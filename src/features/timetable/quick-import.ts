import { days, defaultPeriods } from './constants'
import { makeAssignmentKey, normalizeSubjectName } from './utils'

type DayId = (typeof days)[number]['id']
type SessionId = keyof typeof defaultPeriods

type QuickSection = 'teachers' | 'subjects' | 'classes' | 'assignments' | 'hard' | 'soft' | null

export type QuickImportAssignment = {
  key: string
  teacher: string
  subject: string
  className: string
  weeklyPeriods: string
}

export type QuickImportData = {
  selectedDays: DayId[]
  selectedSessions: SessionId[]
  periods: Record<SessionId, number>
  teachers: string[]
  subjects: string[]
  classes: string[]
  assignments: QuickImportAssignment[]
  hardConstraints: string[]
  softConstraints: string[]
}

export const QUICK_IMPORT_SAMPLE_TEXT = `DATASET 1
Days: Mon-Fri
Time: Morning
Max periods: 4
Teachers:
Sơn
Dung
Hương
Thủy
Hiếu
Lan
Thắng
Phương
Subjects:
Toán
Văn
Tiếng Anh
GDTC
KHTN
LS&ĐL
CN
GDCD
Classes:
6A
6B
Assignments:
Sơn-Toán-6A-4
Sơn-Toán-6B-4
Dung-Văn-6A-4
Dung-Văn-6B-4
Hương-Tiếng Anh-6A-3
Hương-Tiếng Anh-6B-3
Thủy-GDTC-6A-2
Thủy-GDTC-6B-2
Hiếu-KHTN-6A-3
Hiếu-KHTN-6B-3
Lan-LS&ĐL-6A-2
Lan-LS&ĐL-6B-2
Thắng-CN-6A-1
Thắng-CN-6B-1
Phương-GDCD-6A-1
Phương-GDCD-6B-1
Hard constraints:
Sơn không dạy thứ 2
Hương không dạy tiết 1
Soft constraints:
Toán nên xếp tiết 1-2
Văn nên liên tiếp 2 tiết`

const DAY_ORDER: DayId[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const MONDAY_TO_FRIDAY: DayId[] = DAY_ORDER.slice(0, 5)

const dayAliasMap = new Map<string, DayId>([
  ['mon', 'monday'],
  ['monday', 'monday'],
  ['t2', 'monday'],
  ['thu2', 'monday'],
  ['thuhai', 'monday'],
  ['tue', 'tuesday'],
  ['tuesday', 'tuesday'],
  ['t3', 'tuesday'],
  ['thu3', 'tuesday'],
  ['thuba', 'tuesday'],
  ['wed', 'wednesday'],
  ['wednesday', 'wednesday'],
  ['t4', 'wednesday'],
  ['thu4', 'wednesday'],
  ['thutu', 'wednesday'],
  ['thu', 'thursday'],
  ['thursday', 'thursday'],
  ['t5', 'thursday'],
  ['thu5', 'thursday'],
  ['thunam', 'thursday'],
  ['fri', 'friday'],
  ['friday', 'friday'],
  ['t6', 'friday'],
  ['thu6', 'friday'],
  ['thusau', 'friday'],
  ['sat', 'saturday'],
  ['saturday', 'saturday'],
  ['t7', 'saturday'],
  ['thu7', 'saturday'],
  ['thubay', 'saturday'],
  ['sun', 'sunday'],
  ['sunday', 'sunday'],
  ['cn', 'sunday'],
  ['chunhat', 'sunday'],
])

const sessionAliasMap = new Map<string, SessionId>([
  ['morning', 'morning'],
  ['sang', 'morning'],
  ['buoisang', 'morning'],
  ['casang', 'morning'],
  ['afternoon', 'afternoon'],
  ['chieu', 'afternoon'],
  ['buoichieu', 'afternoon'],
  ['cachieu', 'afternoon'],
  ['night', 'night'],
  ['toi', 'night'],
  ['buoitoi', 'night'],
  ['catoi', 'night'],
])

const stripDiacritics = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '')
const normalizeToken = (value: string) => stripDiacritics(value).toLowerCase().replace(/[^a-z0-9]/g, '')

const pushUnique = (list: string[], value: string) => {
  if (!list.includes(value)) list.push(value)
}

const parseDayList = (raw: string): DayId[] => {
  if (!raw.trim()) return MONDAY_TO_FRIDAY
  const resolved: DayId[] = []

  raw
    .split(/[,;]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .forEach((token) => {
      const rangeTokens = token.split('-').map((part) => part.trim()).filter(Boolean)
      if (rangeTokens.length === 2) {
        const start = dayAliasMap.get(normalizeToken(rangeTokens[0]))
        const end = dayAliasMap.get(normalizeToken(rangeTokens[1]))
        if (!start || !end) {
          throw new Error(`Không nhận diện được ngày trong khoảng: "${token}"`)
        }
        const startIndex = DAY_ORDER.indexOf(start)
        const endIndex = DAY_ORDER.indexOf(end)
        if (startIndex > endIndex) {
          throw new Error(`Khoảng ngày không hợp lệ: "${token}"`)
        }
        DAY_ORDER.slice(startIndex, endIndex + 1).forEach((day) => {
          if (!resolved.includes(day)) resolved.push(day)
        })
        return
      }

      const day = dayAliasMap.get(normalizeToken(token))
      if (!day) {
        throw new Error(`Không nhận diện được ngày: "${token}"`)
      }
      if (!resolved.includes(day)) resolved.push(day)
    })

  return resolved.length ? resolved : MONDAY_TO_FRIDAY
}

const parseSessionList = (raw: string): SessionId[] => {
  if (!raw.trim()) return ['morning']

  const resolved: SessionId[] = []
  raw
    .replace(/[–—]/g, '-')
    .split(/\s*(?:[,;/+&-]|\b(?:and|to|va|và)\b)\s*/iu)
    .map((token) => token.trim())
    .filter(Boolean)
    .forEach((token) => {
      const session = sessionAliasMap.get(normalizeToken(token))
      if (!session) {
        throw new Error(`Không nhận diện được buổi học: "${token}"`)
      }
      if (!resolved.includes(session)) resolved.push(session)
    })

  return resolved.length ? resolved : ['morning']
}

const distributePeriods = (selectedSessions: SessionId[], maxPeriods: number): Record<SessionId, number> => {
  const periods: Record<SessionId, number> = {
    morning: defaultPeriods.morning,
    afternoon: defaultPeriods.afternoon,
    night: defaultPeriods.night,
  }

  if (selectedSessions.length === 0) return periods
  if (selectedSessions.length === 1) {
    periods[selectedSessions[0]] = Math.min(12, Math.max(1, maxPeriods))
    return periods
  }

  let remaining = maxPeriods
  selectedSessions.forEach((sessionId, index) => {
    const remainingSessions = selectedSessions.length - index - 1
    const defaultCapacity = defaultPeriods[sessionId]
    const periodCount = Math.min(defaultCapacity, Math.max(1, remaining - remainingSessions))
    periods[sessionId] = periodCount
    remaining -= periodCount
  })

  return periods
}

export function parseQuickImportText(rawText: string): QuickImportData {
  const text = rawText.replace(/\r\n?/g, '\n')
  const lines = text.split('\n').map((line) => line.trim())

  const sections: Record<Exclude<QuickSection, null>, string[]> = {
    teachers: [],
    subjects: [],
    classes: [],
    assignments: [],
    hard: [],
    soft: [],
  }

  let section: QuickSection = null
  let dayRaw = 'Mon-Fri'
  let timeRaw = 'Morning'
  let maxPeriodsRaw = '4'

  lines.forEach((line) => {
    if (!line) return
    const lower = line.toLowerCase()

    if (lower.startsWith('dataset')) return
    if (/^days\s*:/.test(lower)) {
      dayRaw = line.slice(line.indexOf(':') + 1).trim()
      section = null
      return
    }
    if (/^time\s*:/.test(lower)) {
      timeRaw = line.slice(line.indexOf(':') + 1).trim()
      section = null
      return
    }
    if (/^max periods?\s*:/.test(lower)) {
      maxPeriodsRaw = line.slice(line.indexOf(':') + 1).trim()
      section = null
      return
    }
    if (/^teachers\s*:/.test(lower)) {
      section = 'teachers'
      return
    }
    if (/^subjects\s*:/.test(lower)) {
      section = 'subjects'
      return
    }
    if (/^classes\s*:/.test(lower)) {
      section = 'classes'
      return
    }
    if (/^assignments\s*:/.test(lower)) {
      section = 'assignments'
      return
    }
    if (/^hard constraints\s*:/.test(lower)) {
      section = 'hard'
      return
    }
    if (/^soft constraints\s*:/.test(lower)) {
      section = 'soft'
      return
    }

    if (!section) return
    sections[section].push(line)
  })

  const selectedDays = parseDayList(dayRaw)
  const selectedSessions = parseSessionList(timeRaw)
  const maxPeriods = Number.parseInt(maxPeriodsRaw, 10)
  if (!Number.isFinite(maxPeriods) || maxPeriods <= 0) {
    throw new Error('Max periods phải là số nguyên dương.')
  }

  const teacherList: string[] = []
  const subjectList: string[] = []
  const classList: string[] = []

  sections.teachers.forEach((teacher) => pushUnique(teacherList, teacher))
  sections.subjects.forEach((subject) => pushUnique(subjectList, normalizeSubjectName(subject)))
  sections.classes.forEach((className) => pushUnique(classList, className.toUpperCase()))

  const assignments: QuickImportAssignment[] = sections.assignments.map((line, index) => {
    const parts = line.split('-').map((part) => part.trim())
    if (parts.length < 4) {
      throw new Error(`Dòng phân công ${index + 1} sai format: "${line}"`)
    }

    const weeklyPeriods = parts.at(-1) ?? ''
    const className = (parts.at(-2) ?? '').toUpperCase()
    const teacher = parts[0] ?? ''
    const subject = normalizeSubjectName(parts.slice(1, -2).join('-'))

    if (!teacher || !subject || !className) {
      throw new Error(`Dòng phân công ${index + 1} thiếu dữ liệu: "${line}"`)
    }
    if (!/^\d+$/.test(weeklyPeriods) || Number(weeklyPeriods) <= 0) {
      throw new Error(`Số tiết không hợp lệ ở dòng phân công ${index + 1}: "${line}"`)
    }

    pushUnique(teacherList, teacher)
    pushUnique(subjectList, subject)
    pushUnique(classList, className)

    return {
      key: makeAssignmentKey(teacher, subject, className, weeklyPeriods),
      teacher,
      subject,
      className,
      weeklyPeriods,
    }
  })

  const periods = distributePeriods(selectedSessions, maxPeriods)

  return {
    selectedDays,
    selectedSessions,
    periods,
    teachers: teacherList,
    subjects: subjectList,
    classes: classList,
    assignments,
    hardConstraints: sections.hard,
    softConstraints: sections.soft,
  }
}
