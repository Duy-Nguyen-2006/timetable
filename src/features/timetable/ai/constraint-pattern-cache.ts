/**
 * Constraint pattern cache — Tier 4 (VAL-T4-007..010, 014, 017)
 *
 * localStorage-backed cache at key `tt:constraint-pattern-cache:v1`.
 * Lookup: Jaccard similarity on whitespace + diacritic-normalized token sets, threshold 0.8.
 * Storage limit: 200 entries, LRU eviction on overflow.
 * Resilience: unparseable JSON → null, unknown version → null, quota-exceeded → false.
 *
 * APIs:
 *   - lookup(text): ConstraintSpec | null
 *   - store(text, spec): boolean
 *   - clear(): void
 *   - size(): number
 */

import { CONSTRAINT_KINDS } from './constraint-registry';
import type { ConstraintKind, ConstraintSpec } from './constraint-spec';
import { normalizeConstraintText } from './translator-text';

const CACHE_KEY = 'tt:constraint-pattern-cache:v1';
const CACHE_VERSION = 1;
const MAX_ENTRIES = 200;
const JACCARD_THRESHOLD = 0.8;

const KNOWN_KINDS: ReadonlySet<ConstraintKind> = new Set(CONSTRAINT_KINDS);

export type CacheEntry = {
  text: string;
  spec: ConstraintSpec;
  createdAt: string;
};

export type CacheSchema = {
  version: number;
  entries: CacheEntry[];
};

export type CacheLookupResult = {
  spec: ConstraintSpec;
  sourceText: string;
};

/**
 * Tokenize text: lowercase, strip diacritics, split on whitespace + punctuation.
 * Returns sorted unique tokens for stable Jaccard comparison.
 */
export function tokenize(text: string): string[] {
  const normalized = normalizeConstraintText(text)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim();
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return Array.from(new Set(tokens)).sort((a, b) => a.localeCompare(b));
}

export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function isQuotaExceeded(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /quota/i.test(err.message)
  );
}

function readCache(): CacheSchema | null {
  if (typeof localStorage === 'undefined') return null;
  let raw: string | null;
  try {
    raw = localStorage.getItem(CACHE_KEY);
  } catch {
    return null;
  }
  if (!raw) return { version: CACHE_VERSION, entries: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Resilience: unparseable JSON returns null without throwing.
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== CACHE_VERSION) return null; // unknown version rejects
  if (!Array.isArray(obj.entries)) return null;
  // Reject unknown kind in any cached spec.
  const validEntries: CacheEntry[] = [];
  for (const e of obj.entries as CacheEntry[]) {
    if (
      e &&
      typeof e.text === 'string' &&
      typeof e.createdAt === 'string' &&
      e.spec &&
      typeof e.spec === 'object' &&
      typeof e.spec.kind === 'string' &&
      typeof e.spec.id === 'string' &&
      KNOWN_KINDS.has(e.spec.kind as ConstraintKind)
    ) {
      validEntries.push(e);
    }
  }
  return { version: CACHE_VERSION, entries: validEntries };
}

function writeCache(cache: CacheSchema): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    return true;
  } catch (err) {
    if (isQuotaExceeded(err)) {
      // Try once more after evicting 25% oldest entries.
      const keep = Math.floor(MAX_ENTRIES * 0.75);
      const trimmed: CacheSchema = {
        version: CACHE_VERSION,
        entries: cache.entries.slice(-keep),
      };
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

/**
 * Find best match by Jaccard similarity ≥ 0.8.
 * Iterates entries in reverse chronological order (newest first).
 */
export function lookup(text: string): CacheLookupResult | null {
  const cache = readCache();
  if (!cache || cache.entries.length === 0) return null;
  const tokens = tokenize(text);
  for (let i = cache.entries.length - 1; i >= 0; i -= 1) {
    const entry = cache.entries[i];
    if (!entry) continue;
    const entryTokens = tokenize(entry.text);
    const sim = jaccardSimilarity(tokens, entryTokens);
    if (sim >= JACCARD_THRESHOLD) {
      return { spec: entry.spec, sourceText: entry.text };
    }
  }
  return null;
}

export function store(text: string, spec: ConstraintSpec): boolean {
  const cache = readCache();
  if (!cache) return false;
  const entry: CacheEntry = {
    text,
    spec,
    createdAt: new Date().toISOString(),
  };
  // LRU: remove any earlier entry with identical text+spec, then append.
  const filtered = cache.entries.filter(
    (e) => !(e.text === text && JSON.stringify(e.spec) === JSON.stringify(spec))
  );
  filtered.push(entry);
  // Evict oldest if over MAX_ENTRIES.
  const trimmed =
    filtered.length > MAX_ENTRIES ? filtered.slice(filtered.length - MAX_ENTRIES) : filtered;
  return writeCache({ version: CACHE_VERSION, entries: trimmed });
}

export function clear(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

export function size(): number {
  const cache = readCache();
  return cache ? cache.entries.length : 0;
}

export const __patternCacheInternal = {
  CACHE_KEY,
  CACHE_VERSION,
  MAX_ENTRIES,
  JACCARD_THRESHOLD,
  readCache,
  writeCache,
};
