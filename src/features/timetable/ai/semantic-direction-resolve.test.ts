import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSemanticDirection } from './semantic-direction';

test('resolveSemanticDirection flags require+only as needs clarification', () => {
  const analysis = resolveSemanticDirection('Cô Thủy phải có và chỉ dạy tiết 4');
  assert.equal(analysis.needsClarification, true);
  assert.equal(analysis.direction, 'unknown');
});

test('resolveSemanticDirection detects block for không có tiết trống', () => {
  const analysis = resolveSemanticDirection('Thầy Sơn không có tiết trống');
  assert.equal(analysis.direction, 'block');
});

test('resolveSemanticDirection ignores negated block marker', () => {
  const analysis = resolveSemanticDirection('Không phải nghỉ tiết 4');
  assert.notEqual(analysis.direction, 'block');
});