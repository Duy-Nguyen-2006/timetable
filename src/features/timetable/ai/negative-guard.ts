/**
 * negative-guard.ts — Phase 0.3
 *
 * Pure-code safety net that prevents silent misparse. Runs after every
 * parser (LLM, rule, reparse) and flags/demotes specs that would invert
 * the user's stated meaning.
 *
 * Two guard families:
 *
 * 1) REQUIRE markers (`phải có`, `cần có`, `ít nhất`, `có ít nhất`,
 *    `bắt buộc có`, `phải được`) are positive intent. They MUST NOT
 *    be mapped to a *block* or *allowed* (set-restricting) kind. If a
 *    parser emits such a mismatch, the guard demotes confidence to
 *    `medium` and forces `requiresConfirmation = true`. Callers should
 *    surface the demotion so the user can re-confirm — the spec is
 *    NEVER auto-confirmed.
 *
 * 2) BLOCK markers (`không`, `cấm`, `nghỉ`, `đừng`, `tránh`) are
 *    negative intent. They MUST NOT be mapped to a *required* /
 *    *allowed* (positive-set / atLeast) kind. Same demotion policy.
 *
 * The guard is intentionally conservative: false positives only force
 * confirmation, never auto-confirm. False negatives (a misparse that
 * slipped through) are caught by the back-translation gate.
 *
 * The guard also returns a list of `hardReasons` so callers can short-
 * circuit to `needs_clarification` when ambiguity is unresolvable.
 */

import type { ConstraintSpec } from './constraint-spec';

export const REQUIRE_MARKERS = [
  'phải có',
  'phai co',
  'cần có',
  'can co',
  'ít nhất',
  'it nhat',
  'có ít nhất',
  'co it nhat',
  'bắt buộc có',
  'bat buoc co',
  'phải được',
  'phai duoc',
  'nhất định phải',
  'nhat dinh phai',
] as const;

export const BLOCK_MARKERS = [
  'không',
  'khong',
  'ko ',
  'cấm',
  'cam',
  'nghỉ',
  'nghi',
  'đừng',
  'dung',
  'tránh',
  'tranh',
  'né',
  'ne',
  'dừng',
  'dung',
] as const;

/** Kinds that express positive, set-restricting (only) or atLeast semantics. */
const POSITIVE_SET_KINDS = new Set([
  'teacher_allowed_days',
  'teacher_allowed_periods',
  'teacher_preferred_periods',
  'class_allowed_days',
  'class_allowed_periods',
  'subject_allowed_days',
  'subject_preferred_periods',
  'subject_pin_period',
  'class_fixed_period',
  'teacher_required_period',
  'class_required_period',
  'subject_required_period',
  'teacher_required_day',
  'teacher_required_slot',
]);

/** Kinds that express negative, set-restricting (block) semantics. */
const NEGATIVE_SET_KINDS = new Set([
  'teacher_block_day',
  'teacher_block_period',
  'teacher_block_slot',
  'class_block_day',
  'class_block_period',
  'class_block_slot',
  'subject_block_period',
  'subject_block_days',
]);

function normalizeForCheck(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function hasAnyMarker(text: string, markers: readonly string[]): boolean {
  const lower = ` ${text} `;
  for (const m of markers) {
    if (lower.includes(m)) return true;
  }
  return false;
}

export type GuardDecision =
  | { kind: 'ok' }
  | {
      kind: 'demote_to_medium_with_confirmation';
      reason: string;
      marker: 'require' | 'block';
      violatedKind: string;
    }
  | {
      kind: 'force_clarification';
      reason: string;
      hardReasons: string[];
    };

/**
 * Run the negative guard against a single spec. Pure, side-effect-free.
 *
 * @param spec the candidate spec emitted by a parser
 * @param originalText the user's original Vietnamese input
 * @returns a decision the caller must honor
 */
export function evaluateNegativeGuard(
  spec: ConstraintSpec,
  originalText: string
): GuardDecision {
  const normalized = normalizeForCheck(originalText);
  const hasRequire = hasAnyMarker(normalized, REQUIRE_MARKERS);
  const hasBlock = hasAnyMarker(normalized, BLOCK_MARKERS);

  // REQUIRE marker + negative-set kind = silent misparse (e.g. "phải có tiết 4" → block_period).
  if (hasRequire && NEGATIVE_SET_KINDS.has(spec.kind as string)) {
    return {
      kind: 'demote_to_medium_with_confirmation',
      reason: `Câu chứa mỏ neo yêu cầu (phải có/ít nhất) nhưng parser ánh xạ sang kind chặn (${spec.kind}). Cần xác nhận lại.`,
      marker: 'require',
      violatedKind: spec.kind,
    };
  }

  // BLOCK marker + positive-set kind = silent misparse (e.g. "không dạy tiết 4" → required_period).
  if (hasBlock && POSITIVE_SET_KINDS.has(spec.kind as string)) {
    return {
      kind: 'demote_to_medium_with_confirmation',
      reason: `Câu chứa mỏ neo phủ định (không/cấm/nghỉ) nhưng parser ánh xạ sang kind dương (${spec.kind}). Cần xác nhận lại.`,
      marker: 'block',
      violatedKind: spec.kind,
    };
  }

  // Same conflict can appear in custom_dsl (custom_dsl without `expr` is opaque to the guard;
  // with `expr` we trust the IR humanizer). Skip custom_dsl to avoid false positives.

  return { kind: 'ok' };
}

/**
 * Apply the guard to a list of specs. Returns a list of decisions (one per spec)
 * and a list of hard reasons that, if non-empty, force `needs_clarification`.
 *
 * Hard reason rule: if the same spec violates the guard with BOTH a require
 * marker AND a block marker present in the same text, the sentence is
 * self-contradicting and the parser cannot resolve it. Force clarification.
 */
export function evaluateNegativeGuardForSpecs(
  specs: ConstraintSpec[],
  originalText: string
): { decisions: GuardDecision[]; hardReasons: string[]; anyDemote: boolean } {
  const decisions: GuardDecision[] = [];
  const hardReasons: string[] = [];
  let anyDemote = false;
  for (const spec of specs) {
    const decision = evaluateNegativeGuard(spec, originalText);
    decisions.push(decision);
    if (decision.kind === 'demote_to_medium_with_confirmation') {
      anyDemote = true;
    }
  }
  const normalized = normalizeForCheck(originalText);
  const hasRequire = hasAnyMarker(normalized, REQUIRE_MARKERS);
  const hasBlock = hasAnyMarker(normalized, BLOCK_MARKERS);
  if (hasRequire && hasBlock) {
    hardReasons.push(
      'Câu vừa chứa mỏ neo yêu cầu vừa chứa mỏ neo phủ định — không thể tự quyết định nghĩa.'
    );
  }
  return { decisions, hardReasons, anyDemote };
}
