import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SOLVER_CONFIG,
  resolveSolveConfig,
  solveProgressPercent,
  toProgressStep,
} from './solver-ui'

test('toProgressStep maps deterministic solver phases', () => {
  assert.equal(toProgressStep('translator'), 'preparing')
  assert.equal(toProgressStep('running'), 'running')
  assert.equal(toProgressStep('checking'), 'checking')
})

test('solveProgressPercent increases through deterministic steps', () => {
  assert.ok(solveProgressPercent('preparing') < solveProgressPercent('running'))
  assert.ok(solveProgressPercent('running') < solveProgressPercent('checking'))
  assert.equal(solveProgressPercent('idle'), 100)
})

test('resolveSolveConfig falls back to bundled balanced defaults', () => {
  assert.deepEqual(resolveSolveConfig(null), DEFAULT_SOLVER_CONFIG)
  assert.equal(resolveSolveConfig({ baseURL: 'x', apiKey: 'k', model: 'm', solverProfile: 'deep' }).solverProfile, 'deep')
})