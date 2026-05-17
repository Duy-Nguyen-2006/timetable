import { app, BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'

const isDev = !app.isPackaged
let serverProcess = null

function getAppRoot() {
  return app.getAppPath()
}

function getStandaloneRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', '.next', 'standalone')
  }

  return path.join(getAppRoot(), '.next', 'standalone')
}

function getPythonBin() {
  if (process.env.TIMETABLE_PYTHON_BIN) return process.env.TIMETABLE_PYTHON_BIN

  const bundledExe = path.join(process.resourcesPath, 'python', 'runner.exe')
  if (fs.existsSync(bundledExe)) return bundledExe

  const bundledRunner = path.join(process.resourcesPath, 'python', 'runner')
  if (fs.existsSync(bundledRunner)) return bundledRunner

  const devVenv = path.join(getAppRoot(), '.venv', 'Scripts', 'python.exe')
  if (fs.existsSync(devVenv)) return devVenv

  return process.platform === 'win32' ? 'python' : 'python3'
}

async function waitForServer(url, attempts = 60) {
  for (let index = 0; index < attempts; index += 1) {
    const ok = await new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume()
        resolve(Boolean(res.statusCode && res.statusCode < 500))
      })
      req.on('error', () => resolve(false))
    })

    if (ok) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error('Next server did not start in time')
}

async function startServer() {
  const standaloneRoot = getStandaloneRoot()
  const serverEntry = path.join(standaloneRoot, 'server.js')
  const port = process.env.PORT || '3210'

  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: standaloneRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: port,
      HOSTNAME: '127.0.0.1',
      TIMETABLE_PYTHON_BIN: getPythonBin(),
      TIMETABLE_PYTHON_RUNNER_DIR: path.join(process.resourcesPath, 'python'),
    },
    stdio: 'inherit',
  })

  serverProcess.on('exit', () => {
    serverProcess = null
  })

  await waitForServer(`http://127.0.0.1:${port}`)
  return `http://127.0.0.1:${port}`
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    autoHideMenuBar: true,
    backgroundColor: '#050505',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  })

  const url = isDev ? 'http://127.0.0.1:3000' : await startServer()
  await win.loadURL(url)
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }

  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }
})
