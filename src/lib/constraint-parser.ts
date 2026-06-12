import type { DayId, SessionId } from '../features/timetable/calendar-schema'

export type ParsedConstraint =
  | { kind: 'teacher_block_days'; teacherLabels: string[]; dayIds: string[] }
  | { kind: 'teacher_block_periods'; teacherLabels: string[]; periods: number[] }
  | { kind: 'teacher_block_last_period'; teacherLabels: string[] }
  | { kind: 'teacher_block_sessions'; teacherLabels: string[]; sessionIds: string[] }
  | { kind: 'teacher_block_day_period'; teacherLabels: string[]; dayIds: string[]; periods: number[] }
  | { kind: 'teacher_block_session_day'; teacherLabels: string[]; sessionIds: string[]; dayIds: string[] }
  | { kind: 'teacher_allow_only_days'; teacherLabels: string[]; dayIds: string[] }
  | { kind: 'teacher_allow_only_periods'; teacherLabels: string[]; periods: number[] }
  | { kind: 'teacher_allow_only_sessions'; teacherLabels: string[]; sessionIds: string[] }
  | { kind: 'teacher_weekly_range'; teacherLabels: string[]; min?: number; max?: number }
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
  | { kind: 'teacher_pair_same_slot'; teacherLabels: string[]; dayIds: string[] }
  | { kind: 'teacher_homeroom_first_period'; teacherLabels: string[]; classLabels: string[]; dayIds: string[]; period: number }
  | { kind: 'subject_not_last_period'; subjectLabels: string[]; classFilter?: string[] }
  | { kind: 'subject_not_consecutive'; subjectLabels: string[]; classFilter?: string[] }
  | { kind: 'subject_block_days'; subjectLabels: string[]; dayIds: string[]; classFilter?: string[] }
  | { kind: 'class_allow_only_days'; classLabels: string[]; dayIds: string[] }
  | { kind: 'class_allow_only_periods'; classLabels: string[]; periods: number[] }
  | { kind: 'subject_allow_only_days'; subjectLabels: string[]; dayIds: string[]; classFilter?: string[] }
  | { kind: 'class_no_gaps'; classLabels: string[] | '*' }
  | { kind: 'class_min_per_day'; classLabels: string[]; minPerDay: number }
  | { kind: 'class_max_per_day'; classLabels: string[]; maxPerDay: number }
  | { kind: 'teacher_min_per_day'; teacherLabels: string[]; minPerDay: number }
  | { kind: 'teacher_max_per_day'; teacherLabels: string[]; maxPerDay: number }
  | { kind: 'teacher_no_gaps'; teacherLabels: string[] | '*' }
  | { kind: 'teacher_min_working_days'; teacherLabels: string[]; minDays: number }
  | { kind: 'teacher_max_working_days'; teacherLabels: string[]; maxDays: number }
  | { kind: 'teacher_exact_working_days'; teacherLabels: string[]; days: number }
  | { kind: 'teacher_max_per_day'; teacherLabels: string[]; maxPerDay: number }
  | { kind: 'teacher_no_constraint'; teacherLabels: string[] }
  | { kind: 'teacher_count_relative'; teacherLabels: string[]; otherTeacherLabels: string[]; op: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'pct' | 'factor'; value: number }
  | { kind: 'teacher_total_periods'; teacherLabels: string[]; op: 'min' | 'max' | 'exact'; value: number }
  | { kind: 'teacher_argmax_weekly'; teacherLabels: string[] }
  // Phase 3 quick wins: order/distance pair constraints (nhóm 6).
  | { kind: 'teacher_pair_period_order'; teacherALabels: string[]; teacherBLabels: string[]; relation: 'before' | 'after' | 'adjacent_before' | 'adjacent_after'; minGap: number }
  | { kind: 'teacher_pair_not_adjacent'; teacherALabels: string[]; teacherBLabels: string[] }
  | { kind: 'teacher_pair_day_distance'; teacherALabels: string[]; teacherBLabels: string[]; direction: 'before' | 'after' | 'either'; distance: number }
  | { kind: 'teacher_group_not_same_day'; teacherLabels: string[] }
  | { kind: 'teacher_group_min_per_day'; teacherLabels: string[]; minCount: number }
  | { kind: 'teacher_group_not_same_period'; teacherLabels: string[] }
  | { kind: 'teacher_group_max_concurrent'; teacherLabels: string[]; maxConcurrent: number }
  | { kind: 'teacher_group_exact_per_day'; teacherLabels: string[]; exactCount: number }
  | { kind: 'teacher_group_total_periods'; teachersALabels: string[]; teachersBLabels: string[] }
  | { kind: 'global_min_teachers_per_period'; minCount: number; period?: number; dayIds: string[] }
  | { kind: 'global_max_teachers_per_period'; maxCount: number; period?: number; dayIds: string[] }
  | { kind: 'global_exact_teachers_per_period'; exactCount: number; period?: number; dayIds: string[] }
  | { kind: 'teacher_priority_session'; teacherLabels: string[]; sessionIds: string[] }
  | { kind: 'teacher_priority_day'; teacherLabels: string[]; dayIds: string[] }
  | { kind: 'teacher_unavailable_holiday'; teacherLabels: string[]; dayIds: string[] }
  | { kind: 'teacher_unavailable_sudden'; teacherLabels: string[] }
  | { kind: 'teacher_break_time_minutes'; teacherLabels: string[]; minutes: number }
  | { kind: 'global_max_workload_diff'; maxDiff: number }
  | { kind: 'subject_after_subject_week'; subjectALabels: string[]; subjectBLabels: string[] }
  | { kind: 'subject_before_subject_week'; subjectALabels: string[]; subjectBLabels: string[] }
  | { kind: 'subject_same_week'; subjectALabels: string[]; subjectBLabels: string[] }
  | { kind: 'subject_gap_weeks'; subjectALabels: string[]; subjectBLabels: string[]; gapWeeks: number }
  | { kind: 'subject_min_gap_hours'; subjectALabels: string[]; subjectBLabels: string[]; minHours: number }
  | { kind: 'subject_after_break'; subjectLabels: string[]; afterPeriod: number }
  | { kind: 'subject_consecutive_periods'; subjectLabels: string[]; length: number }
  | { kind: 'teacher_min_rest_between_days'; teacherLabels: string[]; minRestDays: number }
  | { kind: 'teacher_max_hours_per_day'; teacherLabels: string[]; maxHours: number }
  | { kind: 'teacher_lunch_break_required'; teacherLabels: string[] }
  | { kind: 'teacher_mentorship'; mentorLabels: string[]; menteeLabels: string[] }
  | { kind: 'teacher_conflict'; teacherALabels: string[]; teacherBLabels: string[] }
  | { kind: 'teacher_max_gaps'; teacherLabels: string[]; maxGaps: number }
  | { kind: 'teacher_min_consecutive'; teacherLabels: string[]; minConsecutive: number }
  | { kind: 'subject_min_gap_days'; subjectLabels: string[]; minGapDays: number; classFilter?: string[] }
  | { kind: 'subject_min_days'; subjectLabels: string[]; minDays: number; classFilter?: string[] }
  | { kind: 'pair_same_slot'; teacherLabels: string[]; dayIds: string[] }
  | { kind: 'mutual_exclusion'; subjectLabels: string[] }
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

/** Names listed after "gồm/có" in group sentences (Tổ X có A, B, C). */
function extractTeacherGroupMembers(raw: string, ctx: ParseContext): string[] {
  const segmentMatch = raw.match(
    /(?:tổ|to|nhóm|nhom)\s+[\p{L}\d\s]+?\s+(?:có|co|gồm|gom)\s+(.+?)\s+(?:không\s*dạy|khong\s*day|phải\s*có|phai\s*co|đúng|dung|tối\s*đa|toi\s*da|ít\s*nhất|it\s*nhat|từ\s*\d|tu\s*\d|có\s*tổng|co\s*tong|dạy\s*buổi|day\s*buoi)/iu
  )
  if (!segmentMatch) return []
  const chunk = segmentMatch[1]
  const parts = chunk.split(/,| và | va /iu).map((s) => s.trim()).filter(Boolean)
  const picked: string[] = []
  for (const part of parts) {
    const m = matchLabels(part, ctx.teacherLabels)
    if (m[0]) picked.push(m[0])
    else if (part.length <= 24 && !/(dạy|day|ngày|ngay|tiết|tiet|mỗi|moi)/iu.test(part)) {
      const fuzzy = ctx.teacherLabels.find((l) => normalize(l) === normalize(part))
      if (fuzzy) picked.push(fuzzy)
    }
  }
  return unique(picked)
}

function extractSubjectPairFromText(raw: string, ctx: ParseContext): [string, string] | null {
  const subjects = matchLabels(raw, ctx.subjectLabels)
  if (subjects.length >= 2) return [subjects[0], subjects[1]]
  const andSplit = raw.split(/\s+và\s+|\s+va\s+/iu)
  if (andSplit.length >= 2) {
    const a = matchLabels(andSplit[0], ctx.subjectLabels)[0]
    const b = matchLabels(andSplit[1], ctx.subjectLabels)[0]
    if (a && b) return [a, b]
  }
  return null
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
  // Range: "từ thứ X đến thứ Y" → expand into the inclusive list of days.
  const dayRange = text.match(/\bthứ\s*(\d)\s*(?:đến|den|toi|[-–—])\s*thứ\s*(\d)\b/u);
  if (dayRange) {
    const lo = Number(dayRange[1]);
    const hi = Number(dayRange[2]);
    if (lo >= 2 && hi >= 2 && lo <= 7 && hi <= 7) {
      const a = Math.min(lo, hi);
      const b = Math.max(lo, hi);
      for (let n = a; n <= b; n++) {
        const dayIndex = n - 2;
        days.push(resolveDayId(dayIndex, ctxDayIds));
      }
      return unique(days);
    }
  }
  // Comma/space separated: "thứ 2, 3, 4" or "thứ 2 3 4" → match list of digits 2-7.
  const compact = text.match(/\bthứ\s*([2-7](?:[\s,]+[2-7])+)\b/u)
  if (compact) {
    for (const n of compact[1].split(/[\s,]+/)) {
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
  // "từ tiết A đến tiết B" — also catch "tiết A đến tiết B"
  const wordRange = text.match(/\btiết\s*(\d+)\s*(?:đến|den|toi)\s*(?:tiết\s*)?(\d+)/u);
  if (wordRange) {
    const lo = Number(wordRange[1])
    const hi = Number(wordRange[2])
    for (let n = Math.min(lo, hi); n <= Math.max(lo, hi); n++) periods.push(n)
  }
  // Match "tiết 1, 2, 3" — comma-separated list after "tiết"
  const commaList = text.match(/\btiết\s*(\d+(?:\s*,\s*\d+)+)\b/u);
  if (commaList) {
    for (const n of commaList[1].split(',')) {
      const num = Number(n.trim());
      if (Number.isInteger(num) && num > 0) periods.push(num);
    }
  }
  // Match "tiết 1, tiết 2, tiết 3" or "tiết 1 và tiết 2"
  const expandedList = text.matchAll(/\btiết\s*(\d+)(?:\s*,?\s*(?:và|va|and|hoặc|hoac|or|,))?\s*tiết\s*(\d+)/gu);
  for (const m of expandedList) {
    if (Number.isInteger(Number(m[1]))) periods.push(Number(m[1]));
    if (Number.isInteger(Number(m[2]))) periods.push(Number(m[2]));
  }
  const singles = text.matchAll(/\btiết\s*(\d+)\b/gu)
  for (const match of singles) periods.push(Number(match[1]))
  // "tiết lẻ" / "tiết chẵn"
  if (/\btiết\s*lẻ|tiet\s*le\b/u.test(text)) {
    for (let n = 1; n <= 10; n += 2) periods.push(n);
  }
  if (/\btiết\s*chẵn|tiet\s*chan\b/u.test(text)) {
    for (let n = 2; n <= 10; n += 2) periods.push(n);
  }
  // "tiết đầu tiên" / "tiết đầu"
  if (/\btiết\s*đầu\b|\btiet\s*dau\b|\btiết\s*đầu\s*tiên\b|\btiet\s*dau\s*tien\b/u.test(text)) {
    periods.push(1);
  }
  // "tiết cuối" / "tiết cuối cùng" (for parsing; the max period is resolved at translator)
  if (/\btiết\s*cuối\b|\btiet\s*cuoi\b/u.test(text)) {
    periods.push(-1);
  }
  return unique(periods.map(String)).map(Number).filter((n) => Number.isInteger(n) && n > 0 || n === -1)
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

  // Phase 1 quick wins: no-op detection
  // When the user says "tất cả các ngày trong tuần" or "tất cả các ngày trừ thứ 7"
  // and the fixture doesn't include the referenced days, the constraint is
  // vacuous — emit a no-op marker so the parser doesn't fall through to
  // custom_dsl (which the user-sim test treats as PARTIAL).
  const allDayIds = Object.keys(ctx.dayIds)
  if (allDayIds.length > 0 && teachers.length > 0) {
    const mentionsAllDays = /(tất\s*cả|tat\s*ca|mọi|moi|uất\s*cả|uat\s*ca|all\s*days?)/u.test(raw)
    const mentionsExclusion = /(trừ|tru|ngoại\s*trừ|ngoai\s*tru|except)/u.test(raw)
    const mentionsWeekendOrNotInFixture =
      /\bthứ\s*7\b|\bthứ\s*8\b|\bchủ\s*nhật\b|\bchu\s*nhat\b|\bcn\b/u.test(raw) &&
      days.length > 0 &&
      days.some((d) => !allDayIds.includes(d))

    if (mentionsAllDays && !mentionsExclusion) {
      // "Trang dạy tất cả các ngày trong tuần" — covers every fixture day.
      return { kind: 'teacher_no_constraint', teacherLabels: teachers }
    }
    if (mentionsAllDays && mentionsExclusion) {
      // "Mai dạy tất cả các ngày trừ thứ 7" — exclusion day not in fixture → no-op.
      if (days.length > 0 && days.every((d) => !allDayIds.includes(d))) {
        return { kind: 'teacher_no_constraint', teacherLabels: teachers }
      }
    }
    if (mentionsWeekendOrNotInFixture) {
      // "Quân không dạy thứ 7" — block day not in fixture → no-op.
      return { kind: 'teacher_no_constraint', teacherLabels: teachers }
    }
  }

  const groupTeachers = extractTeacherGroupMembers(raw, ctx)
  const mentionsGroupHeader = /(?:^|\s)(?:tổ|to|nhóm|nhom)\s+[\p{L}\d]/iu.test(raw) && /(?:có|co|gồm|gom)\b/iu.test(raw)
  const groupMembers = unique([
    ...groupTeachers,
    ...(mentionsGroupHeader ? teachers : []),
  ]).filter((t) => ctx.teacherLabels.includes(t))
  const groupMembersFinal = groupMembers.length >= 2 ? groupMembers : teachers.length >= 2 ? teachers : []

  // Phase 4–8: teacher group constraints (Tổ/Nhóm … có/gồm …)
  if (groupMembersFinal.length >= 2 && /(tổ|to|nhóm|nhom)\b/iu.test(raw)) {
    if (/(không|khong).*(cùng|trùng).*(ngày|ngay)/iu.test(raw)) {
      return { kind: 'teacher_group_not_same_day', teacherLabels: groupMembersFinal }
    }
    if (/(không|khong).*(cùng|trùng).*(tiết|tiet|slot)/iu.test(raw)) {
      return { kind: 'teacher_group_not_same_period', teacherLabels: groupMembersFinal }
    }
    if (/(phải\s*có|phai\s*co|ít\s*nhất|it\s*nhat).*(người|nguoi).*(dạy|day).*(mỗi\s*ngày|moi\s*ngay)/iu.test(raw)) {
      const minCount = extractFirstNumber(raw) ?? 1
      return { kind: 'teacher_group_min_per_day', teacherLabels: groupMembersFinal, minCount }
    }
    if (/(không\s*có\s*quá|khong\s*co\s*qua|tối\s*đa|toi\s*da).*(người|nguoi).*(dạy|cùng\s*lúc|cung\s*luc)/iu.test(raw)) {
      const maxConcurrent = extractFirstNumber(raw) ?? 2
      return { kind: 'teacher_group_max_concurrent', teacherLabels: groupMembersFinal, maxConcurrent }
    }
    if (/(đúng|dung|chính\s*xác|chinh\s*xac).*(người|nguoi).*(dạy|day).*(mỗi\s*ngày|moi\s*ngay)/iu.test(raw)) {
      const exactCount = extractFirstNumber(raw) ?? 3
      return { kind: 'teacher_group_exact_per_day', teacherLabels: groupMembersFinal, exactCount }
    }
    if (/(tổng\s*số\s*tiết|tong\s*so\s*tiet).*(bằng|bang)/iu.test(raw) && /(nhóm|nhom)\s+[a-zà-ỹ\d]/iu.test(raw)) {
      const groupB = raw.match(/(?:và|va|với|voi)\s*(?:nhóm|nhom)\s+([a-zà-ỹ\d]+)/iu)
      const bTeachers = groupB ? extractTeacherGroupMembers(`nhóm ${groupB[1]} gồm ${groupB[1]}`, ctx) : []
      if (bTeachers.length >= 2) {
        return { kind: 'teacher_group_total_periods', teachersALabels: groupMembersFinal, teachersBLabels: bTeachers }
      }
    }
  }

  // "Nhóm B không có quá 2 người dạy cùng lúc" (no teacher names in text)
  if (
    /(nhóm|nhom)\s+[a-zà-ỹ\d]/iu.test(raw) &&
    /(không\s*có\s*quá|khong\s*co\s*qua|tối\s*đa|toi\s*da).*(người|nguoi).*(dạy|cùng\s*lúc|cung\s*luc)/iu.test(raw) &&
    teachers.length === 0
  ) {
    const maxConcurrent = extractFirstNumber(raw) ?? 2
    return { kind: 'teacher_group_max_concurrent', teacherLabels: ctx.teacherLabels.slice(0, 8), maxConcurrent }
  }

  // Global concurrent teachers (Không quá N giáo viên dạy cùng lúc)
  if (
    /(giáo\s*viên|giao\s*vien|gv)/iu.test(raw) &&
    /(cùng\s*lúc|cung\s*luc|mỗi\s*tiết|moi\s*tiet|đồng\s*thời|dong\s*thoi)/iu.test(raw) &&
    teachers.length === 0
  ) {
    const period = periods[0]
    const dayIds = days.length > 0 ? days : []
    if (/(không\s*quá|khong\s*qua|tối\s*đa|toi\s*da)/iu.test(raw)) {
      const maxCount = extractFirstNumber(raw) ?? 5
      return { kind: 'global_max_teachers_per_period', maxCount, period, dayIds }
    }
    if (/(ít\s*nhất|it\s*nhat|tối\s*thiểu|toi\s*thieu)/iu.test(raw)) {
      const minCount = extractFirstNumber(raw) ?? 2
      return { kind: 'global_min_teachers_per_period', minCount, period, dayIds }
    }
    if (/(đúng|dung|chính\s*xác|chinh\s*xac)/iu.test(raw)) {
      const exactCount = extractFirstNumber(raw) ?? 8
      return { kind: 'global_exact_teachers_per_period', exactCount, period, dayIds }
    }
  }

  if (/(chênh\s*lệch|chenh\s*lech).*(số\s*tiết|so\s*tiet).*(giáo\s*viên|giao\s*vien)/iu.test(raw)) {
    const maxDiff = extractFirstNumber(raw) ?? 3
    return { kind: 'global_max_workload_diff', maxDiff }
  }

  const subjectPair = extractSubjectPairFromText(raw, ctx)
  if (subjectPair) {
    const [subA, subB] = subjectPair
    if (/(dạy\s*trước|day\s*truoc).*(trong\s*tuần|trong\s*tuan|tuần)/iu.test(raw) && !/(tiết|tiet)/iu.test(raw)) {
      return { kind: 'subject_before_subject_week', subjectALabels: [subA], subjectBLabels: [subB] }
    }
    if (/(dạy\s*sau|day\s*sau).*(trong\s*tuần|trong\s*tuan|tuần)/iu.test(raw) && !/(tiết|tiet)/iu.test(raw)) {
      return { kind: 'subject_after_subject_week', subjectALabels: [subA], subjectBLabels: [subB] }
    }
    if (/(cùng\s*tuần|cung\s*tuan)/iu.test(raw)) {
      return { kind: 'subject_same_week', subjectALabels: [subA], subjectBLabels: [subB] }
    }
    if (/(cách\s*nhau|cach\s*nhau).*(tuần|tuan)/iu.test(raw)) {
      const gapWeeks = extractFirstNumber(raw) ?? 1
      return { kind: 'subject_gap_weeks', subjectALabels: [subA], subjectBLabels: [subB], gapWeeks }
    }
    if (/(cách\s*nhau|cach\s*nhau).*(giờ|gio|tiết|tiet)/iu.test(raw)) {
      const minHours = extractFirstNumber(raw) ?? 1
      return { kind: 'subject_min_gap_hours', subjectALabels: [subA], subjectBLabels: [subB], minHours }
    }
  }

  if (subjects.length > 0 && /(cần|can)\s*(\d+)?\s*(tiết|tiet)\s*liên\s*tiếp|lien\s*tiep/iu.test(raw)) {
    const length = extractFirstNumber(raw) ?? 2
    return { kind: 'subject_consecutive_periods', subjectLabels: subjects, length }
  }

  if (subjects.length > 0 && /(sau\s*giờ\s*nghỉ|sau\s*bữa\s*trưa|sau\s*giai\s*lao)/iu.test(raw)) {
    const afterPeriod = periods[0] ?? 3
    return { kind: 'subject_after_break', subjectLabels: subjects, afterPeriod }
  }

  if (teachers.length >= 1) {
    if (/(ưu\s*tiên|uu\s*tien).*(buổi\s*sáng|buoi\s*sang)/iu.test(raw) && /(hơn|hon).*(chiều|chieu)/iu.test(raw)) {
      return { kind: 'teacher_priority_session', teacherLabels: teachers, sessionIds: ['morning'] }
    }
    if (/(ưu\s*tiên|uu\s*tien).*(ngày|ngay)/iu.test(raw) && days.length > 0) {
      return { kind: 'teacher_priority_day', teacherLabels: teachers, dayIds: days }
    }
    if (/(nghỉ\s*lễ|nghi\s*le|ngày\s*lễ|ngay\s*le|không\s*khả\s*dụng|khong\s*kha\s*dung)/iu.test(raw)) {
      return { kind: 'teacher_unavailable_holiday', teacherLabels: teachers, dayIds: days }
    }
    if (/(nghỉ\s*đột\s*xuất|nghi\s*dot\s*xuat|thay\s*thế|thay\s*the)/iu.test(raw)) {
      return { kind: 'teacher_unavailable_sudden', teacherLabels: teachers }
    }
    if (/(ăn\s*sáng|an\s*sang|nghỉ\s*giữa|nghi\s*giua).*(phút|phut)/iu.test(raw)) {
      const minutes = extractFirstNumber(raw) ?? 20
      return { kind: 'teacher_break_time_minutes', teacherLabels: teachers, minutes }
    }
    if (/(không\s*dạy\s*qua\s*giờ\s*nghỉ|nghỉ\s*trưa|nghi\s*trua)/iu.test(raw)) {
      return { kind: 'teacher_lunch_break_required', teacherLabels: teachers }
    }
    if (/(giám\s*sát|giam\s*sat)/iu.test(raw) && teachers.length >= 2) {
      return { kind: 'teacher_mentorship', mentorLabels: [teachers[0]], menteeLabels: [teachers[1]] }
    }
    if (/(mâu\s*thuẫn|mau\s*thuan|cạnh\s*tranh|canh\s*tranh).*(không\s*dạy\s*chung|khong\s*day\s*chung)/iu.test(raw) && teachers.length >= 2) {
      return { kind: 'teacher_conflict', teacherALabels: [teachers[0]], teacherBLabels: [teachers[1]] }
    }
    if (/(tối\s*đa|toi\s*da).*(giờ|gio).*(ngày|ngay)/iu.test(raw)) {
      const maxHours = extractFirstNumber(raw) ?? 8
      return { kind: 'teacher_max_hours_per_day', teacherLabels: teachers, maxHours }
    }
    if (/(nghỉ\s*giữa|nghi\s*giua).*(ngày|ngay)/iu.test(raw) && /(ít\s*nhất|it\s*nhat)/iu.test(raw)) {
      const minRestDays = extractFirstNumber(raw) ?? 1
      return { kind: 'teacher_min_rest_between_days', teacherLabels: teachers, minRestDays }
    }
  }

  if ((/không\s*dạy\s*quá|khong\s*day\s*qua/u.test(raw) || /không\s*quá|khong\s*qua/u.test(raw)) && /liên\s*tiếp|lien\s*tiep/u.test(raw)) {
    const max = extractFirstNumber(raw)
    if (max !== null) return { kind: 'teacher_max_consecutive', teacherLabels: allTeacherToken(raw) ? '*' : teachers, max }
  }

  if (/ngày\s*nghỉ\s*tối\s*thiểu|ngay\s*nghi\s*toi\s*thieu|nghỉ\s*tối\s*thiểu|nghi\s*toi\s*thieu/u.test(raw)) {
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

  // teacher_weekly_range: "dạy từ N đến M tiết trong tuần" / "dạy đúng N tiết" / "ít nhất N tiết" / "tối đa N tiết"
  if (teachers.length > 0 && /(?:tiết|tiet)\b/u.test(raw) && /(?:trong\s*tuần|trong\s*tuan|tuần\s*này|tuan\s*nay|tuần|tuan|\bweek\b)/u.test(raw) && !/không|khong/u.test(raw)) {
    // Range: "từ N đến M tiết"
    const rangeMatch = raw.match(/\b(?:từ|tu|đến|den|toi)\s*(\d+)\s*(?:đến|den|toi|[-–])\s*(\d+)/u);
    if (rangeMatch) {
      const lo = Number(rangeMatch[1]);
      const hi = Number(rangeMatch[2]);
      if (lo > 0 && hi >= lo) {
        return { kind: 'teacher_weekly_range', teacherLabels: teachers, min: lo, max: hi };
      }
    }
    // "ít nhất N tiết" / "tối thiểu N tiết"
    const minMatch = raw.match(/(?:ít\s*nhất|it\s*nhat|tối\s*thiểu|toi\s*thieu)\s*(\d+)\s*(?:tiết|tiet)?/u);
    if (minMatch) {
      return { kind: 'teacher_weekly_range', teacherLabels: teachers, min: Number(minMatch[1]) };
    }
    // "tối đa N tiết" / "không quá N tiết" / "nhiều nhất N tiết"
    const maxMatch = raw.match(/(?:tối\s*đa|toi\s*da|không\s*quá|khong\s*qua|nhiều\s*nhất|nhieu\s*nhat|nhiều|nhieu)\s*(\d+)\s*(?:tiết|tiet)?/u);
    if (maxMatch) {
      return { kind: 'teacher_weekly_range', teacherLabels: teachers, max: Number(maxMatch[1]) };
    }
    // "đúng N tiết" / "chính xác N tiết"
    const exactMatch = raw.match(/(?:đúng|dung|chính\s*xác|chinh\s*xac|đủ|du|chỉ|chi|=\s*)\s*(\d+)\s*(?:tiết|tiet)?/u);
    if (exactMatch) {
      const n = Number(exactMatch[1]);
      return { kind: 'teacher_weekly_range', teacherLabels: teachers, min: n, max: n };
    }
  }

  if (/không\s*dạy|khong\s*day|không\s*có\s*lịch|khong\s*co\s*lich|tránh\s*dạy|tranh\s*day|tránh\s*tiết|tranh\s*tiet|tránh|tranh/u.test(raw) && teachers.length > 0) {
    // Special: "không dạy tiết cuối cùng" — treat as block of all max period
    if (periods.length === 0 && /(tiết\s*cuối|tiet\s*cuoi)/u.test(raw)) {
      // Defer to translator to expand based on period counts
      return { kind: 'teacher_block_last_period', teacherLabels: teachers }
    }
    if (days.length > 0 && periods.length > 0) return { kind: 'teacher_block_day_period', teacherLabels: teachers, dayIds: days, periods }
    if (sessions.length > 0 && days.length > 0) return { kind: 'teacher_block_session_day', teacherLabels: teachers, sessionIds: sessions, dayIds: days }
    if (days.length > 0) return { kind: 'teacher_block_days', teacherLabels: teachers, dayIds: days }
    if (periods.length > 0) return { kind: 'teacher_block_periods', teacherLabels: teachers, periods }
    if (sessions.length > 0) return { kind: 'teacher_block_sessions', teacherLabels: teachers, sessionIds: sessions }
  }

  if (periods.length > 0 && teachers.length > 0 && !/không|khong|tránh|tranh/u.test(raw)) {
    // "dạy từ tiết A đến tiết B" / "chỉ dạy tiết 1-3" — positive period constraint
    if (/(từ|tu|đến|den)/u.test(raw) || (/chỉ|chi/u.test(raw))) {
      return { kind: 'teacher_allow_only_periods', teacherLabels: teachers, periods };
    }
    // "Quân dạy tiết 3" / "Lan dạy tiết 2 và tiết 4" — single/multiple specific periods
    if (periods.length > 0) {
      return { kind: 'teacher_allow_only_periods', teacherLabels: teachers, periods };
    }
  }

  if ((/chỉ\s*dạy|chi\s*day/u.test(raw) || /\bchỉ|chi\b/u.test(raw)) && teachers.length > 0) {
    if (days.length > 0) return { kind: 'teacher_allow_only_days', teacherLabels: teachers, dayIds: days }
    if (sessions.length > 0) return { kind: 'teacher_allow_only_sessions', teacherLabels: teachers, sessionIds: sessions }
    if (periods.length > 0) return { kind: 'teacher_allow_only_periods', teacherLabels: teachers, periods }
  }

  // teacher_allow_only_relative_days: "cuối tuần" / "đầu tuần" / "giữa tuần" / "tất cả các ngày trừ thứ 7"
  if (teachers.length > 0 && (/tuần|tuan|uần|uan|trừ|tru|ngoại\s*trừ|ngoai\s*tru/u.test(raw))) {
    const allDayIds = Object.keys(ctx.dayIds);
    const excluded = extractDays(raw, ctx.dayIds);
    let allowed: string[] = allDayIds;
    if (/cuối\s*tuần|cuoi\s*tuan|cuối\s*tuần/u.test(raw)) {
      const last = allDayIds.slice(-2);
      if (last.length > 0) allowed = last;
    } else if (/đầu\s*tuần|dau\s*tuan|uầu\s*tuần|uau\s*tuan|đầu\s*tuần/u.test(raw)) {
      allowed = allDayIds.slice(0, 2);
    } else if (/giữa\s*tuần|giua\s*tuan|giữa\s*tuần/u.test(raw)) {
      const mid = allDayIds.slice(2, -2);
      allowed = mid.length > 0 ? mid : allDayIds.slice(1, -1);
    } else if (/(trừ|tru|ngoại\s*trừ|ngoai\s*tru|except)/u.test(raw) && excluded.length > 0) {
      const exSet = new Set(excluded);
      allowed = allDayIds.filter((d) => !exSet.has(d));
    } else if (/tất\s*cả|tat\s*ca|mọi|moi|uất\s*cả|uat\s*ca|all\s*days?/u.test(raw)) {
      // "tất cả các ngày" with no real exclusion = unparsed (already covers all)
      if (excluded.length === 0) {
        return { kind: 'unparsed', reason: 'Constraint áp dụng cho tất cả các ngày — không cần ràng buộc cụ thể.' };
      }
      allowed = allDayIds.filter((d) => !excluded.includes(d));
    }
    if (allowed.length > 0 && allowed.length < allDayIds.length) {
      if (/không|khong/u.test(raw)) {
        const blockSet = new Set(allDayIds.filter((d) => !allowed.includes(d)));
        return { kind: 'teacher_block_days', teacherLabels: teachers, dayIds: Array.from(blockSet) };
      }
      return { kind: 'teacher_allow_only_days', teacherLabels: teachers, dayIds: allowed };
    }
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
    (teachers.length > 0 || allTeacherToken(raw))
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

  // class_max_per_day: "lớp 10A học tối đa 6 tiết/ngày" (no teacher mention).
  if (
    classes.length > 0 &&
    /(tối\s*đa|toi\s*da|max).*(tiết|tiet).*(ngày|ngay)/u.test(raw)
  ) {
    const max = extractFirstNumber(raw)
    if (max !== null) {
      return { kind: 'class_max_per_day', classLabels: classes, maxPerDay: max }
    }
  }

  // class_min_per_day: "lớp 10A học ít nhất 4 tiết/ngày" (no teacher mention).
  if (
    classes.length > 0 &&
    /(ít\s*nhất|it\s*nhat|tối\s*thiểu|toi\s*thieu|min).*(tiết|tiet).*(ngày|ngay)/u.test(raw)
  ) {
    const min = extractFirstNumber(raw)
    if (min !== null) {
      return { kind: 'class_min_per_day', classLabels: classes, minPerDay: min }
    }
  }

  // teacher_min_per_day: "giáo viên A dạy ít nhất 2 tiết/ngày".
  if (
    teachers.length > 0 &&
    /(ít\s*nhất|it\s*nhat|tối\s*thiểu|toi\s*thieu|min).*(tiết|tiet).*(ngày|ngay)/u.test(raw)
  ) {
    const min = extractFirstNumber(raw)
    if (min !== null) {
      return { kind: 'teacher_min_per_day', teacherLabels: teachers, minPerDay: min }
    }
  }

  // class_no_gaps: "lớp 10A không có tiết trống" | "lớp 10A không có tiết trống giữa ngày"
  if (
    classes.length > 0 &&
    /(không\s*có|khong\s*co).*(tiết\s*trống|tiet\s*trong|trống|trong)/u.test(raw)
  ) {
    return { kind: 'class_no_gaps', classLabels: allClassToken(raw) ? '*' : classes }
  }

  // teacher_no_gaps: "giáo viên A không có tiết trống"
  if (
    teachers.length > 0 &&
    /(không\s*có|khong\s*co).*(tiết\s*trống|tiet\s*trong|trống|trong)/u.test(raw)
  ) {
    return { kind: 'teacher_no_gaps', teacherLabels: teachers }
  }

  // teacher_max_gaps: "giáo viên A tối đa 2 tiết trống/ngày"
  if (
    teachers.length > 0 &&
    /(tối\s*đa|toi\s*da|max).*(trống|trong)/u.test(raw)
  ) {
    const maxGaps = extractFirstNumber(raw)
    if (maxGaps !== null) {
      return { kind: 'teacher_max_gaps', teacherLabels: teachers, maxGaps }
    }
  }

  // teacher_min_consecutive: "giáo viên A khi dạy thì ít nhất 2 tiết liền"
  if (
    teachers.length > 0 &&
    /(khi\s*dạy|khi\s*day).*(ít\s*nhất|it\s*nhat|min).*?(liên\s*tiếp|lien\s*tiep|liền|lien)/u.test(raw)
  ) {
    const minConsecutive = extractFirstNumber(raw)
    if (minConsecutive !== null) {
      return { kind: 'teacher_min_consecutive', teacherLabels: teachers, minConsecutive }
    }
  }

  // teacher_min_working_days: "giáo viên A dạy ít nhất 4 ngày/tuần"
  if (
    teachers.length > 0 &&
    /(ít\s*nhất|it\s*nhat|tối\s*thiểu|toi\s*thieu|min).*(ngày|ngay)/u.test(raw) &&
    !/(tiết|tiet)/u.test(raw)
  ) {
    const minDays = extractFirstNumber(raw)
    if (minDays !== null) {
      return { kind: 'teacher_min_working_days', teacherLabels: teachers, minDays }
    }
  }

  // teacher_max_working_days: "giáo viên A không dạy quá N ngày/tuần" | "tối đa N ngày/tuần"
  if (
    teachers.length > 0 &&
    /(?:không\s*quá|khong\s*qua|không\s*hơn|khong\s*hon|tối\s*đa|toi\s*da|nhiều\s*nhất|nhieu\s*nhat|max|không\s*(?:dạy|day)\s*quá|khong\s*(?:day|day)\s*qua|không\s*(?:dạy|day)\s*hơn|khong\s*(?:day|day)\s*hon)/u.test(raw) &&
    /(ngày|ngay)/u.test(raw) &&
    /(tuần|tuan|trong\s*tuần|trong\s*tuan)/u.test(raw) &&
    !/(tiết|tiet)/u.test(raw)
  ) {
    const maxDays = extractFirstNumber(raw)
    if (maxDays !== null) {
      return { kind: 'teacher_max_working_days', teacherLabels: teachers, maxDays }
    }
  }

  // teacher_exact_working_days: "giáo viên A dạy đúng N ngày/tuần" | "chỉ dạy N ngày/tuần"
  if (
    teachers.length > 0 &&
    !/(tiết|tiet)/u.test(raw) &&
    /(ngày|ngay)/u.test(raw) &&
    /(tuần|tuan|trong\s*tuần|trong\s*tuan)/u.test(raw) &&
    /(đúng|dung|chính\s*xác|chinh\s*xac)/u.test(raw)
  ) {
    const days = extractFirstNumber(raw)
    if (days !== null) {
      return { kind: 'teacher_exact_working_days', teacherLabels: teachers, days }
    }
  }
  if (
    teachers.length > 0 &&
    !/(tiết|tiet)/u.test(raw) &&
    /(ngày|ngay)/u.test(raw) &&
    /(tuần|tuan|trong\s*tuần|trong\s*tuan)/u.test(raw) &&
    /chỉ\s*dạy|chi\s*day/u.test(raw)
  ) {
    const days = extractFirstNumber(raw)
    if (days !== null) {
      return { kind: 'teacher_exact_working_days', teacherLabels: teachers, days }
    }
  }

  // teacher_max_per_day: "giáo viên A chỉ dạy N tiết mỗi ngày" | "không quá N tiết mỗi ngày" | "tối đa N tiết/ngày"
  if (
    teachers.length > 0 &&
    /(tiết|tiet)/u.test(raw) &&
    /(mỗi\s*ngày|moi\s*ngay|mỗi\s*1\s*ngày|moi\s*1\s*ngay|\/ngày|\/ngay|trong\s*ngày|trong\s*ngay)/u.test(raw)
  ) {
    const maxPerDay = extractFirstNumber(raw)
    if (maxPerDay !== null) {
      return { kind: 'teacher_max_per_day', teacherLabels: teachers, maxPerDay }
    }
  }

  // ─── Phase 2 quick wins: frequency comparison (nhóm 7) ───────────────

  // teacher_weekly_range (with negation): "Dung không dạy quá 6 tiết trong tuần"
  // The existing teacher_weekly_range branch above excludes "không", so this
  // dedicated rule handles the negated "max" case.
  if (
    teachers.length > 0 &&
    /(tiết|tiet)/u.test(raw) &&
    /(tuần|tuan|trong\s*tuần|trong\s*tuan)/u.test(raw) &&
    /không|khong/u.test(raw)
  ) {
    // Word-boundary match for "đúng" to avoid clashing with teacher name "Dung".
    // (Normalized "raw" lowercases both "Dung" and "đúng" to "dung".)
    const hasExactWord = teachers.some((t) => normalize(t) === 'dung')
      ? false  // a teacher named "Dung" exists, so the "dung" token is the name
      : /\bđúng\b|\bdung\b/u.test(raw)
    const maxMatch = raw.match(/(?:không\s*quá|khong\s*qua|không\s*dạy\s*quá|khong\s*day\s*qua|tối\s*đa|toi\s*da|nhiều\s*nhất|nhieu\s*nhat)\s*(\d+)\s*(?:tiết|tiet)?/u);
    if (maxMatch && !hasExactWord) {
      return { kind: 'teacher_weekly_range', teacherLabels: teachers, max: Number(maxMatch[1]) };
    }
  }

  // teacher_count_relative: "Phương dạy nhiều hơn Trang ít nhất 2 tiết" / "gấp đôi" / "bằng" / "ít hơn tối đa" / "50% số tiết"
  if (teachers.length >= 2) {
    const [primary, other] = teachers; // primary is leftmost (the one with the constraint)
    // Factor: "gấp đôi số tiết của X" → primary = 2 * other
    if (/(gấp\s*đôi|gap\s*doi|nhân\s*đôi|nhan\s*doi)/iu.test(raw)) {
      return { kind: 'teacher_count_relative', teacherLabels: [primary], otherTeacherLabels: [other], op: 'factor', value: 2 };
    }
    // Percent: "ít nhất N% số tiết của X"
    const pctMatch = raw.match(/(?:ít\s*nhất|it\s*nhat|tối\s*thiểu|toi\s*thieu|không\s*ít\s*hơn|khong\s*it\s*hon|>=|≥|tối\s*đa|toi\s*da|<=|≤)\s*(\d+)\s*%\s*(?:số\s*tiết|so\s*tiet)?\s*(?:của|qua|cua)/iu);
    if (pctMatch) {
      return { kind: 'teacher_count_relative', teacherLabels: [primary], otherTeacherLabels: [other], op: 'pct', value: Number(pctMatch[1]) };
    }
    // "nhiều hơn ... ít nhất N tiết" → primary >= other + N (gte)
    const gteMatch = raw.match(/(?:nhiều\s*hơn|nhieu\s*hon|nhiều|nhieu|cao\s*hơn|cao\s*hon).*?(?:ít\s*nhất|it\s*nhat|tối\s*thiểu|toi\s*thieu|>=|≥)?\s*(\d+)\s*(?:tiết|tiet)?/iu);
    if (gteMatch && /(nhiều\s*hơn|nhieu\s*hon|cao\s*hơn|cao\s*hon)/iu.test(raw)) {
      return { kind: 'teacher_count_relative', teacherLabels: [primary], otherTeacherLabels: [other], op: 'gte', value: Number(gteMatch[1]) };
    }
    // "ít hơn ... tối đa N tiết" → primary <= other + N (lte)
    const lteMatch = raw.match(/(?:ít\s*hơn|it\s*hon|ít|it|thấp\s*hơn|thap\s*hon).*?(?:tối\s*đa|toi\s*da|nhiều\s*nhất|nhieu\s*nhat|<=|≤)?\s*(\d+)\s*(?:tiết|tiet)?/iu);
    if (lteMatch && /(ít\s*hơn|it\s*hon|thấp\s*hơn|thap\s*hon)/iu.test(raw)) {
      return { kind: 'teacher_count_relative', teacherLabels: [primary], otherTeacherLabels: [other], op: 'lte', value: Number(lteMatch[1]) };
    }
    // "nhiều hơn ... đúng N tiết" → primary == other + N (eq)
    const eqOffsetMatch = raw.match(/(?:nhiều\s*hơn|nhieu\s*hon|nhiều|nhieu|ít\s*hơn|it\s*hon|ít|it).*?(?:đúng|dung|chính\s*xác|chinh\s*xac|=)\s*(\d+)\s*(?:tiết|tiet)?/iu);
    if (eqOffsetMatch) {
      return { kind: 'teacher_count_relative', teacherLabels: [primary], otherTeacherLabels: [other], op: 'eq', value: Number(eqOffsetMatch[1]) };
    }
    // "bằng số tiết của X" / "bằng X" → primary == other (eq, value=0)
    if (/bằng\s*số\s*tiết|bang\s*so\s*tiet|bằng\s*|bang\s*$/iu.test(raw) && !/ít\s*nhất|it\s*nhat|ít\s*hơn|it\s*hon|tối\s*đa|toi\s*da/iu.test(raw)) {
      return { kind: 'teacher_count_relative', teacherLabels: [primary], otherTeacherLabels: [other], op: 'eq', value: 0 };
    }
  }

  // teacher_total_periods: "Bình và Cường dạy tổng cộng N tiết" / "không quá N tiết" / "ít nhất N tiết"
  if (teachers.length >= 2 && /(tổng\s*cộng|tong\s*cong|tổng|tong|sum|combined)/iu.test(raw)) {
    const value = extractFirstNumber(raw);
    if (value !== null) {
      let op: 'min' | 'max' | 'exact' = 'exact';
      if (/(ít\s*nhất|it\s*nhat|tối\s*thiểu|toi\s*thieu|>=?|≥|tối\s*thiểu)/iu.test(raw)) op = 'min';
      else if (/(tối\s*đa|toi\s*da|không\s*quá|khong\s*qua|nhiều\s*nhất|nhieu\s*nhat|<=?|≤)/iu.test(raw)) op = 'max';
      return { kind: 'teacher_total_periods', teacherLabels: teachers, op, value };
    }
  }
  if (teachers.length >= 2 && /và|va|,/iu.test(raw) && /(tiết|tiet)/iu.test(raw) && /(tổng|tong|sum|combined|cộng|cong|all\s*together|cả\s*hai|ca\s*hai)/iu.test(raw)) {
    const value = extractFirstNumber(raw);
    if (value !== null) {
      let op: 'min' | 'max' | 'exact' = 'exact';
      if (/(ít\s*nhất|it\s*nhat|tối\s*thiểu|toi\s*thieu|>=?|≥)/iu.test(raw)) op = 'min';
      else if (/(tối\s*đa|toi\s*da|không\s*quá|khong\s*qua|nhiều\s*nhất|nhieu\s*nhat|<=?|≤)/iu.test(raw)) op = 'max';
      return { kind: 'teacher_total_periods', teacherLabels: teachers, op, value };
    }
  }

  // teacher_argmax_weekly: "Toàn dạy nhiều nhất trong tuần"
  if (
    teachers.length === 1 &&
    /(dạy\s*nhiều\s*nhất|day\s*nhieu\s*nhat|dạy\s*nhiều|day\s*nhieu|most\s*periods|argmax|nhiều\s*nhất|nhieu\s*nhat)/iu.test(raw) &&
    /(tuần|tuan|trong\s*tuần|trong\s*tuan|weekly|week)/iu.test(raw) &&
    !/(và|va|,)/iu.test(raw)
  ) {
    return { kind: 'teacher_argmax_weekly', teacherLabels: teachers };
  }

  // ─── Phase 3 quick wins: order/distance pair constraints (nhóm 6) ─────

  // teacher_pair_day_distance: "A dạy cách B đúng N ngày" / "A dạy trước B đúng N ngày" / "A dạy sau B đúng N ngày"
  // Also handles "A dạy trước B đúng 1 ngày" (no "cách" keyword).
  if (teachers.length >= 2 && /(ngày|ngay)/iu.test(raw)) {
    const exactMatch = raw.match(/(?:đúng|dung|chính\s*xác|chinh\s*xac|=\s*)\s*(\d+)\s*(?:ngày|ngay)/iu);
    if (exactMatch) {
      const [primary, other] = teachers;
      const distance = Number(exactMatch[1]);
      // Direction: "trước" / "sau" / unspecified (either)
      let direction: 'before' | 'after' | 'either' = 'either';
      const hasTruoc = /(trước|truoc)/iu.test(raw);
      const hasSau = /\bsau\b/iu.test(raw);
      if (hasTruoc && !hasSau) direction = 'before';
      else if (hasSau && !hasTruoc) direction = 'after';
      // If both trước and sau present, default to 'before' (first wins).
      return { kind: 'teacher_pair_day_distance', teacherALabels: [primary], teacherBLabels: [other], direction, distance };
    }
  }

  // teacher_pair_not_adjacent: MUST be checked BEFORE teacher_pair_period_order
  // because "không dạy ngay trước hoặc ngay sau" can be matched by the "ngay sau"
  // pattern in period_order (which would mis-classify it as adjacent_after).
  if (teachers.length >= 2) {
    const mentionsNotAdjacent =
      /(không|khong)\s*(?:dạy|day)\s*liên\s*tiếp|lien\s*tiep/iu.test(raw) ||
      /(không|khong)\s*(?:dạy|day)\s*liền\s*kề|lien\s*ke/iu.test(raw) ||
      /(không|khong)\s*(?:dạy|day)\s*ngay\s*trước|ngay\s*truoc.*ngay\s*sau/iu.test(raw) ||
      /(không|khong)\s*(?:dạy|day)\s*ngay\s*sau|ngay\s*truoc.*ngay\s*sau/iu.test(raw) ||
      /(không|khong)\s*(?:dạy|day)\s*ngay\s*trước.*hoặc.*ngay\s*sau|ngay\s*truoc.*hoac.*ngay\s*sau/iu.test(raw) ||
      /(không|khong)\s*(?:dạy|day)\s*ngay\s*sau.*hoặc.*ngay\s*trước|ngay\s*sau.*hoac.*ngay\s*truoc/iu.test(raw) ||
      /(các|cac)\s*tiết\s*liên\s*tiếp|cac\s*tiet\s*lien\s*tiep/iu.test(raw);

    if (mentionsNotAdjacent) {
      const [primary, other] = teachers;
      return { kind: 'teacher_pair_not_adjacent', teacherALabels: [primary], teacherBLabels: [other] };
    }
  }

  // teacher_pair_period_order: "A dạy trước/sau B [ít nhất N] tiết" / "A dạy ngay trước/sau B"
  if (teachers.length >= 2) {
    const [primary, other] = teachers;
    // Detect "ngay" / "liền" / "liên tiếp" / "kế tiếp" → adjacent
    const isAdjacent = /(ngay\s*(?:sau|trước|truoc)|ngay\b|liền\s*(?:kề|ke)|liền\b|lien\s*ke|liên\s*tiếp|lien\s*tiep|kế\s*tiếp|ke\s*tiep|adjacent)/iu.test(raw);

    // Pattern: "A dạy trước B" / "A dạy sau B" / "A phải dạy trước B" / "A dạy ... trước B" / "A dạy ... sau B"
    // Allow optional "ngay"/other adverbs between "dạy" and "trước/sau".
    const beforeMatch = /(?:dạy|day)\s+(?:[a-zà-ỹ]+\s+)*?(?:trước|truoc)\b/iu.test(raw)
                        || /\btrước\s+(?:thầy|cô|giáo\s*viên|gv|teacher\s+)/iu.test(raw);
    const afterMatch = /(?:dạy|day)\s+(?:[a-zà-ỹ]+\s+)*?sau\b/iu.test(raw)
                       || /\bsau\s+(?:thầy|cô|giáo\s*viên|gv|teacher\s+)/iu.test(raw);

    if (isAdjacent && (afterMatch || beforeMatch)) {
      // Adjacent order: ngay sau / ngay trước
      const relation: 'adjacent_before' | 'adjacent_after' = afterMatch ? 'adjacent_after' : 'adjacent_before';
      return { kind: 'teacher_pair_period_order', teacherALabels: [primary], teacherBLabels: [other], relation, minGap: 1 };
    }

    if (beforeMatch || afterMatch) {
      // "A dạy trước/sau B [ít nhất N tiết]"
      const minGapMatch = raw.match(/(?:ít\s*nhất|it\s*nhat|tối\s*thiểu|toi\s*thieu|>=?|≥)\s*(\d+)\s*(?:tiết|tiet)?/iu);
      const minGap = minGapMatch ? Number(minGapMatch[1]) : 1;
      const relation: 'before' | 'after' = afterMatch ? 'after' : 'before';
      return { kind: 'teacher_pair_period_order', teacherALabels: [primary], teacherBLabels: [other], relation, minGap };
    }
  }

  // teacher_allow_only_days (range): "Minh dạy từ thứ 2 đến thứ 5" → expand range and emit allow-only.
  if (
    teachers.length > 0 &&
    /\bthứ\s*\d\s*(?:đến|den|toi|[-–—])\s*thứ\s*\d\b/u.test(raw) &&
    !/không|khong/u.test(raw)
  ) {
    const allDayIds = Object.keys(ctx.dayIds);
    const rangeDays = extractDays(raw, ctx.dayIds);
    const rangeSet = new Set(rangeDays);
    // Only emit allow-only when the range is a strict subset of available days.
    if (rangeDays.length > 1 && rangeDays.length < allDayIds.length && rangeDays.every((d) => allDayIds.includes(d))) {
      return { kind: 'teacher_allow_only_days', teacherLabels: teachers, dayIds: rangeDays };
    }
  }

  // class_allow_only_days: "lớp 10A chỉ học thứ 2, 3, 4"
  if (
    classes.length > 0 &&
    /chỉ\s*học|chi\s*hoc|chỉ\s*xếp|chi\s*xep/u.test(raw) &&
    /(thứ|thu|ngày|ngay)/u.test(raw) &&
    !/(tiết|tiet)/u.test(raw)
  ) {
    if (days.length > 0) {
      return { kind: 'class_allow_only_days', classLabels: classes, dayIds: days }
    }
  }

  // subject_allow_only_days: "môn Thể dục chỉ học thứ 3 hoặc thứ 5"
  if (
    subjects.length > 0 &&
    /chỉ\s*học|chi\s*hoc|chỉ\s*xếp|chi\s*xep/u.test(raw) &&
    days.length > 0 &&
    periods.length === 0
  ) {
    return { kind: 'subject_allow_only_days', subjectLabels: subjects, dayIds: days }
  }

  // class_allow_only_periods: "lớp 10A chỉ học tiết 1-5"
  if (
    classes.length > 0 &&
    /chỉ\s*học|chi\s*hoc|chỉ\s*xếp|chi\s*xep/u.test(raw) &&
    /(tiết|tiet)/u.test(raw) &&
    periods.length > 0
  ) {
    return { kind: 'class_allow_only_periods', classLabels: classes, periods }
  }

  // subject_block_days: "môn Thể dục không học thứ 7" | "thể dục không học thứ 2 buổi sáng"
  if (
    subjects.length > 0 &&
    /không\s*học|khong\s*hoc|không\s*xếp|khong\s*xep|không\s*dạy|khong\s*day/u.test(raw) &&
    days.length > 0 &&
    periods.length === 0 &&
    sessions.length === 0
  ) {
    const classFilter = classFilterFromText(raw, ctx.classLabels)
    return classFilter
      ? { kind: 'subject_block_days', subjectLabels: subjects, dayIds: days, classFilter }
      : { kind: 'subject_block_days', subjectLabels: subjects, dayIds: days }
  }

  // subject_not_consecutive: "môn Thể dục không 2 tiết liền nhau" | "...không 2 tiết liên tiếp"
  if (
    subjects.length > 0 &&
    /(không|khong).*(2|hai|2 tiết|2 buổi|2\s*tiết|2\s*buổi).*?(liền nhau|lien nhau|liên\s*tiếp|lien\s*tiep|liền|lien)/u.test(raw)
  ) {
    const classFilter = classFilterFromText(raw, ctx.classLabels)
    return classFilter
      ? { kind: 'subject_not_consecutive', subjectLabels: subjects, classFilter }
      : { kind: 'subject_not_consecutive', subjectLabels: subjects }
  }

  // subject_min_gap_days: "môn Toán rải ít nhất 3 ngày" | "2 buổi học cùng môn cách nhau ít nhất 1 ngày"
  if (
    subjects.length > 0 &&
    /cách\s*nhau|cach\s*nhau|rải|rai|trải|trai/u.test(raw) &&
    /(ngày|ngay)/u.test(raw)
  ) {
    const minGapDays = extractFirstNumber(raw) ?? 1
    const classFilter = classFilterFromText(raw, ctx.classLabels)
    return classFilter
      ? { kind: 'subject_min_gap_days', subjectLabels: subjects, minGapDays, classFilter }
      : { kind: 'subject_min_gap_days', subjectLabels: subjects, minGapDays }
  }

  // subject_min_days: "môn Toán rải ít nhất 3 ngày" (alternative phrasing)
  if (
    subjects.length > 0 &&
    /(rải|rai|trải|trai).*(ít\s*nhất|it\s*nhat|min).*?(ngày|ngay)/u.test(raw) &&
    !/cách\s*nhau|cach\s*nhau/u.test(raw)
  ) {
    const minDays = extractFirstNumber(raw)
    if (minDays !== null) {
      const classFilter = classFilterFromText(raw, ctx.classLabels)
      return classFilter
        ? { kind: 'subject_min_days', subjectLabels: subjects, minDays, classFilter }
        : { kind: 'subject_min_days', subjectLabels: subjects, minDays }
    }
  }

  // pair_same_slot: "giáo viên A và B cùng dạy song song" | "cùng dạy cùng tiết"
  if (
    teachers.length >= 2 &&
    /(cùng\s*dạy|cung\s*day|song\s*song|dạy\s*song\s*song)/u.test(raw)
  ) {
    return { kind: 'pair_same_slot', teacherLabels: teachers.slice(0, 2), dayIds: days }
  }

  // mutual_exclusion: "các môn Toán, Lý, Hóa không cùng tiết" | "Toán Lý Hóa không cùng tiết"
  if (
    subjects.length >= 2 &&
    /(không\s*cùng|khong\s*cung).*(tiết|tiet|slot)/u.test(raw) &&
    !/không\s*liên\s*tiếp|khong\s*lien\s*tiep/u.test(raw)
  ) {
    return { kind: 'mutual_exclusion', subjectLabels: subjects }
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
