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
      displayText: 'Sơn không dạy thứ 2',
    },
  ];
  const raw = constraintItemsToRaw([{ id: 'r1', type: 'required', text: 'Sơn không dạy thứ 2' }]);
  const gate = validateConfirmedSolveRequest(raw, [], { input: baseInput, confirmedConstraints: confirmed });
  assert.equal(gate.ok, true);
  if (gate.ok) assert.equal(gate.preTranslatedSpecs.length, 1);
});

test('validateConfirmedSolveRequest blocks confirmed hard custom_dsl without executable form', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'custom_r1',
      original: 'Nếu cô Thúy dạy thứ 4 thì cô Hạnh nghỉ',
      severity: 'hard',
      kind: 'custom_dsl',
      params: {
        naturalLanguage: 'Nếu cô Thúy dạy thứ 4 thì cô Hạnh nghỉ',
        normalizedText: 'Nếu cô Thúy dạy Thứ 4 thì cô Hạnh không dạy.',
      },
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
      displayText: 'Nếu cô Thúy dạy Thứ 4 thì cô Hạnh không dạy.',
    },
  ];
  const raw = constraintItemsToRaw([{ id: 'r1', type: 'required', text: 'Nếu cô Thúy dạy thứ 4 thì cô Hạnh nghỉ' }]);
  const gate = validateConfirmedSolveRequest(raw, [], { input: baseInput, confirmedConstraints: confirmed });
  assert.equal(gate.ok, false);
  if (!gate.ok) assert.match(gate.messages?.join('\n') ?? '', /chưa chuyển được thành luật máy hiểu/u);
});

test('validateConfirmedSolveRequest allows confirmed hard custom_dsl with IR expr', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'custom_r1',
      original: 'Ràng buộc đặc biệt đã có IR',
      severity: 'hard',
      kind: 'custom_dsl',
      params: {
        expr: { const: true },
      },
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
      displayText: 'Ràng buộc đặc biệt đã có IR.',
    },
  ];
  const raw = constraintItemsToRaw([{ id: 'r1', type: 'required', text: 'Ràng buộc đặc biệt đã có IR' }]);
  const gate = validateConfirmedSolveRequest(raw, [], { input: baseInput, confirmedConstraints: confirmed });
  assert.equal(gate.ok, true);
  if (gate.ok) assert.equal(gate.preTranslatedSpecs[0].kind, 'custom_dsl');
});

test('validateConfirmedSolveRequest still blocks unknown hard kinds', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'Ràng buộc chưa hỗ trợ',
      severity: 'hard',
      kind: 'unsupported_kind' as ConstraintSpec['kind'],
      params: {},
    },
  ];
  const confirmed: ConfirmedConstraint[] = [
    {
      id: 'conf1',
      rawConstraintId: 'r1',
      specs,
      confirmedBy: 'user',
      confirmedAt: new Date().toISOString(),
      summary: 'blocked',
      displayText: 'Ràng buộc chưa hỗ trợ.',
    },
  ];
  const raw = constraintItemsToRaw([{ id: 'r1', type: 'required', text: 'Ràng buộc chưa hỗ trợ' }]);
  const gate = validateConfirmedSolveRequest(raw, [], { input: baseInput, confirmedConstraints: confirmed });
  assert.equal(gate.ok, false);
  if (!gate.ok) assert.match(gate.messages?.join('\n') ?? '', /unsupported_kind/u);
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
      displayText: 'Sơn không dạy thứ 2',
    },
  ];
  const { preTranslatedSpecs } = buildAgentInputWithConfirmedSpecs(baseInput, confirmed);
  assert.equal(preTranslatedSpecs.length, 1);
});
