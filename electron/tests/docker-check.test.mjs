import test from 'node:test'
import assert from 'node:assert/strict'

import { decideDockerUsable, dockerFallbackMessage } from '../docker-check.mjs'

test('decideDockerUsable requires install, daemon, and image', () => {
  assert.deepEqual(decideDockerUsable({ installed: false, daemonRunning: false, imagePresent: false }), {
    usable: false,
    reason: 'docker_not_installed',
  })
  assert.deepEqual(decideDockerUsable({ installed: true, daemonRunning: false, imagePresent: false }), {
    usable: false,
    reason: 'docker_daemon_down',
  })
  assert.deepEqual(decideDockerUsable({ installed: true, daemonRunning: true, imagePresent: false }), {
    usable: false,
    reason: 'docker_image_missing',
  })
  assert.deepEqual(decideDockerUsable({ installed: true, daemonRunning: true, imagePresent: true }), {
    usable: true,
    reason: null,
  })
})

test('dockerFallbackMessage returns a Vietnamese notice per reason', () => {
  assert.match(dockerFallbackMessage('docker_not_installed'), /Không tìm thấy Docker/)
  assert.match(dockerFallbackMessage('docker_daemon_down'), /chưa khởi động/)
  assert.match(dockerFallbackMessage('docker_image_missing'), /Chưa có Docker image/)
  assert.match(dockerFallbackMessage('whatever'), /Không dùng được Docker/)
})
