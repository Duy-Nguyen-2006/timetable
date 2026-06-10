import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  buildDebugBundle,
  debugBundleFilename,
} from './debug-bundle'
import { PIPELINE_VERSIONS } from './pipeline-versions'

test('buildDebugBundle stamps versions and timestamp', () => {
  const before = Date.now()
  const bundle = buildDebugBundle({
    input: {
      days: [],
      sessions: [],
      periodCounts: {},
      deletedPeriods: {},
      assignments: [],
      constraints: [],
    },
    snapshot: {
      inputDigest: 'abc',
      solverCodeSnapshot: '# code',
      executionResult: { ok: true },
    },
  })
  assert.equal(bundle.versions, PIPELINE_VERSIONS)
  assert.equal(bundle.inputDigest, 'abc')
  assert.equal(bundle.solverCodeSnapshot, '# code')
  assert.deepEqual(bundle.executionResult, { ok: true })
  assert.ok(new Date(bundle.generatedAt).getTime() >= before - 1000)
})

test('debugBundleFilename produces a safe filename', () => {
  const name = debugBundleFilename('tack-debug')
  assert.match(name, /^tack-debug-/)
  assert.match(name, /\.json$/)
  assert.ok(!name.includes(':'))
  assert.ok(!name.includes('.json.json'))
})
