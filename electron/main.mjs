import { app, BrowserWindow, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = !app.isPackaged
let serverProcess = null
let mainWindow = null

function getPythonBinary(name) {
  const base = isDev
    ? path.join(__dirname, '..', 'python-dist')
    : path.join(process.resourcesPath, 'python')

  if (name === 'code_executor') {
    return path.join(base, process.platform === 'win32' ? 'code_executor.exe' : 'code_executor')
  }
  // existing timetable_solver
  return path.join(base, process.platform === 'win32' ? 'runner.exe' : 'runner')
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.ts'), // or .js after build
    },
  })

  mainWindow.loadURL(url)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// IPC for Python execution (used by local AI agent)
ipcMain.handle('python:executeCode', async (_event, code, input, timeoutMs = 180000) => {
  return new Promise((resolve) => {
    const binary = getPythonBinary('code_executor')
    const jobDir = path.join(app.getPath('temp'), `tack-job-${Date.now()}`)
    fs.mkdirSync(jobDir, { recursive: true })

    // Write input.json
    fs.writeFileSync(
      path.join(jobDir, 'input.json'),
      JSON.stringify(input, null, 2),
      'utf8'
    )

    const child = spawn(binary, [], {
      cwd: jobDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    let stdout = ''
    let stderr = ''

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({
        success: false,
        has_solution: false,
        stdout,
        stderr: stderr + '\n[MAIN] Timeout from Electron main process',
        execution_time_ms: timeoutMs,
        error_type: 'timeout',
        result: null,
      })
    }, timeoutMs)

    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))

    child.on('close', (code) => {
      clearTimeout(timer)
      try {
        // The Python executor always prints one JSON line
        const lastLine = stdout.trim().split('\n').pop()
        const parsed = JSON.parse(lastLine || '{}')
        resolve(parsed)
      } catch (e) {
        resolve({
          success: false,
          has_solution: false,
          stdout,
          stderr: stderr + '\n[MAIN] Failed to parse executor output: ' + e.message,
          execution_time_ms: 0,
          error_type: 'parse_error',
          result: null,
        })
      }
    })

    child.stdin.write(code)
    child.stdin.end()
  })
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
        PORT: String(port),
        NODE_ENV: 'production',
      },
      stdio: 'ignore',
    })

    // Give the server a moment to start
    setTimeout(() => {
      createWindow(`http://localhost:${port}`)
    }, 2500)
  }
})

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill()
})
