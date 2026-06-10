/**
 * Tests for the V2 golden eval set (Phase 2.4).
 *
 * The V2 set is dual-keyed: each case asserts BOTH the expected built-in
 * kind AND the expected IR expr shape. The frozen cases are protected
 * against silent changes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { GOLDEN_EVAL_SET_V2, summarizeGoldenSetV2 } from './golden-eval-set-v2';

test('golden V2 has at least 10 cases', () => {
  assert.ok(GOLDEN_EVAL_SET_V2.length >= 10, `expected ≥10 cases, got ${GOLDEN_EVAL_SET_V2.length}`);
});

test('golden V2 IDs are unique', () => {
  const ids = new Set(GOLDEN_EVAL_SET_V2.map((c) => c.id));
  assert.equal(ids.size, GOLDEN_EVAL_SET_V2.length);
});

test('golden V2 has the frozen regression cases', () => {
  const frozenIds = GOLDEN_EVAL_SET_V2.filter((c) => c.isFrozen).map((c) => c.id);
  assert.ok(frozenIds.includes('G2-FROZEN-001'), 'must include the Thuy phai co tiet 4 frozen case');
  assert.ok(frozenIds.includes('G2-FROZEN-002'), 'must include the shorter Thuy phai co tiet 4 frozen case');
  assert.ok(frozenIds.includes('G2-FROZEN-003'), 'must include the "chi day" frozen case');
  assert.ok(frozenIds.includes('G2-FROZEN-004'), 'must include the "khong day" frozen case');
});

test('frozen cases all map to positive or block, never to inverse', () => {
  // For each frozen case, the kind and shape must agree on direction.
  for (const c of GOLDEN_EVAL_SET_V2.filter((x) => x.isFrozen)) {
    if (c.expectedKind === 'teacher_required_period') {
      // Must have the require shape, not block or allowed.
      assert.equal(c.expectedExprShape.shape, 'atLeastDaysTeaches');
    }
    if (c.expectedKind === 'teacher_block_period') {
      // Must have the block shape, not require or allowed.
      assert.equal(c.expectedExprShape.shape, 'notForallDaysTeaches');
    }
    if (c.expectedKind === 'teacher_allowed_periods') {
      // Must have the allowed shape.
      assert.equal(c.expectedExprShape.shape, 'forallDaysTeachesInPeriods');
    }
  }
});

test('summary aggregates direction counts', () => {
  const summary = summarizeGoldenSetV2();
  assert.equal(summary.total, GOLDEN_EVAL_SET_V2.length);
  assert.equal(summary.frozen, GOLDEN_EVAL_SET_V2.filter((c) => c.isFrozen).length);
  // The require family should have multiple cases.
  assert.ok(summary.byShape['atLeastDaysTeaches'] >= 2, 'expected ≥2 atLeastDaysTeaches cases');
});
