import type { ConstraintSpec } from './constraint-spec';
import type { AgentInputPayload } from './types';

export type CompressedAssignment = {
  id: string;
  class: string;
  subject: string;
  teacher: string;
  weeklyPeriods: number;
};

export type CompressedPayload = {
  classes: string[];
  days: string[];
  periodsByDay: Record<string, number[]>;
  periods: number[];
  assignments: CompressedAssignment[];
  constraints: ConstraintSpec[];
  datasetDigest: {
    classCount: number;
    teacherCount: number;
    dayCount: number;
    periodCount: number;
    totalAssignments: number;
  };
};

function inferActivePeriods(input: AgentInputPayload): Record<string, number[]> {
  const byDay: Record<string, number[]> = {};
  // Không bật day-level cho tất cả days chỉ vì MỘT day có entry trong
  // periodCounts. Cần KIỂM TRA per-day: nếu day này không có entry hợp lệ
  // thì dùng session breakdown. (fix bug #11)
  const allDaysHaveDayLevelCount = input.days.every((day) => {
    const value = Number(input.periodCounts[day.id]);
    return Number.isFinite(value) && value > 0;
  });

  for (const day of input.days) {
    const activePeriods: number[] = [];
    const dayLevelValue = Number(input.periodCounts[day.id]);
    const dayHasOwnCount = Number.isFinite(dayLevelValue) && dayLevelValue > 0;

    if (allDaysHaveDayLevelCount || dayHasOwnCount) {
      const dayMax = dayHasOwnCount ? dayLevelValue : 0;
      const deletedPeriods = new Set<number>();
      for (const [key, isDeleted] of Object.entries(input.deletedPeriods)) {
        if (!isDeleted) continue;
        const [keyDay, , keyPeriodRaw] = key.split('-');
        const keyPeriod = Number(keyPeriodRaw);
        if (keyDay === day.id && Number.isFinite(keyPeriod)) {
          deletedPeriods.add(keyPeriod);
        }
      }
      for (let period = 1; period <= dayMax; period += 1) {
        if (!deletedPeriods.has(period)) activePeriods.push(period);
      }
      byDay[day.id] = activePeriods;
      continue;
    }

    let offset = 0;
    for (const session of input.sessions) {
      const sessionMax = Number(input.periodCounts[session.id] ?? 0);
      for (let period = 1; period <= sessionMax; period += 1) {
        const key = `${day.id}-${session.id}-${period}`;
        if (!input.deletedPeriods[key]) activePeriods.push(offset + period);
      }
      offset += sessionMax;
    }
    byDay[day.id] = activePeriods;
  }

  return byDay;
}

export function compressPayload(
  input: AgentInputPayload,
  constraintSpecs: ConstraintSpec[]
): CompressedPayload {
  const assignments: CompressedAssignment[] = input.assignments.map((assignment) => ({
    id: assignment.id,
    class: assignment.class.label,
    subject: assignment.subject.label,
    teacher: assignment.teacher.label,
    weeklyPeriods: assignment.weeklyPeriods,
  }));

  const classes = [...new Set(assignments.map((assignment) => assignment.class))].sort((a, b) =>
    a.localeCompare(b, 'vi')
  );
  const teachers = [...new Set(assignments.map((assignment) => assignment.teacher))];
  const periodsByDay = inferActivePeriods(input);
  const merged = new Set<number>();
  for (const periods of Object.values(periodsByDay)) {
    for (const period of periods) merged.add(period);
  }
  const periods = [...merged].sort((a, b) => a - b);
  const days = input.days.map((day) => day.id);

  return {
    classes,
    days,
    periodsByDay,
    periods,
    assignments,
    constraints: constraintSpecs,
    datasetDigest: {
      classCount: classes.length,
      teacherCount: teachers.length,
      dayCount: days.length,
      periodCount: periods.length,
      totalAssignments: assignments.length,
    },
  };
}

export function groupAssignments(assignments: CompressedAssignment[]): Record<string, CompressedAssignment[]> {
  const grouped: Record<string, CompressedAssignment[]> = {};
  for (const assignment of assignments) {
    if (!grouped[assignment.class]) grouped[assignment.class] = [];
    grouped[assignment.class].push(assignment);
  }
  return grouped;
}

export function digestError(raw: string, maxLength = 800): string {
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  const focused = lines.slice(-12).join('\n');
  if (focused.length <= maxLength) return focused;
  // fix bug #28 — cắt ở ranh giới dòng gần nhất trước maxLength để
  // tránh rách tracebacks giữa dòng/ký tự.
  const cutAt = focused.lastIndexOf('\n', maxLength - 4);
  const safeCut = cutAt > 0 ? cutAt : maxLength - 3;
  return `${focused.slice(0, safeCut)}\n...`;
}