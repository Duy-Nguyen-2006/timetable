import assert from 'node:assert/strict';
import test from 'node:test';

import { applyRepairPatches } from './repair';

test('applyRepairPatches - applies single patch', () => {
  const src = 'foo bar baz';
  const result = applyRepairPatches(src, [
    { oldStr: 'bar', newStr: 'BAR', reason: 'test' },
  ]);
  assert.equal(result, 'foo BAR baz');
});

test('applyRepairPatches - rejects ambiguous oldStr when replaceAll not set', () => {
  const src = 'foo foo bar';
  assert.throws(
    () => applyRepairPatches(src, [{ oldStr: 'foo', newStr: 'FOO', reason: 'test' }]),
    /ambiguous/i
  );
});

test('applyRepairPatches - accepts replaceAll for repeated oldStr', () => {
  const src = 'foo foo bar';
  const result = applyRepairPatches(src, [
    { oldStr: 'foo', newStr: 'FOO', reason: 'test', replaceAll: true },
  ]);
  assert.equal(result, 'FOO FOO bar');
});

test('applyRepairPatches - is atomic: rejects all if one patch invalid', () => {
  const src = 'foo bar baz';
  assert.throws(
    () => applyRepairPatches(src, [
      { oldStr: 'bar', newStr: 'BAR', reason: 'ok' },
      { oldStr: 'NOT_PRESENT', newStr: 'X', reason: 'fail' },
    ]),
    /not found/i
  );
});

test('applyRepairPatches - applies multiple patches in source-order, not list-order', () => {
  const src = 'AAA BBB CCC';
  const result = applyRepairPatches(src, [
    { oldStr: 'CCC', newStr: 'ccc', reason: 'late-in-list' },
    { oldStr: 'AAA', newStr: 'aaa', reason: 'early-in-list' },
  ]);
  assert.equal(result, 'aaa BBB ccc');
});

test('applyRepairPatches - applies correctly when newStr contains another patch oldStr', () => {
  const src = 'X Y Z';
  const result = applyRepairPatches(src, [
    { oldStr: 'X', newStr: 'Y', reason: '...' },
    { oldStr: 'Y', newStr: 'W', reason: '...' },
  ]);
  assert.equal(result, 'W Y Z');
});
