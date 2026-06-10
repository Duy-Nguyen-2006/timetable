/**
 * Ambiguity Gate — Parse Accuracy Layer 2
 *
 * When the retriever returns top-k candidates, we look at the score gap
 * between the top-1 and top-2 candidates. If the gap is small, the LLM
 * is being asked to disambiguate between two near-equal options — a
 * common source of subtle parse errors.
 *
 * Rule: if score[0] - score[1] < AMBIGUITY_DELTA OR top1 is below
 * AMBIGUITY_FLOOR, we return a clarification request with the top
 * candidates listed as options.
 *
 * This is pure code (no LLM) and runs before invoking the slot-fill LLM.
 */

import type { BuiltInConstraintScope } from './constraint-registry';
import { getConstraintMeta } from './constraint-registry';
import type { ConstraintRetrieverCandidate, ConstraintResolverHints } from './constraint-retriever';
import { retrieveTopK } from './constraint-retriever';

export const AMBIGUITY_DELTA = 1.2; // score gap threshold
export const AMBIGUITY_FLOOR = 3; // absolute min score for top-1 to be unambiguous
export const AMBIGUITY_TOPK_OPTIONS = 3;

export type AmbiguityGateResult =
  | {
      status: 'unambiguous';
      winner: ConstraintRetrieverCandidate;
      runnerUp: ConstraintRetrieverCandidate | null;
      delta: number;
    }
  | {
      status: 'ambiguous';
      options: ConstraintRetrieverCandidate[];
      delta: number;
      /** Human-readable explanation of why we couldn't pick a winner. */
      reason: string;
    };

/** Run the ambiguity gate on top-k candidates. */
export function evaluateAmbiguity(
  candidates: ConstraintRetrieverCandidate[]
): AmbiguityGateResult {
  if (candidates.length === 0) {
    return {
      status: 'ambiguous',
      options: [],
      delta: 0,
      reason: 'No candidates retrieved — bạn có thể nói rõ hơn?',
    };
  }
  // We don't have raw scores here; rank-based gap is the safe proxy.
  // When score is available upstream, callers should pass it via a wrapper.
  // For ranking-only: gap of 0 between rank 0 and 1 → ambiguous.
  const top = candidates[0];
  const runnerUp = candidates.length > 1 ? candidates[1] : null;
  // If we have at least 2 candidates and they're not "obviously separated"
  // (we use rank as proxy when no scores), flag ambiguous.
  if (candidates.length === 1) {
    return { status: 'unambiguous', winner: top, runnerUp: null, delta: Number.POSITIVE_INFINITY };
  }
  if (runnerUp) {
    const topScore = typeof top.score === 'number' ? top.score : null;
    const runnerScore = typeof runnerUp.score === 'number' ? runnerUp.score : null;
    if (topScore !== null && runnerScore !== null) {
      const delta = topScore - runnerScore;
      if (topScore < AMBIGUITY_FLOOR || delta < AMBIGUITY_DELTA) {
        return {
          status: 'ambiguous',
          options: candidates.slice(0, AMBIGUITY_TOPK_OPTIONS),
          delta,
          reason: `Điểm ứng viên chưa đủ tách biệt: ${top.kind}=${topScore.toFixed(2)}, ${runnerUp.kind}=${runnerScore.toFixed(2)}.`,
        };
      }
      return { status: 'unambiguous', winner: top, runnerUp, delta };
    }

    const sameKindFamily = isSameKindFamily(top.kind, runnerUp.kind);
    return sameKindFamily
      ? {
          status: 'ambiguous' as const,
          options: [top, runnerUp],
          delta: 0,
          reason: `Hai ứng viên khả thi gần ngang nhau: "${top.kind}" và "${runnerUp.kind}". Bạn muốn ý nào?`,
        }
      : {
          status: 'unambiguous' as const,
          winner: top,
          runnerUp,
          delta: 1,
        };
  }
  return { status: 'unambiguous', winner: top, runnerUp: null, delta: Number.POSITIVE_INFINITY };
}

/** Two kinds are "same family" if they share scope and a meaningful prefix. */
export function isSameKindFamily(a: string, b: string): boolean {
  if (a === b) return true;
  // block_X family, max_X family, min_X family
  const families = [
    ['teacher_block_day', 'teacher_block_period', 'teacher_block_slot', 'teacher_no_gaps'],
    ['teacher_max_per_day', 'teacher_max_consecutive', 'teacher_max_working_days', 'teacher_max_subjects_per_day', 'teacher_max_classes_per_day', 'teacher_max_consecutive_days', 'teacher_max_gaps'],
    ['teacher_min_per_day', 'teacher_min_working_days', 'teacher_min_consecutive', 'teacher_min_off_days'],
    ['teacher_allowed_days', 'teacher_allowed_periods', 'teacher_preferred_periods'],
    ['subject_block_period', 'subject_block_days', 'subject_not_consecutive', 'subject_not_last_period'],
    ['subject_max_consecutive', 'subject_daily_max_periods', 'subject_min_gap_days', 'subject_min_days'],
    ['subject_pin_period', 'subject_preferred_periods'],
    ['class_block_day', 'class_block_period', 'class_block_slot'],
    ['class_max_per_day', 'class_min_per_day', 'class_no_gaps', 'class_max_consecutive', 'class_max_subjects_per_day', 'class_min_working_days'],
    ['class_allowed_days', 'class_allowed_periods'],
    ['teacher_pair_not_same_day', 'teacher_pair_not_same_slot', 'teacher_pair_required_same_day', 'teacher_pair_required_same_slot'],
  ];
  for (const family of families) {
    if (family.includes(a) && family.includes(b)) return true;
  }
  return false;
}

/** Build a clarification block describing ambiguity for UI. */
export function buildAmbiguityQuestion(gate: AmbiguityGateResult): string {
  if (gate.status === 'unambiguous') return '';
  if (gate.options.length === 0) return gate.reason || 'Mình cần bạn làm rõ thêm.';
  const lines = gate.options.map((opt, i) => {
    const meta = getConstraintMeta(opt.kind);
    return `  ${i + 1}. ${meta?.label ?? opt.kind} (${opt.scope})`;
  });
  return `Mình chưa chắc ý bạn muốn loại nào. Bạn chọn một trong các khả năng sau?\n${lines.join('\n')}`;
}

/** Convenience: run retriever + gate in one call. */
export function runAmbiguityGate(
  hints: ConstraintResolverHints,
  scope: BuiltInConstraintScope | null
): { gate: AmbiguityGateResult; candidates: ConstraintRetrieverCandidate[] } {
  const candidates = retrieveTopK(hints, scope, AMBIGUITY_TOPK_OPTIONS + 2);
  const gate = evaluateAmbiguity(candidates.slice(0, AMBIGUITY_TOPK_OPTIONS));
  return { gate, candidates };
}
