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

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('password-store', 'basic')
}

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

    while (true) {
      const newlineIdx = daemonStdout.indexOf('\n')
      if (newlineIdx === -1) return

      const line = daemonStdout.slice(0, newlineIdx).trim()
      daemonStdout = daemonStdout.slice(newlineIdx + 1)

      if (!line) continue

      if (!line.startsWith('{')) {
        console.warn('[PYTHON-DAEMON NON-JSON]', line)
        continue
      }

      if (!daemonPending) continue

      const { resolve, timer } = daemonPending
      daemonPending = null
      clearTimeout(timer)

      try {
        const parsed = JSON.parse(line)
        let resultData
        if (parsed.resultPath && fs.existsSync(parsed.resultPath)) {
          try {
            resultData = JSON.parse(fs.readFileSync(parsed.resultPath, 'utf8'))
          } catch {
            /* ignore */
          }
        }
        resolve({ ...parsed, ...(resultData ? { resultData } : {}) })
      } catch (e) {
        resolve({
          ok: false,
          status: 'crashed',
          durationMs: 0,
          errorDigest: `[MAIN] Failed to parse daemon output: ${e.message}`,
        })
      }

      return
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

async function verifyApiRoutes(baseUrl) {
  const routes = [
    { path: '/prompts/coder.system.md', name: 'coder prompt' },
    { path: '/templates/solver_skeleton.py', name: 'solver skeleton' },
  ]
  const issues = []
  for (const route of routes) {
    try {
      const res = await fetch(`${baseUrl}${route.path}`)
      if (!res.ok) issues.push(`${route.name} (HTTP ${res.status})`)
    } catch (err) {
      issues.push(`${route.name} (${err.message})`)
    }
  }
  if (issues.length > 0) {
    console.warn('[STARTUP-CHECK] Missing assets in standalone:', issues.join(', '))
    notifyRenderer('app:server-error', {
      message: `Cảnh báo: Một số tài nguyên AI không khả dụng: ${issues.join(', ')}. Pipeline có thể hoạt động không ổn định.`,
    })
  }
  return issues.length === 0
}

async function prewarmApiRoutes(baseUrl) {
  const routes = [
    '/api/provider/test',
    '/api/ai/chat',
    '/api/ai/python-execute',
    '/api/ai/python-syntax-check',
    '/api/ai/python-ast-check',
    '/api/ai/solver-skeleton',
    '/prompts/coder.system.md',
    '/prompts/planner.system.md',
    '/prompts/translator.system.md',
    '/prompts/repair.system.md',
    '/templates/solver_skeleton.py',
  ]
  const start = Date.now()
  await Promise.allSettled(
    routes.map((route) =>
      fetch(`${baseUrl}${route}`, { method: 'GET' }).catch(() => {})
    )
  )
  console.log(`[WARM-UP] API routes pre-warmed in ${Date.now() - start}ms`)
}

function prewarmPythonDaemon() {
  const dockerAvailable = false
  const spec = resolveSpawnSpec({
    mode: currentRuntimeMode,
    isDev,
    isPackaged: app.isPackaged,
    appDir: __dirname,
    resourcesPath: process.resourcesPath,
    platform: process.platform,
    dockerAvailable,
  })
  if (!fs.existsSync(spec.command)) {
    console.warn('[WARM-UP] Python executor binary not found, skipping daemon pre-warm')
    return
  }
  const worker = ensureDaemon(spec)
  if (worker) {
    console.log('[WARM-UP] Python daemon pre-spawned')
  }
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
    // Bind chỉ loopback để app desktop không vô tình listen public interface.
    const hostname = '127.0.0.1'

    serverProcess = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PORT: String(port),
        HOSTNAME: hostname,
        NODE_ENV: 'production',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let serverStdout = ''
    let serverStderr = ''

    serverProcess.stdout?.on('data', (chunk) => {
      serverStdout += chunk.toString()
      // Keep last ~8k for diagnostics
      if (serverStdout.length > 8192) serverStdout = serverStdout.slice(-8192)
      console.log('[NEXT-STANDALONE]', chunk.toString().trim())
    })

    serverProcess.stderr?.on('data', (chunk) => {
      serverStderr += chunk.toString()
      if (serverStderr.length > 8192) serverStderr = serverStderr.slice(-8192)
      console.error('[NEXT-STANDALONE ERROR]', chunk.toString().trim())
    })

    serverProcess.on('error', (err) => {
      console.error('[NEXT-STANDALONE] Failed to spawn Next server:', err)
      notifyRenderer('app:server-error', {
        message: `Không khởi động được server nội bộ: ${err.message}`,
      })
    })

    serverProcess.on('exit', (code, signal) => {
      if (code !== 0) {
        console.error(`[NEXT-STANDALONE] Server exited with code ${code}, signal ${signal}`)
        console.error('Last stdout (tail):', serverStdout.slice(-2000))
        console.error('Last stderr (tail):', serverStderr.slice(-2000))
        notifyRenderer('app:server-error', {
          message: `Server nội bộ đã thoát bất thường (code ${code}). Xem console để biết chi tiết.`,
        })
      }
    })

    const url = `http://${hostname}:${port}`
    void waitForServer(url).then(async (ready) => {
      if (!ready) {
        console.error('[STARTUP] Next.js standalone server did not become ready in time.')
        notifyRenderer('app:server-error', {
          message: 'Server nội bộ không khởi động được. Vui lòng thử khởi động lại ứng dụng.',
        })
        return
      }
      createWindow(url)
      prewarmPythonDaemon()
      await Promise.all([
        verifyApiRoutes(url),
        prewarmApiRoutes(url),
      ])
    })
  }
})

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill()
})
