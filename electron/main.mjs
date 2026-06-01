import { app, BrowserWindow, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

import {
  DEFAULT_RUNTIME_MODE,
  normalizeRuntimeMode,
  resolveSpawnSpec,
  resolveWorkerCount,
  resolveTimeoutSeconds,
} from './solver-runtime.mjs'
import { probeDocker, dockerFallbackMessage } from './docker-check.mjs'
import {
  isSecureStoreAvailable,
  saveProvider,
  loadProvider,
  clearProvider,
} from './secure-store.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = !app.isPackaged
let serverProcess = null
let mainWindow = null

// Selected solver runtime mode (bundled | docker | system) + docker probe cache.
let currentRuntimeMode = DEFAULT_RUNTIME_MODE
let dockerProbeCache = null // { usable, reason, ... }

// Persistent Python worker daemon
let daemonWorker = null
let daemonPending = null // { resolve, timer }
let daemonStdout = ''
let daemonMode = null // the runtime mode the live daemon was spawned with

async function getDockerAvailability() {
  if (currentRuntimeMode !== 'docker') return false
  if (!dockerProbeCache) {
    dockerProbeCache = await probeDocker()
  }
  return dockerProbeCache.usable === true
}

// Resolve the spawn spec for the current mode. Surfaces a one-time fallback
// notice to the renderer when docker was requested but is unavailable (#7).
function resolveCurrentSpec(dockerAvailable) {
  const spec = resolveSpawnSpec({
    mode: currentRuntimeMode,
    isDev,
    isPackaged: app.isPackaged,
    appDir: __dirname,
    resourcesPath: process.resourcesPath,
    platform: process.platform,
    dockerAvailable,
  })
  if (spec.fallbackReason && dockerProbeCache) {
    notifyRenderer('solver-runtime:notice', {
      level: 'warning',
      message: dockerFallbackMessage(dockerProbeCache.reason || spec.fallbackReason),
    })
  }
  return spec
}

function notifyRenderer(channel, payload) {
  try {
    mainWindow?.webContents?.send(channel, payload)
  } catch {
    /* ignore */
  }
}

function spawnDaemon(spec) {
  if (!fs.existsSync(spec.command)) return null

  const worker = spawn(spec.command, [...spec.baseArgs, '--daemon'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...spec.env },
  })

  daemonStdout = ''
  daemonMode = spec.mode

  worker.stdout.on('data', (chunk) => {
    daemonStdout += chunk.toString()
    const newlineIdx = daemonStdout.indexOf('\n')
    if (newlineIdx === -1) return
    const line = daemonStdout.slice(0, newlineIdx).trim()
    daemonStdout = daemonStdout.slice(newlineIdx + 1)
    if (!daemonPending) return
    const { resolve, timer } = daemonPending
    daemonPending = null
    clearTimeout(timer)
    try {
      const parsed = JSON.parse(line)
      let resultData
      if (parsed.resultPath && fs.existsSync(parsed.resultPath)) {
        try { resultData = JSON.parse(fs.readFileSync(parsed.resultPath, 'utf8')) } catch { /* ignore */ }
      }
      resolve({ ...parsed, ...(resultData ? { resultData } : {}) })
    } catch (e) {
      resolve({ ok: false, status: 'crashed', durationMs: 0,
        errorDigest: `[MAIN] Failed to parse daemon output: ${e.message}` })
    }
  })

  worker.on('exit', () => {
    daemonWorker = null
    if (daemonPending) {
      const { resolve, timer } = daemonPending
      daemonPending = null
      clearTimeout(timer)
      resolve({ ok: false, status: 'crashed', durationMs: 0,
        errorDigest: '[MAIN] Daemon worker exited unexpectedly' })
    }
  })

  return worker
}

function ensureDaemon(spec) {
  // Re-spawn if dead or if the runtime mode changed since last spawn.
  if (!daemonWorker || daemonWorker.exitCode !== null || daemonMode !== spec.mode) {
    if (daemonWorker && daemonWorker.exitCode === null) {
      try { daemonWorker.kill('SIGKILL') } catch { /* ignore */ }
    }
    daemonWorker = spawnDaemon(spec)
  }
  return daemonWorker
}

function runWithDaemon(spec, code, timeoutSeconds, solverWorkers, jobDir, type = 'execute') {
  return new Promise((resolve) => {
    const worker = ensureDaemon(spec)
    if (!worker) {
      resolve(null) // fall back to per-call spawn
      return
    }
    const timeoutMs = timeoutSeconds * 1000
    const timer = setTimeout(() => {
      daemonPending = null
      worker.kill('SIGKILL')
      daemonWorker = null
      resolve({ ok: false, status: 'timeout', durationMs: timeoutMs,
        errorDigest: '[MAIN] Daemon job timed out' })
    }, timeoutMs + 5000)

    daemonPending = { resolve, timer }
    const job = JSON.stringify({ type, code, timeoutSeconds, solverWorkers, jobDir })
    worker.stdin.write(job + '\n')
  })
}

function resolvePreloadPath() {
  return path.join(__dirname, 'preload.cjs')
}

async function waitForServer(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return true
    } catch {
      /* server not ready yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: resolvePreloadPath(),
    },
  })

  mainWindow.loadURL(url)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function cleanupJobDir(jobDir) {
  try {
    fs.rmSync(jobDir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

function spawnPerCall(spec, code, jobDir, timeoutMs, timeoutSeconds, workerCount, modeFlag = null) {
  return new Promise((resolve) => {
    const args = modeFlag ? [...spec.baseArgs, modeFlag] : [...spec.baseArgs, String(timeoutSeconds)]
    const child = spawn(spec.command, args, {
      cwd: jobDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...spec.env,
        EXECUTOR_TIMEOUT_SECONDS: String(timeoutSeconds),
        SOLVER_MAX_SECONDS: String(Math.max(5, timeoutSeconds - 5)),
        SOLVER_WORKERS: String(workerCount),
      },
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish({ ok: false, status: 'timeout', durationMs: timeoutMs,
        errorDigest: '[MAIN] Timeout from Electron main process' })
    }, timeoutMs)

    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', (err) => {
      clearTimeout(timer)
      finish({ ok: false, status: 'crashed', durationMs: 0,
        errorDigest: `[MAIN] Failed to spawn executor: ${err.message}` })
    })

    child.on('close', () => {
      clearTimeout(timer)
      try {
        const lastLine = stdout.trim().split('\n').pop()
        const parsed = JSON.parse(lastLine || '{}')
        let resultData
        if (parsed.resultPath && fs.existsSync(parsed.resultPath)) {
          try { resultData = JSON.parse(fs.readFileSync(parsed.resultPath, 'utf8')) } catch { /* ignore */ }
        }
        finish({ ...parsed, ...(resultData ? { resultData } : {}) })
      } catch (e) {
        finish({ ok: false, status: 'crashed', durationMs: 0,
          errorDigest: `[MAIN] Failed to parse executor output: ${e.message}` })
      }
    })

    child.stdin.write(code)
    child.stdin.end()
  })
}

ipcMain.handle('solver-runtime:set', async (_event, mode) => {
  const next = normalizeRuntimeMode(mode)
  if (next !== currentRuntimeMode) {
    currentRuntimeMode = next
    dockerProbeCache = null // re-probe on next run
  }
  return { mode: currentRuntimeMode }
})

ipcMain.handle('solver-runtime:probeDocker', async () => {
  dockerProbeCache = await probeDocker()
  return dockerProbeCache
})

ipcMain.handle('secure-store:available', async () => isSecureStoreAvailable())
ipcMain.handle('secure-store:save-provider', async (_event, config) => saveProvider(config))
ipcMain.handle('secure-store:load-provider', async () => loadProvider())
ipcMain.handle('secure-store:clear-provider', async () => clearProvider())

async function runExecutorCheck(type, code, timeoutMs = 10000) {
  const timeoutSeconds = resolveTimeoutSeconds(timeoutMs)
  const dockerAvailable = await getDockerAvailability()
  const spec = resolveCurrentSpec(dockerAvailable)
  const jobDir = path.join(app.getPath('temp'), `tack-check-${Date.now()}`)
  fs.mkdirSync(jobDir, { recursive: true })
  try {
    const daemonResult = await runWithDaemon(spec, code, timeoutSeconds, undefined, jobDir, type)
    if (daemonResult !== null) return daemonResult
    return await spawnPerCall(
      spec,
      code,
      jobDir,
      timeoutMs,
      timeoutSeconds,
      1,
      type === 'syntax-check' ? '--syntax-check' : '--ast-check'
    )
  } finally {
    cleanupJobDir(jobDir)
  }
}

ipcMain.handle('python:syntaxCheck', async (_event, code) => runExecutorCheck('syntax-check', code))
ipcMain.handle('python:astCheck', async (_event, code) => runExecutorCheck('ast-check', code))

// IPC for Python execution (used by local AI agent)
ipcMain.handle('python:executeCode', async (_event, code, input, timeoutMs = 360000, solverWorkers = undefined) => {
  const timeoutSeconds = resolveTimeoutSeconds(timeoutMs)
  const workerCount = resolveWorkerCount({
    requested: solverWorkers,
    cpuCount: os.cpus().length,
    envWorkers: process.env.SOLVER_WORKERS,
  })

  const dockerAvailable = await getDockerAvailability()
  const spec = resolveCurrentSpec(dockerAvailable)

  const jobDir = path.join(app.getPath('temp'), `tack-job-${Date.now()}`)
  fs.mkdirSync(jobDir, { recursive: true })
  fs.writeFileSync(path.join(jobDir, 'input.json'), JSON.stringify(input ?? {}), 'utf8')

  try {
    const daemonResult = await runWithDaemon(spec, code, timeoutSeconds, workerCount, jobDir)
    if (daemonResult !== null) return daemonResult

    // Fallback: per-call spawn
    return await spawnPerCall(spec, code, jobDir, timeoutMs, timeoutSeconds, workerCount)
  } finally {
    cleanupJobDir(jobDir)
  }
})


app.whenReady().then(() => {
  if (isDev) {
    // Development: assume `npm run dev` is running on port 3000
    createWindow('http://localhost:3000')
  } else {
    // Production (packaged AppImage): start the Next.js standalone server
    const serverPath = path.join(process.resourcesPath, 'app.asar.unpacked', '.next', 'standalone', 'server.js')
    const port = 3456

    serverProcess = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PORT: String(port),
        NODE_ENV: 'production',
      },
      stdio: 'ignore',
    })

    const url = `http://localhost:${port}`
    void waitForServer(url).then(() => createWindow(url))
  }
})

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill()
})
