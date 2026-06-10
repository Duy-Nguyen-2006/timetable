import test from 'node:test';
import assert from 'node:assert/strict';

import { getDeterministicEligibility, isDeterministicallyEligible } from './deterministic-solver-eligibility';
import type { ConstraintSpec } from './constraint-spec';

const baseSpec: Omit<ConstraintSpec, 'kind' | 'severity' | 'params'> = {
  id: 'c1',
  original: 'ràng buộc mẫu',
};

test('built-in hard constraint có checker → eligible', () => {
  const specs: ConstraintSpec[] = [
    {
      ...baseSpec,
      id: 'c1',
      severity: 'hard',
      kind: 'teacher_block_period',
      params: { teacher: 'Sơn', period: 1 },
    },
  ];
  const result = getDeterministicEligibility(specs);
  assert.equal(result.ok, true);
  assert.equal(isDeterministicallyEligible(specs), true);
});

test('hard custom_dsl bị reject', () => {
  const specs: ConstraintSpec[] = [
    {
      ...baseSpec,
      id: 'c1',
      severity: 'hard',
      kind: 'custom_dsl',
      params: {},
    },
  ];
  const result = getDeterministicEligibility(specs);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.hardCustomSpecs.length, 1);
    assert.match(result.reason, /custom_dsl hard/);
  }
  assert.equal(isDeterministicallyEligible(specs), false);
});

test('hard kind ngoài registry bị reject', () => {
  const specs: ConstraintSpec[] = [
    {
      ...baseSpec,
      id: 'c1',
      severity: 'hard',
      kind: 'unknown_kind' as ConstraintSpec['kind'],
      params: {},
    },
  ];
  const result = getDeterministicEligibility(specs);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.unsupportedHardSpecs.length, 1);
    assert.equal(result.hardCustomSpecs.length, 0);
    assert.equal(result.hardUncheckedSpecs.length, 0);
    assert.match(result.reason, /chưa được mã hóa CP-SAT/);
  }
});

test('soft custom_dsl không block eligibility', () => {
  const specs: ConstraintSpec[] = [
    {
      ...baseSpec,
      id: 'c1',
      severity: 'soft',
      kind: 'custom_dsl',
      params: {},
    },
  ];
  const result = getDeterministicEligibility(specs);
  assert.equal(result.ok, true);
});

test('soft unknown kind không block eligibility', () => {
  const specs: ConstraintSpec[] = [
    {
      ...baseSpec,
      id: 'c1',
      severity: 'soft',
      kind: 'future_soft_kind' as ConstraintSpec['kind'],
      params: {},
    },
  ];
  const result = getDeterministicEligibility(specs);
  assert.equal(result.ok, true);
});

test('mix hard + soft → chỉ cần hard đủ điều kiện', () => {
  const specs: ConstraintSpec[] = [
    {
      ...baseSpec,
      id: 'c1',
      severity: 'hard',
      kind: 'teacher_block_day',
      params: { teacher: 'Sơn', day: 'monday' },
    },
    {
      ...baseSpec,
      id: 'c2',
      severity: 'soft',
      kind: 'custom_dsl',
      params: {},
    },
  ];
  const result = getDeterministicEligibility(specs);
  assert.equal(result.ok, true);
});

test('multiple hard unsupported → reason liệt kê cả 2 loại', () => {
  const specs: ConstraintSpec[] = [
    {
      ...baseSpec,
      id: 'c1',
      severity: 'hard',
      kind: 'custom_dsl',
      params: {},
    },
    {
      ...baseSpec,
      id: 'c2',
      severity: 'hard',
      kind: 'unknown_kind' as ConstraintSpec['kind'],
      params: {},
    },
  ];
  const result = getDeterministicEligibility(specs);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.hardCustomSpecs.length, 1);
    assert.equal(result.unsupportedHardSpecs.length, 1);
    assert.match(result.reason, /custom_dsl hard chưa có IR expr\/pythonPredicate/);
    assert.match(result.reason, /chưa được mã hóa CP-SAT/);
  }
});

test('empty batch → eligible (không có gì để check)', () => {
  const result = getDeterministicEligibility([]);
  assert.equal(result.ok, true);
});
