/**
 * Tests for the IR type checker (Phase 1.2).
 *
 * The checker is fail-closed. Hard issues must reject the constraint;
 * soft issues should trigger clarification. The tests cover:
 *   - valid IR passes
 *   - unknown teacher rejects
 *   - unknown day rejects
 *   - period out of range rejects
 *   - unknown session rejects
 *   - atLeast.k = -1 rejects
 *   - consecutive.length = 1 rejects
 *   - gap.min = 0 rejects
 *   - unknown class / subject rejects
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { typeCheckIR } from './ir-type-checker';
import type { ConstraintIR } from './constraint-ir';
import type { AgentInputPayload } from './types';

const input: AgentInputPayload = {
  days: [
    { id: 'monday', label: 'Thứ 2' },
    { id: 'tuesday', label: 'Thứ 3' },
  ],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { morning: 5 },
  deletedPeriods: {},
  assignments: [
    { id: 'a1', teacher: { id: 't1', label: 'Hiếu' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 4 },
    { id: 'a2', teacher: { id: 't2', label: 'Thúy' }, subject: { id: 's2', label: 'Văn' }, class: { id: 'c2', label: '6B' }, weeklyPeriods: 4 },
  ],
  constraints: [],
};

function irOf(expr: ConstraintIR['expr']): ConstraintIR {
  return {
    id: 't1',
    severity: 'hard',
    original: 'test',
    expr,
  };
}

test('typeCheckIR: valid teaches atom passes', () => {
  const result = typeCheckIR(
    irOf({ teaches: { teacher: 'Hiếu', day: 'monday', period: 1 } }),
    input
  );
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});

test('typeCheckIR: unknown teacher rejects', () => {
  const result = typeCheckIR(
    irOf({ teaches: { teacher: 'Ghost', day: 'monday', period: 1 } }),
    input
  );
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'unknown_teacher'));
});

test('typeCheckIR: unknown day rejects', () => {
  const result = typeCheckIR(
    irOf({ teaches: { teacher: 'Hiếu', day: 'sunday', period: 1 } }),
    input
  );
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'unknown_day'));
});

test('typeCheckIR: period out of range rejects', () => {
  // monday has 5 periods; period 99 is out of range.
  const result = typeCheckIR(
    irOf({ teaches: { teacher: 'Hiếu', day: 'monday', period: 99 } }),
    input
  );
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'period_out_of_range'));
});

test('typeCheckIR: atLeast.k negative rejects', () => {
  const result = typeCheckIR(
    irOf({
      atLeast: {
        k: -1,
        var: 'd',
        in: 'days',
        body: { const: true },
      },
    }),
    input
  );
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'invalid_k'));
});

test('typeCheckIR: consecutive.length = 1 rejects', () => {
  const result = typeCheckIR(
    irOf({
      consecutive: {
        var: 'd',
        in: 'days',
        length: 1,
        body: { const: true },
      },
    }),
    input
  );
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'invalid_k'));
});

test('typeCheckIR: gap.min = 0 rejects (Phase 1.1)', () => {
  const result = typeCheckIR(
    irOf({
      gap: {
        var: 'd',
        in: 'days',
        min: 0,
        body: { const: true },
      },
    }),
    input
  );
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'invalid_k'));
});

test('typeCheckIR: gap.min = 2 passes (Phase 1.1)', () => {
  const result = typeCheckIR(
    irOf({
      gap: {
        var: 'd',
        in: 'days',
        min: 2,
        body: { teaches: { teacher: 'Hiếu', day: 'monday', period: 1 } },
      },
    }),
    input
  );
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});

test('typeCheckIR: unknown session in session atom rejects (Phase 1.1)', () => {
  const result = typeCheckIR(
    irOf({ session: { session: 'afternoon' } }),
    input
  );
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'unknown_session'));
});

test('typeCheckIR: valid session atom with teacher passes (Phase 1.1)', () => {
  const result = typeCheckIR(
    irOf({ session: { session: 'morning', teacher: 'Hiếu' } }),
    input
  );
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});

test('typeCheckIR: before/after recurse into first/second (Phase 1.1)', () => {
  const result = typeCheckIR(
    irOf({
      before: {
        var: 'd',
        in: 'days',
        first: { teaches: { teacher: 'Hiếu', day: 'monday', period: 1 } },
        second: { teaches: { teacher: 'Hiếu', day: 'monday', period: 2 } },
      },
    }),
    input
  );
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});

test('typeCheckIR: unknown class in classSubjectAt rejects', () => {
  const result = typeCheckIR(
    irOf({ classSubjectAt: { class: '9Z', subject: 'Toán', day: 'monday', period: 1 } }),
    input
  );
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'unknown_class'));
});

test('typeCheckIR: kind-to-IR day placeholder is accepted when bound to days', () => {
  const result = typeCheckIR(
    irOf({
      atLeast: {
        k: 1,
        var: 'd',
        in: 'days',
        body: { teaches: { teacher: 'Hiếu', day: '$$D$$', period: 4 } },
      },
    }),
    input
  );
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});

test('typeCheckIR: period placeholder is accepted when bound to periods', () => {
  const result = typeCheckIR(
    irOf({
      forall: {
        var: 'p',
        in: 'periods',
        body: { classBusy: { class: '6A', day: 'monday', period: '$$P$$' } },
      },
    }),
    input
  );
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});

test('typeCheckIR: class placeholder is accepted when bound to classes', () => {
  const result = typeCheckIR(
    irOf({
      forall: {
        var: 'c',
        in: 'classes',
        body: { classSubjectAt: { class: '$$C$$', subject: 'Toán', day: 'monday', period: 1 } },
      },
    }),
    input
  );
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});

test('typeCheckIR: placeholder bound to wrong domain rejects', () => {
  const result = typeCheckIR(
    irOf({
      forall: {
        var: 'd',
        in: 'days',
        body: { classSubjectAt: { class: '$$D$$', subject: 'Toán', day: 'monday', period: 1 } },
      },
    }),
    input
  );
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'invalid_binding'));
});

test('typeCheckIR: classBusy period out of range rejects', () => {
  const result = typeCheckIR(
    irOf({ classBusy: { class: '6A', day: 'monday', period: 99 } }),
    input
  );
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'period_out_of_range'));
});
