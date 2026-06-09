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
  | { kind: 'teacher_prefer_periods'; teacherLabels: string[]; periods: number[] }
  | { kind: 'teacher_max_classes_per_day'; teacherLabels: string[] | '*'; max: number }
  | { kind: 'teacher_pair_not_same_slot'; teacherLabels: string[]; dayIds: string[] }
  | { kind: 'teacher_pair_not_same_day'; teacherLabels: string[]; dayIds: string[] }
  | { kind: 'teacher_homeroom_first_period'; teacherLabels: string[]; classLabels: string[]; dayIds: string[]; period: number }
  | { kind: 'subject_not_last_period'; subjectLabels: string[]; classFilter?: string[] }
  | { kind: 'class_subjects_not_same_day'; classLabels: string[] | '*'; subjectLabels: string[]; maxSubjectsPerDay: number; softHint: boolean }
  | { kind: 'class_max_heavy_subjects_per_day'; classLabels: string[] | '*'; subjectLabels: string[]; maxHeavy: number }
  | { kind: 'class_max_heavy_subjects_per_session'; classLabels: string[] | '*'; subjectLabels: string[]; subjectGroups?: string[][]; maxHeavyInSession: number; sessionIds: string[]; softHint?: boolean }
  | { kind: 'class_first_period_required'; classLabels: string[] | '*' }
  | { kind: 'subject_flag_ceremony_slot'; dayIds: string[]; period: number }
  | { kind: 'global_teacher_utilization_balance'; tolerance: number }
  | { kind: 'unparsed'; reason: string }

type ParseContext = {
  teacherLabels: string[]
  classLabels: string[]
  subjectLabels: string[]
  dayIds: Record<string, string>
  sessionIds: Record<string, string>
}

const VN_DAY_ALIASES: Array<[RegExp, number]> = [
  [/\bthứ\s*(?:2|hai)\b/u, 0], // Monday
  [/\bthứ\s*(?:3|ba)\b/u, 1], // Tuesday
  [/\bthứ\s*(?:4|tư|tu)\b/u, 2], // Wednesday
  [/\bthứ\s*(?:5|năm|nam)\b/u, 3], // Thursday
  [/\bthứ\s*(?:6|sáu|sau)\b/u, 4], // Friday
  [/\bthứ\s*(?:7|bảy|bay)\b/u, 5], // Saturday
  [/\b(?:chủ\s*nhật|chu\s*nhat|cn)\b/u, 6], // Sunday
]

const HARDCODED_DAY_IDS: DayId[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

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


function heavySubjectsFromLabels(labels: string[]): string[] {
  return labels.filter((label) =>
    /toán|toan|văn|van|tiếng\s*anh|tieng\s*anh|khtn|thể\s*dục|gdcd|lý|ls&đl|cn|sinh\s*hoạt/u.test(normalize(label))
  )
}

function extractHeavySubjectGroups(raw: string, ctx: ParseContext): string[][] | null {
  const segments = raw.split(/\s+(?:và|va)\s+/iu).map((s) => s.trim()).filter(Boolean)
  const groups: string[][] = []
  for (const seg of segments) {
    if (!/(môn|mon|toán|văn|anh|khtn)/iu.test(seg)) continue
    const picked = matchLabels(seg, ctx.subjectLabels)
    if (picked.length >= 2) groups.push(picked)
  }
  if (groups.length >= 2) return groups
  if (groups.length === 1) return groups
  return null
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function resolveDayId(dayIndex: number, ctxDayIds?: Record<string, string>): string {
  if (ctxDayIds) {
    const entries = Object.entries(ctxDayIds);
    // Positional lookup: index 0 = Mon, 1 = Tue, …, 6 = Sun.
    if (dayIndex >= 0 && dayIndex < entries.length) {
      return entries[dayIndex][1];
    }
  }
  return HARDCODED_DAY_IDS[dayIndex] ?? HARDCODED_DAY_IDS[0];
}

function extractDays(text: string, ctxDayIds?: Record<string, string>): string[] {
  const days: string[] = []
  const compact = text.match(/\bthứ\s*([2-7](?:\s+[2-7])+)\b/u)
  if (compact) {
    for (const n of compact[1].split(/\s+/)) {
      const dayIndex = Number(n) - 2; // "thứ 2" → index 0
      if (dayIndex >= 0 && dayIndex <= 5) {
        days.push(resolveDayId(dayIndex, ctxDayIds));
      }
    }
    return unique(days)
  }
  for (const [pattern, dayIndex] of VN_DAY_ALIASES) {
    if (pattern.test(text)) {
      days.push(resolveDayId(dayIndex, ctxDayIds));
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


function inferMaxHeavyInSession(raw: string, heavyCount: number): number {
  const explicit = raw.match(/(?:tối\s*đa|toi\s*da|không\s*quá|khong\s*qua|max)\s*(\d+)\s*(?:môn|mon)/iu)
  if (explicit) {
    const n = Number(explicit[1])
    if (Number.isInteger(n) && n > 0) return n
  }
  if (/toán.*văn.*anh|toan.*van.*anh/iu.test(raw) || heavyCount >= 3) return 2
  const first = extractFirstNumber(raw)
  if (first !== null && first >= 2 && first <= 6) return first
  return 2
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
  const days = extractDays(raw, ctx.dayIds)
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

  if (teachers.length >= 2 && /(không|khong).*(cùng|trùng).*(ngày|ngay)/u.test(raw)) {
    return { kind: 'teacher_pair_not_same_day', teacherLabels: teachers.slice(0, 2), dayIds: days }
  }

  if (teachers.length >= 2 && /(không|khong).*(cùng|trùng).*(tiết|tiet|slot)/u.test(raw)) {
    return { kind: 'teacher_pair_not_same_slot', teacherLabels: teachers.slice(0, 2), dayIds: days }
  }

  if (/không\s*dạy|khong\s*day|không\s*có\s*lịch|khong\s*co\s*lich|tránh\s*dạy|tranh\s*day|tránh\s*tiết|tranh\s*tiet|tránh|tranh/u.test(raw) && teachers.length > 0) {
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

  if (teachers.length > 0 && periods.length > 0 && /nên|nen|ưu\s*tiên|uu\s*tien|xếp|xep/u.test(raw)) {
    return { kind: 'teacher_prefer_periods', teacherLabels: teachers, periods }
  }

  if (
    (/tối\s*đa|toi\s*da|không\s*quá|khong\s*qua/u.test(raw)) &&
    /(lớp|lop)/u.test(raw) &&
    /(mỗi\s*ngày|moi\s*ngay|ngày|ngay)/u.test(raw) &&
    teachers.length > 0
  ) {
    const max = extractFirstNumber(raw)
    if (max !== null) {
      return {
        kind: 'teacher_max_classes_per_day',
        teacherLabels: allTeacherToken(raw) ? '*' : teachers,
        max,
      }
    }
  }

  if (
    teachers.length > 0 &&
    classes.length > 0 &&
    /(chủ\s*nhiệm|chu\s*nhiem|gvcn)/u.test(raw) &&
    /(tiết\s*1|tiet\s*1|tiết\s*đầu|tiet\s*dau)/u.test(raw)
  ) {
    const period = periods[0] ?? 1
    return {
      kind: 'teacher_homeroom_first_period',
      teacherLabels: teachers,
      classLabels: classes,
      dayIds: days.length > 0 ? days : ['monday'],
      period,
    }
  }

  if (subjects.length > 0 && /(tiết\s*cuối|tiet\s*cuoi|không\s*xếp\s*tiết\s*cuối|khong\s*xep\s*tiet\s*cuoi)/u.test(raw)) {
    const classFilter = classFilterFromText(raw, ctx.classLabels)
    return classFilter
      ? { kind: 'subject_not_last_period', subjectLabels: subjects, classFilter }
      : { kind: 'subject_not_last_period', subjectLabels: subjects }
  }

  if (
    (/môn\s*nặng|mon\s*nang|tiết\s*nặng|tiet\s*nang/u.test(raw)) &&
    /(buổi|buoi|sáng|sang|chiều|chieu)/u.test(raw) &&
    /(dồn|don|xen\s*kẽ|xen\s*ke|trong\s*(?:1\s*)?buổi|cùng\s*(?:1\s*)?buổi|vào\s*(?:1\s*)?buổi|không\s*chỉ|khong\s*chi)/u.test(raw)
  ) {
    const sessions = extractSessions(raw)
    const sessionIds = sessions.length > 0 ? sessions : (['morning', 'afternoon'] as SessionId[])
    const groups = extractHeavySubjectGroups(raw, ctx)
    const heavySubjects =
      subjects.length >= 2
        ? subjects
        : heavySubjectsFromLabels(ctx.subjectLabels)
    const maxHeavyInSession = inferMaxHeavyInSession(raw, heavySubjects.length)
    const softHint = /(không\s*nên|khong\s*nen|nên|nen|ưu\s*tiên|uu\s*tien|tránh|tranh)/u.test(raw)
    if (groups && groups.length >= 1) {
      return {
        kind: 'class_max_heavy_subjects_per_session',
        classLabels: classes.length > 0 ? classes : '*',
        subjectLabels: groups.flat(),
        subjectGroups: groups,
        maxHeavyInSession,
        sessionIds,
        softHint,
      }
    }
    if (heavySubjects.length >= 2) {
      return {
        kind: 'class_max_heavy_subjects_per_session',
        classLabels: classes.length > 0 ? classes : '*',
        subjectLabels: heavySubjects,
        maxHeavyInSession,
        sessionIds,
        softHint,
      }
    }
  }

  if (
    (/tiết\s*nặng|tiet\s*nang|môn\s*nặng|mon\s*nang|tiết\s*chính|tiet\s*chinh/u.test(raw) ||
      (/môn\s*nặng|mon\s*nang/u.test(raw) && subjects.length === 0)) &&
    /(không\s*nên|khong\s*nen|không|khong|tránh|tranh)/u.test(raw) &&
    /(cùng|cung).*(ngày|ngay)/u.test(raw) &&
    !/(buổi|buoi)/u.test(raw) &&
    /(lớp|lop)/u.test(raw)
  ) {
    const heavySubjects =
      subjects.length >= 2
        ? subjects
        : ctx.subjectLabels.filter((label) =>
            /toán|toan|văn|van|tiếng\s*anh|tieng\s*anh|khtn|thể\s*dục|gdcd|lý|van|sinh\s*hoạt/u.test(normalize(label))
          );
    if (heavySubjects.length >= 2) {
      return {
        kind: 'class_subjects_not_same_day',
        classLabels: classes.length > 0 ? classes : '*',
        subjectLabels: heavySubjects,
        maxSubjectsPerDay: 1,
        softHint: true,
      };
    }
  }

  if (
    subjects.length >= 2 &&
    /(không\s*nên|khong\s*nen|không|khong|tránh|tranh)/u.test(raw) &&
    /(cùng|cung)/u.test(raw) &&
    /(ngày|ngay)/u.test(raw) &&
    /(lớp|lop)/u.test(raw)
  ) {
    return {
      kind: 'class_subjects_not_same_day',
      classLabels: classes.length > 0 ? classes : '*',
      subjectLabels: subjects,
      maxSubjectsPerDay: 1,
      softHint: /không\s*nên|khong\s*nen|nên\s*tránh|nen\s*tranh/u.test(raw),
    }
  }

  if (
    (/môn\s*nặng|mon\s*nang|môn\s*chính|mon\s*chinh/u.test(raw) || subjects.length >= 2) &&
    /(tối\s*đa|toi\s*da|không\s*quá|khong\s*qua)/u.test(raw) &&
    /(ngày|ngay)/u.test(raw)
  ) {
    const maxHeavy = extractFirstNumber(raw) ?? 2
    const heavySubjects =
      subjects.length > 0
        ? subjects
        : ctx.subjectLabels.filter((label) =>
            /toán|toan|văn|van|tiếng\s*anh|tieng\s*anh|anh\s*văn/u.test(normalize(label))
          )
    if (heavySubjects.length > 0) {
      return {
        kind: 'class_max_heavy_subjects_per_day',
        classLabels: allClassToken(raw) ? '*' : classes,
        subjectLabels: heavySubjects,
        maxHeavy,
      }
    }
  }

  if (
    classes.length > 0 &&
    /(tiết\s*đầu|tiet\s*dau|bắt\s*đầu\s*từ\s*tiết\s*1|bat\s*dau\s*tu\s*tiet\s*1|không\s*bỏ\s*trống\s*tiết\s*đầu)/u.test(raw)
  ) {
    return { kind: 'class_first_period_required', classLabels: allClassToken(raw) ? '*' : classes }
  }

  if (/(chào\s*cờ|chao\s*co|sinh\s*hoạt|sinh\s*hoat|lễ\s*chào)/u.test(raw) && (days.length > 0 || periods.length > 0)) {
    return {
      kind: 'subject_flag_ceremony_slot',
      dayIds: days.length > 0 ? days : ['monday'],
      period: periods[0] ?? 1,
    }
  }

  if (/(cân\s*bằng\s*tải|cân\s*bằng\s*tiết|phan\s*bo\s*deu|balanced)/u.test(raw) && /(giáo\s*viên|giao\s*vien|gv|toàn\s*trường)/u.test(raw)) {
    const tolerance = extractFirstNumber(raw) ?? 1
    return { kind: 'global_teacher_utilization_balance', tolerance }
  }

  return { kind: 'unparsed', reason: 'Không khớp pattern chuẩn hoặc thiếu entity/ngày/tiết/buổi.' }
}
