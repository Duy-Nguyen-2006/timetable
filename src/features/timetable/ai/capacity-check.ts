/**
 * Pre-solve Capacity Check (Section 14.1)
 *
 * Detect obviously-infeasible setups BEFORE invoking the solver, by simple
 * arithmetic over the input. Catches:
 *   - Total required periods > total available slots
 *   - A teacher needs more periods than they have available slots
 *     (after applying their own availability/block constraints)
 *   - A class needs more periods than they have available slots
 *
 * Returns a list of human-readable problems; if non-empty, the caller should
 * NOT invoke the solver (or should warn the user loudly).
 *
 * Pure code; no LLM, no solver.
 */

import type { AgentInputPayload, ScheduleEntry } from './types';
import type { ConstraintSpec } from './constraint-spec';
import { resolveDayLabel } from './constraint-humanizer-labels';

export type CapacityProblem = {
  severity: 'fatal' | 'warning';
  scope: 'school' | 'teacher' | 'class' | 'subject' | 'session';
  entity?: string;
  message: string;
  /** Numeric details for UI display. */
  required: number;
  available: number;
  /** Optional hint for the user. */
  hint?: string;
};

export type CapacityCheckResult = {
  ok: boolean;
  problems: CapacityProblem[];
  /** Total periods required / total slots available at the school level. */
  totals: {
    requiredPeriods: number;
    availableSlots: number;
    utilizationPercent: number;
  };
};

function periodCountForSession(input: AgentInputPayload, sessionId: string): number {
  const direct = input.periodCounts[sessionId];
  if (Number.isFinite(direct)) return direct;
  const fallback = Object.values(input.periodCounts).filter((value) => Number.isFinite(value));
  return fallback.length > 0 ? Math.max(...fallback) : 0;
}

/** Compute the total number of slots available per day/session. */
function computeAvailableSlots(input: AgentInputPayload): number {
  let total = 0;
  for (const day of input.days) {
    for (const session of input.sessions) {
      total += periodCountForSession(input, session.id);
    }
  }
  return total;
}

/** Compute available slots for a specific teacher after applying their block constraints. */
function computeTeacherAvailableSlots(
  input: AgentInputPayload,
  teacherLabel: string,
  blockSpecs: ConstraintSpec[]
): number {
  const totalSlots = computeAvailableSlots(input);
  let blockedSlots = 0;
  for (const spec of blockSpecs) {
    if (spec.params.teacher !== teacherLabel) continue;
    const day = spec.params.day;
    const period = spec.params.period;
    if (day && period) {
      blockedSlots += 1; // specific slot
    } else if (day) {
      // Block entire day
      const daySession = input.sessions.reduce((s, sess) => s + periodCountForSession(input, sess.id), 0);
      blockedSlots += daySession;
    } else if (period) {
      // Block a specific period across all days
      blockedSlots += input.days.length;
    }
  }
  return Math.max(0, totalSlots - blockedSlots);
}

function computeClassAvailableSlots(
  input: AgentInputPayload,
  classLabel: string,
  blockSpecs: ConstraintSpec[]
): number {
  const totalSlots = computeAvailableSlots(input);
  let blockedSlots = 0;
  for (const spec of blockSpecs) {
    if (spec.params.class !== classLabel) continue;
    const day = spec.params.day;
    const period = spec.params.period;
    if (day && period) {
      blockedSlots += 1;
    } else if (day) {
      const daySession = input.sessions.reduce((s, sess) => s + periodCountForSession(input, sess.id), 0);
      blockedSlots += daySession;
    } else if (period) {
      blockedSlots += input.days.length;
    }
  }
  return Math.max(0, totalSlots - blockedSlots);
}

/** Run all capacity checks. Returns problems; empty array = feasible from a capacity standpoint. */
export function runPreSolveCapacityCheck(
  input: AgentInputPayload,
  specs: ConstraintSpec[]
): CapacityCheckResult {
  const problems: CapacityProblem[] = [];
  const totalRequired = input.assignments.reduce((s, a) => s + a.weeklyPeriods, 0);
  const totalAvailable = computeAvailableSlots(input);
  const utilization = totalAvailable > 0 ? (totalRequired / totalAvailable) * 100 : 0;

  // School-level check
  if (totalRequired > totalAvailable) {
    problems.push({
      severity: 'fatal',
      scope: 'school',
      message: `Tổng tiết cần xếp (${totalRequired}) vượt tổng slot khả dụng (${totalAvailable}).`,
      required: totalRequired,
      available: totalAvailable,
      hint: 'Giảm số tiết/tuần của một số phân công, hoặc tăng số buổi/tiết trong tuần.',
    });
  }

  // Per-teacher check
  const teacherBlockSpecs = specs.filter(
    (s) => (s.kind === 'teacher_block_day' || s.kind === 'teacher_block_period' || s.kind === 'teacher_block_slot') && s.severity === 'hard'
  );
  const teacherRequired = new Map<string, number>();
  for (const a of input.assignments) {
    teacherRequired.set(a.teacher.label, (teacherRequired.get(a.teacher.label) ?? 0) + a.weeklyPeriods);
  }
  for (const [teacherLabel, required] of teacherRequired.entries()) {
    const available = computeTeacherAvailableSlots(input, teacherLabel, teacherBlockSpecs);
    if (required > available) {
      problems.push({
        severity: 'fatal',
        scope: 'teacher',
        entity: teacherLabel,
        message: `Giáo viên ${teacherLabel} cần ${required} tiết nhưng chỉ còn ${available} slot khả dụng sau ràng buộc cấm.`,
        required,
        available,
        hint: 'Bỏ bớt ràng buộc cấm ngày/tiết, hoặc giảm phân công của giáo viên này.',
      });
    }
  }

  // Per-class check
  const classBlockSpecs = specs.filter(
    (s) => (s.kind === 'class_block_day' || s.kind === 'class_block_period' || s.kind === 'class_block_slot') && s.severity === 'hard'
  );
  const classRequired = new Map<string, number>();
  for (const a of input.assignments) {
    classRequired.set(a.class.label, (classRequired.get(a.class.label) ?? 0) + a.weeklyPeriods);
  }
  for (const [classLabel, required] of classRequired.entries()) {
    const available = computeClassAvailableSlots(input, classLabel, classBlockSpecs);
    if (required > available) {
      problems.push({
        severity: 'fatal',
        scope: 'class',
        entity: classLabel,
        message: `Lớp ${classLabel} cần ${required} tiết nhưng chỉ còn ${available} slot khả dụng sau ràng buộc cấm.`,
        required,
        available,
        hint: 'Bỏ bớt ràng buộc cấm ngày/tiết của lớp, hoặc tăng số buổi học.',
      });
    }
  }

  // Per-day check (a teacher can't teach more slots in a day than periods)
  // Detect: any day has more teacher_block_period entries than the daily session count
  for (const [teacherLabel] of teacherRequired.entries()) {
    const dayBlockCounts = new Map<string, number>();
    for (const spec of teacherBlockSpecs) {
      if (spec.params.teacher !== teacherLabel) continue;
      const day = typeof spec.params.day === 'string' ? spec.params.day : null;
      const period = spec.params.period;
      if (day && period) {
        dayBlockCounts.set(day, (dayBlockCounts.get(day) ?? 0) + 1);
      }
    }
    for (const [day, blocked] of dayBlockCounts.entries()) {
      const dailySlots = input.sessions.reduce((s, sess) => s + periodCountForSession(input, sess.id), 0);
      if (blocked > dailySlots) {
        problems.push({
          severity: 'warning',
          scope: 'session',
          entity: `${teacherLabel} @ ${resolveDayLabel(day) || day}`,
          message: `Giáo viên ${teacherLabel} bị cấm ${blocked} slot trong ${resolveDayLabel(day) || day} nhưng ngày đó chỉ có ${dailySlots} tiết.`,
          required: blocked,
          available: dailySlots,
        });
      }
    }
  }

  return {
    ok: problems.filter((p) => p.severity === 'fatal').length === 0,
    problems,
    totals: {
      requiredPeriods: totalRequired,
      availableSlots: totalAvailable,
      utilizationPercent: Math.round(utilization * 10) / 10,
    },
  };
}

/** Build a UI-friendly summary of capacity problems. */
export function summarizeCapacityProblems(result: CapacityCheckResult): string {
  if (result.ok) return `Khả thi về mặt sức chứa (${result.totals.utilizationPercent}% sử dụng).`;
  const lines: string[] = [];
  for (const p of result.problems) {
    lines.push(`- [${p.severity}] ${p.message}${p.hint ? ` Gợi ý: ${p.hint}` : ''}`);
  }
  return `Phát hiện ${result.problems.length} vấn đề sức chứa:\n${lines.join('\n')}`;
}

/**
 * Quick utility to check feasibility of a produced schedule — distinct from
 * per-constraint validation. Checks that all assignments have at least one
 * entry (no orphan assignments).
 */
export function checkScheduleCompleteness(schedule: ScheduleEntry[], input: AgentInputPayload): {
  complete: boolean;
  missing: Array<{ assignmentId: string; teacher: string; class: string; subject: string; required: number; scheduled: number }>;
} {
  const counts = new Map<string, number>();
  for (const entry of schedule) {
    if (!entry.assignmentId) continue;
    counts.set(entry.assignmentId, (counts.get(entry.assignmentId) ?? 0) + 1);
  }
  const missing: Array<{ assignmentId: string; teacher: string; class: string; subject: string; required: number; scheduled: number }> = [];
  for (const a of input.assignments) {
    const scheduled = counts.get(a.id) ?? 0;
    if (scheduled < a.weeklyPeriods) {
      missing.push({
        assignmentId: a.id,
        teacher: a.teacher.label,
        class: a.class.label,
        subject: a.subject.label,
        required: a.weeklyPeriods,
        scheduled,
      });
    }
  }
  return { complete: missing.length === 0, missing };
}
