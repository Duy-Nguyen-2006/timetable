import { app, BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'

const isDev = !app.isPackaged
let serverProcess = null

// Use string concatenation to avoid nested template literal pitfalls
const LOADING_URL = 'data:text/html,' + encodeURIComponent(
  '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tack Timetable</title>' +
  '<style>' +
  '*{margin:0;padding:0;box-sizing:border-box}' +
  'body{background:#050505;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,-apple-system,sans-serif}' +
  '.wrap{text-align:center;width:300px}' +
  '.title{font-size:22px;font-weight:600;letter-spacing:-.5px}' +
  '.status{color:#555;font-size:13px;margin:10px 0 24px;min-height:18px;transition:opacity .3s}' +
  '.track{width:100%;height:3px;background:#1a1a1a;border-radius:2px;overflow:hidden}' +
  '.fill{height:100%;background:linear-gradient(90deg,#6366f1,#8b5cf6);border-radius:2px;width:0%;transition:width .8s ease-out}' +
  '</style></head><body>' +
  '<div class="wrap">' +
  '<div class="title">Tack Timetable</div>' +
  '<div class="status" id="s">Đang khởi động...</div>' +
  '<div class="track"><div class="fill" id="f"></div></div>' +
  '</div>' +
  '<script>' +
  'var msgs=[[0,"Đang khởi động..."],[3,"Đang tải máy chủ nội bộ..."],[8,"Đang chuẩn bị giao diện..."],[18,"Lần đầu chạy thường mất 20-40 giây..."],[35,"Vui lòng chờ thêm một chút..."]];' +
  'var t0=Date.now();' +
  'function tick(){' +
  '  var s=(Date.now()-t0)/1000;' +
  '  var p=94*(1-Math.exp(-s/12));' +
  '  document.getElementById("f").style.width=p+"%";' +
  '  var m=msgs[0][1];for(var i=0;i<msgs.length;i++){if(s>=msgs[i][0])m=msgs[i][1];}' +
  '  document.getElementById("s").textContent=m;' +
  '}' +
  'setInterval(tick,600);tick();' +
  '</script>' +
  '</body></html>'
)

function buildErrorHTML(msg) {
  const safe = String(msg).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return 'data:text/html,' + encodeURIComponent(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Lỗi khởi động</title>' +
    '<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#050505;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,-apple-system,sans-serif}</style>' +
    '</head><body>' +
    '<div style="max-width:600px;padding:32px;text-align:center">' +
    '<div style="font-size:20px;font-weight:600;color:#f87171">Lỗi khởi động</div>' +
    '<div style="color:#888;font-size:13px;margin:10px 0 20px">Không thể khởi động server nội bộ</div>' +
    '<pre style="background:#111;border:1px solid #222;border-radius:8px;padding:16px;text-align:left;font-size:12px;color:#ddd;overflow:auto;max-height:300px;white-space:pre-wrap">' + safe + '</pre>' +
    '<div style="color:#555;font-size:12px;margin-top:16px">Hãy đảm bảo Python đã được cài đặt, hoặc liên hệ hỗ trợ.</div>' +
    '</div>' +
    '</body></html>'
  )
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

async function waitForServer(url, isReady) {
  const ATTEMPTS = 240   // up to ~60s
  const INTERVAL = 250
  for (let index = 0; index < ATTEMPTS; index += 1) {
    const ok = await new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume()
        resolve(Boolean(res.statusCode && res.statusCode < 500))
      })
      req.on('error', () => resolve(false))
      req.setTimeout(2000, () => { req.destroy(); resolve(false) })
    })

    if (ok) return
    if (isReady && isReady() && index > 4) {
      // server claims ready but TCP isn't accepting yet — keep polling briefly
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL))
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
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let ready = false
  const handleOutput = (buf) => {
    const text = buf.toString()
    process.stdout.write(text)
    if (!ready && /ready|listening|started server/i.test(text)) ready = true
  }
  serverProcess.stdout?.on('data', handleOutput)
  serverProcess.stderr?.on('data', (buf) => process.stderr.write(buf))

  serverProcess.on('exit', () => {
    serverProcess = null
  })

  await waitForServer(`http://127.0.0.1:${port}`, () => ready)
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

  await win.loadURL(LOADING_URL)
  win.show()

  try {
    const url = isDev ? 'http://127.0.0.1:3000' : await startServer()
    await win.loadURL(url)
  } catch (err) {
    await win.loadURL(buildErrorHTML(err && err.message ? err.message : String(err)))
  }
}

// Suppress VSync/GL errors on Linux (DRM vsync unavailable on Wayland/VMs/some drivers)
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('disable-gpu-vsync')
  app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor')
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
