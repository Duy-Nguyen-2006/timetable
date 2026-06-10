/**
 * Auto-Relaxation (Section 14.4)
 *
 * When the solver returns infeasible, try to relax some hard constraints
 * to soft (so the solver can find a feasible solution with a penalty) and
 * re-run. Relax in priority order:
 *   1. Soft-only constraints stay as-is.
 *   2. Hard constraints that are "flexible" (e.g., preferred slots, balanced
 *      load, min per day) are relaxed first.
 *   3. Hard block/slot constraints are relaxed last.
 *
 * This is purely a TypeScript orchestration layer: it does NOT solve
 * itself, it just produces a relaxed copy of the constraint list and
 * asks the caller to re-run the solver.
 *
 * The caller is responsible for the actual re-solve.
 */

import type { ConstraintSpec, ConstraintSeverity } from './constraint-spec';

/** Constraints in this set are safe to relax from hard → soft first. */
const FLEXIBLE_KINDS = new Set([
  'teacher_max_per_day',
  'teacher_min_per_day',
  'teacher_max_consecutive',
  'teacher_min_consecutive',
  'teacher_max_working_days',
  'teacher_min_working_days',
  'teacher_max_classes_per_day',
  'teacher_max_subjects_per_day',
  'teacher_max_consecutive_days',
  'teacher_min_off_days',
  'teacher_max_gaps',
  'teacher_no_gaps',
  'teacher_balanced_load',
  'teacher_preferred_periods',
  'teacher_allowed_periods',
  'teacher_allowed_days',
  'subject_pin_period',
  'subject_preferred_periods',
  'subject_max_consecutive',
  'subject_min_gap_days',
  'subject_min_days',
  'subject_daily_max_periods',
  'subject_spread_evenly',
  'subject_consecutive',
  'class_max_per_day',
  'class_min_per_day',
  'class_max_consecutive',
  'class_max_subjects_per_day',
  'class_no_gaps',
  'class_balanced_load',
  'class_allowed_days',
  'class_allowed_periods',
  'class_subjects_not_same_day',
  'class_subjects_same_day',
  'global_teacher_utilization_balance',
  'subject_group_daily_limit',
  'subject_session_max_periods',
  'assignment_spread_days',
  'assignment_consecutive',
  'assignment_max_per_day',
  'weekly_periods_exact',
  'session_limit',
  'teacher_required_day',
  'teacher_required_slot',
  'teacher_pair_required_same_day',
  'teacher_pair_required_same_slot',
]);

export type RelaxationStep = {
  /** Constraint ID that was relaxed. */
  constraintId: string;
  /** Original kind. */
  kind: string;
  /** Original severity. */
  originalSeverity: ConstraintSeverity;
  /** Why this was a good candidate to relax. */
  reason: string;
};

export type RelaxationPlan = {
  /** Steps to apply in order. */
  steps: RelaxationStep[];
  /** Constraints that remain hard after this plan. */
  remainingHard: ConstraintSpec[];
  /** Constraints that became soft. */
  relaxed: ConstraintSpec[];
  /** A new constraint list with the relaxation applied. */
  nextSpecs: ConstraintSpec[];
};

export type RelaxationStrategy = 'flexible_first' | 'balanced' | 'conservative';

const STRATEGY_ORDER: Record<RelaxationStrategy, number> = {
  flexible_first: 0,    // relax flexible kinds first
  balanced: 1,          // mixed
  conservative: 2,      // relax block constraints last
};

/** Build a relaxation plan from the current infeasible state. */
export function buildRelaxationPlan(
  specs: ConstraintSpec[],
  options?: { strategy?: RelaxationStrategy; maxRelaxations?: number }
): RelaxationPlan {
  const strategy = options?.strategy ?? 'flexible_first';
  const maxRelaxations = options?.maxRelaxations ?? 5;

  const hardSpecs = specs.filter((s) => s.severity === 'hard');

  // Score each hard spec by how "flexible" it is.
  const scored = hardSpecs.map((spec) => {
    let flexibilityScore: number;
    if (FLEXIBLE_KINDS.has(spec.kind)) {
      flexibilityScore = strategy === 'flexible_first' ? 0 : strategy === 'balanced' ? 1 : 2;
    } else {
      // Hard block/slot/required — least flexible
      flexibilityScore = strategy === 'flexible_first' ? 2 : strategy === 'balanced' ? 1 : 0;
    }
    return { spec, flexibilityScore };
  });

  // Sort by flexibility (lowest first = most flexible to relax first)
  scored.sort((a, b) => a.flexibilityScore - b.flexibilityScore);

  // Take up to maxRelaxations
  const toRelax = scored.slice(0, maxRelaxations);

  const steps: RelaxationStep[] = toRelax.map(({ spec }) => ({
    constraintId: spec.id,
    kind: spec.kind,
    originalSeverity: spec.severity,
    reason: FLEXIBLE_KINDS.has(spec.kind)
      ? 'Loại ràng buộc "mềm" về bản chất (giới hạn, cân bằng, ưu tiên) — thường dễ thỏa hơn khi nới thành soft.'
      : 'Ràng buộc cứng cuối cùng phải nới vì các ràng buộc khác đã chùng — đây là ứng viên an toàn nhất để nới thành soft.',
  }));

  const relaxedIds = new Set(toRelax.map((s) => s.spec.id));
  const nextSpecs = specs.map((spec) => {
    if (!relaxedIds.has(spec.id)) return spec;
    return {
      ...spec,
      severity: 'soft' as ConstraintSeverity,
      weight: spec.weight ?? 10,
      notes: (spec.notes ?? '') + ' [auto-relaxed from hard]',
    };
  });

  return {
    steps,
    remainingHard: nextSpecs.filter((s) => s.severity === 'hard'),
    relaxed: nextSpecs.filter((s) => s.severity === 'soft' && relaxedIds.has(s.id)),
    nextSpecs,
  };
}

/** Apply a relaxation plan to a list of specs. Convenience wrapper. */
export function applyRelaxation(specs: ConstraintSpec[], plan: RelaxationPlan): ConstraintSpec[] {
  return plan.nextSpecs;
}

/**
 * Best-effort safety net for the 4-tiết-Văn regression (FIX.md §10.2):
 * if a relaxation touches a `subject_max_consecutive` spec, make sure
 * the relaxation result still uses BOTH `maxConsecutive` and `max` keys
 * (so legacy readers still see the value).
 *
 * Callers should already have run the constraint-spec normalizer; this
 * is a defensive guard against order-of-operations bugs where the
 * relaxation runs before the normalizer.
 */
export function normalizeRelaxedSpecs(specs: ConstraintSpec[]): ConstraintSpec[] {
  return specs.map((spec) => {
    if (
      spec.kind === 'subject_max_consecutive' ||
      spec.kind === 'teacher_max_consecutive' ||
      spec.kind === 'class_max_consecutive'
    ) {
      const max = spec.params.maxConsecutive ?? spec.params.max;
      if (max == null) return spec;
      return {
        ...spec,
        params: {
          ...spec.params,
          maxConsecutive: max,
          max,
        },
      };
    }
    return spec;
  });
}
