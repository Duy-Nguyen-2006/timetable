import type { ScheduleEntry } from './constraint-spec';

export type RoundTripResult = {
  ok: boolean;
  message: string;
};

export function verifyCpSatRoundTrip(
  schedule: ScheduleEntry[],
  assignments: Array<{
    id: string;
    class: string;
    subject: string;
    teacher: string;
    weeklyPeriods: number;
  }>,
  domain?: {
    days?: string[];
    periodsByDay?: Record<string, number[]>;
    periods?: number[];
  }
): RoundTripResult {
  const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));
  const validDays = new Set((domain?.days ?? []).map((day) => String(day)));
  const validPeriods = new Set((domain?.periods ?? []).map((period) => Number(period)));
  const periodsByDay = domain?.periodsByDay ?? {};

  for (const entry of schedule) {
    const assignmentId = entry.assignmentId ? String(entry.assignmentId) : '';
    const matchingAssignments = assignments.filter(
      (assignment) =>
        entry.class === assignment.class &&
        entry.subject === assignment.subject &&
        entry.teacher === assignment.teacher
    );
    const resolvedAssignmentId = assignmentId || (matchingAssignments.length === 1 ? matchingAssignments[0].id : '');

    if (!resolvedAssignmentId) {
      return {
        ok: false,
        message: `Round-trip missing assignmentId for ${entry.class}/${entry.subject}/${entry.teacher}`,
      };
    }

    const assignment = assignmentById.get(resolvedAssignmentId);

    if (!assignment) {
      return {
        ok: false,
        message: `Round-trip unknown assignmentId: ${resolvedAssignmentId}`,
      };
    }

    if (
      entry.class !== assignment.class ||
      entry.subject !== assignment.subject ||
      entry.teacher !== assignment.teacher
    ) {
      return {
        ok: false,
        message: `Round-trip assignment tuple mismatch for ${resolvedAssignmentId}`,
      };
    }

    if (validDays.size > 0 && !validDays.has(String(entry.day))) {
      return {
        ok: false,
        message: `Round-trip invalid day: ${entry.day}`,
      };
    }

    const period = Number(entry.period);
    const dayPeriods = periodsByDay[String(entry.day)];
    if (Array.isArray(dayPeriods) && dayPeriods.length > 0 && !dayPeriods.includes(period)) {
      return {
        ok: false,
        message: `Round-trip invalid period ${entry.period} for day ${entry.day}`,
      };
    }
    if (validPeriods.size > 0 && !validPeriods.has(period)) {
      return {
        ok: false,
        message: `Round-trip invalid period: ${entry.period}`,
      };
    }
  }

  for (const assignment of assignments) {
    const count = schedule.filter(
      (entry) => {
        const assignmentId = entry.assignmentId ? String(entry.assignmentId) : '';
        if (assignmentId) return assignmentId === assignment.id;

        return (
          entry.class === assignment.class &&
          entry.subject === assignment.subject &&
          entry.teacher === assignment.teacher
        );
      }
    ).length;

    if (count !== assignment.weeklyPeriods) {
      return {
        ok: false,
        message: `Round-trip weekly mismatch for ${assignment.id}: expected ${assignment.weeklyPeriods}, got ${count}`,
      };
    }
  }

  return { ok: true, message: 'Round-trip verified.' };
}
