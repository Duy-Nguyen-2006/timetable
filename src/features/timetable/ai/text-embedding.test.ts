import test from 'node:test';
import assert from 'node:assert/strict';

import { computeSemanticEmbedding, cosineSimilarity, EMBEDDING_DIM } from './text-embedding';

test('computeSemanticEmbedding returns normalized 384-dim vector', () => {
  const vec = computeSemanticEmbedding('Thầy Sơn phải có tiết 4');
  assert.equal(vec.length, EMBEDDING_DIM);
  const norm = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0));
  assert.ok(Math.abs(norm - 1) < 0.001 || norm === 0);
});

test('cosineSimilarity ranks paraphrases above unrelated text', () => {
  const query = computeSemanticEmbedding('Cô Thủy phải có tiết 4');
  const close = computeSemanticEmbedding('Thủy bắt buộc có tiết 4');
  const far = computeSemanticEmbedding('Lớp 6A không học tiết 5');
  assert.ok(cosineSimilarity(query, close) > cosineSimilarity(query, far));
});