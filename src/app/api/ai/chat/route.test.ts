import assert from 'node:assert/strict';
import test from 'node:test';

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
  assert.equal((mapped[0] as { cache_control?: { type: string } }).cache_control?.type, 'ephemeral');
  assert.equal((mapped[1] as { cache_control?: { type: string } }).cache_control?.type, 'ephemeral');
  assert.equal((mapped[2] as { cache_control?: { type: string } }).cache_control, undefined);
});

test('openai models do not receive anthropic cache metadata', () => {
  const headers = __chatInternal.providerHeaders('openai/gpt-4.1', true);
  assert.equal(headers, undefined);

  const messages = [{ role: 'user' as const, content: 'u' }];
  const mapped = __chatInternal.applyProviderSpecificCaching('openai/gpt-4.1', messages, true);
  assert.equal((mapped[0] as { cache_control?: { type: string } }).cache_control, undefined);
});

test('deepseek models do not receive anthropic cache metadata', () => {
  const headers = __chatInternal.providerHeaders('deepseek/deepseek-chat', true);
  assert.equal(headers, undefined);

  const messages = [{ role: 'user' as const, content: 'u' }];
  const mapped = __chatInternal.applyProviderSpecificCaching('deepseek/deepseek-chat', messages, true);
  assert.equal((mapped[0] as { cache_control?: { type: string } }).cache_control, undefined);
});

test('provider resolver keeps OpenRouter models on chat completions', () => {
  assert.equal(
    __chatInternal.resolveProvider(undefined, 'https://openrouter.ai/api/v1', 'deepseek/deepseek-v4-flash'),
    'openrouter'
  );
});

test('provider resolver routes direct GPT-5 style models to Responses API', () => {
  assert.equal(
    __chatInternal.resolveProvider(undefined, 'https://api.openai.com/v1', 'gpt-5.5'),
    'openai-responses'
  );
});

test('buildChatRequest uses chat completions for OpenRouter', () => {
  const request = __chatInternal.buildChatRequest(
    'openrouter',
    'https://openrouter.ai/api/v1',
    'deepseek/deepseek-v4-flash',
    [{ role: 'user', content: 'ping' }],
    { model: 'deepseek/deepseek-v4-flash' },
    false
  );

  assert.equal(request.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.deepEqual(request.requestBody.messages, [{ role: 'user', content: 'ping' }]);
});

test('buildChatRequest uses Responses API for direct OpenAI models', () => {
  const request = __chatInternal.buildChatRequest(
    'openai-responses',
    'https://api.openai.com/v1',
    'gpt-5.5',
    [{ role: 'user', content: 'ping' }],
    { model: 'gpt-5.5', max_tokens: 8 },
    false
  );

  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.deepEqual(request.requestBody.input, [{ role: 'user', content: 'ping' }]);
  assert.equal(request.requestBody.max_output_tokens, 8);
});

test('parseProviderResponse parses OpenAI Responses output_text', () => {
  const parsed = __chatInternal.parseProviderResponse(
    JSON.stringify({ output_text: '{"ok":true}', usage: { total_tokens: 9 } })
  );

  assert.equal(parsed.content, '{"ok":true}');
  assert.deepEqual(parsed.usage, { total_tokens: 9 });
});

test('parseProviderResponse parses normal JSON chat completion', () => {
  const parsed = __chatInternal.parseProviderResponse(
    JSON.stringify({
      id: 'cmpl_1',
      object: 'chat.completion',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: '{"ok":true}' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    })
  );

  assert.equal(parsed.content, '{"ok":true}');
  assert.deepEqual(parsed.usage, { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 });
});

test('parseProviderResponse parses SSE data payload', () => {
  const parsed = __chatInternal.parseProviderResponse(
    [
      'data: {"id":"cmpl_1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"{\\"a\\":"}}]}',
      'data: {"id":"cmpl_1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"1}"}}]}',
      'data: {"id":"cmpl_1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":12}}',
      'data: [DONE]',
    ].join('\n')
  );

  assert.equal(parsed.content, '{"a":1}');
  assert.deepEqual(parsed.usage, { total_tokens: 12 });
});

test('parseProviderResponse throws provider error from SSE event', () => {
  assert.throws(
    () =>
      __chatInternal.parseProviderResponse(
        [
          'data: {"id":"cmpl_1","object":"chat.completion.chunk","error":{"message":"Provider disconnected"}}',
          'data: [DONE]',
        ].join('\n')
      ),
    /Provider disconnected/
  );
});
