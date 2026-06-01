import assert from 'node:assert/strict';
import test from 'node:test';

import { astCheckPython, syntaxCheckPython } from './skeleton-injector';

test('astCheckPython - returns ok: true when backend validator passes', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.equal(url, '/api/ai/python-ast-check');
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: { ok: true }
        })
      } as any;
    };

    const res = await astCheckPython('print("hello")');
    assert.ok(res.ok);
    assert.equal(res.error, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('astCheckPython - returns ok: false when backend validator finds forbidden nodes', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.equal(url, '/api/ai/python-ast-check');
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: { ok: false, error: 'Forbidden import at line 1' }
        })
      } as any;
    };

    const res = await astCheckPython('import os');
    assert.ok(!res.ok);
    assert.equal(res.error, 'Forbidden import at line 1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('syntaxCheckPython - preserves Electron errorDigest fallback', async () => {
  const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  (globalThis as typeof globalThis & { window?: unknown }).window = {
    electron: {
      python: {
        syntaxCheck: async () => ({ ok: false, errorDigest: 'SyntaxError: invalid syntax at line 4' }),
      },
    },
  };

  try {
    const res = await syntaxCheckPython('broken python');
    assert.equal(res.ok, false);
    assert.equal(res.error, 'SyntaxError: invalid syntax at line 4');
  } finally {
    (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
  }
});
