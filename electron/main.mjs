import { app, BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'

const isDev = !app.isPackaged
let serverProcess = null

const LOADING_HTML = `data:text/html,${encodeURIComponent(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Tack Timetable</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#050505;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,-apple-system,sans-serif}.dot{width:8px;height:8px;border-radius:50%;background:#6366f1;animation:bounce 1.2s infinite ease-in-out}.dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}.dots{display:flex;gap:6px;margin-top:16px}@keyframes bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}</style>
</head><body>
<div style="text-align:center">
  <div style="font-size:22px;font-weight:600;letter-spacing:-0.5px">Tack Timetable</div>
  <div style="color:#555;font-size:13px;margin-top:6px">Đang khởi động ứng dụng...</div>
  <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
</div>
</body></html>`)}`

function buildErrorHTML(msg) {
  const safe = String(msg).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `data:text/html,${encodeURIComponent(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Lỗi khởi động</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#050505;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,-apple-system,sans-serif}</style>
</head><body>
<div style="max-width:600px;padding:32px;text-align:center">
  <div style="font-size:20px;font-weight:600;color:#f87171">Lỗi khởi động</div>
  <div style="color:#888;font-size:13px;margin:10px 0 20px">Không thể khởi động server nội bộ</div>
  <pre style="background:#111;border:1px solid #222;border-radius:8px;padding:16px;text-align:left;font-size:12px;color:#ddd;overflow:auto;max-height:300px;white-space:pre-wrap">${safe}</pre>
  <div style="color:#555;font-size:12px;margin-top:16px">Hãy đảm bảo Python đã được cài đặt, hoặc liên hệ hỗ trợ.</div>
</div>
</body></html>`)}`
}

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
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#050505',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  })

  await win.loadURL(LOADING_HTML)
  win.show()

  try {
    const url = isDev ? 'http://127.0.0.1:3000' : await startServer()
    await win.loadURL(url)
  } catch (err) {
    await win.loadURL(buildErrorHTML(err && err.message ? err.message : String(err)))
  }
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
