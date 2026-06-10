/**
 * Extra Phase-0 contract tests for the constraint engine.
 *
 * These tests freeze the most dangerous Vietnamese semantic flip:
 * "phải có / ít nhất" is an at-least requirement, never an allowed-only or block rule.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateNegativeGuard } from './negative-guard';
import type { ConstraintSpec } from './constraint-spec';

function spec(kind: ConstraintSpec['kind'], params: Record<string, unknown> = {}): ConstraintSpec {
  return {
    id: 'phase0-contract',
    original: '',
    severity: 'hard',
    kind,
    params,
  };
}

test('contract: "Thủy phải có tiết 4" must reject block-period silent flip', () => {
  const decision = evaluateNegativeGuard(
    spec('teacher_block_period', { teacher: 'Thủy', period: 4 }),
    'Cô Thủy phải có ít nhất 1 tiết 4 trong tuần',
  );

  assert.equal(decision.kind, 'demote_to_medium_with_confirmation');
  if (decision.kind === 'demote_to_medium_with_confirmation') {
    assert.equal(decision.marker, 'require');
    assert.equal(decision.violatedKind, 'teacher_block_period');
  }
});

test('contract: "Thủy phải có tiết 4" accepts required-period semantics', () => {
  const decision = evaluateNegativeGuard(
    spec('teacher_required_period', { teacher: 'Thủy', period: 4, minCount: 1 }),
    'Cô Thủy phải có ít nhất 1 tiết 4 trong tuần',
  );

  assert.equal(decision.kind, 'ok');
});

test('contract: "Thủy không dạy tiết 4" must reject required-period silent flip', () => {
  const decision = evaluateNegativeGuard(
    spec('teacher_required_period', { teacher: 'Thủy', period: 4, minCount: 1 }),
    'Cô Thủy không dạy tiết 4',
  );

  assert.equal(decision.kind, 'demote_to_medium_with_confirmation');
  if (decision.kind === 'demote_to_medium_with_confirmation') {
    assert.equal(decision.marker, 'block');
    assert.equal(decision.violatedKind, 'teacher_required_period');
  }
});

test('contract: "Thủy chỉ dạy tiết 4" is allowed-periods, not required-period', () => {
  const allowed = evaluateNegativeGuard(
    spec('teacher_allowed_periods', { teacher: 'Thủy', periods: [4] }),
    'Cô Thủy chỉ dạy tiết 4',
  );
  const required = evaluateNegativeGuard(
    spec('teacher_required_period', { teacher: 'Thủy', period: 4, minCount: 1 }),
    'Cô Thủy chỉ dạy tiết 4',
  );

  assert.equal(allowed.kind, 'ok');
  assert.equal(required.kind, 'ok');
});
