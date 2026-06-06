import assert from 'node:assert/strict';
import test from 'node:test';

import { POST } from './route';

const makeRequest = (body: unknown) =>
  new Request('http://localhost/api/provider/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

function jsonResponse(status: number, body: unknown, statusText = 'OK'): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('OpenRouter provider test trusts chat completion over auth/key precheck', async () => {
  const calls: string[] = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/models')) {
      return jsonResponse(200, { data: [{ id: 'deepseek/deepseek-v4-flash' }] });
    }
    if (url.endsWith('/chat/completions')) {
      return jsonResponse(200, { choices: [{ message: { content: 'OK' } }] });
    }
    if (url.endsWith('/auth/key')) {
      throw new Error('auth/key should not be called before successful chat smoke');
    }
    return jsonResponse(404, { error: 'unexpected url' }, 'Not Found');
  }) as typeof fetch;

  try {
    const response = await POST(makeRequest({
      provider: 'openrouter',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
      model: 'deepseek/deepseek-v4-flash',
    }));
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.match(payload.message, /Kết nối thành công/);
    assert.deepEqual(calls, [
      'https://openrouter.ai/api/v1/models',
      'https://openrouter.ai/api/v1/chat/completions',
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('OpenRouter provider test reports model missing before chat smoke', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/models')) {
      return jsonResponse(200, { data: [{ id: 'deepseek/deepseek-chat' }] });
    }
    return jsonResponse(500, { error: 'should not call chat for missing model' });
  }) as typeof fetch;

  try {
    const response = await POST(makeRequest({
      provider: 'openrouter',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
      model: 'deepseek/deepseek-v4-flash',
    }));
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, false);
    assert.match(payload.message, /Model không có trong OpenRouter/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
