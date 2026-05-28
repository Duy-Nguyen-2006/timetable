import test from 'node:test';
import assert from 'node:assert/strict';

import { __parseModelJsonInternal, parseModelJson } from './parse-model-json';

test('parseModelJson parses plain valid JSON', () => {
  const value = parseModelJson('{"ok":true,"count":2}');
  assert.deepEqual(value, { ok: true, count: 2 });
});

test('parseModelJson parses fenced JSON', () => {
  const value = parseModelJson('```json\n{"name":"solver","ok":true}\n```');
  assert.deepEqual(value, { name: 'solver', ok: true });
});

test('parseModelJson extracts first JSON object from wrapped text', () => {
  const value = parseModelJson('Result:\n{"status":"done","patches":[]}\nThanks');
  assert.deepEqual(value, { status: 'done', patches: [] });
});

test('parseModelJson throws on truncated unterminated JSON', () => {
  assert.throws(() => parseModelJson('{"status":"broken","message":"unterminated'), /Invalid JSON/);
});

test('extractFirstJsonObject handles braces inside string values', () => {
  const raw = 'prefix {"message":"hello {world}","ok":true} suffix';
  const extracted = __parseModelJsonInternal.extractFirstJsonObject(raw);
  assert.equal(extracted, '{"message":"hello {world}","ok":true}');
});
