/**
 * Tests for kind-to-IR adapter (Phase 1.4).
 *
 * Verifies the adapter produces valid IR for the require-family kinds
 * (Phase 0.2) and a few canonical kinds. The full parity test (random
 * schedule -> specToIR vs ir_eval vs deterministic-validator) is a
 * separate concern handled in cp-sat-roundtrip.test.ts.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { specToIR, specsToIR } from './kind-to-ir';
import { validateIR } from './constraint-ir';
import type { ConstraintSpec } from './constraint-spec';
import { typeCheckIR } from './ir-type-checker';
import type { AgentInputPayload } from './types';

function spec(kind: ConstraintSpec['kind'], params: Record<string, unknown>, id = 't1'): ConstraintSpec {
  return { id, original: 'test', severity: 'hard', kind, params };
}

const input: AgentInputPayload = {
  days: [
    { id: 'monday', label: 'Thứ 2' },
    { id: 'tuesday', label: 'Thứ 3' },
  ],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { morning: 5 },
  deletedPeriods: {},
  assignments: [
    { id: 'a1', teacher: { id: 't1', label: 'Thủy' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 4 },
    { id: 'a2', teacher: { id: 't2', label: 'Sơn' }, subject: { id: 's2', label: 'Văn' }, class: { id: 'c2', label: '6B' }, weeklyPeriods: 4 },
  ],
  constraints: [],
};

function assertSchemaAndTypeValid(ir: NonNullable<ReturnType<typeof specToIR>>): void {
  const shapeIssues = validateIR(ir);
  assert.equal(shapeIssues.length, 0, `IR has schema issues: ${JSON.stringify(shapeIssues)}`);
  const typeResult = typeCheckIR(ir, input);
  assert.equal(typeResult.ok, true, `IR has type issues: ${JSON.stringify(typeResult.issues, null, 2)}`);
}

test('specToIR: teacher_required_period -> atLeast with teaches body', () => {
  const ir = specToIR(spec('teacher_required_period', { teacher: 'Thủy', period: 4, minCount: 1 }));
  assert.ok(ir, 'should produce IR');
  // The IR must be schema-valid.
  const issues = validateIR(ir);
  assert.equal(issues.length, 0, `IR has validation issues: ${JSON.stringify(issues)}`);
  // The body must be a `teaches` atom.
  assert.ok('atLeast' in ir!.expr);
  const atLeast = (ir!.expr as { atLeast: { body: unknown } }).atLeast;
  assert.ok('teaches' in atLeast.body);
});

test('specToIR: class_required_period -> atLeast with classBusy body', () => {
  const ir = specToIR(spec('class_required_period', { class: '6A', period: 1, minCount: 1 }));
  assert.ok(ir);
  const issues = validateIR(ir);
  assert.equal(issues.length, 0, JSON.stringify(issues));
});

test('specToIR: subject_required_period -> atLeast with forall/classSubjectAt', () => {
  const ir = specToIR(spec('subject_required_period', { subject: 'Toán', period: 1, minCount: 1 }));
  assert.ok(ir);
  const issues = validateIR(ir);
  assert.equal(issues.length, 0, JSON.stringify(issues));
});

test('specToIR: teacher_block_period -> not(forall(teaches))', () => {
  const ir = specToIR(spec('teacher_block_period', { teacher: 'Thủy', period: 4 }));
  assert.ok(ir);
  const issues = validateIR(ir);
  assert.equal(issues.length, 0, JSON.stringify(issues));
});

test('specToIR: if_then -> implies(if, then)', () => {
  const ir = specToIR(
    spec(
      'if_then',
      {
        if: { op: 'teacher_teaches_at_slot', teacher: 'Sơn', day: 'monday', period: 1 },
        then: [{ kind: 'teacher_block_slot', params: { teacher: 'Hương', day: 'tuesday', period: 3 } }],
      },
      'if-then'
    )
  );
  assert.ok(ir);
  assert.ok('implies' in ir!.expr);
  const issues = validateIR(ir);
  assert.equal(issues.length, 0, JSON.stringify(issues));
});

test('specToIR: teacher_allowed_periods forbids disallowed periods', () => {
  const ir = specToIR(spec('teacher_allowed_periods', { teacher: 'Thủy', periods: [2, 4] }));
  assert.ok(ir);
  assert.ok('forall' in ir!.expr);
  const issues = validateIR(ir);
  assert.equal(issues.length, 0, JSON.stringify(issues));
});

test('specToIR: teacher_max_per_day -> forall(compare(count, <=, N))', () => {
  const ir = specToIR(spec('teacher_max_per_day', { teacher: 'Thủy', maxPerDay: 3 }));
  assert.ok(ir);
  const issues = validateIR(ir);
  assert.equal(issues.length, 0, JSON.stringify(issues));
});

test('specToIR: unknown kind returns null', () => {
  // custom_dsl is intentionally not in the adapter (it carries its own expr).
  const ir = specToIR({
    id: 't1',
    original: 'test',
    severity: 'hard',
    kind: 'custom_dsl',
    params: {},
  });
  assert.equal(ir, null);
});

test('specsToIR: unconvertible separates custom_dsl from built-ins', () => {
  const specs: ConstraintSpec[] = [
    spec('teacher_required_period', { teacher: 'Thủy', period: 4, minCount: 1 }, 'a'),
    {
      id: 'b',
      original: 'custom',
      severity: 'hard',
      kind: 'custom_dsl',
      params: { expr: { const: true } },
    },
  ];
  const { irs, unconvertible } = specsToIR(specs);
  assert.equal(irs.length, 1);
  assert.equal(unconvertible.length, 1);
  assert.equal(unconvertible[0].kind, 'custom_dsl');
});

test('specToIR: require-family IRs are schema-valid (zod)', () => {
  const specs: ConstraintSpec[] = [
    spec('teacher_required_period', { teacher: 'Thủy', period: 4, minCount: 1 }, 'a'),
    spec('class_required_period', { class: '6A', period: 1, minCount: 1 }, 'b'),
    spec('subject_required_period', { subject: 'Toán', period: 1, minCount: 2 }, 'c'),
  ];
  for (const s of specs) {
    const ir = specToIR(s);
    assert.ok(ir, `expected IR for ${s.kind}`);
    const issues = validateIR(ir);
    assert.equal(issues.length, 0, `${s.kind} produced invalid IR: ${JSON.stringify(issues)}`);
  }
});

test('specToIR: adapted IR is semantic-valid for known AgentInput', () => {
  const specs: ConstraintSpec[] = [
    spec('teacher_required_period', { teacher: 'Thủy', period: 4, minCount: 1 }, 'teacher-required'),
    spec('class_required_period', { class: '6A', period: 1, minCount: 1 }, 'class-required'),
    spec('subject_required_period', { subject: 'Toán', period: 1, minCount: 2 }, 'subject-required'),
    spec('teacher_block_period', { teacher: 'Thủy', period: 4 }, 'teacher-block'),
    spec('class_block_period', { class: '6A', period: 1 }, 'class-block'),
    spec('teacher_max_per_day', { teacher: 'Thủy', maxPerDay: 3 }, 'teacher-max'),
    spec('teacher_min_per_day', { teacher: 'Thủy', minPerDay: 1 }, 'teacher-min'),
  ];

  for (const s of specs) {
    const ir = specToIR(s);
    assert.ok(ir, `expected IR for ${s.kind}`);
    assertSchemaAndTypeValid(ir);
  }
});

test('specToIR: semantic type checker rejects adapted IR with unknown entity', () => {
  const ir = specToIR(spec('teacher_required_period', { teacher: 'Ghost', period: 4, minCount: 1 }));
  assert.ok(ir);
  const result = typeCheckIR(ir, input);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'unknown_teacher'));
});
