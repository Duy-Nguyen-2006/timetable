// Single source of truth for resolving how the Python solver is launched.
// Imported by electron/main.mjs and unit-tested via `node --test`.
//
// Three modes (outer launcher + inner sandbox together):
//   - bundled: PyInstaller `code_executor` binary; inner sandbox auto-detected.
//   - docker:  launcher with TT_SANDBOX_MODE=docker (after a docker availability check).
//   - system:  system python3 running python/code_executor.py (dev only).

import path from 'node:path'

export const RUNTIME_MODES = ['bundled', 'docker', 'system']
export const DEFAULT_RUNTIME_MODE = 'bundled'

export function normalizeRuntimeMode(mode) {
  return RUNTIME_MODES.includes(mode) ? mode : DEFAULT_RUNTIME_MODE
}

export function bundledBinaryName(platform) {
  return platform === 'win32' ? 'code_executor.exe' : 'code_executor'
}

// Directory that holds the bundled binary, depending on dev vs packaged.
export function bundledBinaryDir({ isDev, appDir, resourcesPath }) {
  return isDev ? path.join(appDir, '..', 'python-dist') : path.join(resourcesPath, 'python')
}

export function bundledBinaryPath({ isDev, appDir, resourcesPath, platform }) {
  return path.join(
    bundledBinaryDir({ isDev, appDir, resourcesPath }),
    bundledBinaryName(platform)
  )
}

// Path to the python source entrypoint for system mode.
export function systemEntrypoint({ isDev, appDir, resourcesPath }) {
  return isDev
    ? path.join(appDir, '..', 'python', 'code_executor.py')
    : path.join(resourcesPath, 'python-src', 'code_executor.py')
}

// Base env applied to every runtime. `isPackaged` drives the production guard
// (#8): packaged builds must never allow the unsafe no-sandbox bypass.
export function baseRuntimeEnv({ isPackaged }) {
  const env = {
    PYTHONUNBUFFERED: '1',
    PYTHONHASHSEED: '0',
  }
  if (isPackaged) {
    env.TT_PRODUCTION = '1'
  }
  return env
}

// Resolve a concrete spawn spec for the given mode.
// `dockerAvailable` is the result of the async probe (see docker-check.mjs).
// When docker is requested but unavailable, we fall back to bundled and record
// the reason so the UI can surface a notice (#7).
export function resolveSpawnSpec({
  mode,
  isDev,
  isPackaged,
  appDir,
  resourcesPath,
  platform,
  pythonExecutable = 'python3',
  dockerAvailable = false,
  dockerImage = 'tack-timetable-solver:latest',
}) {
  const requested = normalizeRuntimeMode(mode)
  let effective = requested
  let fallbackReason = null

  if (requested === 'docker' && !dockerAvailable) {
    effective = 'bundled'
    fallbackReason = 'docker_unavailable'
  }

  const env = baseRuntimeEnv({ isPackaged })

  if (effective === 'system') {
    return {
      requestedMode: requested,
      mode: 'system',
      command: pythonExecutable,
      baseArgs: [systemEntrypoint({ isDev, appDir, resourcesPath })],
      env,
      fallbackReason,
    }
  }

  const binary = bundledBinaryPath({ isDev, appDir, resourcesPath, platform })

  if (effective === 'docker') {
    return {
      requestedMode: requested,
      mode: 'docker',
      command: binary,
      baseArgs: [],
      env: { ...env, TT_SANDBOX_MODE: 'docker', TT_DOCKER_IMAGE: dockerImage },
      fallbackReason,
    }
  }

  return {
    requestedMode: requested,
    mode: 'bundled',
    command: binary,
    baseArgs: [],
    env,
    fallbackReason,
  }
}

// Clamp solver worker count into the supported [1, 8] band, defaulting from
// cpu count when not provided (#9).
export function resolveWorkerCount({ requested, cpuCount, envWorkers }) {
  const fromEnv = Number(envWorkers)
  const base = Number(requested) || (Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 0)
  const cpus = Math.max(1, Number(cpuCount) || 1)
  const fallback = Math.max(1, cpus - 1)
  const chosen = base > 0 ? base : fallback
  return Math.min(8, Math.max(1, Math.floor(chosen)))
}

// Convert a timeout in ms into whole seconds, never below 1 (#9).
export function resolveTimeoutSeconds(timeoutMs) {
  return Math.max(1, Math.ceil(Number(timeoutMs || 0) / 1000))
}
