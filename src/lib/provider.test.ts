import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProviderModel, parseProviderPasteLine } from './provider';

test('parseProviderPasteLine parses comma-separated OpenRouter blob', () => {
  const parsed = parseProviderPasteLine(
    'https://openrouter.ai/api/v1, model deepseek/deepseek-v4-flash , sk-or-v1-test-key'
  );
  assert.deepEqual(parsed, {
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'deepseek/deepseek-v4-flash',
    apiKey: 'sk-or-v1-test-key',
  });
});

test('normalizeProviderModel strips model prefix', () => {
  assert.equal(normalizeProviderModel('model deepseek/deepseek-v4-flash'), 'deepseek/deepseek-v4-flash');
  assert.equal(normalizeProviderModel('  deepseek/deepseek-chat  '), 'deepseek/deepseek-chat');
});

test('parseProviderPasteLine returns null for empty input', () => {
  assert.equal(parseProviderPasteLine('   '), null);
});