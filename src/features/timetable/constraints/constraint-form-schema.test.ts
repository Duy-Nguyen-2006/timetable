import test from 'node:test';
import assert from 'node:assert/strict';

import type { AgentInputPayload } from '../ai/types';
import {
  defaultFormValues,
  formValuesToSpecs,
  buildContextFromAgentInput,
  applyFormToDraft,
} from './constraint-form-schema';

const input: AgentInputPayload = {
  days: [{ id: 'monday', label: 'Thứ 2' }],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { monday: 5 },
  deletedPeriods: {},
  assignments: [
    {
      id: 'a1',
      teacher: { id: 't1', label: 'Sơn' },
      subject: { id: 's1', label: 'Toán' },
      class: { id: 'c1', label: '6A' },
      weeklyPeriods: 3,
    },
  ],
  constraints: [],
};

test('formValuesToSpecs teacher_block_day', () => {
  const ctx = buildContextFromAgentInput(input);
  const values = { ...defaultFormValues('teacher_block_day', 'required'), teacher: 'Sơn', day: 'monday' };
  const specs = formValuesToSpecs('Sơn không dạy thứ 2', values, ctx);
  assert.equal(specs.length, 1);
  assert.equal(specs[0].kind, 'teacher_block_day');
  assert.equal(specs[0].params.teacher, 'Sơn');
});

test('formValuesToSpecs subject_max_consecutive all subjects', () => {
  const ctx = buildContextFromAgentInput(input);
  const values = {
    ...defaultFormValues('subject_max_consecutive', 'required'),
    subjectsScope: 'all' as const,
    maxConsecutive: 2,
  };
  const specs = formValuesToSpecs('Không 3 tiết liên tiếp', values, ctx);
  assert.ok(specs.length >= 1);
  assert.equal(specs[0].kind, 'subject_max_consecutive');
  assert.equal(specs[0].params.maxConsecutive, 2);
});

test('applyFormToDraft updates status', () => {
  const ctx = buildContextFromAgentInput(input);
  const draft = {
    id: 'd1',
    rawConstraintId: 'r1',
    original: 'x',
    proposedSpecs: [],
    status: 'unparsed' as const,
    confidence: 'low' as const,
    explanation: '',
    issues: [],
    source: 'manual' as const,
  };
  const values = { ...defaultFormValues('teacher_block_day', 'required'), teacher: 'Sơn', day: 'monday' };
  const updated = applyFormToDraft(input, draft, 'required', values, ctx);
  assert.ok(updated.proposedSpecs.length > 0);
  assert.equal(updated.source, 'manual');
});
