/**
 * Tests for solver seed determinism (Section 14.8).
 *
 * Goal: same input → same seed; different input → different seed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveSolverSeed, DEFAULT_SOLVER_SEED } from './local-agent-utils';
import type { ConstraintSpec } from './constraint-spec';

test('deriveSolverSeed returns same seed for same input', () => {
  const specs: Array<{ id: string; kind: string; params: Record<string, unknown> }> = [
    { id: 'a', kind: 'teacher_block_day', params: { teacher: 'Sơn', day: 'monday' } },
    { id: 'b', kind: 'teacher_max_per_day', params: { teacher: 'Sơn', maxPerDay: 4 } },
  ];
  const s1 = deriveSolverSeed(specs);
  const s2 = deriveSolverSeed(specs);
  assert.equal(s1, s2);
});

test('deriveSolverSeed returns different seeds for different input', () => {
  const a: Array<{ id: string; kind: string; params: Record<string, unknown> }> = [
    { id: 'a', kind: 'teacher_block_day', params: { teacher: 'Sơn', day: 'monday' } },
  ];
  const b: Array<{ id: string; kind: string; params: Record<string, unknown> }> = [
    { id: 'a', kind: 'teacher_block_day', params: { teacher: 'Hương', day: 'monday' } },
  ];
  assert.notEqual(deriveSolverSeed(a), deriveSolverSeed(b));
});

test('deriveSolverSeed is order-independent', () => {
  const a: Array<{ id: string; kind: string; params: Record<string, unknown> }> = [
    { id: 'a', kind: 'teacher_block_day', params: { teacher: 'Sơn', day: 'monday' } },
    { id: 'b', kind: 'teacher_max_per_day', params: { teacher: 'Sơn', maxPerDay: 4 } },
  ];
  const b: Array<{ id: string; kind: string; params: Record<string, unknown> }> = [
    { id: 'b', kind: 'teacher_max_per_day', params: { teacher: 'Sơn', maxPerDay: 4 } },
    { id: 'a', kind: 'teacher_block_day', params: { teacher: 'Sơn', day: 'monday' } },
  ];
  assert.equal(deriveSolverSeed(a), deriveSolverSeed(b));
});

test('deriveSolverSeed returns a non-negative int32', () => {
  const seed = deriveSolverSeed([{ id: 'x', kind: 'teacher_block_day', params: {} }]);
  assert.ok(Number.isInteger(seed));
  assert.ok(seed >= 0);
  assert.ok(seed < 2 ** 31);
});

test('DEFAULT_SOLVER_SEED is set to 42 for fallback reproducibility', () => {
  assert.equal(DEFAULT_SOLVER_SEED, 42);
});

test('deriveSolverSeed works on empty specs', () => {
  // Empty input falls back to a stable value (must not throw)
  const seed = deriveSolverSeed([]);
  assert.ok(typeof seed === 'number');
});
