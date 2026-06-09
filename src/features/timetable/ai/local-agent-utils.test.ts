import test from 'node:test';
import assert from 'node:assert/strict';

import { hashKey, stableHash } from './local-agent-utils';

test('hashKey is deterministic and order-independent', () => {
  const a = hashKey({ x: 1, y: 2, nested: { a: 1, b: 2 } });
  const b = hashKey({ nested: { b: 2, a: 1 }, y: 2, x: 1 });
  assert.equal(a, b);
  assert.equal(a.length, 8, 'FNV-1a 32-bit should be 8 hex chars');
});

test('hashKey differs for different inputs', () => {
  assert.notEqual(hashKey({ x: 1 }), hashKey({ x: 2 }));
  assert.notEqual(hashKey({ x: 1 }), hashKey({ y: 1 }));
});

test('hashKey is bounded length even for huge inputs', () => {
  const huge = { data: 'x'.repeat(100_000) };
  const k = hashKey(huge);
  assert.ok(k.length <= 16, `hashKey too long: ${k.length}`);
});

test('hashKey matches stableHash-prefixed key for cache equality semantics', () => {
  // Two different ways to spell the same constraint signature collide.
  // (Arrays are intentionally NOT reordered — list order is semantically
  // meaningful, e.g. order of `custom_specs` in payload matters.)
  const sig1 = { kind: 'teacher_block_day', severity: 'hard', params: { teacher: 'A', day: 'mon' } };
  const sig2 = { params: { day: 'mon', teacher: 'A' }, kind: 'teacher_block_day', severity: 'hard' };
  assert.equal(hashKey(sig1), hashKey(sig2));
});

test('hashKey preserves array order (lists are semantically ordered)', () => {
  // Arrays are NOT reordered by sortObjectDeep. If we ever need order-
  // independent array hashing, callers should wrap arrays in an object with
  // a named key (e.g. `{ids: [...]}`).
  assert.notEqual(hashKey([1, 2, 3]), hashKey([3, 2, 1]));
});

test('stableHash remains order-independent (back-compat)', () => {
  // stableHash is a thin wrapper around JSON.stringify(sortObjectDeep) — keep its
  // contract stable so existing cache keys don't suddenly change format.
  assert.equal(stableHash({ a: 1, b: 2 }), stableHash({ b: 2, a: 1 }));
});
