// Docker availability probe + pure decision logic (#7).
// The decision function is pure and unit-tested; the probe shells out to docker.

import { spawn } from 'node:child_process'

// Decide whether docker mode can run, given probe facts. Pure + testable.
export function decideDockerUsable({ installed, daemonRunning, imagePresent }) {
  if (!installed) return { usable: false, reason: 'docker_not_installed' }
  if (!daemonRunning) return { usable: false, reason: 'docker_daemon_down' }
  if (!imagePresent) return { usable: false, reason: 'docker_image_missing' }
  return { usable: true, reason: null }
}

export function dockerFallbackMessage(reason) {
  switch (reason) {
    case 'docker_not_installed':
      return 'Không tìm thấy Docker. Đã chuyển sang chế độ bundled.'
    case 'docker_daemon_down':
      return 'Docker chưa khởi động (daemon không chạy). Đã chuyển sang chế độ bundled.'
    case 'docker_image_missing':
      return 'Chưa có Docker image cho solver. Đã chuyển sang chế độ bundled.'
    default:
      return 'Không dùng được Docker. Đã chuyển sang chế độ bundled.'
  }
}

function runCommand(command, args, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch {
      resolve({ code: -1, stdout: '', stderr: 'spawn_failed' })
      return
    }
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ code: -1, stdout, stderr: 'timeout' })
    }, timeoutMs)
    child.stdout?.on('data', (d) => (stdout += d.toString()))
    child.stderr?.on('data', (d) => (stderr += d.toString()))
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: 'error' })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, stdout, stderr })
    })
  })
}

// Probe docker state on the host. Returns the facts + the decision.
export async function probeDocker({ image = 'tack-timetable-solver:latest', timeoutMs = 5000 } = {}) {
  const version = await runCommand('docker', ['--version'], timeoutMs)
  const installed = version.code === 0
  if (!installed) {
    return { installed, daemonRunning: false, imagePresent: false, ...decideDockerUsable({ installed, daemonRunning: false, imagePresent: false }) }
  }

  const info = await runCommand('docker', ['info', '--format', '{{.ServerVersion}}'], timeoutMs)
  const daemonRunning = info.code === 0

  let imagePresent = false
  if (daemonRunning) {
    const inspect = await runCommand('docker', ['image', 'inspect', image], timeoutMs)
    imagePresent = inspect.code === 0
  }

  const decision = decideDockerUsable({ installed, daemonRunning, imagePresent })
  return { installed, daemonRunning, imagePresent, ...decision }
}
