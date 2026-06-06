/**
 * Tier 4 — constraint-pattern-cache tests
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { __patternCacheInternal, jaccardSimilarity, store, tokenize, type CacheEntry } from './constraint-pattern-cache';
import type { ConstraintSpec } from './constraint-spec';

type LocalStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

function makeLocalStorageStub(): LocalStorageLike {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
}

function withLocalStorage<T>(stub: LocalStorageLike, fn: () => T): T {
  const original = (globalThis as Record<string, unknown>).localStorage;
  (globalThis as Record<string, unknown>).localStorage = stub;
  try {
    return fn();
  } finally {
    (globalThis as Record<string, unknown>).localStorage = original;
  }
}

function spec(id: string, kind: string, params: Record<string, unknown> = {}): ConstraintSpec {
  return { id, original: 'test', severity: 'hard', kind: kind as ConstraintSpec['kind'], params };
}

test('tokenize strips diacritics and lowercases', () => {
  const tokens = tokenize('Sơn và Hương dạy thứ 2 tiết 2');
  assert.deepEqual(tokens, ['2', 'day', 'huong', 'son', 'thu', 'tiet', 'va']);
});

test('jaccardSimilarity returns 1.0 for identical token sets', () => {
  assert.equal(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c']), 1);
});

test('jaccardSimilarity returns 0 for disjoint token sets', () => {
  assert.equal(jaccardSimilarity(['a', 'b'], ['c', 'd']), 0);
});

test('jaccardSimilarity 0.5 for half overlap', () => {
  // 1 intersection / (2 + 2 - 1) = 1/3
  const sim = jaccardSimilarity(['a', 'b'], ['b', 'c']);
  assert.equal(sim, 1 / 3);
});

test('lookup returns null when cache is empty', () => {
  const stub = makeLocalStorageStub();
  withLocalStorage(stub, () => {
    const cache = __patternCacheInternal.readCache();
    assert.ok(cache);
    assert.equal(cache!.entries.length, 0);
  });
});

test('lookup returns null for unparseable JSON', () => {
  const stub = makeLocalStorageStub();
  stub.setItem(__patternCacheInternal.CACHE_KEY, 'not json{{{');
  withLocalStorage(stub, () => {
    assert.equal(__patternCacheInternal.readCache(), null);
  });
});

test('lookup returns null for unknown version', () => {
  const stub = makeLocalStorageStub();
  stub.setItem(__patternCacheInternal.CACHE_KEY, JSON.stringify({ version: 99, entries: [] }));
  withLocalStorage(stub, () => {
    assert.equal(__patternCacheInternal.readCache(), null);
  });
});

test('lookup returns null for unknown kind in cached spec', () => {
  const stub = makeLocalStorageStub();
  stub.setItem(
    __patternCacheInternal.CACHE_KEY,
    JSON.stringify({
      version: 1,
      entries: [{ text: 'foo', spec: { id: 'c1', original: 'foo', severity: 'hard', kind: 'fake_kind_xyz', params: {} }, createdAt: '2026-06-01' }],
    })
  );
  withLocalStorage(stub, () => {
    const cache = __patternCacheInternal.readCache();
    assert.ok(cache, 'readCache should return a valid schema, dropping the bad entry');
    assert.equal(cache?.entries.length, 0);
  });
});

test('store writes JSON to localStorage with version 1', () => {
  const stub = makeLocalStorageStub();
  withLocalStorage(stub, () => {
    const ok = store('Sơn không dạy thứ 2', spec('c1', 'teacher_block_day', { teacher: 'Sơn', day: 'mon' }));
    assert.equal(ok, true);
    const raw = stub.getItem(__patternCacheInternal.CACHE_KEY);
    assert.ok(raw);
    const parsed = JSON.parse(String(raw));
    assert.equal(parsed.version, 1);
    assert.equal(parsed.entries.length, 1);
  });
});

test('LRU eviction keeps only the most recent 200 entries', () => {
  const stub = makeLocalStorageStub();
  withLocalStorage(stub, () => {
    // Pre-seed 250 entries directly.
    const seedEntries: CacheEntry[] = [];
    for (let i = 0; i < 250; i += 1) {
      seedEntries.push({
        text: `unique-text-${i}`,
        spec: spec(`c${i}`, 'teacher_block_day', { teacher: 'X', day: 'mon' }),
        createdAt: new Date(2026, 0, 1, 0, i).toISOString(),
      });
    }
    __patternCacheInternal.writeCache({ version: 1, entries: seedEntries });
    // Add one more → should evict the oldest 51.
    store('trigger', spec('cNew', 'teacher_block_day'));
    const cache = __patternCacheInternal.readCache();
    assert.ok(cache);
    assert.ok(cache!.entries.length <= __patternCacheInternal.MAX_ENTRIES);
  });
});
