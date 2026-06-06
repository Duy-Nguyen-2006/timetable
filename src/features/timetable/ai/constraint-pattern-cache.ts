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

import type { ConstraintKind, ConstraintSpec } from './constraint-spec';

const CACHE_KEY = 'tt:constraint-pattern-cache:v1';
const CACHE_VERSION = 1;
const MAX_ENTRIES = 200;
const JACCARD_THRESHOLD = 0.8;

const KNOWN_KINDS: ReadonlySet<ConstraintKind> = new Set<ConstraintKind>([
  'teacher_block_day',
  'teacher_block_period',
  'teacher_block_slot',
  'teacher_max_per_day',
  'teacher_max_consecutive',
  'teacher_max_working_days',
  'teacher_min_per_day',
  'teacher_no_gaps',
  'teacher_allowed_days',
  'teacher_allowed_periods',
  'teacher_min_working_days',
  'teacher_max_gaps',
  'teacher_min_consecutive',
  'teacher_balanced_load',
  'teacher_max_subjects_per_day',
  'teacher_max_consecutive_days',
  'teacher_preferred_periods',
  'teacher_max_classes_per_day',
  'teacher_pair_not_same_slot',
  'teacher_homeroom_first_period',
  'subject_pin_period',
  'subject_preferred_periods',
  'subject_not_last_period',
  'subject_consecutive',
  'subject_max_consecutive',
  'subject_allowed_days',
  'subject_min_gap_days',
  'subject_daily_max_periods',
  'subject_block_period',
  'subject_block_days',
  'subject_not_consecutive',
  'subject_min_days',
  'subject_spread_evenly',
  'subject_order_before',
  'subject_not_after_subject',
  'class_block_day',
  'class_block_period',
  'class_block_slot',
  'class_max_per_day',
  'class_min_per_day',
  'class_no_gaps',
  'class_no_double_subject_day',
  'class_subjects_not_same_day',
  'class_fixed_period',
  'class_allowed_days',
  'class_allowed_periods',
  'class_max_consecutive',
  'class_max_subjects_per_day',
  'class_balanced_load',
  'class_subjects_same_day',
  'class_min_working_days',
  'class_max_heavy_subjects_per_day',
  'class_max_heavy_subjects_per_session',
  'class_first_period_required',
  'subject_flag_ceremony_slot',
  'global_teacher_utilization_balance',
  'assignment_pin_slot',
  'assignment_block_slot',
  'assignment_allowed_slots',
  'assignment_spread_days',
  'weekly_periods_exact',
  'assignment_consecutive',
  'assignment_max_per_day',
  'assignment_same_day',
  'assignment_not_same_day',
  'if_then',
  'pair_not_same_slot',
  'pair_same_slot',
  'mutual_exclusion',
  'session_limit',
  'subject_group',
  'subject_group_daily_limit',
  'subject_session_max_periods',
  'custom_dsl',
]);

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
  const stripped = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim();
  const tokens = stripped.split(/\s+/).filter(Boolean);
  return Array.from(new Set(tokens)).sort();
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
