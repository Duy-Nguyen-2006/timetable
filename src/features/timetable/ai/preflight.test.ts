import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  buildPreflight,
  checkActivePeriods,
  checkAssignments,
  checkProviderConfigured,
  checkRoster,
  checkSolverRuntime,
} from './preflight'
import type { AIProviderConfig, AgentInputPayload } from './types'

const fullConfig: AIProviderConfig = {
  baseURL: 'https://api.example.com/v1',
  apiKey: 'sk-x',
  model: 'gpt-x',
}

const fullInput: AgentInputPayload = {
  days: [{ id: 'monday', label: 'Thứ 2' }],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { monday: 4 },
  deletedPeriods: {},
  assignments: [
    {
      id: 'a1',
      teacher: { id: 't1', label: 'GV1' },
      subject: { id: 's1', label: 'Toán' },
      class: { id: 'c1', label: '6A' },
      weeklyPeriods: 4,
    },
  ],
  constraints: [],
}

test('checkProviderConfigured fails when config is missing', () => {
  assert.equal(checkProviderConfigured(null).ok, false)
  assert.equal(checkProviderConfigured({}).ok, false)
  assert.equal(checkProviderConfigured(fullConfig).ok, true)
})

test('checkAssignments counts assignments correctly', () => {
  assert.equal(checkAssignments(null).ok, false)
  assert.equal(checkAssignments({ ...fullInput, assignments: [] }).ok, false)
  assert.equal(checkAssignments(fullInput).ok, true)
})

test('checkActivePeriods rejects fully-deleted board', () => {
  const allDeleted: AgentInputPayload = {
    ...fullInput,
    deletedPeriods: { 'monday-1': true, 'monday-2': true, 'monday-3': true, 'monday-4': true },
  }
  assert.equal(checkActivePeriods(allDeleted).ok, false)
  assert.equal(checkActivePeriods(fullInput).ok, true)
})

test('checkRoster requires at least one teacher/subject/class', () => {
  assert.equal(checkRoster(fullInput).ok, true)
  const empty: AgentInputPayload = { ...fullInput, assignments: [] }
  assert.equal(checkRoster(empty).ok, false)
})

test('checkSolverRuntime reports docker availability', () => {
  assert.equal(checkSolverRuntime({ mode: 'docker', dockerAvailable: false }).ok, false)
  assert.equal(checkSolverRuntime({ mode: 'docker', dockerAvailable: true }).ok, true)
  assert.equal(checkSolverRuntime({ mode: 'bundled', bundledAvailable: true }).ok, true)
  assert.equal(checkSolverRuntime({ mode: 'bundled', bundledAvailable: false }).ok, false)
  assert.equal(checkSolverRuntime({ mode: 'system' }).ok, true)
})

test('buildPreflight composes outcome and blocking message', () => {
  const ok = buildPreflight({
    config: fullConfig,
    input: fullInput,
    runtime: { mode: 'bundled', bundledAvailable: true },
  })
  assert.equal(ok.ok, true)
  assert.equal(ok.blockingMessage, undefined)

  const bad = buildPreflight({
    config: null,
    input: { ...fullInput, assignments: [] },
    runtime: { mode: 'docker', dockerAvailable: false },
  })
  assert.equal(bad.ok, false)
  assert.match(bad.blockingMessage ?? '', /Không thể chạy solver/)
})
