import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import {
  RUNTIME_MODES,
  DEFAULT_RUNTIME_MODE,
  normalizeRuntimeMode,
  bundledBinaryName,
  bundledBinaryPath,
  systemEntrypoint,
  baseRuntimeEnv,
  resolveSpawnSpec,
  resolveWorkerCount,
  resolveTimeoutSeconds,
} from '../solver-runtime.mjs'

const baseCtx = {
  isDev: false,
  isPackaged: true,
  appDir: '/app/electron',
  resourcesPath: '/app/resources',
  platform: 'linux',
}

test('normalizeRuntimeMode falls back to default for unknown modes', () => {
  assert.equal(normalizeRuntimeMode('bundled'), 'bundled')
  assert.equal(normalizeRuntimeMode('docker'), 'docker')
  assert.equal(normalizeRuntimeMode('system'), 'system')
  assert.equal(normalizeRuntimeMode('garbage'), DEFAULT_RUNTIME_MODE)
  assert.equal(normalizeRuntimeMode(undefined), DEFAULT_RUNTIME_MODE)
  assert.deepEqual(RUNTIME_MODES, ['bundled', 'docker', 'system'])
})

test('bundledBinaryName is platform aware', () => {
  assert.equal(bundledBinaryName('win32'), 'code_executor.exe')
  assert.equal(bundledBinaryName('linux'), 'code_executor')
  assert.equal(bundledBinaryName('darwin'), 'code_executor')
})

test('bundledBinaryPath resolves dev vs packaged dirs', () => {
  assert.equal(
    bundledBinaryPath({ isDev: true, appDir: '/app/electron', resourcesPath: '/r', platform: 'linux' }),
    path.join('/app', 'python-dist', 'code_executor')
  )
  assert.equal(
    bundledBinaryPath({ isDev: false, appDir: '/app/electron', resourcesPath: '/r', platform: 'win32' }),
    path.join('/r', 'python', 'code_executor.exe')
  )
})

test('systemEntrypoint resolves dev vs packaged python source', () => {
  assert.equal(
    systemEntrypoint({ isDev: true, appDir: '/app/electron', resourcesPath: '/r' }),
    path.join('/app', 'python', 'code_executor.py')
  )
  assert.equal(
    systemEntrypoint({ isDev: false, appDir: '/app/electron', resourcesPath: '/r' }),
    path.join('/r', 'python-src', 'code_executor.py')
  )
})

test('baseRuntimeEnv sets production guard only when packaged', () => {
  assert.equal(baseRuntimeEnv({ isPackaged: true }).TT_PRODUCTION, '1')
  assert.equal(baseRuntimeEnv({ isPackaged: false }).TT_PRODUCTION, undefined)
})

test('resolveSpawnSpec bundled mode uses the binary, no sandbox env', () => {
  const spec = resolveSpawnSpec({ ...baseCtx, mode: 'bundled' })
  assert.equal(spec.mode, 'bundled')
  assert.equal(spec.requestedMode, 'bundled')
  assert.equal(spec.command, path.join('/app/resources', 'python', 'code_executor'))
  assert.deepEqual(spec.baseArgs, [])
  assert.equal(spec.env.TT_SANDBOX_MODE, undefined)
  assert.equal(spec.env.TT_PRODUCTION, '1')
  assert.equal(spec.fallbackReason, null)
})

test('resolveSpawnSpec system mode runs python3 against the source entrypoint', () => {
  const spec = resolveSpawnSpec({ ...baseCtx, isPackaged: false, mode: 'system', pythonExecutable: 'python3.14' })
  assert.equal(spec.mode, 'system')
  assert.equal(spec.command, 'python3.14')
  assert.equal(spec.baseArgs[0], path.join('/app/resources', 'python-src', 'code_executor.py'))
  assert.equal(spec.env.TT_PRODUCTION, undefined)
})

test('resolveSpawnSpec docker mode sets sandbox + image env when available', () => {
  const spec = resolveSpawnSpec({ ...baseCtx, mode: 'docker', dockerAvailable: true, dockerImage: 'img:1' })
  assert.equal(spec.mode, 'docker')
  assert.equal(spec.env.TT_SANDBOX_MODE, 'docker')
  assert.equal(spec.env.TT_DOCKER_IMAGE, 'img:1')
  assert.equal(spec.fallbackReason, null)
})

test('resolveSpawnSpec docker falls back to bundled when docker unavailable', () => {
  const spec = resolveSpawnSpec({ ...baseCtx, mode: 'docker', dockerAvailable: false })
  assert.equal(spec.requestedMode, 'docker')
  assert.equal(spec.mode, 'bundled')
  assert.equal(spec.fallbackReason, 'docker_unavailable')
  assert.equal(spec.env.TT_SANDBOX_MODE, undefined)
})

test('resolveWorkerCount clamps into [1,8] with cpu-based default', () => {
  assert.equal(resolveWorkerCount({ requested: 99, cpuCount: 4 }), 8)
  assert.equal(resolveWorkerCount({ requested: 0, cpuCount: 4 }), 3)
  assert.equal(resolveWorkerCount({ requested: undefined, cpuCount: 1 }), 1)
  assert.equal(resolveWorkerCount({ requested: undefined, envWorkers: '2', cpuCount: 16 }), 2)
  assert.equal(resolveWorkerCount({ requested: 3, cpuCount: 16 }), 3)
})

test('resolveTimeoutSeconds rounds up and floors at 1', () => {
  assert.equal(resolveTimeoutSeconds(0), 1)
  assert.equal(resolveTimeoutSeconds(1500), 2)
  assert.equal(resolveTimeoutSeconds(360000), 360)
})
