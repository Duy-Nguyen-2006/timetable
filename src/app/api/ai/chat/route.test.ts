import test from 'node:test';
import assert from 'node:assert/strict';

import { __chatInternal } from './route';

test('anthropic models receive cache headers and message cache_control', () => {
  const headers = __chatInternal.providerHeaders('anthropic/claude-3.5-sonnet', true);
  assert.deepEqual(headers, { 'anthropic-beta': 'prompt-caching-2024-07-31' });

  const messages = [
    { role: 'system' as const, content: 's' },
    { role: 'user' as const, content: 'u' },
    { role: 'assistant' as const, content: 'a' },
  ];
  const mapped = __chatInternal.applyProviderSpecificCaching('anthropic/claude-3.5-sonnet', messages, true);
  assert.equal((mapped[0] as any).cache_control?.type, 'ephemeral');
  assert.equal((mapped[1] as any).cache_control?.type, 'ephemeral');
  assert.equal((mapped[2] as any).cache_control, undefined);
});

test('openai models do not receive anthropic cache metadata', () => {
  const headers = __chatInternal.providerHeaders('openai/gpt-4.1', true);
  assert.equal(headers, undefined);

  const messages = [{ role: 'user' as const, content: 'u' }];
  const mapped = __chatInternal.applyProviderSpecificCaching('openai/gpt-4.1', messages, true);
  assert.equal((mapped[0] as any).cache_control, undefined);
});

test('deepseek models do not receive anthropic cache metadata', () => {
  const headers = __chatInternal.providerHeaders('deepseek/deepseek-chat', true);
  assert.equal(headers, undefined);

  const messages = [{ role: 'user' as const, content: 'u' }];
  const mapped = __chatInternal.applyProviderSpecificCaching('deepseek/deepseek-chat', messages, true);
  assert.equal((mapped[0] as any).cache_control, undefined);
});
