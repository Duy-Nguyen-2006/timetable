import test from 'node:test';
import assert from 'node:assert/strict';

import type { AgentInputPayload } from './types';
import type { ConstraintSpec } from './constraint-spec';
import {
  buildAgentInputWithConfirmedSpecs,
  validateConfirmedSolveRequest,
  constraintItemsToRaw,
} from './solver-constraint-gate';
import type { ConfirmedConstraint } from './constraint-review-types';

const baseInput: Omit<AgentInputPayload, 'constraints'> = {
  days: [{ id: 'monday', label: 'Thứ 2' }],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { monday: 5 },
  deletedPeriods: {},
  assignments: [
    {
      id: 'asg_1',
      teacher: { id: 't1', label: 'Sơn' },
      subject: { id: 's1', label: 'Toán' },
      class: { id: 'c1', label: '6A' },
      weeklyPeriods: 3,
    },
  ],
};

test('validateConfirmedSolveRequest blocks unconfirmed hard raw', () => {
  const raw = constraintItemsToRaw([{ id: 'r1', type: 'required', text: 'Sơn không dạy thứ 2' }]);
  const gate = validateConfirmedSolveRequest(raw, [], { input: baseInput, confirmedConstraints: [] });
  assert.equal(gate.ok, false);
  if (!gate.ok) assert.equal(gate.status, 400);
});

test('validateConfirmedSolveRequest allows confirmed teacher_block_day', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'Sơn không dạy thứ 2',
      severity: 'hard',
      kind: 'teacher_block_day',
      params: { teacher: 'Sơn', day: 'monday' },
    },
  ];
  const confirmed: ConfirmedConstraint[] = [
    {
      id: 'conf1',
      rawConstraintId: 'r1',
      specs,
      confirmedBy: 'user',
      confirmedAt: new Date().toISOString(),
      summary: 'ok',
    },
  ];
  const raw = constraintItemsToRaw([{ id: 'r1', type: 'required', text: 'Sơn không dạy thứ 2' }]);
  const gate = validateConfirmedSolveRequest(raw, [], { input: baseInput, confirmedConstraints: confirmed });
  assert.equal(gate.ok, true);
  if (gate.ok) assert.equal(gate.preTranslatedSpecs.length, 1);
});

test('buildAgentInputWithConfirmedSpecs flattens specs', () => {
  const confirmed: ConfirmedConstraint[] = [
    {
      id: 'conf1',
      rawConstraintId: 'r1',
      specs: [
        {
          id: 'c1',
          original: 'x',
          severity: 'hard',
          kind: 'teacher_block_day',
          params: { teacher: 'Sơn', day: 'monday' },
        },
      ],
      confirmedBy: 'user',
      confirmedAt: '',
      summary: '',
    },
  ];
  const { preTranslatedSpecs } = buildAgentInputWithConfirmedSpecs(baseInput, confirmed);
  assert.equal(preTranslatedSpecs.length, 1);
});
