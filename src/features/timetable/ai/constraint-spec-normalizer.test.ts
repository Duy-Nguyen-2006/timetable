import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeConstraintSpecsForSolving } from './constraint-spec-normalizer';
import type { AgentInputPayload } from './types';
import type { ConstraintSpec } from './constraint-spec';

const input: AgentInputPayload = {
  classes: [],
  teachers: [],
  subjects: [],
  days: [{ id: 'mon', label: 'Thứ 2' }],
  sessions: [],
  periodCounts: {},
  assignments: [
    {
      id: 'a1',
      class: { id: '6a', label: '6A' },
      subject: { id: 'math', label: 'Toán' },
      teacher: { id: 'thuy', label: 'Thủy' },
      weeklyPeriods: 4,
    },
  ],
  constraints: [],
};

function spec(kind: ConstraintSpec['kind'], params: Record<string, unknown>): ConstraintSpec {
  return {
    id: 's1',
    original: '',
    severity: 'hard',
    kind,
    params,
  };
}

test('normalizer accepts teacher_required_period and defaults minCount to 1', () => {
  const result = normalizeConstraintSpecsForSolving(input, [
    spec('teacher_required_period', { teacher: 'Thủy', period: '4' }),
  ]);

  assert.equal(result.issues.length, 0);
  assert.equal(result.specs.length, 1);
  assert.equal(result.specs[0].kind, 'teacher_required_period');
  assert.equal(result.specs[0].params.period, 4);
  assert.equal(result.specs[0].params.minCount, 1);
});

test('normalizer rejects malformed teacher_required_period fail-closed', () => {
  const result = normalizeConstraintSpecsForSolving(input, [
    spec('teacher_required_period', { teacher: 'Thủy', period: 'bad' }),
  ]);

  assert.equal(result.specs.length, 0);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].field, 'period');
});

test('normalizer expands subject_max_consecutive across all known subjects', () => {
  const result = normalizeConstraintSpecsForSolving(input, [
    spec('subject_max_consecutive', { max: 2 }),
  ]);

  assert.equal(result.issues.length, 0);
  assert.equal(result.specs.length, 1);
  assert.equal(result.specs[0].kind, 'subject_max_consecutive');
  assert.equal(result.specs[0].params.subject, 'Toán');
  assert.equal(result.specs[0].params.maxConsecutive, 2);
});

test('normalizer rejects subject_block_period without explicit subject', () => {
  const result = normalizeConstraintSpecsForSolving(input, [
    spec('subject_block_period', { periods: [4] }),
  ]);

  assert.equal(result.specs.length, 0);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].field, 'subject');
});
