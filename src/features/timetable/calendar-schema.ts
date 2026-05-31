export const DAY_IDS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type DayId = (typeof DAY_IDS)[number];

export const WEEKDAY_IDS: readonly DayId[] = DAY_IDS.slice(0, 5);

export const SESSION_IDS = ['morning', 'afternoon', 'night'] as const;

export type SessionId = (typeof SESSION_IDS)[number];

export const DAY_ALIASES: Record<string, DayId> = {
  mon: 'monday',
  monday: 'monday',
  t2: 'monday',
  thu2: 'monday',
  thuhai: 'monday',
  tue: 'tuesday',
  tuesday: 'tuesday',
  t3: 'tuesday',
  thu3: 'tuesday',
  thuba: 'tuesday',
  wed: 'wednesday',
  wednesday: 'wednesday',
  t4: 'wednesday',
  thu4: 'wednesday',
  thutu: 'wednesday',
  thu: 'thursday',
  thursday: 'thursday',
  t5: 'thursday',
  thu5: 'thursday',
  thunam: 'thursday',
  fri: 'friday',
  friday: 'friday',
  t6: 'friday',
  thu6: 'friday',
  thusau: 'friday',
  sat: 'saturday',
  saturday: 'saturday',
  t7: 'saturday',
  thu7: 'saturday',
  thubay: 'saturday',
  sun: 'sunday',
  sunday: 'sunday',
  cn: 'sunday',
  chunhat: 'sunday',
};

export const SESSION_ALIASES: Record<string, SessionId> = {
  morning: 'morning',
  sang: 'morning',
  buoisang: 'morning',
  casang: 'morning',
  afternoon: 'afternoon',
  chieu: 'afternoon',
  buoichieu: 'afternoon',
  cachieu: 'afternoon',
  night: 'night',
  toi: 'night',
  buoitoi: 'night',
  catoi: 'night',
};

const stripDiacritics = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '');

export function normalizeAliasToken(value: string): string {
  return stripDiacritics(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function normalizeDayId(value: string): DayId | null {
  return DAY_ALIASES[normalizeAliasToken(value)] ?? null;
}

export function normalizeSessionId(value: string): SessionId | null {
  return SESSION_ALIASES[normalizeAliasToken(value)] ?? null;
}
