import type { AgentInputPayload } from './types';

export function buildTranslatorPeriods(input: AgentInputPayload): number[] {
  const periodSet = new Set<number>();
  const periodsByDay = buildTranslatorPeriodsByDay(input);

  for (const periods of Object.values(periodsByDay)) {
    for (const period of periods) {
      if (Number.isFinite(period) && period > 0) periodSet.add(period);
    }
  }

  return [...periodSet].sort((a, b) => a - b);
}

export function buildTranslatorPeriodsByDay(input: AgentInputPayload): Record<string, number[]> {
  const periodsByDay: Record<string, number[]> = {};
  const allDaysHaveDayLevelCount = input.days.every((day) => {
    const value = Number(input.periodCounts[day.id]);
    return Number.isFinite(value) && value > 0;
  });
  const hasSessionCounts = input.sessions.some((session) => {
    const value = Number(input.periodCounts[session.id]);
    return Number.isFinite(value) && value > 0;
  });

  for (const day of input.days) {
    const activePeriods: number[] = [];
    const dayLevelValue = Number(input.periodCounts[day.id]);
    const dayHasOwnCount = Number.isFinite(dayLevelValue) && dayLevelValue > 0;

    if ((allDaysHaveDayLevelCount || dayHasOwnCount) && !hasSessionCounts) {
      const deletedPeriods = new Set<number>();
      for (const [key, isDeleted] of Object.entries(input.deletedPeriods)) {
        if (!isDeleted) continue;
        const [keyDay, , keyPeriodRaw] = key.split('-');
        const keyPeriod = Number(keyPeriodRaw);
        if (keyDay === day.id && Number.isFinite(keyPeriod)) deletedPeriods.add(keyPeriod);
      }
      for (let period = 1; period <= dayLevelValue; period += 1) {
        if (!deletedPeriods.has(period)) activePeriods.push(period);
      }
      periodsByDay[day.id] = activePeriods;
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
    periodsByDay[day.id] = activePeriods;
  }

  return periodsByDay;
}

export function periodsForSession(input: AgentInputPayload, sessionId: string): number[] {
  let offset = 0;
  for (const session of input.sessions) {
    const count = Number(input.periodCounts[session.id] ?? 0);
    const periods = Array.from({ length: Math.max(0, count) }, (_, index) => offset + index + 1);
    if (session.id === sessionId) return periods;
    offset += count;
  }
  return [];
}
