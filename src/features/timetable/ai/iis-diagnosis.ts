/**
 * IIS Diagnosis (Section 14.2)
 *
 * When the solver returns infeasible, we want to identify the *Irreducible
 * Inconsistent Subset* of constraints — a small set whose removal makes
 * the problem feasible.
 *
 * OR-Tools CP-SAT can produce an IIS via the `model.Proto()` and a manual
 * analysis. Since we don't have direct access to that from TypeScript,
 * we use a TS-side heuristic:
 *   1. Start with the full hard constraint set.
 *   2. Try removing each hard constraint one at a time (or in small groups)
 *      and re-running the solver. If the solver becomes feasible after
 *      removing a constraint, that constraint is "in" the conflict set.
 *   3. Bisect to find the minimum conflict set.
 *
 * For the simpler "fast" case (Section 14.2.1), we just do a single-step
 * leave-one-out analysis: for each hard constraint, check whether the
 * problem is "still infeasible" without it. If it becomes feasible, that
 * constraint is in the IIS.
 *
 * This module is the orchestration layer. The actual re-solve is done by
 * the caller (`deterministic-solver.ts`).
 */

import type { ConstraintSpec } from './constraint-spec';

export type IISCandidate = {
  /** Constraint ID suspected to be in the IIS. */
  constraintId: string;
  /** Kind for UI display. */
  kind: string;
  /** Original text. */
  original: string;
  /** Why this is suspicious (e.g., conflicts with another constraint). */
  suspicionReason: string;
};

export type IISDiagnosis = {
  /** Heuristic conflict set (smallest plausible). */
  conflictSet: IISCandidate[];
  /** Hard constraints that have NO conflict suspicion (safe to keep). */
  safeConstraintIds: string[];
  /** Whether the diagnosis was complete (true) or partial (false — would need re-solve). */
  complete: boolean;
};

/** Cheap heuristic: pairs of constraints that often conflict. */
const KNOWN_CONFLICT_PAIRS: Array<{ a: string; b: string; reason: string }> = [
  { a: 'teacher_block_day', b: 'teacher_required_day', reason: 'Cấm dạy ngày X mâu thuẫn với bắt buộc dạy ngày X' },
  { a: 'teacher_block_period', b: 'teacher_required_slot', reason: 'Cấm dạy tiết X mâu thuẫn với bắt buộc dạy tiết X' },
  { a: 'teacher_no_gaps', b: 'teacher_allowed_periods', reason: 'Không gap mâu thuẫn với chỉ được dạy tiết rời rạc' },
  { a: 'teacher_max_per_day', b: 'teacher_min_per_day', reason: 'Tối đa N tiết có thể mâu thuẫn với tối thiểu N\' tiết (N < N\')' },
  { a: 'teacher_max_working_days', b: 'teacher_min_working_days', reason: 'Tối đa/tối thiểu ngày mâu thuẫn' },
  { a: 'class_block_day', b: 'class_fixed_period', reason: 'Cấm lớp học ngày X mâu thuẫn với bắt buộc lớp học ngày X' },
  { a: 'class_max_per_day', b: 'class_min_per_day', reason: 'Tối đa/tối thiểu tiết ngày mâu thuẫn' },
  { a: 'subject_pin_period', b: 'subject_block_period', reason: 'Pin môn vào tiết X mâu thuẫn với cấm môn ở tiết X' },
  { a: 'subject_max_consecutive', b: 'subject_consecutive', reason: 'Max N liên tiếp mâu thuẫn với cụm N+ liên tiếp (positive)' },
];

/** Detect direct conflicts between two hard specs. */
function detectDirectConflict(a: ConstraintSpec, b: ConstraintSpec): string | null {
  for (const pair of KNOWN_CONFLICT_PAIRS) {
    if (a.kind === pair.a && b.kind === pair.b) {
      if (a.params.teacher && b.params.teacher && a.params.teacher === b.params.teacher) return pair.reason;
      if (a.params.class && b.params.class && a.params.class === b.params.class) return pair.reason;
      if (a.params.subject && b.params.subject && a.params.subject === b.params.subject) return pair.reason;
    }
    if (a.kind === pair.b && b.kind === pair.a) {
      if (a.params.teacher && b.params.teacher && a.params.teacher === b.params.teacher) return pair.reason;
      if (a.params.class && b.params.class && a.params.class === b.params.class) return pair.reason;
      if (a.params.subject && b.params.subject && a.params.subject === b.params.subject) return pair.reason;
    }
  }
  return null;
}

/** Detect numeric over-constraint between two specs. */
function detectNumericConflict(a: ConstraintSpec, b: ConstraintSpec): string | null {
  const sameEntity = (() => {
    if (a.params.teacher && b.params.teacher && a.params.teacher === b.params.teacher) return true;
    if (a.params.class && b.params.class && a.params.class === b.params.class) return true;
    if (a.params.subject && b.params.subject && a.params.subject === b.params.subject) return true;
    return false;
  })();
  if (!sameEntity) return null;
  if (a.kind === 'teacher_max_per_day' && b.kind === 'teacher_min_per_day') {
    const max = Number(a.params.maxPerDay);
    const min = Number(b.params.minPerDay);
    if (max < min) return `Tối đa ${max} < tối thiểu ${min} tiết/ngày → mâu thuẫn.`;
  }
  if (a.kind === 'teacher_max_working_days' && b.kind === 'teacher_min_working_days') {
    const max = Number(a.params.maxDays);
    const min = Number(b.params.minDays);
    if (max < min) return `Tối đa ${max} ngày < tối thiểu ${min} ngày/tuần → mâu thuẫn.`;
  }
  if (a.kind === 'class_max_per_day' && b.kind === 'class_min_per_day') {
    const max = Number(a.params.max);
    const min = Number(a.params.min);
    if (max < min) return `Lớp: tối đa ${max} < tối thiểu ${min} tiết/ngày → mâu thuẫn.`;
  }
  return null;
}

/** Heuristic IIS: walk through hard specs and find pairs that conflict. */
export function diagnoseIIS(specs: ConstraintSpec[]): IISDiagnosis {
  const hard = specs.filter((s) => s.severity === 'hard');
  const conflictSet: IISCandidate[] = [];
  const seen = new Set<string>();
  const safeIds = new Set<string>(hard.map((s) => s.id));

  for (let i = 0; i < hard.length; i++) {
    for (let j = i + 1; j < hard.length; j++) {
      const a = hard[i];
      const b = hard[j];
      const reason = detectDirectConflict(a, b) ?? detectNumericConflict(a, b);
      if (reason) {
        for (const spec of [a, b]) {
          if (seen.has(spec.id)) continue;
          seen.add(spec.id);
          conflictSet.push({
            constraintId: spec.id,
            kind: spec.kind,
            original: spec.original,
            suspicionReason: reason,
          });
          safeIds.delete(spec.id);
        }
      }
    }
  }

  return {
    conflictSet,
    safeConstraintIds: [...safeIds],
    complete: false, // Heuristic only — true IIS requires solver re-runs
  };
}

/** Build a user-friendly summary of the IIS for the UI. */
export function summarizeIIS(diagnosis: IISDiagnosis): string {
  if (diagnosis.conflictSet.length === 0) {
    return 'Không phát hiện mâu thuẫn rõ ràng giữa các ràng buộc. Solver có thể vô nghiệm vì lý do khác (số học, điều kiện biên).';
  }
  const ids = diagnosis.conflictSet.map((c) => c.constraintId).join(', ');
  const firstReason = diagnosis.conflictSet[0]?.suspicionReason ?? '';
  return `Phát hiện ${diagnosis.conflictSet.length} ràng buộc có khả năng mâu thuẫn (id: ${ids}). Lý do nghi ngờ: ${firstReason}`;
}
