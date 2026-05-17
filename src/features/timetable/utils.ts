import { subjectPresets } from "./constants";

export function getCellKey(
  dayId: string,
  sessionId: string,
  period: number
): string {
  return `${dayId}-${sessionId}-${period}`;
}

export function makeAssignmentKey(
  teacher: string,
  subject: string,
  className: string,
  weeklyPeriods: string
): string {
  return `${teacher}|${subject}|${className}|${weeklyPeriods}`;
}

export function normalizeSubjectName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  // Check if it matches a preset abbreviation (uppercase)
  const preset = subjectPresets.find(
    (p) =>
      p.abbr === trimmed.toUpperCase() ||
      p.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (preset) return preset.name;
  return trimmed;
}

export function sortAlphabetically<T>(
  list: T[],
  accessor: (item: T) => string
): T[] {
  return [...list].sort((a, b) =>
    accessor(a).localeCompare(accessor(b), "vi-VN")
  );
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

export function getTeacherColorIndex(teacher: string, teachers: string[]): number {
  const idx = teachers.indexOf(teacher);
  return idx >= 0 ? idx % 16 : 0;
}
