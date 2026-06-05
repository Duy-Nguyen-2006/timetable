import type { ConstraintSpec, ScheduleEntry } from './constraint-spec';
import { toPeriod } from './validator-helpers';

/** Đếm số môn nặng khác nhau trong một buổi (theo danh sách tiết). */
export function countHeavySubjectsInPeriods(
  entries: ScheduleEntry[],
  heavy: Set<string>,
  periods: number[]
): number {
  const periodSet = new Set(periods);
  const present = new Set<string>();
  for (const e of entries) {
    const p = toPeriod(e.period);
    if (p === null || !periodSet.has(p)) continue;
    if (heavy.has(e.subject)) present.add(e.subject);
  }
  return present.size;
}

export function sessionPeriodBuckets(spec: ConstraintSpec): Array<{ sessionId: string; periods: number[] }> {
  const bySession = spec.params.sessionPeriodsBySession as Record<string, number[]> | undefined;
  if (bySession && typeof bySession === 'object') {
    return Object.entries(bySession).map(([sessionId, periods]) => ({
      sessionId,
      periods: Array.isArray(periods) ? periods.map(Number).filter(Number.isFinite) : [],
    }));
  }
  const flat = Array.isArray(spec.params.sessionPeriods)
    ? (spec.params.sessionPeriods as number[]).map(Number).filter(Number.isFinite)
    : [];
  const ids = Array.isArray(spec.params.sessionIds)
    ? (spec.params.sessionIds as string[]).map(String)
    : ['all'];
  if (flat.length === 0) return [{ sessionId: 'all', periods: [] }];
  if (ids.length === 1) return [{ sessionId: ids[0], periods: flat }];
  const sorted = [...flat].sort((a, b) => a - b);
  const mid = Math.ceil(sorted.length / 2);
  if (ids.includes('morning') && ids.includes('afternoon')) {
    return [
      { sessionId: 'morning', periods: sorted.slice(0, mid) },
      { sessionId: 'afternoon', periods: sorted.slice(mid) },
    ];
  }
  return [{ sessionId: ids[0], periods: sorted }];
}
