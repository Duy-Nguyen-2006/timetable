import test from 'node:test';
import assert from 'node:assert/strict';

import { segmentConstraint } from './constraint-segmenter';

test('segmentConstraint segments a simple constraint', () => {
  const segment = segmentConstraint('Thầy Sơn không dạy thứ 3 tiết 5');
  assert.equal(segment.shape, 'simple');
  assert.deepEqual(segment.atoms, ['Thầy Sơn không dạy thứ 3 tiết 5']);
});

test('segmentConstraint segments if-then with multiple THEN atoms', () => {
  const segment = segmentConstraint('Nếu cô A dạy thứ 3 tiết 4 thì thứ 5 thầy B không dạy tiết 2 và thầy C phải dạy thứ 2');
  assert.equal(segment.shape, 'if_then');
  assert.equal(segment.ifClause, 'cô A dạy thứ 3 tiết 4');
  assert.deepEqual(segment.atoms, ['thứ 5 thầy B không dạy tiết 2', 'thầy C phải dạy thứ 2']);
});

test('segmentConstraint extracts day scope and drops illustration text', () => {
  const segment = segmentConstraint('Vào thứ 6, nếu Thúy và Yên đều có tiết dạy thì họ không được cùng 1 tiết, ví dụ cùng tiết 2');
  assert.equal(segment.scope?.day, 'thu6');
  assert.equal(segment.shape, 'if_then');
  assert.equal(segment.atoms.some((atom) => atom.includes('tiết 2')), false);
  assert.deepEqual(segment.droppedIllustrations, ['ví dụ cùng tiết 2']);
});
