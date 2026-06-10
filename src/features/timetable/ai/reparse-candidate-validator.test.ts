import test from 'node:test';
import assert from 'node:assert/strict';

import type { AgentInputPayload } from './types';
import { validateReparseCandidateSpecs } from './reparse-candidate-validator';

const agentInput: AgentInputPayload = {
  days: [
    { id: 'monday', label: 'Thứ 2' },
    { id: 'tuesday', label: 'Thứ 3' },
  ],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { morning: 5 },
  deletedPeriods: {},
  assignments: [
    {
      id: 'asg_1',
      teacher: { id: 't1', label: 'Thúy' },
      subject: { id: 's1', label: 'Toán' },
      class: { id: 'c1', label: '6A' },
      weeklyPeriods: 3,
    },
  ],
  constraints: [],
};

test('validateReparseCandidateSpecs accepts two teacher_block_period specs', () => {
  const raw = {
    id: 'c1',
    text: 'Cô Thúy bận trông con nên hay phải đi muộn, nên tránh tiết 1 với 2 cho cổ đi',
    type: 'required' as const,
  };
  const result = validateReparseCandidateSpecs(agentInput, raw, [
    { kind: 'teacher_block_period', params: { teacher: 'Thúy', period: 1 } },
    { kind: 'teacher_block_period', params: { teacher: 'Thúy', period: 2 } },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.specs.length, 2);
  assert.ok(result.specs.every((s) => s.kind === 'teacher_block_period'));
  assert.ok(!result.specs.some((s) => s.kind === 'custom_dsl'));
});

test('validateReparseCandidateSpecs rejects hard custom_dsl without pythonPredicate', () => {
  const raw = { id: 'c2', text: 'ràng buộc lạ', type: 'required' as const };
  const result = validateReparseCandidateSpecs(agentInput, raw, [
    { kind: 'custom_dsl', params: { naturalLanguage: 'x' } },
  ]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 'unsupported');
  assert.ok(result.issues.some((i) => i.code === 'hard_unchecked'));
});

test('validateReparseCandidateSpecs rejects unknown teacher', () => {
  const raw = { id: 'c3', text: 'Cô X tránh tiết 1', type: 'required' as const };
  const result = validateReparseCandidateSpecs(agentInput, raw, [
    { kind: 'teacher_block_period', params: { teacher: 'KhôngTồnTại', period: 1 } },
  ]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((i) => i.code === 'unknown_entity'));
});

test('validateReparseCandidateSpecs empty specs', () => {
  const raw = { id: 'c4', text: 'x', type: 'required' as const };
  const result = validateReparseCandidateSpecs(agentInput, raw, undefined);
  assert.equal(result.ok, false);
});

test('validateReparseCandidateSpecs accepts custom_dsl with valid IR expr', () => {
  const raw = { id: 'c5', text: 'Cô Thúy phải có tiết 4', type: 'required' as const };
  const result = validateReparseCandidateSpecs(agentInput, raw, [
    {
      kind: 'custom_dsl',
      params: {
        expr: {
          atLeast: {
            k: 1,
            var: 'd',
            in: 'days',
            body: { teaches: { teacher: 'Thúy', day: '$$D$$', period: 4 } },
          },
        },
      },
    },
  ]);
  assert.equal(result.ok, true);
});

test('validateReparseCandidateSpecs rejects custom_dsl IR expr with unknown teacher', () => {
  const raw = { id: 'c6', text: 'Cô Ghost phải có tiết 4', type: 'required' as const };
  const result = validateReparseCandidateSpecs(agentInput, raw, [
    {
      kind: 'custom_dsl',
      params: {
        expr: {
          atLeast: {
            k: 1,
            var: 'd',
            in: 'days',
            body: { teaches: { teacher: 'Ghost', day: '$$D$$', period: 4 } },
          },
        },
      },
    },
  ]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 'unsupported');
  assert.ok(result.issues.some((i) => i.code === 'hard_unchecked'));
  assert.match(result.issues.map((i) => i.message).join('\n'), /Ghost/);
});

test('validateReparseCandidateSpecs rejects custom_dsl IR expr with out-of-range period', () => {
  const raw = { id: 'c7', text: 'Cô Thúy phải có tiết 9', type: 'required' as const };
  const result = validateReparseCandidateSpecs(agentInput, raw, [
    {
      kind: 'custom_dsl',
      params: {
        expr: {
          atLeast: {
            k: 1,
            var: 'd',
            in: 'days',
            body: { teaches: { teacher: 'Thúy', day: 'monday', period: 9 } },
          },
        },
      },
    },
  ]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 'unsupported');
  assert.ok(result.issues.some((i) => i.code === 'hard_unchecked'));
  assert.match(result.issues.map((i) => i.message).join('\n'), /Tiết 9/);
});
