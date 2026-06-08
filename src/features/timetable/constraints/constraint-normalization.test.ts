import test from 'node:test';
import assert from 'node:assert/strict';

import { constraintItemsToRaw } from '../ai/solver-constraint-gate';
import type { AgentInputPayload } from '../ai/types';
import { normalizeConstraintToBuiltInDraft } from './constraint-normalization';

const agentInput: AgentInputPayload = {
  days: [
    { id: 'monday', label: 'Thứ 2' },
    { id: 'tuesday', label: 'Thứ 3' },
    { id: 'wednesday', label: 'Thứ 4' },
    { id: 'thursday', label: 'Thứ 5' },
    { id: 'friday', label: 'Thứ 6' },
  ],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { morning: 4 },
  deletedPeriods: {},
  assignments: [
    {
      id: 'asg_0',
      teacher: { id: 'T1', label: 'Dung' },
      subject: { id: 'S1', label: 'Văn' },
      class: { id: 'C1', label: '6A' },
      weeklyPeriods: 4,
    },
  ],
  constraints: [],
};

test('normalizeConstraintToBuiltInDraft creates subject max consecutive draft from Vietnamese text', () => {
  const [raw] = constraintItemsToRaw([
    { id: 'r1', type: 'required', text: 'Môn Văn không được 3 tiết liên tiếp' },
  ]);

  const draft = normalizeConstraintToBuiltInDraft(raw, agentInput);

  assert.equal(draft.status, 'parsed');
  assert.equal(draft.confidence, 'high');
  assert.equal(draft.proposedSpecs.length, 1);
  assert.equal(draft.proposedSpecs[0].kind, 'subject_max_consecutive');
  assert.deepEqual(draft.proposedSpecs[0].params, {
    subject: 'Văn',
    max: 2,
    maxConsecutive: 2,
    classes: ['6A'],
  });
});

test('normalizeConstraintToBuiltInDraft keeps unclear text unparsed for user review', () => {
  const [raw] = constraintItemsToRaw([
    { id: 'r2', type: 'required', text: 'Xếp lịch thật đẹp' },
  ]);

  const draft = normalizeConstraintToBuiltInDraft(raw, agentInput);

  assert.equal(draft.status, 'unparsed');
  assert.equal(draft.confidence, 'low');
  assert.equal(draft.proposedSpecs.length, 0);
});
