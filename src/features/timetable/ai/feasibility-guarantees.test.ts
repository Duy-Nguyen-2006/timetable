/**
 * Tests for feasibility guarantee modules (Section 14 of REFACTOR_PLAN.md):
 *  - Capacity check (14.1)
 *  - Auto-relaxation (14.4)
 *  - IIS diagnosis (14.2)
 *  - Schedule completeness check (14.7)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { runPreSolveCapacityCheck, summarizeCapacityProblems, checkScheduleCompleteness } from './capacity-check';
import { buildRelaxationPlan, applyRelaxation } from './auto-relaxation';
import { diagnoseIIS, summarizeIIS } from './iis-diagnosis';
import type { AgentInputPayload } from './types';
import type { ConstraintSpec } from './constraint-spec';

const baseInput: AgentInputPayload = {
  days: [
    { id: 'monday', label: 'Thứ 2' },
    { id: 'tuesday', label: 'Thứ 3' },
    { id: 'wednesday', label: 'Thứ 4' },
    { id: 'thursday', label: 'Thứ 5' },
    { id: 'friday', label: 'Thứ 6' },
  ],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { morning: 5 }, // 5 days × 5 periods = 25 slots
  deletedPeriods: {},
  assignments: [
    { id: 'a1', teacher: { id: 't1', label: 'Sơn' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 4 },
    { id: 'a2', teacher: { id: 't2', label: 'Hương' }, subject: { id: 's2', label: 'Văn' }, class: { id: 'c2', label: '6B' }, weeklyPeriods: 3 },
  ],
  constraints: [],
};

// ─── Capacity check (Section 14.1) ──────────────────────────────────────────

test('capacity check passes for feasible assignment', () => {
  const result = runPreSolveCapacityCheck(baseInput, []);
  assert.equal(result.ok, true, `problems: ${JSON.stringify(result.problems)}`);
  assert.equal(result.totals.requiredPeriods, 7);
  assert.equal(result.totals.availableSlots, 25);
});

test('capacity check flags school-level over-allocation', () => {
  const overloaded: AgentInputPayload = {
    ...baseInput,
    assignments: [
      { id: 'a1', teacher: { id: 't1', label: 'Sơn' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 30 },
    ],
  };
  const result = runPreSolveCapacityCheck(overloaded, []);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.scope === 'school' && p.severity === 'fatal'));
});

test('capacity check flags teacher over-allocation after block constraints', () => {
  // Sơn needs 25 periods but is blocked from 24 slots (5 days × 5 - 1 = 24)
  const blockSpecs: ConstraintSpec[] = [
    {
      id: 'b1', original: '', severity: 'hard',
      kind: 'teacher_block_day', params: { teacher: 'Sơn', day: 'monday' },
    },
    {
      id: 'b2', original: '', severity: 'hard',
      kind: 'teacher_block_day', params: { teacher: 'Sơn', day: 'tuesday' },
    },
    {
      id: 'b3', original: '', severity: 'hard',
      kind: 'teacher_block_day', params: { teacher: 'Sơn', day: 'wednesday' },
    },
    {
      id: 'b4', original: '', severity: 'hard',
      kind: 'teacher_block_day', params: { teacher: 'Sơn', day: 'thursday' },
    },
  ];
  // Sơn has only 5 slots left (Friday only) but needs 4 → OK
  let result = runPreSolveCapacityCheck(baseInput, blockSpecs);
  assert.equal(result.ok, true, 'Sơn has 4 needed vs 5 available → OK');

  // Now bump Sơn to 6 periods → should fail
  const overloaded: AgentInputPayload = {
    ...baseInput,
    assignments: [
      { id: 'a1', teacher: { id: 't1', label: 'Sơn' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 6 },
    ],
  };
  result = runPreSolveCapacityCheck(overloaded, blockSpecs);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.scope === 'teacher' && p.entity === 'Sơn'));
});

test('capacity check summary is non-empty for infeasible case', () => {
  const overloaded: AgentInputPayload = {
    ...baseInput,
    assignments: [
      { id: 'a1', teacher: { id: 't1', label: 'Sơn' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 100 },
    ],
  };
  const result = runPreSolveCapacityCheck(overloaded, []);
  const summary = summarizeCapacityProblems(result);
  assert.match(summary, /Phát hiện.*vấn đề sức chứa/);
});

test('checkScheduleCompleteness detects missing entries', () => {
  const result = checkScheduleCompleteness(
    [
      { class: '6A', day: 'monday', period: 1, subject: 'Toán', teacher: 'Sơn', assignmentId: 'a1' },
    ],
    baseInput
  );
  assert.equal(result.complete, false);
  // a1 needs 4 but only 1 scheduled; a2 needs 3 but 0 scheduled → 2 missing
  assert.equal(result.missing.length, 2);
  // Spot check a1's gap
  const a1Missing = result.missing.find((m) => m.assignmentId === 'a1');
  assert.ok(a1Missing);
  assert.equal(a1Missing.required, 4);
  assert.equal(a1Missing.scheduled, 1);
});

test('checkScheduleCompleteness returns complete when all assigned', () => {
  const result = checkScheduleCompleteness(
    [
      { class: '6A', day: 'monday', period: 1, subject: 'Toán', teacher: 'Sơn', assignmentId: 'a1' },
      { class: '6A', day: 'monday', period: 2, subject: 'Toán', teacher: 'Sơn', assignmentId: 'a1' },
      { class: '6A', day: 'monday', period: 3, subject: 'Toán', teacher: 'Sơn', assignmentId: 'a1' },
      { class: '6A', day: 'monday', period: 4, subject: 'Toán', teacher: 'Sơn', assignmentId: 'a1' },
      { class: '6B', day: 'monday', period: 1, subject: 'Văn', teacher: 'Hương', assignmentId: 'a2' },
      { class: '6B', day: 'monday', period: 2, subject: 'Văn', teacher: 'Hương', assignmentId: 'a2' },
      { class: '6B', day: 'monday', period: 3, subject: 'Văn', teacher: 'Hương', assignmentId: 'a2' },
    ],
    baseInput
  );
  assert.equal(result.complete, true, `missing: ${JSON.stringify(result.missing)}`);
});

// ─── Auto-relaxation (Section 14.4) ──────────────────────────────────────────

test('buildRelaxationPlan converts hard → soft for flexible kinds first', () => {
  const specs: ConstraintSpec[] = [
    { id: 'h1', original: '', severity: 'hard', kind: 'teacher_max_per_day', params: { teacher: 'Sơn', maxPerDay: 4 } },
    { id: 'h2', original: '', severity: 'hard', kind: 'teacher_block_day', params: { teacher: 'Sơn', day: 'monday' } },
  ];
  const plan = buildRelaxationPlan(specs, { strategy: 'flexible_first', maxRelaxations: 1 });
  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0].constraintId, 'h1'); // teacher_max_per_day relaxed first
  assert.equal(plan.relaxed.length, 1);
  assert.equal(plan.relaxed[0].severity, 'soft');
});

test('buildRelaxationPlan respects maxRelaxations', () => {
  const specs: ConstraintSpec[] = Array.from({ length: 10 }, (_, i) => ({
    id: `h${i}`, original: '', severity: 'hard' as const, kind: 'teacher_max_per_day' as const, params: { teacher: 'Sơn', maxPerDay: 4 },
  }));
  const plan = buildRelaxationPlan(specs, { maxRelaxations: 3 });
  assert.equal(plan.steps.length, 3);
  assert.equal(plan.relaxed.length, 3);
});

test('applyRelaxation returns updated spec list', () => {
  const specs: ConstraintSpec[] = [
    { id: 'h1', original: '', severity: 'hard', kind: 'teacher_max_per_day', params: { teacher: 'Sơn', maxPerDay: 4 } },
    { id: 'h2', original: '', severity: 'hard', kind: 'teacher_block_day', params: { teacher: 'Sơn', day: 'monday' } },
  ];
  const plan = buildRelaxationPlan(specs, { maxRelaxations: 1 });
  const updated = applyRelaxation(specs, plan);
  const h1 = updated.find((s) => s.id === 'h1');
  const h2 = updated.find((s) => s.id === 'h2');
  assert.equal(h1?.severity, 'soft');
  assert.equal(h2?.severity, 'hard'); // unchanged
});

test('buildRelaxationPlan returns empty steps for no hard specs', () => {
  const specs: ConstraintSpec[] = [
    { id: 's1', original: '', severity: 'soft', kind: 'teacher_max_per_day', params: { teacher: 'Sơn', maxPerDay: 4 } },
  ];
  const plan = buildRelaxationPlan(specs);
  assert.equal(plan.steps.length, 0);
  assert.equal(plan.relaxed.length, 0);
});

// ─── IIS diagnosis (Section 14.2) ────────────────────────────────────────────

test('diagnoseIIS flags teacher_block_day vs teacher_required_day on same teacher+day', () => {
  const specs: ConstraintSpec[] = [
    { id: 'h1', original: '', severity: 'hard', kind: 'teacher_block_day', params: { teacher: 'Sơn', day: 'monday' } },
    { id: 'h2', original: '', severity: 'hard', kind: 'teacher_required_day', params: { teacher: 'Sơn', day: 'monday' } },
  ];
  const diagnosis = diagnoseIIS(specs);
  assert.equal(diagnosis.conflictSet.length, 2, 'both should be in conflict set');
  assert.ok(diagnosis.conflictSet[0].suspicionReason.includes('mâu thuẫn'));
});

test('diagnoseIIS flags numeric over-constraint (max < min)', () => {
  const specs: ConstraintSpec[] = [
    { id: 'h1', original: '', severity: 'hard', kind: 'teacher_max_per_day', params: { teacher: 'Sơn', maxPerDay: 2 } },
    { id: 'h2', original: '', severity: 'hard', kind: 'teacher_min_per_day', params: { teacher: 'Sơn', minPerDay: 5 } },
  ];
  const diagnosis = diagnoseIIS(specs);
  assert.equal(diagnosis.conflictSet.length, 2);
  assert.match(diagnosis.conflictSet[0].suspicionReason, /mâu thuẫn/);
});

test('diagnoseIIS returns empty conflict set for non-conflicting specs', () => {
  const specs: ConstraintSpec[] = [
    { id: 'h1', original: '', severity: 'hard', kind: 'teacher_block_day', params: { teacher: 'Sơn', day: 'monday' } },
    { id: 'h2', original: '', severity: 'hard', kind: 'teacher_block_day', params: { teacher: 'Hương', day: 'monday' } },
  ];
  const diagnosis = diagnoseIIS(specs);
  assert.equal(diagnosis.conflictSet.length, 0);
  assert.equal(diagnosis.safeConstraintIds.length, 2);
});

test('summarizeIIS is informative for empty conflict set', () => {
  const diagnosis = diagnoseIIS([]);
  const summary = summarizeIIS(diagnosis);
  assert.match(summary, /Không phát hiện mâu thuẫn/);
});

test('summarizeIIS is informative for non-empty conflict set', () => {
  const specs: ConstraintSpec[] = [
    { id: 'h1', original: '', severity: 'hard', kind: 'teacher_block_day', params: { teacher: 'Sơn', day: 'monday' } },
    { id: 'h2', original: '', severity: 'hard', kind: 'teacher_required_day', params: { teacher: 'Sơn', day: 'monday' } },
  ];
  const diagnosis = diagnoseIIS(specs);
  const summary = summarizeIIS(diagnosis);
  assert.match(summary, /mâu thuẫn/);
});
