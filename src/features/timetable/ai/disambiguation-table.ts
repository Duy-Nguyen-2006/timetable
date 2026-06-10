/**
 * disambiguation-table.ts — Phase 1.5
 *
 * Versioned, frozen table that resolves Vietnamese phrasing ambiguity to
 * a SINGLE canonical semantic direction. This replaces the scattered
 * heuristics in built-in-suggestion.ts / constraint-resolver.ts and gives
 * the parser, the guard, the reparse loop, and the humanizer a single
 * source of truth for "this phrase means THAT direction".
 *
 * Usage:
 *   - The disambiguation-table is checked FIRST in any parser path.
 *   - If a sentence matches a row's POSITIVE assertion, the parser MUST
 *     use the positive mapping (e.g. *_required_period).
 *   - If a sentence matches the NEGATIVE assertion, the parser MUST use
 *     the negative mapping (e.g. *_block_period).
 *   - If a sentence matches neither but matches a row, the parser MUST
 *     return needs_clarification with both POSITIVE and NEGATIVE
 *     renderings as options (see constraint-clarification.ts).
 *   - If no row matches, the parser is free to use any heuristic.
 *
 * The table is part of the IR vocabulary. Bumping
 * DISAMBIGUATION_TABLE_VERSION invalidates any cached humanizer
 * outputs and triggers a re-derivation pass.
 *
 * Each row's POSITIVE and NEGATIVE assertions are FULL Vietnamese
 * sentences, not keywords, so the match is exact (not greedy). This is
 * deliberate: a sentence that contains both "phải có" and "không" is
 * contradictory and the guard forces clarification.
 *
 * The table is consumed by:
 *   - parser/retriever (preferred path)
 *   - negative-guard.ts (last-line-of-defense safety net)
 *   - golden-eval-set.ts (each case cites at least one row)
 *
 * If a row is removed/changed, the corresponding frozen regression
 * test in golden-eval-set.test.ts (and Phase 0 tests) will fail.
 */

import { normalizeConstraintText } from './translator-text';

export const DISAMBIGUATION_TABLE_VERSION = '1.0.0';

export type DisambiguationDirection = 'require' | 'only' | 'block' | 'soft_prefer';

export type DisambiguationRow = {
  /** Stable id; do not change once shipped. */
  id: string;
  /** Vietnamese phrase (positive assertion, e.g. "phải có"). */
  positiveAssertion: string;
  /** Vietnamese phrase (negative assertion, e.g. "không dạy"). */
  negativeAssertion: string;
  /** Optional soft-prefer phrase. */
  softPreferAssertion?: string;
  /** Direction of the positive assertion. */
  positiveDirection: DisambiguationDirection;
  /** Direction of the negative assertion. */
  negativeDirection: DisambiguationDirection;
  /** Kinds the positive direction maps to (in order of preference). */
  positiveKinds: string[];
  /** Kinds the negative direction maps to. */
  negativeKinds: string[];
  /** Soft-prefer kinds (if any). */
  softPreferKinds?: string[];
  /** Notes for future maintainers. */
  notes: string;
};

export const DISAMBIGUATION_TABLE: DisambiguationRow[] = [
  // ─── Teacher period ──────────────────────────────────────────────────────
  {
    id: 'D001',
    positiveAssertion: 'phải có',
    negativeAssertion: 'không dạy',
    softPreferAssertion: 'nên dạy',
    positiveDirection: 'require',
    negativeDirection: 'block',
    positiveKinds: ['teacher_required_period', 'teacher_required_day', 'teacher_required_slot'],
    negativeKinds: ['teacher_block_period', 'teacher_block_day', 'teacher_block_slot'],
    softPreferKinds: ['teacher_preferred_periods', 'teacher_preferred_days'],
    notes: 'The original "Thủy phải có tiết 4" bug. require + period = required_period; block = block_period. NEVER alias require -> block or vice versa.',
  },
  {
    id: 'D002',
    positiveAssertion: 'cần có',
    negativeAssertion: 'cấm dạy',
    positiveDirection: 'require',
    negativeDirection: 'block',
    positiveKinds: ['teacher_required_period'],
    negativeKinds: ['teacher_block_period'],
    notes: 'Synonym of D001. Less common in user input but kept for completeness.',
  },
  {
    id: 'D003',
    positiveAssertion: 'ít nhất',
    negativeAssertion: 'không quá',
    positiveDirection: 'require',
    negativeDirection: 'soft_prefer',
    positiveKinds: ['teacher_required_period', 'teacher_min_per_day'],
    negativeKinds: ['teacher_max_per_day', 'teacher_max_per_week'],
    notes: '"ít nhất N" is a positive floor (require/atLeast). "không quá N" is an upper bound (soft max).',
  },
  {
    id: 'D004',
    positiveAssertion: 'chỉ dạy',
    negativeAssertion: 'không dạy ngoài',
    positiveDirection: 'only',
    negativeDirection: 'block',
    positiveKinds: ['teacher_allowed_periods', 'teacher_allowed_days'],
    negativeKinds: ['teacher_block_period', 'teacher_block_day'],
    notes: '"chỉ dạy" means "only teaches X" -> allowed. The block alternative is "không dạy ngoài" (a double negative phrasing).',
  },
  {
    id: 'D005',
    positiveAssertion: 'ưu tiên',
    negativeAssertion: 'tránh',
    positiveDirection: 'soft_prefer',
    negativeDirection: 'soft_prefer',
    positiveKinds: ['teacher_preferred_periods', 'teacher_preferred_days'],
    negativeKinds: ['teacher_preferred_periods', 'teacher_preferred_days'],
    notes: 'Both ưu tiên and tránh are soft preferences. They use the same kind; only the direction is different.',
  },
  {
    id: 'D006',
    positiveAssertion: 'nghỉ',
    negativeAssertion: 'đi dạy',
    positiveDirection: 'block',
    negativeDirection: 'require',
    positiveKinds: ['teacher_block_day', 'teacher_block_period', 'teacher_block_slot'],
    negativeKinds: ['teacher_required_day', 'teacher_required_period', 'teacher_required_slot'],
    notes: '"nghỉ" + (day/period) = block. Inverse "đi dạy" is rare but means required.',
  },
  // ─── Class period ────────────────────────────────────────────────────────
  {
    id: 'D010',
    positiveAssertion: 'lớp phải có',
    negativeAssertion: 'lớp không học',
    positiveDirection: 'require',
    negativeDirection: 'block',
    positiveKinds: ['class_required_period'],
    negativeKinds: ['class_block_period', 'class_block_day'],
    notes: 'Class-side parallel of D001.',
  },
  // ─── Subject period ──────────────────────────────────────────────────────
  {
    id: 'D020',
    positiveAssertion: 'môn phải có',
    negativeAssertion: 'môn không xếp vào',
    positiveDirection: 'require',
    negativeDirection: 'block',
    positiveKinds: ['subject_required_period'],
    negativeKinds: ['subject_block_period', 'subject_block_days'],
    notes: 'Subject-side parallel of D001.',
  },
  // ─── Day equivalents ─────────────────────────────────────────────────────
  {
    id: 'D030',
    positiveAssertion: 'phải dạy vào',
    negativeAssertion: 'không dạy vào',
    positiveDirection: 'require',
    negativeDirection: 'block',
    positiveKinds: ['teacher_required_day', 'teacher_required_slot'],
    negativeKinds: ['teacher_block_day', 'teacher_block_slot'],
    notes: 'Day-level require vs block.',
  },
  // ─── Class-level day equivalents ───────────────────────────────────────
  {
    id: 'D031',
    positiveAssertion: 'lớp phải học vào',
    negativeAssertion: 'lớp không học vào',
    positiveDirection: 'require',
    negativeDirection: 'block',
    positiveKinds: ['class_first_period_required'],
    negativeKinds: ['class_block_day'],
    notes: 'Class-day require vs block. required for class_first_period_required when the user says each working day.',
  },
];

// ─── Lookup helpers ────────────────────────────────────────────────────────

function containsMarker(normalizedText: string, marker: string): boolean {
  return normalizedText.includes(marker);
}

/**
 * Each row's positiveAssertion, negativeAssertion, and softPreferAssertion
 * are stored as natural Vietnamese; the matcher normalizes BOTH the
 * input and the assertion so diacritics and case are irrelevant.
 */
function normalizeAssertion(text: string): string {
  return text
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match an assertion against a sentence using word-presence with order.
 * The assertion is split into words (delimiter: whitespace). All words must
 * appear in the sentence, in the same relative order. Other words may
 * appear in between (e.g. "Lớp 6A phải có" matches the assertion "lớp phải có").
 */
function matchesAssertion(sentence: string, assertion: string): boolean {
  if (!assertion) return false;
  const normSentence = normalizeAssertion(sentence);
  const normAssertion = normalizeAssertion(assertion);
  const words = normAssertion.split(' ').filter((w) => w.length > 0);
  if (words.length === 0) return false;
  let cursor = 0;
  const sentenceWords = normSentence.split(' ');
  for (const w of sentenceWords) {
    if (w === words[cursor]) {
      cursor += 1;
      if (cursor === words.length) return true;
    }
  }
  return false;
}

export type DisambiguationMatch = {
  row: DisambiguationRow;
  /** Which assertion matched. */
  direction: 'positive' | 'negative' | 'soft';
  /** Recommended kind. */
  recommendedKind: string;
  /** True if the sentence contains BOTH positive and negative markers. */
  contradictory: boolean;
};

/**
 * Look up all disambiguation rows that match the given sentence.
 * Returns the row + direction + recommended kind. If multiple rows match,
 * the caller decides precedence (usually the first match by id).
 *
 * If the sentence contains BOTH a positive and a negative marker from the
 * same row, the match is flagged `contradictory: true` so the caller can
 * surface a needs_clarification.
 */
export function findDisambiguationMatch(originalText: string): DisambiguationMatch[] {
  const normalized = normalizeConstraintText(originalText);
  const matches: DisambiguationMatch[] = [];

  for (const row of DISAMBIGUATION_TABLE) {
    const pos = row.positiveAssertion
      ? matchesAssertion(normalized, row.positiveAssertion)
      : false;
    const neg = row.negativeAssertion
      ? matchesAssertion(normalized, row.negativeAssertion)
      : false;
    const soft = row.softPreferAssertion
      ? matchesAssertion(normalized, row.softPreferAssertion)
      : false;

    const contradictory = pos && neg;

    if (pos && !contradictory) {
      matches.push({
        row,
        direction: 'positive',
        recommendedKind: row.positiveKinds[0],
        contradictory: false,
      });
    } else if (neg && !contradictory) {
      matches.push({
        row,
        direction: 'negative',
        recommendedKind: row.negativeKinds[0],
        contradictory: false,
      });
    } else if (soft && !pos && !neg) {
      const kind = row.softPreferKinds?.[0] ?? row.positiveKinds[0];
      matches.push({
        row,
        direction: 'soft',
        recommendedKind: kind,
        contradictory: false,
      });
    }

    if (contradictory) {
      matches.push({
        row,
        direction: 'positive',
        recommendedKind: row.positiveKinds[0],
        contradictory: true,
      });
    }
  }

  return matches;
}

/** Versioned summary, used in debug bundles and CI parity tests. */
export function summarizeDisambiguationTable(): {
  total: number;
  version: string;
  byDirection: Record<DisambiguationDirection, number>;
} {
  const byDirection: Record<DisambiguationDirection, number> = {
    require: 0,
    only: 0,
    block: 0,
    soft_prefer: 0,
  };
  for (const row of DISAMBIGUATION_TABLE) {
    byDirection[row.positiveDirection] += 1;
    if (row.negativeDirection !== row.positiveDirection) {
      byDirection[row.negativeDirection] += 1;
    }
  }
  return { total: DISAMBIGUATION_TABLE.length, version: DISAMBIGUATION_TABLE_VERSION, byDirection };
}
