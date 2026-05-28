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
  const assignmentKeys = new Set(
    assignments.map((assignment) => `${assignment.class}::${assignment.subject}::${assignment.teacher}`)
  );
  const validDays = new Set((domain?.days ?? []).map((day) => String(day)));
  const validPeriods = new Set((domain?.periods ?? []).map((period) => Number(period)));
  const periodsByDay = domain?.periodsByDay ?? {};

  for (const entry of schedule) {
    const assignmentKey = `${entry.class}::${entry.subject}::${entry.teacher}`;
    if (!assignmentKeys.has(assignmentKey)) {
      return {
        ok: false,
        message: `Round-trip unknown assignment tuple: ${assignmentKey}`,
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

  return { ok: true, message: 'Round-trip verified.' };
}
