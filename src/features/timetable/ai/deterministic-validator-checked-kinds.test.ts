import test from 'node:test';
import assert from 'node:assert/strict';

import { getDeterministicallyCheckedKinds, isDeterministicallyCheckedKind } from './deterministic-validator';
import { CHECKED_KINDS } from './constraint-registry';

test('teacher_block_day có checker', () => {
  assert.equal(isDeterministicallyCheckedKind('teacher_block_day'), true);
});

test('custom_dsl không có checker', () => {
  assert.equal(isDeterministicallyCheckedKind('custom_dsl'), false);
});

test('getDeterministicallyCheckedKinds trả readonly view', () => {
  const set = getDeterministicallyCheckedKinds();
  assert.equal(set.has('teacher_block_day'), true);
  assert.equal(set.has('custom_dsl'), false);
  // Readonly Set — đảm bảo cùng instance với CHECKED_KINDS registry
  assert.equal(set, CHECKED_KINDS);
});
