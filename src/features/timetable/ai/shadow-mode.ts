/**
 * shadow-mode.ts — Phase 2.3
 *
 * The new IR-first pipeline runs in PARALLEL with the legacy built-in
 * pipeline. The legacy pipeline's output is the AUTHORITATIVE one for
 * the user; the IR-first pipeline's output is LOGGED for divergence
 * analysis. This file manages that logging.
 *
 * Divergence taxonomy:
 *   - 'kind_mismatch': legacy emitted a built-in kind, new emitted a
 *     different kind for the same sentence.
 *   - 'param_mismatch': same kind, but different params (e.g. legacy
 *     mapped "ít nhất" to count=0; new mapped to count=1).
 *   - 'silent_flip': legacy mapped a require-marker sentence to a
 *     *_block_* kind. CRITICAL — must be zero before flipping.
 *   - 'clarification_diff': one asked for clarification, the other did not.
 *
 * Each log entry includes:
 *   - raw text
 *   - legacy kind + params
 *   - new kind + params (or new expr kind)
 *   - divergence category
 *   - timestamp
 *
 * The log is consumed by the divergence analyzer (CLI / CI) to compute:
 *   - silent-flip rate (must be 0 to flip the parser)
 *   - clarification rate
 *   - kind-mismatch rate
 *   - param-mismatch rate
 */

import type { ConstraintSpec } from './constraint-spec';

export type DivergenceCategory =
  | 'kind_mismatch'
  | 'param_mismatch'
  | 'silent_flip'
  | 'clarification_diff'
  | 'no_legacy_spec'
  | 'no_new_spec'
  | 'match';

export type ShadowLogEntry = {
  /** Frozen ID. */
  id: string;
  /** Raw user input. */
  rawText: string;
  /** Legacy pipeline output (the one the user sees). */
  legacy?: {
    specs: ConstraintSpec[];
    status: 'mapped_builtin' | 'semantic_only' | 'needs_clarification' | 'unsupported';
  };
  /** New IR-first pipeline output. */
  new?: {
    specs: ConstraintSpec[];
    status: 'mapped_builtin' | 'semantic_only' | 'needs_clarification' | 'unsupported';
  };
  /** Computed divergence category. */
  divergence: DivergenceCategory;
  /** Human-readable explanation. */
  explanation: string;
  /** When the divergence was detected. */
  timestamp: string;
};

export type ShadowLogOptions = {
  /** Max number of entries to keep in memory. Older entries are evicted. */
  maxEntries?: number;
  /** Whether to log the same divergence multiple times. */
  deduplicate?: boolean;
};

export class ShadowLogger {
  private entries: ShadowLogEntry[] = [];
  private seenKeys = new Set<string>();
  private maxEntries: number;
  private deduplicate: boolean;

  constructor(options: ShadowLogOptions = {}) {
    this.maxEntries = options.maxEntries ?? 5000;
    this.deduplicate = options.deduplicate ?? true;
  }

  log(entry: Omit<ShadowLogEntry, 'id' | 'timestamp'>): ShadowLogEntry {
    const full: ShadowLogEntry = {
      ...entry,
      id: `slog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
    };
    if (this.deduplicate) {
      const key = `${entry.rawText}::${entry.divergence}`;
      if (this.seenKeys.has(key)) {
        return full;
      }
      this.seenKeys.add(key);
    }
    this.entries.push(full);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
    return full;
  }

  getEntries(): ReadonlyArray<ShadowLogEntry> {
    return this.entries;
  }

  summarize(): {
    total: number;
    silentFlipCount: number;
    kindMismatchCount: number;
    paramMismatchCount: number;
    clarificationDiffCount: number;
    matchCount: number;
    silentFlipRate: number;
  } {
    const total = this.entries.length;
    let silentFlipCount = 0;
    let kindMismatchCount = 0;
    let paramMismatchCount = 0;
    let clarificationDiffCount = 0;
    let matchCount = 0;
    for (const e of this.entries) {
      if (e.divergence === 'silent_flip') silentFlipCount += 1;
      else if (e.divergence === 'kind_mismatch') kindMismatchCount += 1;
      else if (e.divergence === 'param_mismatch') paramMismatchCount += 1;
      else if (e.divergence === 'clarification_diff') clarificationDiffCount += 1;
      else if (e.divergence === 'match') matchCount += 1;
    }
    return {
      total,
      silentFlipCount,
      kindMismatchCount,
      paramMismatchCount,
      clarificationDiffCount,
      matchCount,
      silentFlipRate: total > 0 ? silentFlipCount / total : 0,
    };
  }

  clear(): void {
    this.entries = [];
    this.seenKeys.clear();
  }
}

// ─── Default logger (process-wide singleton, used by the pipeline) ─────────
let _default: ShadowLogger | null = null;
export function getDefaultShadowLogger(): ShadowLogger {
  if (!_default) _default = new ShadowLogger();
  return _default;
}
export function resetDefaultShadowLogger(): void {
  _default = null;
}

// ─── Divergence classifier ─────────────────────────────────────────────────

const NEGATIVE_KINDS = new Set([
  'teacher_block_day',
  'teacher_block_period',
  'teacher_block_slot',
  'class_block_day',
  'class_block_period',
  'class_block_slot',
  'subject_block_period',
  'subject_block_days',
]);

const REQUIRE_MARKERS = ['phải có', 'cần có', 'ít nhất', 'bắt buộc có', 'phải được'];

function hasRequireMarker(text: string): boolean {
  const lower = text.toLowerCase();
  return REQUIRE_MARKERS.some((m) => lower.includes(m));
}

export function classifyDivergence(
  rawText: string,
  legacy: { specs: ConstraintSpec[]; status: string } | undefined,
  newP: { specs: ConstraintSpec[]; status: string } | undefined
): { divergence: DivergenceCategory; explanation: string } {
  // No legacy spec — usually means legacy asked for clarification.
  if (!legacy || legacy.specs.length === 0) {
    if (newP && newP.specs.length > 0) {
      return {
        divergence: 'clarification_diff',
        explanation: 'Legacy asked for clarification; new produced specs.',
      };
    }
    return { divergence: 'no_legacy_spec', explanation: 'Legacy produced no specs.' };
  }
  if (!newP || newP.specs.length === 0) {
    if (legacy.specs.length > 0) {
      return {
        divergence: 'clarification_diff',
        explanation: 'New asked for clarification; legacy produced specs.',
      };
    }
    return { divergence: 'no_new_spec', explanation: 'New produced no specs.' };
  }

  // Critical: silent flip. Legacy mapped a require-marker sentence to a
  // *_block_* kind.
  if (hasRequireMarker(rawText)) {
    for (const spec of legacy.specs) {
      if (NEGATIVE_KINDS.has(spec.kind)) {
        return {
          divergence: 'silent_flip',
          explanation: `Legacy mapped require-marker sentence to ${spec.kind} (a block kind).`,
        };
      }
    }
  }

  const legacyKind = legacy.specs[0].kind;
  const newKind = newP.specs[0].kind;
  if (legacyKind !== newKind) {
    return {
      divergence: 'kind_mismatch',
      explanation: `Legacy=${legacyKind}, new=${newKind}.`,
    };
  }

  // Same kind — compare params.
  const legacyParams = JSON.stringify(legacy.specs[0].params ?? {});
  const newParams = JSON.stringify(newP.specs[0].params ?? {});
  if (legacyParams !== newParams) {
    return {
      divergence: 'param_mismatch',
      explanation: `Same kind ${legacyKind} but different params.`,
    };
  }

  return { divergence: 'match', explanation: 'Both pipelines agree.' };
}
