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

test('validateConfirmedSolveRequest allows solve with zero user constraints', () => {
  const gate = validateConfirmedSolveRequest([], [], { input: baseInput, confirmedConstraints: [] });
  assert.equal(gate.ok, true);
  if (gate.ok) assert.deepEqual(gate.preTranslatedSpecs, []);
});

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
  if (!gate.ok) {
    assert.match(gate.messages?.join('\n') ?? '', /Ràng buộc chưa hỗ trợ/);
    assert.doesNotMatch(gate.messages?.join('\n') ?? '', /unsupported_kind/u);
  }
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

// M4.4: Solve path MUST NOT depend on LLM, parser, or codegen.
// We verify this by reading the imports of solver-constraint-gate.ts
// and asserting that chat-client (LLM), reparse service, and python-codegen
// are not in the dependency graph. This is a static, file-level guard.
test('M4.4: solver-constraint-gate.ts does NOT import LLM/chat-client', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const gatePath = path.join(__dirname, 'solver-constraint-gate.ts');
  const source = await fs.readFile(gatePath, 'utf8');

  // The gate must not import chat-client, reparse, codegen
  assert.ok(
    !source.includes("from './chat-client'"),
    'solver-constraint-gate.ts MUST NOT import chat-client (LLM)'
  );
  assert.ok(
    !source.includes("from './constraint-reparse-service'"),
    'solver-constraint-gate.ts MUST NOT import constraint-reparse-service (parser)'
  );
  assert.ok(
    !source.includes("from './python-bridge'") || source.includes('// allow-python-bridge'),
    'solver-constraint-gate.ts MUST NOT import python-bridge (codegen)'
  );
  assert.ok(
    !source.includes("from './local-agent'"),
    'solver-constraint-gate.ts MUST NOT import local-agent (orchestrator that may call LLM)'
  );
  assert.ok(
    !source.includes("from './analyze-constraint-service'"),
    'solver-constraint-gate.ts MUST NOT import analyze-constraint-service (LLM-heavy)'
  );
});

test('M4.4: validateConfirmedSolveRequest blocks mixed valid+invalid hard', () => {
  // One valid confirmed + one invalid custom_dsl = whole solve blocked.
  const validSpec: ConstraintSpec = {
    id: 'valid1',
    original: 'Sơn không dạy thứ 2',
    severity: 'hard',
    kind: 'teacher_block_day',
    params: { teacher: 'Sơn', day: 'monday' },
  };
  const invalidSpec: ConstraintSpec = {
    id: 'invalid1',
    original: 'Ràng buộc custom không có IR',
    severity: 'hard',
    kind: 'custom_dsl',
    params: { naturalLanguage: 'mô tả không có IR' },
  };
  const confirmed: ConfirmedConstraint[] = [
    {
      id: 'conf_valid',
      rawConstraintId: 'r_valid',
      specs: [validSpec],
      confirmedBy: 'user',
      confirmedAt: '',
      summary: '',
      displayText: 'Sơn không dạy thứ 2',
    },
    {
      id: 'conf_invalid',
      rawConstraintId: 'r_invalid',
      specs: [invalidSpec],
      confirmedBy: 'user',
      confirmedAt: '',
      summary: '',
      displayText: 'Ràng buộc custom không có IR',
    },
  ];
  const raw = constraintItemsToRaw([
    { id: 'r_valid', type: 'required', text: 'Sơn không dạy thứ 2' },
    { id: 'r_invalid', type: 'required', text: 'Ràng buộc custom không có IR' },
  ]);
  const gate = validateConfirmedSolveRequest(raw, [], { input: baseInput, confirmedConstraints: confirmed });
  assert.equal(gate.ok, false, 'Whole solve must be blocked when one hard spec is invalid');
  if (!gate.ok) {
    assert.match(gate.messages?.join('\n') ?? '', /chưa chuyển được thành luật máy hiểu/u);
  }
});

test('M4.5: confirmed teacher_required_period with all required params is allowed', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'Cô Thủy phải có ít nhất 1 tiết 4 trong tuần',
      severity: 'hard',
      kind: 'teacher_required_period',
      params: { teacher: 'Thủy', period: 4, minCount: 1 },
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
      displayText: 'Cô Thủy phải có ít nhất 1 tiết 4 trong tuần',
    },
  ];
  const raw = constraintItemsToRaw([
    { id: 'r1', type: 'required', text: 'Cô Thủy phải có ít nhất 1 tiết 4 trong tuần' },
  ]);
  const gate = validateConfirmedSolveRequest(raw, [], { input: baseInput, confirmedConstraints: confirmed });
  assert.equal(gate.ok, true);
  if (gate.ok) {
    assert.equal(gate.preTranslatedSpecs[0].kind, 'teacher_required_period');
  }
});

test('M4.5: teacher_required_period missing period is blocked', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'Cô Thủy phải có tiết (missing period)',
      severity: 'hard',
      kind: 'teacher_required_period',
      params: { teacher: 'Thủy', minCount: 1 } as any, // missing period
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
      displayText: 'Cô Thủy phải có tiết (missing period)',
    },
  ];
  const raw = constraintItemsToRaw([
    { id: 'r1', type: 'required', text: 'Cô Thủy phải có tiết (missing period)' },
  ]);
  const gate = validateConfirmedSolveRequest(raw, [], { input: baseInput, confirmedConstraints: confirmed });
  // The gate should fail either at preflight (missing param) or normalize.
  // Either way, ok must be false.
  assert.equal(gate.ok, false);
});
