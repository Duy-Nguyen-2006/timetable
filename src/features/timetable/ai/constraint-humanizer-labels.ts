import { days as APP_DAYS } from '../constants';

const DAY_BY_ID = Object.fromEntries(APP_DAYS.map((d) => [d.id, d.tableLabel])) as Record<string, string>;

const DAY_ALIASES: Record<string, string> = {
  mon: 'Thứ 2',
  monday: 'Thứ 2',
  tue: 'Thứ 3',
  tuesday: 'Thứ 3',
  wed: 'Thứ 4',
  wednesday: 'Thứ 4',
  thu: 'Thứ 5',
  thursday: 'Thứ 5',
  fri: 'Thứ 6',
  friday: 'Thứ 6',
  sat: 'Thứ 7',
  saturday: 'Thứ 7',
  sun: 'CN',
  sunday: 'CN',
};

/** Chuyển id ngày (monday, mon, …) sang nhãn người dùng đọc được. */
export function resolveDayLabel(dayId: unknown): string {
  if (dayId === undefined || dayId === null || dayId === '') return '';
  const raw = String(dayId).trim();
  const lower = raw.toLowerCase();
  return DAY_BY_ID[lower] ?? DAY_BY_ID[raw] ?? DAY_ALIASES[lower] ?? raw;
}

export function formatPeriodList(periods: unknown): string {
  if (!Array.isArray(periods) || !periods.length) return '';
  return periods.map((p) => `tiết ${p}`).join(', ');
}

export function severityPhrase(severity: 'hard' | 'soft' | 'info', weight?: number): string {
  if (severity === 'hard') return '';
  if (severity === 'info') return ' (thông tin, không áp dụng khi xếp lịch)';
  const w = weight ?? undefined;
  return w != null && Number.isFinite(w) ? ` (ưu tiên nên có, trọng số ${w}/10)` : ' (ưu tiên nên có)';
}
