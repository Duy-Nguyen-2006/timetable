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
  // Try session-level counts first (periodCounts keyed by session.id)
  const sessionLevelCount = Number(input.periodCounts[sessionId] ?? 0);
  if (Number.isFinite(sessionLevelCount) && sessionLevelCount > 0) {
    let offset = 0;
    for (const session of input.sessions) {
      if (session.id === sessionId) {
        return Array.from({ length: sessionLevelCount }, (_, i) => offset + i + 1);
      }
      const count = Number(input.periodCounts[session.id] ?? 0);
      offset += Number.isFinite(count) ? count : 0;
    }
  }

  // Fallback: derive session-level counts from day-level counts (periodCounts keyed by day.id).
  // Split each day equally across sessions and map session position to absolute period numbers.
  const sessionIndex = input.sessions.findIndex((s) => s.id === sessionId);
  if (sessionIndex < 0 || input.sessions.length === 0) return [];

  const sampleDay = input.days[0];
  if (!sampleDay) return [];
  const dayLevelCount = Number(input.periodCounts[sampleDay.id] ?? 0);
  if (!Number.isFinite(dayLevelCount) || dayLevelCount <= 0) return [];

  const sessionsCount = input.sessions.length;
  // For session i, periods are: i*N+1, i*N+2, ..., i*N+(N/sessions) — but we don't know the split.
  // Use a simple heuristic: each session gets dayLevelCount / sessionsCount periods (rounded up).
  const periodsPerSession = Math.ceil(dayLevelCount / sessionsCount);
  const start = sessionIndex * periodsPerSession + 1;
  const end = Math.min(start + periodsPerSession - 1, dayLevelCount);
  const periods: number[] = [];
  for (let p = start; p <= end; p += 1) periods.push(p);
  return periods;
}
