import type { DayId, SessionId } from '../features/timetable/calendar-schema'

export type ParsedConstraint =
  | { kind: 'teacher_block_days'; teacherLabels: string[]; dayIds: string[] }
  | { kind: 'teacher_block_periods'; teacherLabels: string[]; periods: number[] }
  | { kind: 'teacher_block_sessions'; teacherLabels: string[]; sessionIds: string[] }
  | { kind: 'teacher_block_day_period'; teacherLabels: string[]; dayIds: string[]; periods: number[] }
  | { kind: 'teacher_block_session_day'; teacherLabels: string[]; sessionIds: string[]; dayIds: string[] }
  | { kind: 'teacher_allow_only_days'; teacherLabels: string[]; dayIds: string[] }
  | { kind: 'teacher_allow_only_sessions'; teacherLabels: string[]; sessionIds: string[] }
  | { kind: 'class_block_days'; classLabels: string[]; dayIds: string[] }
  | { kind: 'subject_block_periods'; subjectLabels: string[]; periods: number[] }
  | { kind: 'subject_pin_periods'; subjectLabels: string[]; periods: number[] }
  | { kind: 'subject_only_sessions'; subjectLabels: string[]; sessionIds: string[] }
  | { kind: 'subject_block_consecutive'; subjectLabels: string[]; blockSize: number }
  | { kind: 'teacher_max_consecutive'; teacherLabels: string[] | '*'; max: number }
  | { kind: 'teacher_min_off_days'; teacherLabels: string[] | '*'; min: number }
  | { kind: 'class_daily_subject_any'; classLabels: string[] | '*'; subjectLabels: string[] }
  | { kind: 'subjects_not_consecutive'; subjectLabels: string[] }
  | { kind: 'subject_prefer_periods'; subjectLabels: string[]; periods: number[]; classFilter?: string[] }
  | { kind: 'subject_prefer_sessions'; subjectLabels: string[]; sessionIds: string[] }
  | { kind: 'unparsed'; reason: string }

type ParseContext = {
  teacherLabels: string[]
  classLabels: string[]
  subjectLabels: string[]
  dayIds: Record<string, string>
  sessionIds: Record<string, string>
}

const VN_DAY_ALIASES: Array<[RegExp, DayId]> = [
  [/\bthứ\s*(?:2|hai)\b/u, 'monday'],
  [/\bthứ\s*(?:3|ba)\b/u, 'tuesday'],
  [/\bthứ\s*(?:4|tư|tu)\b/u, 'wednesday'],
  [/\bthứ\s*(?:5|năm|nam)\b/u, 'thursday'],
  [/\bthứ\s*(?:6|sáu|sau)\b/u, 'friday'],
  [/\bthứ\s*(?:7|bảy|bay)\b/u, 'saturday'],
  [/\b(?:chủ\s*nhật|chu\s*nhat|cn)\b/u, 'sunday'],
]

const SESSION_ALIASES: Array<[RegExp, SessionId]> = [
  [/\b(?:buổi\s*)?(?:sáng|sang|sáng\s*sớm|sang\s*som)\b/u, 'morning'],
  [/\b(?:buổi\s*)?(?:chiều|chieu)\b/u, 'afternoon'],
  [/\b(?:buổi\s*)?(?:tối|toi)\b/u, 'night'],
]

function normalize(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function boundaryPattern(label: string): RegExp {
  return new RegExp(`(^|[\\s,.;:()\\[\\]{}"'/-])${escapeRegExp(normalize(label))}(?=$|[\\s,.;:()\\[\\]{}"'/-])`, 'u')
}

function matchLabels(text: string, labels: string[]): string[] {
  return [...labels]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .filter((label) => boundaryPattern(label).test(text))
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function extractDays(text: string): string[] {
  const days: string[] = []
  const compact = text.match(/\bthứ\s*([2-7](?:\s+[2-7])+)\b/u)
  if (compact) {
    for (const n of compact[1].split(/\s+/)) {
      const map: Record<string, string> = {
        '2': 'monday',
        '3': 'tuesday',
        '4': 'wednesday',
        '5': 'thursday',
        '6': 'friday',
        '7': 'saturday',
      }
      if (map[n]) days.push(map[n])
    }
    return unique(days)
  }
  for (const [pattern, dayId] of VN_DAY_ALIASES) {
    if (pattern.test(text)) {
      days.push(dayId)
      break
    }
  }
  return unique(days)
}

function extractSessions(text: string): string[] {
  const sessions: string[] = []
  for (const [pattern, sessionId] of SESSION_ALIASES) {
    if (pattern.test(text)) sessions.push(sessionId)
  }
  return unique(sessions)
}

function extractPeriods(text: string): number[] {
  const periods: number[] = []
  const range = text.match(/\btiết\s*(\d+)\s*[-–]\s*(\d+)\b/u)
  if (range) {
    const lo = Number(range[1])
    const hi = Number(range[2])
    for (let n = Math.min(lo, hi); n <= Math.max(lo, hi); n++) periods.push(n)
  }
  const singles = text.matchAll(/\btiết\s*(\d+)\b/gu)
  for (const match of singles) periods.push(Number(match[1]))
  return unique(periods.map(String)).map(Number).filter((n) => Number.isInteger(n) && n > 0)
}

function extractFirstNumber(text: string): number | null {
  const match = text.match(/\b(\d+)\b/u)
  if (!match) return null
  const n = Number(match[1])
  return Number.isInteger(n) && n > 0 ? n : null
}

function classFilterFromText(text: string, classLabels: string[]): string[] | undefined {
  const exact = matchLabels(text, classLabels)
  if (exact.length > 0) return exact
  const grade = text.match(/\blớp\s*(\d{1,2})\b/u)
  if (!grade) return undefined
  const filtered = classLabels.filter((label) => normalize(label).startsWith(grade[1]))
  return filtered.length > 0 ? filtered : undefined
}

function allTeacherToken(text: string): boolean {
  return /\b(?:mỗi|moi)\s*(?:giáo\s*viên|giao\s*vien|gv)\b/u.test(text)
}

function allClassToken(text: string): boolean {
  return /\b(?:mỗi|moi)\s*(?:lớp|lop)\b/u.test(text)
}

export function parseConstraint(text: string, ctx: ParseContext): ParsedConstraint {
  const raw = normalize(text)
  if (!raw) return { kind: 'unparsed', reason: 'Constraint rỗng.' }

  const teachers = matchLabels(raw, ctx.teacherLabels)
  const classes = matchLabels(raw, ctx.classLabels)
  const subjects = matchLabels(raw, ctx.subjectLabels)
  const days = extractDays(raw)
  const sessions = extractSessions(raw)
  const periods = extractPeriods(raw)

  if ((/không\s*dạy\s*quá|khong\s*day\s*qua/u.test(raw) || /không\s*quá|khong\s*qua/u.test(raw)) && /liên\s*tiếp|lien\s*tiep/u.test(raw)) {
    const max = extractFirstNumber(raw)
    if (max !== null) return { kind: 'teacher_max_consecutive', teacherLabels: allTeacherToken(raw) ? '*' : teachers, max }
  }

  if (/ngày\s*nghỉ\s*tối\s*thiểu|ngay\s*nghi\s*toi\s*thieu/u.test(raw)) {
    const min = extractFirstNumber(raw) ?? 1
    return { kind: 'teacher_min_off_days', teacherLabels: allTeacherToken(raw) || teachers.length === 0 ? '*' : teachers, min }
  }

  if (/mỗi\s*ngày\s*mỗi\s*lớp|moi\s*ngay\s*moi\s*lop/u.test(raw) && subjects.length > 0) {
    return { kind: 'class_daily_subject_any', classLabels: allClassToken(raw) ? '*' : classes, subjectLabels: subjects }
  }

  if (/không\s*liên\s*tiếp|khong\s*lien\s*tiep/u.test(raw) && subjects.length >= 2) {
    return { kind: 'subjects_not_consecutive', subjectLabels: subjects }
  }

  if (/không\s*dạy|khong\s*day|không\s*có\s*lịch|khong\s*co\s*lich/u.test(raw) && teachers.length > 0) {
    if (days.length > 0 && periods.length > 0) return { kind: 'teacher_block_day_period', teacherLabels: teachers, dayIds: days, periods }
    if (sessions.length > 0 && days.length > 0) return { kind: 'teacher_block_session_day', teacherLabels: teachers, sessionIds: sessions, dayIds: days }
    if (days.length > 0) return { kind: 'teacher_block_days', teacherLabels: teachers, dayIds: days }
    if (periods.length > 0) return { kind: 'teacher_block_periods', teacherLabels: teachers, periods }
    if (sessions.length > 0) return { kind: 'teacher_block_sessions', teacherLabels: teachers, sessionIds: sessions }
  }

  if ((/chỉ\s*dạy|chi\s*day/u.test(raw) || /\bchỉ|chi\b/u.test(raw)) && teachers.length > 0) {
    if (days.length > 0) return { kind: 'teacher_allow_only_days', teacherLabels: teachers, dayIds: days }
    if (sessions.length > 0) return { kind: 'teacher_allow_only_sessions', teacherLabels: teachers, sessionIds: sessions }
  }

  if (/không\s*học|khong\s*hoc/u.test(raw) && classes.length > 0) {
    if (days.length > 0) return { kind: 'class_block_days', classLabels: classes, dayIds: days }
  }

  if ((/không\s*xếp|khong\s*xep|không\s*được\s*xếp|khong\s*duoc\s*xep/u.test(raw) || (/không|khong/u.test(raw) && subjects.length > 0)) && subjects.length > 0) {
    if (periods.length > 0) return { kind: 'subject_block_periods', subjectLabels: subjects, periods }
    if (sessions.length > 0) return { kind: 'subject_only_sessions', subjectLabels: subjects, sessionIds: sessions }
  }

  if ((/chỉ\s*tiết|chi\s*tiet|bắt\s*buộc\s*tiết|bat\s*buoc\s*tiet|luôn\s*tiết|luon\s*tiet/u.test(raw)) && subjects.length > 0 && periods.length > 0) {
    return { kind: 'subject_pin_periods', subjectLabels: subjects, periods }
  }

  if (subjects.length > 0 && /phải\s*block|phai\s*block|liên\s*tiếp|lien\s*tiep/u.test(raw)) {
    const blockSize = extractFirstNumber(raw) ?? 2
    return { kind: 'subject_block_consecutive', subjectLabels: subjects, blockSize }
  }

  if (subjects.length > 0 && sessions.length > 0 && !/không|khong/u.test(raw)) {
    if (/nên|nen/u.test(raw)) return { kind: 'subject_prefer_sessions', subjectLabels: subjects, sessionIds: sessions }
    return { kind: 'subject_only_sessions', subjectLabels: subjects, sessionIds: sessions }
  }

  if (subjects.length > 0 && periods.length > 0 && /nên|nen|xếp|xep|tiết|tiet/u.test(raw)) {
    const classFilter = classFilterFromText(raw, ctx.classLabels)
    return classFilter
      ? { kind: 'subject_prefer_periods', subjectLabels: subjects, periods, classFilter }
      : { kind: 'subject_prefer_periods', subjectLabels: subjects, periods }
  }

  return { kind: 'unparsed', reason: 'Không khớp pattern chuẩn hoặc thiếu entity/ngày/tiết/buổi.' }
}
