'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Download,
  Hash,
  Loader2,
  Minus,
  Plus,
  RadioTower,
  RotateCcw,
  AlertTriangle,
  ClipboardList,
  Sparkles,
  Sun,
  Trash2,
  User,
} from 'lucide-react'
import * as XLSX from 'xlsx'

import { generateTimetableWithAI } from './ai/client'
import { useApiKeyStore } from './ai/api-key-store'
import type {
  AgentEvent,
  CheckerReport,
  ConstraintCheckItem,
  DeterministicValidationReport,
  TimetableSolveResult,
} from './ai/types'
import {
  classPresetGroups,
  constraintTypeList,
  constraintTypes,
  days,
  defaultPeriods,
  disabledPrimaryButtonClass,
  ghostButtonClass,
  iconShellClass,
  inputClass,
  navBackClass,
  navBarClass,
  navDisabledClass,
  navNextClass,
  panelClass,
  panelMutedClass,
  primaryButtonClass,
  sessions,
  subjectPresets,
  teacherColors,
} from './constants'
import { getCellKey, makeAssignmentKey, normalizeSubjectName, sortAlphabetically } from './utils'

const LOWPRIZO_API_KEY_STORAGE_KEY = 'lowprizo_api_key'
const RESULT_NOT_FOUND_MESSAGE = 'Couldnt Find the Solution'
const NO_ACTIVE_PERIOD_MESSAGE = 'Không còn ô tiết nào để xếp lịch. Vui lòng khôi phục ít nhất một ô tiết ở trang xem trước.'

const STEP_ORDER = ['thinking', 'coding', 'running', 'checking', 'fixing'] as const

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)}s`
}

function formatNullableNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('vi-VN')
}

function getVerdictBadge(verdict: TimetableSolveResult['verdict']) {
  switch (verdict) {
    case 'accept':
      return {
        label: 'Accepted',
        className: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
      }
    case 'retry':
      return {
        label: 'Retry',
        className: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
      }
    case 'infeasible':
      return {
        label: 'Infeasible',
        className: 'border-red-400/30 bg-red-400/10 text-red-300',
      }
    default:
      return {
        label: 'Error',
        className: 'border-white/15 bg-white/[0.04] text-white/70',
      }
  }
}

function getCheckSeverityBadge(severity: ConstraintCheckItem['severity']) {
  switch (severity) {
    case 'base':
      return 'border-red-400/25 bg-red-400/10 text-red-300'
    case 'hard':
      return 'border-amber-400/25 bg-amber-400/10 text-amber-300'
    default:
      return 'border-sky-400/25 bg-sky-400/10 text-sky-300'
  }
}

function getCheckStatusBadge(passed: boolean) {
  return passed
    ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
    : 'border-red-400/25 bg-red-400/10 text-red-300'
}

function renderList(items: string[] | undefined | null, emptyLabel = 'Không có') {
  if (!items?.length) return <span className="text-white/35">{emptyLabel}</span>
  return (
    <ul className="space-y-1">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="text-xs text-white/60">
          • {item}
        </li>
      ))}
    </ul>
  )
}

function buildReportRows(
  title: string,
  report: DeterministicValidationReport | CheckerReport | null | undefined,
): string[][] {
  if (!report) return [[title, 'Không có dữ liệu']]

  const rows: string[][] = [
    [title, report.summary],
    ['Base constraint pass', report.baseConstraintPass ? 'Yes' : 'No'],
    ['Hard constraint pass', report.hardConstraintPass ? 'Yes' : 'No'],
    ['Soft score', String(report.softConstraintScore)],
  ]

  if ('valid' in report) {
    rows.push(['Overall valid', report.valid ? 'Yes' : 'No'])
    rows.push(['Unchecked constraints', report.uncheckedConstraintIds.join(' | ') || 'None'])
  }

  if ('verdict' in report) {
    rows.push(['Verdict', report.verdict])
    rows.push(['Retry instructions', report.retryInstructions.join(' | ') || 'None'])
  }

  rows.push([])
  rows.push(['constraintId', 'severity', 'passed', 'reason', 'suggestion', 'original'])
  report.checks.forEach((check) => {
    rows.push([
      check.constraintId,
      check.severity,
      check.passed ? 'Yes' : 'No',
      check.reason,
      check.suggestion ?? '',
      check.original,
    ])
  })

  return rows
}

function MetricCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={`${panelMutedClass} p-3`}>
      <p className="text-[10px] uppercase tracking-widest text-white/35">{label}</p>
      <div className="mt-1 text-sm text-white/70">{value}</div>
    </div>
  )
}

function loadStoredLowprizoApiKey() {
  if (typeof window === 'undefined') return ''

  try {
    return localStorage.getItem(LOWPRIZO_API_KEY_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveStoredLowprizoApiKey(apiKey: string) {
  try {
    if (apiKey) {
      localStorage.setItem(LOWPRIZO_API_KEY_STORAGE_KEY, apiKey)
    } else {
      localStorage.removeItem(LOWPRIZO_API_KEY_STORAGE_KEY)
    }
  } catch {}
}

type AssignmentItem = {
  key: string
  teacher: string
  subject: string
  className: string
  weeklyPeriods: string
}

type ConstraintItem = {
  id: string
  type: keyof typeof constraintTypes
  text: string
  weight?: number
}

type BulkAssignmentError = {
  line: number
  rawLine: string
  parts?: string[]
  segmentIndex: number
}

function SelectField({ icon: Icon, label, placeholder, value, options, onChange }) {
  return (
    <label className={`${panelClass} block p-4`}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className={iconShellClass}>
          <Icon size={16} strokeWidth={1.5} />
        </span>
        <span className="text-sm font-medium text-white">{label}</span>
      </div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function DayTile({ selected, title, subtitle, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col items-center justify-center rounded-md px-2 py-3 transition-all duration-200 ${
        selected
          ? 'bg-[#4DB848] text-[#0a0a0a]'
          : 'border border-white/[0.06] bg-[#141414] text-white hover:border-white/[0.12] hover:bg-white/[0.04]'
      }`}
    >
      <span className={`text-sm font-semibold leading-none ${selected ? 'text-[#0a0a0a]' : 'text-white'}`}>{subtitle}</span>
      <span className={`mt-1 text-[10px] leading-none ${selected ? 'text-[#0a0a0a]/50' : 'text-white/30'}`}>{title.replace('Thứ ', '')}</span>
    </button>
  )
}

function SessionTile({ selected, icon, title, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col items-center justify-center gap-2 rounded-md px-4 py-4 transition-all duration-200 ${
        selected
          ? 'bg-[#4DB848] text-[#0a0a0a]'
          : 'border border-white/[0.06] bg-[#141414] text-white hover:border-white/[0.12] hover:bg-white/[0.04]'
      }`}
    >
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-full border transition ${
          selected
            ? 'border-[#0a0a0a]/10 bg-[#0a0a0a]/10 text-[#0a0a0a]'
            : 'border-white/[0.08] bg-white/[0.03] text-[#4DB848] group-hover:bg-white/[0.06]'
        }`}
      >
        <span className="text-xl">{icon}</span>
      </span>
      <span className={`text-sm font-semibold ${selected ? 'text-[#0a0a0a]' : 'text-white'}`}>{title}</span>
    </button>
  )
}

function PeriodControl({ session, value, onChange }) {
  const [rawInput, setRawInput] = useState<string | null>(null)

  const clampValue = (nextValue) => Math.min(12, Math.max(1, nextValue))
  const displayValue = rawInput ?? String(value)
  const parsedRawValue = rawInput === null || rawInput === '' ? null : Number(rawInput)
  const isInvalid =
    rawInput !== null &&
    (rawInput === '' ||
      parsedRawValue === null ||
      Number.isNaN(parsedRawValue) ||
      parsedRawValue < 1 ||
      parsedRawValue > 12 ||
      !Number.isInteger(parsedRawValue))

  const commitValue = (nextValue) => {
    const cleanValue = Number.isNaN(nextValue) ? value : clampValue(nextValue)
    onChange(session.id, cleanValue)
    setRawInput(null)
  }

  const handleInputChange = (event) => {
    const raw = event.target.value
    setRawInput(raw)

    if (raw === '') {
      return
    }

    const num = Number(raw)
    if (!Number.isNaN(num) && num >= 1 && num <= 12 && Number.isInteger(num)) {
      onChange(session.id, num)
    }
  }

  const handleBlur = () => {
    if (rawInput === null) {
      return
    }

    if (isInvalid) {
      setRawInput(null)
      return
    }

    commitValue(Number(rawInput))
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleBlur()
    }
  }

  const handleStep = (delta) => {
    const baseValue = rawInput !== null && !isInvalid && rawInput !== '' ? Number(rawInput) : value
    commitValue(baseValue + delta)
  }

  return (
    <div className={`${panelClass} p-4`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-[#4DB848] transition">
            <span className="text-xl">{session.icon}</span>
          </span>
          <div>
            <p className="text-sm font-semibold text-white">{session.label}</p>
            <p className="text-xs text-white/40">Số tiết tối đa cho buổi này</p>
          </div>
        </div>

        <div className={`${panelMutedClass} flex items-center gap-2 p-1.5`}>
          <button
            type="button"
            onClick={() => handleStep(-1)}
            className="flex h-8 w-8 items-center justify-center rounded border border-white/[0.08] bg-transparent text-white/50 transition hover:bg-white/[0.04]"
            aria-label={`Giảm số tiết buổi ${session.label}`}
          >
            <Minus size={14} strokeWidth={1.5} />
          </button>
          <label className="sr-only" htmlFor={`${session.id}-periods`}>
            Số tiết tối đa buổi {session.label}
          </label>
          <input
            id={`${session.id}-periods`}
            type="number"
            min="1"
            max="12"
            value={displayValue}
            onChange={handleInputChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={`h-8 w-16 rounded border text-center text-sm outline-none transition ${
              isInvalid
                ? 'border-red-500/60 bg-red-500/[0.06] text-red-400 focus:border-red-400'
                : 'border-white/[0.08] bg-[#0a0a0a] text-white focus:border-white/20'
            }`}
          />
          <button
            type="button"
            onClick={() => handleStep(1)}
            className="flex h-8 w-8 items-center justify-center rounded border border-white/[0.08] bg-transparent text-white/50 transition hover:bg-white/[0.04]"
            aria-label={`Tăng số tiết buổi ${session.label}`}
          >
            <Plus size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoField({ icon: Icon, label, placeholder, value, onChange }) {
  return (
    <label className={`${panelClass} block p-4`}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className={iconShellClass}>
          <Icon size={16} strokeWidth={1.5} />
        </span>
        <span className="text-sm font-medium text-white">{label}</span>
      </div>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
    </label>
  )
}

export default function App({ onBackToLanding }) {
  const { apiKey } = useApiKeyStore()
  const [page, setPage] = useState('select')
  const [selectedDays, setSelectedDays] = useState(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])
  const [selectedSessions, setSelectedSessions] = useState(['morning'])
  const [periods, setPeriods] = useState(defaultPeriods)
  const [deletedPeriods, setDeletedPeriods] = useState({})
  const [teacherInput, setTeacherInput] = useState('')
  const [teacherImportMode, setTeacherImportMode] = useState('update')
  const teacherInputRef = useRef<(HTMLInputElement & HTMLTextAreaElement) | null>(null)
  const [teacherList, setTeacherList] = useState<string[]>([])
  const [subjectImportMode, setSubjectImportMode] = useState<'update' | 'bulk'>('update')
  const [subjectInput, setSubjectInput] = useState('')
  const [subjectList, setSubjectList] = useState<string[]>([])
  const [classInput, setClassInput] = useState('')
  const [classList, setClassList] = useState<string[]>([])
  const [assignmentDraft, setAssignmentDraft] = useState({ teacher: '', subject: '', className: '', weeklyPeriods: '' })
  const [assignmentImportMode, setAssignmentImportMode] = useState('update')
  const [bulkAssignmentText, setBulkAssignmentText] = useState('')
  const [bulkAssignmentErrors, setBulkAssignmentErrors] = useState<BulkAssignmentError[]>([])
  const [assignmentList, setAssignmentList] = useState<AssignmentItem[]>([])
  const [constraintDraft, setConstraintDraft] = useState<{ type: keyof typeof constraintTypes; text: string; weight: number }>({ type: 'required', text: '', weight: 5 })
  const [constraintList, setConstraintList] = useState<ConstraintItem[]>([])
  const [aiResult, setAiResult] = useState<TimetableSolveResult | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [agentStatus, setAgentStatus] = useState<string | null>(null)
  const [agentStep, setAgentStep] = useState<'idle' | 'thinking' | 'coding' | 'running' | 'checking' | 'fixing'>('idle')
  const [agentIteration, setAgentIteration] = useState(0)
  const [agentMaxIterations, setAgentMaxIterations] = useState(5)
  const [agentElapsed, setAgentElapsed] = useState(0)
  const agentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [showTechnicalErrors, setShowTechnicalErrors] = useState(false)
  const [lowprizoApiKey, setLowprizoApiKey] = useState('')

  useEffect(() => {
    setLowprizoApiKey(loadStoredLowprizoApiKey())
  }, [])

  useEffect(() => {
    saveStoredLowprizoApiKey(lowprizoApiKey.trim())
  }, [lowprizoApiKey])

  const sortedTeacherList = useMemo(() => sortAlphabetically(teacherList), [teacherList])
  const sortedSubjectList = useMemo(() => sortAlphabetically(subjectList), [subjectList])
  const sortedClassList = useMemo(() => sortAlphabetically(classList), [classList])
  const sortedAssignmentList = useMemo(
    () =>
      [...assignmentList].sort((first, second) => {
        const teacherOrder = first.teacher.localeCompare(second.teacher, 'vi', { numeric: true, sensitivity: 'base' })
        if (teacherOrder !== 0) return teacherOrder

        const subjectOrder = first.subject.localeCompare(second.subject, 'vi', { numeric: true, sensitivity: 'base' })
        if (subjectOrder !== 0) return subjectOrder

        return first.className.localeCompare(second.className, 'vi', { numeric: true, sensitivity: 'base' })
      }),
    [assignmentList],
  )
  const sortedConstraintList = useMemo(
    () => [...constraintList].sort((first, second) => (first.type === second.type ? 0 : first.type === 'required' ? -1 : 1)),
    [constraintList],
  )

  const teacherColorMap = useMemo(
    () => Object.fromEntries(sortedTeacherList.map((teacher, index) => [teacher, teacherColors[index % teacherColors.length]])),
    [sortedTeacherList],
  )

  const selectedDayNames = useMemo(
    () => days.filter((day) => selectedDays.includes(day.id)).map((day) => day.label),
    [selectedDays],
  )

  const selectedSessionData = useMemo(
    () => sessions.filter((session) => selectedSessions.includes(session.id)),
    [selectedSessions],
  )

  const selectedSessionNames = useMemo(() => selectedSessionData.map((session) => session.label), [selectedSessionData])

  const selectedSpreadsheetDays = useMemo(
    () => days.filter((day) => selectedDays.includes(day.id)),
    [selectedDays],
  )

  const timetableRows = useMemo(
    () =>
        selectedSessionData.flatMap((session) => {
          const sessionPeriodCount = periods[session.id] ?? defaultPeriods[session.id]

          return Array.from({ length: sessionPeriodCount }, (_, index) => ({
            id: `${session.id}-${index + 1}`,
            sessionId: session.id,
            sessionLabel: session.label,
            sessionPeriodCount,
            period: index + 1,
            firstInSession: index === 0,
          }))
        }),
    [periods, selectedSessionData],
  )

  const summaryTimetableRows = useMemo(() => {
    const visibleRows = timetableRows.filter((row) =>
      selectedSpreadsheetDays.some((day) => !deletedPeriods[`${day.id}-${row.sessionId}-${row.period}`]),
    )
    const visibleCountBySession = visibleRows.reduce((counts, row) => ({ ...counts, [row.sessionId]: (counts[row.sessionId] ?? 0) + 1 }), {})
    const seenSessions = new Set()

    return visibleRows.map((row) => {
      const firstVisibleInSession = !seenSessions.has(row.sessionId)
      seenSessions.add(row.sessionId)

      return {
        ...row,
        firstInSession: firstVisibleInSession,
        sessionPeriodCount: visibleCountBySession[row.sessionId] ?? 1,
      }
    })
  }, [deletedPeriods, selectedSpreadsheetDays, timetableRows])

  const solvedCellMap = useMemo(
    () => new Map(aiResult?.cells.map((cell) => [cell.slotId, cell]) ?? []),
    [aiResult],
  )

  const resultClassColumns = useMemo(() => {
    const defaultClassOrder = ['6A', '6B', '7A', '7B', '8A', '8B', '9A', '9B']
    const knownClasses = defaultClassOrder.filter((className) => classList.includes(className))
    const customClasses = sortedClassList.filter((className) => !defaultClassOrder.includes(className))
    return [...knownClasses, ...customClasses]
  }, [classList, sortedClassList])

  const resultSessionGroups = useMemo(
    () => selectedSessionData.map((session) => {
      const sessionRows = selectedSpreadsheetDays
        .map((day) => {
          const periodsInDay = summaryTimetableRows.filter((row) => row.sessionId === session.id && !deletedPeriods[getCellKey(day.id, row.sessionId, row.period)])
          return {
            day,
            rows: periodsInDay.map((row, index) => ({ ...row, firstInDay: index === 0, dayPeriodCount: periodsInDay.length })),
          }
        })
        .filter((group) => group.rows.length > 0)

      return {
        ...session,
        rows: sessionRows.flatMap((group) => group.rows.map((row) => ({ ...row, day: group.day }))),
      }
    }).filter((session) => session.rows.length > 0),
    [deletedPeriods, selectedSessionData, selectedSpreadsheetDays, summaryTimetableRows],
  )

  const resultTableClassColumns = useMemo(() => {
    const columns = resultClassColumns.slice(0, 8)
    while (columns.length < 8) columns.push('')
    return columns
  }, [resultClassColumns])

  const fixedResultTableSections = useMemo(() => {
    return selectedSessionData.map((session, sectionIndex) => {
      const sessionPeriodCount = periods[session.id] ?? defaultPeriods[session.id]

      const dayGroups = selectedSpreadsheetDays.map((day) => {
        // Count active (non-deleted) periods for this day+session
        const activeRows: { day: typeof day; session: typeof session; period: number }[] = []
        for (let p = 1; p <= sessionPeriodCount; p++) {
          const cellKey = getCellKey(day.id, session.id, p)
          if (!deletedPeriods[cellKey]) {
            activeRows.push({ day, session, period: p })
          }
        }
        return {
          key: `${session.id}-${day.id}`,
          label: day.tableLabel,
          rows: activeRows,
        }
      }).filter((group) => group.rows.length > 0)

      return {
        key: session.id,
        ...(sectionIndex > 0 ? { divider: `THỜI KHÓA BIỂU BUỔI ${session.label.toUpperCase()}` } : {}),
        rows: dayGroups,
      }
    })
  }, [selectedSessionData, selectedSpreadsheetDays, periods, deletedPeriods])

  const canContinue = selectedDays.length > 0 && selectedSessions.length > 0

  const toggleItem = (id, setter) => {
    setter((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  const updatePeriod = (sessionId, value) => {
    setPeriods((current) => ({ ...current, [sessionId]: value }))
  }

  const toggleDeletedPeriod = (dayId, sessionId, period) => {
    const cellKey = getCellKey(dayId, sessionId, period)
    setDeletedPeriods((current) => {
      const next = { ...current }
      if (next[cellKey]) {
        delete next[cellKey]
      } else {
        next[cellKey] = true
      }
      return next
    })
  }

  const parseLines = (input: string) =>
    input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

  const importTeacher = () => {
    const teacherInputElement = document.getElementById('teacher-input') as HTMLInputElement | HTMLTextAreaElement | null
    const rawInput = teacherInputRef.current?.value ?? teacherInputElement?.value ?? teacherInput
    const normalizedInput = rawInput.replace(/\r\n?/g, '\n')
    const names = teacherImportMode === 'bulk'
      ? parseLines(normalizedInput)
      : [normalizedInput.trim()].filter(Boolean)
    if (!names.length) return

    setTeacherList((current) => {
      const next = [...current]
      names.forEach((name) => {
        if (!next.includes(name)) next.push(name)
      })
      return next
    })
    setTeacherInput('')
  }

  const deleteTeacher = (name) => {
    setTeacherList((current) => current.filter((teacher) => teacher !== name))
  }

  const importSubject = (presetValue?: string) => {
    const rawInput = presetValue ?? subjectInput
    const names = presetValue || subjectImportMode !== 'bulk'
      ? [normalizeSubjectName(rawInput)].filter(Boolean)
      : parseLines(rawInput).map((name) => normalizeSubjectName(name)).filter(Boolean)
    if (!names.length) return

    setSubjectList((current) => {
      const next = [...current]
      names.forEach((name) => {
        if (!next.includes(name)) next.push(name)
      })
      return next
    })
    setSubjectInput('')
  }

  const deleteSubject = (name) => {
    setSubjectList((current) => current.filter((subject) => subject !== name))
  }

  const importClass = () => {
    const name = classInput.trim().toUpperCase()
    if (!name) return

    setClassList((current) => (current.includes(name) ? current : [...current, name]))
    setClassInput('')
  }

  const deleteClass = (name) => {
    setClassList((current) => current.filter((className) => className !== name))
    setAssignmentList((current) => current.filter((assignment) => assignment.className !== name))
  }

  const addClass = (name) => {
    const cleanName = name.trim().toUpperCase()
    if (!cleanName) return

    setClassList((current) => (current.includes(cleanName) ? current : [...current, cleanName]))
  }

  const addClassPresetGroup = (classes) => {
    setClassList((current) => {
      const next = [...current]
      classes.forEach((className) => {
        const normalizedClassName = String(className).trim().toUpperCase()
        if (normalizedClassName && !next.includes(normalizedClassName)) {
          next.push(normalizedClassName)
        }
      })
      return next
    })
  }


  const parseBulkAssignments = (text: string): { parsed: AssignmentItem[]; errors: BulkAssignmentError[] } => {
    const parsed: AssignmentItem[] = []
    const errors: BulkAssignmentError[] = []

    text.split(/\r?\n/).forEach((rawLine, index) => {
      if (!rawLine.trim()) return

      const parts = rawLine.split('-').map((part) => part.trim())
      if (parts.length !== 4) {
        errors.push({ line: index + 1, rawLine, segmentIndex: -1 })
        return
      }

      const [teacher, subject, className, weeklyPeriods] = parts
      const checks = [
        { value: teacher, valid: Boolean(teacher) },
        { value: subject, valid: Boolean(subject) },
        { value: className, valid: Boolean(className) },
        { value: weeklyPeriods, valid: /^\d+$/.test(weeklyPeriods) && Number(weeklyPeriods) > 0 },
      ]
      const badIndex = checks.findIndex((check) => !check.valid)
      if (badIndex !== -1) {
        errors.push({ line: index + 1, rawLine, parts, segmentIndex: badIndex })
        return
      }

      parsed.push({
        key: makeAssignmentKey(teacher, subject, className, weeklyPeriods),
        teacher,
        subject,
        className,
        weeklyPeriods,
      })
    })

    return { parsed, errors }
  }

  const renderBulkAssignmentErrorLine = (error: BulkAssignmentError) => {
    if (!error.parts || error.segmentIndex === -1) {
      return <span className="text-red-300 underline decoration-red-400 decoration-2 underline-offset-2">{error.rawLine}</span>
    }

    return error.parts.map((part, index) => (
      <Fragment key={`${error.line}-${index}`}>
        {index > 0 ? <span className="text-white/30">-</span> : null}
        <span className={index === error.segmentIndex ? 'text-red-300 underline decoration-red-400 decoration-2 underline-offset-2' : 'text-white/60'}>
          {part || 'trống'}
        </span>
      </Fragment>
    ))
  }

  const importBulkAssignments = () => {
    const { parsed, errors } = parseBulkAssignments(bulkAssignmentText)
    setBulkAssignmentErrors(errors)
    if (!parsed.length || errors.length) return

    setAssignmentList((current) => {
      const next = [...current]
      parsed.forEach((assignment) => {
        if (!next.some((existing) => existing.key === assignment.key)) next.push(assignment)
      })
      return next
    })
    setBulkAssignmentText('')
  }

  const importAssignment = () => {
    const { teacher, subject, className, weeklyPeriods } = assignmentDraft
    const cleanPeriods = weeklyPeriods.trim()
    if (!teacher || !subject || !className || !cleanPeriods) return

    const nextAssignment = {
      key: makeAssignmentKey(teacher, subject, className, cleanPeriods),
      teacher,
      subject,
      className,
      weeklyPeriods: cleanPeriods,
    }

    setAssignmentList((current) =>
      current.some((assignment) => assignment.key === nextAssignment.key) ? current : [...current, nextAssignment],
    )
    setAssignmentDraft((current) => ({ ...current, weeklyPeriods: '' }))
  }

  const deleteAssignment = (key) => {
    setAssignmentList((current) => current.filter((assignment) => assignment.key !== key))
  }

  const importConstraint = () => {
    const lines = parseLines(constraintDraft.text)
    if (!lines.length) return

    const now = Date.now()
    const newItems = lines.map((text, i) => ({
      id: `${now}-${i}-${text}`,
      type: constraintDraft.type,
      text,
      weight: constraintDraft.type === 'preferred' ? constraintDraft.weight : undefined,
    }))

    setConstraintList((current) => [...current, ...newItems])
    setConstraintDraft((current) => ({ ...current, text: '' }))
  }

  const deleteConstraint = (id) => {
    setConstraintList((current) => current.filter((constraint) => constraint.id !== id))
  }

  const handleGenerate = async (disableLlm = false) => {
    const apiKey = lowprizoApiKey.trim()
    if (!apiKey) {
      setAiError('Vui lòng nhập Lowprizo API key trước khi xếp lịch.')
      setAiResult(null)
      return
    }

    if (activePeriodCount <= 0) {
      setAiError(NO_ACTIVE_PERIOD_MESSAGE)
      setAiResult(null)
      return
    }

    const constraintConfirmations = constraintList.map((c) => ({
      id: c.id,
      original: c.text,
      interpreted: c.text,
      accepted: true,
    }))
    const needConfirm = constraintConfirmations.length > 0
    if (needConfirm) {
      const ok = window.confirm('Vui lòng xác nhận: hệ thống đang hiểu ràng buộc đúng như bạn đã nhập. Nhấn OK để tiếp tục xếp lịch.')
      if (!ok) {
        setAiError('Bạn đã hủy để chỉnh lại ràng buộc trước khi xếp lịch.')
        return
      }
    }

    setAiLoading(true)
    setAiError(null)
    setAiResult(null)
    setShowTechnicalErrors(false)
    setAgentStatus('Đang khởi tạo...')
    setAgentStep('thinking')
    setAgentIteration(0)
    setAgentMaxIterations(6)
    setAgentElapsed(0)

    if (agentTimerRef.current) clearInterval(agentTimerRef.current)
    agentTimerRef.current = setInterval(() => {
      setAgentElapsed((prev) => prev + 1)
    }, 1000)

    try {
      const result = await generateTimetableWithAI(
        {
          apiKey,
          days: selectedSpreadsheetDays,
          sessions: selectedSessionData,
          periodCounts: periods,
          deletedPeriods,
          assignments: assignmentList,
          constraints: constraintList,
          constraintConfirmations,
        },
        apiKey ?? undefined,
        (event: AgentEvent) => {
          switch (event.type) {
            case 'status':
            case 'phase': {
              setAgentStatus(event.message)
              setAgentIteration(event.iteration)
              setAgentMaxIterations(event.maxIterations)
              if (event.phase === 'deterministic_validation') {
                setAgentStep('checking')
              } else if (event.phase === 'normalize_input') {
                setAgentStep('thinking')
              } else if (event.message.includes('kiểm tra')) {
                setAgentStep('checking')
              } else if (event.message.includes('sửa')) {
                setAgentStep('fixing')
              } else {
                setAgentStep('coding')
              }
              break
            }
            case 'loop_progress':
              setAgentIteration(event.attempt)
              setAgentMaxIterations(event.maxIterations)
              setAgentStatus(event.message)
              setAgentStep('coding')
              break
            case 'coder_started':
              setAgentIteration(event.attempt)
              setAgentStatus(event.message)
              setAgentStep('coding')
              break
            case 'coder_artifact_generated':
              setAgentIteration(event.attempt)
              setAgentStatus(`Đã tạo solver artifact cho attempt ${event.attempt}.`)
              setAgentStep('coding')
              break
            case 'coder_run_started':
              setAgentIteration(event.attempt)
              setAgentStatus(event.message)
              setAgentStep('running')
              break
            case 'coder_run_failed':
            case 'coder_runtime_error':
            case 'coder_schema_error':
            case 'code_fix':
              setAgentIteration(event.attempt)
              setAgentStatus('Solver gặp lỗi, đang chuẩn bị vòng sửa tiếp theo...')
              setAgentStep('fixing')
              break
            case 'checker_started':
              setAgentIteration(event.attempt)
              setAgentStatus(event.message)
              setAgentStep('checking')
              break
            case 'checker_retry_requested':
              setAgentIteration(event.attempt)
              setAgentStatus(event.message)
              setAgentStep('fixing')
              break
            case 'checker_accepted':
              setAgentIteration(event.attempt)
              setAgentStatus(event.message)
              setAgentStep('checking')
              break
            case 'checker_infeasible':
              setAgentIteration(event.attempt)
              setAgentStatus(event.message)
              setAgentStep('checking')
              break
            case 'verified':
              if (event.allSatisfied) {
                setAgentStep('checking')
                setAgentStatus('Tất cả ràng buộc thỏa mãn!')
              } else {
                const hardCount = event.violations.filter((v: { violated: boolean }) => v.violated).length
                if (hardCount > 0) {
                  setAgentStep('fixing')
                  setAgentStatus(`Phát hiện ${hardCount} vi phạm cứng, đang sửa...`)
                } else {
                  setAgentStep('checking')
                  setAgentStatus(`Có ${event.violations.length} ràng buộc mềm chưa tối ưu, hoàn thành...`)
                }
              }
              break
            case 'debug':
              setAgentStatus(event.message)
              break
            case 'result':
              setAgentStatus(event.data.message)
              setAgentStep(event.data.status === 'solved' ? 'checking' : 'idle')
              break
            case 'error':
              setAgentStatus(event.message)
              setAgentStep('fixing')
              break
          }
        },
        { disableLlm },
      )
      setAiResult(result)
      setAgentIteration(result.telemetry?.totalAttempts ?? agentIteration)
      setAgentMaxIterations(result.telemetry?.totalAttempts ?? agentMaxIterations)
      setAgentStatus(result.message)
      if (result.status !== 'solved') {
        setAiError(result.message || result.overallAssessment || RESULT_NOT_FOUND_MESSAGE)
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : RESULT_NOT_FOUND_MESSAGE)
    } finally {
      setAiLoading(false)
      if (agentTimerRef.current) {
        clearInterval(agentTimerRef.current)
        agentTimerRef.current = null
      }
    }
  }

  const handleDownloadExcel = useCallback(() => {
    if (!aiResult || aiResult.status !== 'solved') return

    const headerRow: string[] = ['Thứ', 'Tiết']
    resultTableClassColumns.forEach((className, index) => {
      headerRow.push(className || `Lớp ${index + 1}`)
      headerRow.push('GV Dạy')
    })

    const rows: string[][] = [headerRow]

    fixedResultTableSections.forEach((section, sectionIndex) => {
      if (sectionIndex > 0 && section.divider) {
        const dividerRow = [section.divider, ...Array(headerRow.length - 1).fill('')]
        rows.push(dividerRow)
      }

      section.rows.forEach((group) => {
        group.rows.forEach((row, rowIndex) => {
          const cellKey = getCellKey(row.day.id, row.session.id, row.period)
          const dataRow: string[] = []

          dataRow.push(rowIndex === 0 ? group.label : '')
          dataRow.push(String(row.period))

          resultTableClassColumns.forEach((className) => {
            const entry = className
              ? solvedCellMap.get(cellKey)?.entries.find((item) => item.className === className)
              : null
            dataRow.push(entry?.subject ?? '')
            dataRow.push(entry?.teacher ?? '')
          })

          rows.push(dataRow)
        })
      })
    })

    const wb = XLSX.utils.book_new()
    const timetableSheet = XLSX.utils.aoa_to_sheet(rows)
    timetableSheet['!cols'] = [
      { wch: 12 },
      { wch: 6 },
      ...resultTableClassColumns.flatMap(() => [{ wch: 18 }, { wch: 18 }]),
    ]

    const checkerRows = buildReportRows('Checker report', aiResult.checkerReport)
    const deterministicRows = buildReportRows('Deterministic validation', aiResult.deterministicReport)
    const diagnosticsRows: string[][] = [
      ['Field', 'Value'],
      ['Status', aiResult.status],
      ['Verdict', aiResult.verdict],
      ['Message', aiResult.message],
      ['Final reason', aiResult.finalReason ?? ''],
      ['Overall assessment', aiResult.overallAssessment ?? ''],
      ['Artifact path', aiResult.artifactSummary?.path ?? ''],
      ['Artifact entrypoint', aiResult.artifactSummary?.entrypoint ?? ''],
      ['Artifact source hash', aiResult.artifactSummary?.sourceHash ?? ''],
      ['Artifact summary', aiResult.artifactSummary?.summary ?? ''],
      ['Artifact assumptions', aiResult.artifactSummary?.assumptions.join(' | ') ?? ''],
      ['Diagnostics', aiResult.diagnostics.join(' | ') || ''],
      ['Execution errors', aiResult.executionErrors.map((item) => `${item.constraintId}: ${item.error}`).join(' | ')],
      ['Validation errors', aiResult.validationErrors.map((item) => `${item.constraintId}: ${item.error}`).join(' | ')],
      ['IIS constraint ids', aiResult.iisConstraintIds.join(' | ')],
      ['Conflicting constraints', aiResult.conflictingConstraints.map((item) => `${item.id}: ${item.text}`).join(' | ')],
      ['Telemetry duration', String(aiResult.telemetry?.totalDurationMs ?? '')],
      ['Telemetry compile attempts', String(aiResult.telemetry?.compileAttempts ?? '')],
      ['Telemetry repair attempts', String(aiResult.telemetry?.repairAttempts ?? '')],
      ['Telemetry solver attempts', String(aiResult.telemetry?.solverAttempts ?? '')],
      ['Telemetry llm calls', String(aiResult.telemetry?.llmCallCount ?? '')],
      ['Telemetry total attempts', String(aiResult.telemetry?.totalAttempts ?? '')],
      ['Telemetry chars in', String(aiResult.telemetry?.tokenEstimateCharsIn ?? '')],
      ['Telemetry chars out', String(aiResult.telemetry?.tokenEstimateCharsOut ?? '')],
      ['Telemetry no progress count', String(aiResult.telemetry?.noProgressCount ?? '')],
      ['Telemetry guardrail stop reason', aiResult.telemetry?.guardrailStopReason ?? ''],
      [],
      ['Attempt', 'Phase', 'Status', 'Summary', 'Details', 'Artifact Path', 'Source Hash', 'Started At', 'Finished At'],
      ...(aiResult.attemptHistorySummary ?? []).map((attempt) => [
        String(attempt.attempt),
        attempt.phase,
        attempt.status,
        attempt.summary,
        attempt.details?.join(' | ') ?? '',
        attempt.artifactPath ?? '',
        attempt.sourceHash ?? '',
        attempt.startedAt ?? '',
        attempt.finishedAt ?? '',
      ]),
    ]

    XLSX.utils.book_append_sheet(wb, timetableSheet, 'Thời khóa biểu')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(checkerRows), 'Checker report')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(deterministicRows), 'Validation report')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(diagnosticsRows), 'Diagnostics')
    XLSX.writeFile(wb, 'thoi-khoa-bieu.xlsx')
  }, [aiResult, fixedResultTableSections, resultTableClassColumns, solvedCellMap])

    const activePeriodCount = useMemo(
    () =>
      selectedSpreadsheetDays.reduce(
        (total, day) =>
          total + timetableRows.filter((row) => !deletedPeriods[getCellKey(day.id, row.sessionId, row.period)]).length,
        0,
      ),
    [deletedPeriods, selectedSpreadsheetDays, timetableRows],
  )

  return (
    <main className="w-full overflow-x-hidden bg-[#0A0A0A] font-normal text-white">
      {page === 'select' ? (
        <section className="relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16">
            <div className={navBarClass}>
              <button
                type="button"
                onClick={onBackToLanding}
                className={`${navBackClass} ${!onBackToLanding ? navDisabledClass : ''}`}
                disabled={!onBackToLanding}
              >
                <ArrowLeft size={14} strokeWidth={1.5} />
                Quay lại
              </button>
              <button
                type="button"
                onClick={() => canContinue && setPage('periods')}
                disabled={!canContinue}
                className={`${navNextClass} ${navDisabledClass}`}
              >
                Tiếp tục
                <ChevronRight size={14} strokeWidth={1.5} />
              </button>
            </div>

            <header className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30">
                  <RadioTower size={14} strokeWidth={1.5} />
                  Thiết lập giảng dạy điện tử
                </div>
                <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                  Chọn ngày dạy và buổi dạy
                </h1>
                <p className="mt-4 max-w-2xl text-sm text-white/40">
                  Tích vào các lựa chọn bạn muốn sử dụng. Bỏ tích những mục không cần.
                </p>
              </div>
            </header>

            <div className="flex flex-col gap-3">
              <section className={`${panelClass} p-4`}>
                <div className="mb-4 flex items-center gap-2.5">
                  <span className={iconShellClass}>
                    <CalendarDays size={16} strokeWidth={1.5} />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-white">Ngày dạy trong tuần</h2>
                    <p className="text-xs text-white/40">Từ thứ hai đến chủ nhật</p>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {days.map((day) => (
                    <DayTile
                      key={day.id}
                      selected={selectedDays.includes(day.id)}
                      title={day.label}
                      subtitle={day.short}
                      onClick={() => toggleItem(day.id, setSelectedDays)}
                    />
                  ))}
                </div>
              </section>

              <section className={`${panelClass} p-4`}>
                <div className="mb-4 flex items-center gap-2.5">
                  <span className={iconShellClass}>
                    <Sun size={16} strokeWidth={1.5} />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-white">Chọn buổi học</h2>
                    <p className="text-xs text-white/40">Sáng, chiều, tối</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {sessions.map((session) => (
                    <SessionTile
                      key={session.id}
                      selected={selectedSessions.includes(session.id)}
                      icon={session.icon}
                      title={session.label}
                      onClick={() => toggleItem(session.id, setSelectedSessions)}
                    />
                  ))}
                </div>
              </section>

              <div className={`${panelClass} p-4`}>
                <p className="text-[11px] font-medium uppercase tracking-widest text-[#4DB848]">Đã chọn</p>
                <p className="mt-3 text-sm text-white/70">
                  {selectedDayNames.length ? selectedDayNames.join(', ') : 'Chưa chọn ngày dạy'}
                </p>
                <div className="my-3 h-px bg-white/[0.06]" />
                <p className="text-sm text-white/70">
                  {selectedSessionNames.length ? selectedSessionNames.join(', ') : 'Chưa chọn buổi học'}
                </p>
              </div>
            </div>
        </section>

      ) : page === 'periods' ? (
        <section className="relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16">
          <div className={navBarClass}>
            <button
              type="button"
              onClick={() => setPage('select')}
              className={navBackClass}
            >
              <ArrowLeft size={14} strokeWidth={1.5} />
              Quay lại
            </button>
            <button
              type="button"
              onClick={() => setPage('final')}
              className={navNextClass}
            >
              Tiếp tục
              <ChevronRight size={14} strokeWidth={1.5} />
            </button>
          </div>
          <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30">
                <Hash size={14} strokeWidth={1.5} />
                Thiết lập số tiết tối đa
              </div>
              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Chọn số tiết tối đa
              </h1>
              <p className="mt-4 max-w-2xl text-sm text-white/40">
                Những ngày và buổi bạn đã chọn được giữ lại. Chỉ các buổi đã chọn mới xuất hiện ở đây.
              </p>
            </div>
            <div className={`${panelClass} p-4 text-sm text-white/50 lg:max-w-md`}>
              <p className="font-medium text-white">Ngày giảng dạy</p>
              <p className="mt-2 leading-6">{selectedDayNames.join(', ')}</p>
            </div>
          </header>

          <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_0.55fr]">
            <section className={`${panelClass} p-4`}>
              <div className="mb-4 flex items-center gap-2.5">
                <span className={iconShellClass}>
                  <Hash size={16} strokeWidth={1.5} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-white">Các buổi đã chọn</h2>
                  <p className="text-xs text-white/40">Thiết lập một số tiết tối đa cho mỗi buổi</p>
                </div>
              </div>

              <div className="grid gap-3">
                {selectedSessionData.map((session) => (
                  <PeriodControl
                    key={session.id}
                    session={session}
                    value={periods[session.id] ?? defaultPeriods[session.id]}
                    onChange={updatePeriod}
                  />
                ))}
              </div>
            </section>

            <aside className={`${panelClass} p-4`}>
              <div className="mb-4 flex items-center gap-2.5">
                <span className={iconShellClass}>
                  <Check size={16} strokeWidth={1.5} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-white">Thiết lập của bạn</h2>
                  <p className="text-xs text-white/40">Được lưu từ trang đầu tiên</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className={`${panelMutedClass} p-4`}>
                  <p className="text-[11px] font-medium uppercase tracking-widest text-white/50">Ngày học</p>
                  <p className="mt-2 text-sm text-white/70">{selectedDayNames.join(', ')}</p>
                </div>

                <div className={`${panelMutedClass} p-4`}>
                  <p className="text-[11px] font-medium uppercase tracking-widest text-white/50">Số tiết tối đa</p>
                  <div className="mt-3 space-y-2">
                    {selectedSessionData.map((session) => (
                      <div key={session.id} className="flex items-center justify-between gap-3 text-sm text-white/70">
                        <span>{session.label}</span>
                        <span className="rounded bg-[#4DB848]/10 border border-[#4DB848]/20 px-2 py-0.5 text-xs font-medium text-[#4DB848]">
                          {periods[session.id] ?? defaultPeriods[session.id]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </aside>
          </div>

        </section>
      ) : page === 'final' ? (
        <section className="relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16">
          <div className={navBarClass}>
            <button
              type="button"
              onClick={() => setPage('periods')}
              className={navBackClass}
            >
              <ArrowLeft size={14} strokeWidth={1.5} />
              Quay lại
            </button>
            <button
              type="button"
              onClick={() => activePeriodCount > 0 && setPage('details')}
              disabled={activePeriodCount <= 0}
              className={`${navNextClass} ${navDisabledClass}`}
            >
              Tiếp tục
              <ChevronRight size={14} strokeWidth={1.5} />
            </button>
          </div>
          <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30">
                <CalendarDays size={14} strokeWidth={1.5} />
                Bảng thời khóa biểu mẫu
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Xem trước thời khóa biểu điện tử</h1>
              <p className="mt-3 max-w-3xl text-sm text-white/40">
                Nhấn vào từng ô tiết học để xóa riêng ô đó theo từng ngày. Nhấn lại để khôi phục.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:items-center">
              <div className={`${panelClass} px-4 py-2.5 text-sm text-white/50`}>
                <span className="font-medium text-white">Số tiết đang hoạt động:</span> {activePeriodCount}
              </div>
              <button
                type="button"
                onClick={() => setDeletedPeriods({})}
                className={ghostButtonClass}
              >
                <RotateCcw size={14} strokeWidth={1.5} />
                Khôi phục tất cả
              </button>
            </div>
          </header>

          <div className={`${panelClass} flex-1 overflow-hidden p-3 sm:p-4`}>
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              {selectedSessionData.map((session) => {
                const sessionTotal = selectedSpreadsheetDays.reduce(
                  (total, day) =>
                    total +
                    Array.from({ length: periods[session.id] ?? defaultPeriods[session.id] }, (_, index) => index + 1).filter(
                      (period) => !deletedPeriods[getCellKey(day.id, session.id, period)],
                    ).length,
                  0,
                )

                return (
                  <div key={session.id} className={`${panelMutedClass} p-4`}>
                    <p className="text-[11px] font-medium uppercase tracking-widest text-white/50">{session.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{sessionTotal}</p>
                    <p className="text-xs text-white/30">ô tiết vẫn đang bật</p>
                  </div>
                )
              })}
            </div>

            <div className="h-full overflow-auto rounded-md border border-white/[0.06] bg-[#141414] text-white">
              <table className="min-w-[900px] w-full border-separate border-spacing-0 table-fixed text-left text-sm">
                <thead>
                  <tr>
                      <th className="sticky left-0 top-0 z-20 h-10 w-24 border-b border-r border-white/[0.06] bg-[#141414] px-3 text-[11px] font-semibold uppercase tracking-widest text-white/90">
                        Buổi
                      </th>
                      <th className="sticky left-24 top-0 z-20 h-10 w-16 border-b border-r border-white/[0.06] bg-[#141414] px-2 text-center text-[11px] font-semibold uppercase tracking-widest text-white/90">
                        Tiết
                      </th>
                      {selectedSpreadsheetDays.map((day) => (
                      <th
                        key={day.id}
                        className="sticky top-0 z-10 h-12 border-b border-r border-white/[0.06] bg-[#141414] px-3 text-center text-sm font-semibold text-white"
                      >
                        {day.tableLabel}
                      </th>
                    ))}
                  </tr>
              </thead>
                            <tbody>
                                  {timetableRows.map((row) => (
                      <tr key={row.id} className="h-10">
                        {row.firstInSession ? (
                          <td rowSpan={row.sessionPeriodCount} className="sticky left-0 z-10 w-24 border-b border-r border-white/[0.06] bg-[#141414] px-3 text-center align-middle">
                            <span className="text-xs font-semibold text-white">{row.sessionLabel}</span>
                          </td>
                        ) : null}
                        <td className="sticky left-24 z-10 w-16 border-b border-r border-white/[0.06] bg-[#141414] px-2 text-center align-middle">
                          <span className="text-xs font-semibold text-white">{row.period}</span>
                        </td>
                        {selectedSpreadsheetDays.map((day) => {
                        const cellKey = getCellKey(day.id, row.sessionId, row.period)
                        const isDeleted = deletedPeriods[cellKey]

                          return (
                            <td key={cellKey} className="border-b border-r border-white/[0.04] p-1.5">
                              <button
                                type="button"
                                onClick={() => toggleDeletedPeriod(day.id, row.sessionId, row.period)}
                                className={`group flex h-7 w-full items-center justify-between gap-2 rounded border px-2 text-center text-xs font-medium transition ${
                                    isDeleted
                                      ? 'border-green-500/25 bg-green-500/[0.08] text-green-400 hover:bg-green-500/[0.14] hover:border-green-500/35'
                                      : 'border-white/[0.06] bg-[#141414] text-white/50 hover:border-white/[0.12]'

                                }`}
                                aria-label={`${isDeleted ? 'Khôi phục' : 'Xóa'} ${day.label} ${row.sessionLabel} tiết ${row.period}`}
                              >
                                <span className={isDeleted ? 'mx-auto inline-flex items-center gap-1.5' : 'min-w-0 flex-1'}>
                                  {isDeleted ? (
                                    <>
                                      <RotateCcw size={11} strokeWidth={1.5} />
                                      Restore
                                    </>
                                  ) : (
                                    row.period
                                  )}
                                </span>
                                  {!isDeleted && (
                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center text-red-400/60 group-hover:text-red-400">
                                      <Trash2 size={11} strokeWidth={1.5} />
                                    </span>
                                  )}

                              </button>
                            </td>
                          )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </section>
          ) : page === 'details' ? (
            <section className="relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16">
            <div className={navBarClass}>
              <button
                type="button"
                onClick={() => setPage('final')}
                className={navBackClass}
              >
                <ArrowLeft size={14} strokeWidth={1.5} />
                Quay lại
              </button>
                <button
                  type="button"
                  onClick={() => setPage('subjects')}
                  className={navNextClass}
                >
                  Tiếp tục
                  <ChevronRight size={14} strokeWidth={1.5} />
                </button>
            </div>
            <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30">
                  <User size={14} strokeWidth={1.5} />
                  Danh sách giáo viên
                </div>
                <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                  Nhập tên giáo viên
                </h1>
                <p className="mt-4 max-w-3xl text-sm text-white/40">
                  Trang này chỉ dùng để nhập và quản lý danh sách giáo viên. Nhập tên giáo viên rồi nhấn Import để thêm vào danh sách.
                </p>
              </div>
              <div className={`${panelClass} p-4 text-sm text-white/50 lg:max-w-md`}>
                <p className="font-medium text-white">Tổng giáo viên</p>
                <p className="mt-2 text-3xl font-semibold text-white">{teacherList.length}</p>
              </div>
            </header>

            <div className="grid flex-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <section className={`${panelClass} p-4`}>
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    importTeacher()
                  }}
                >
                  <div className="mb-4 flex items-center gap-2.5">
                    <span className={iconShellClass}>
                      <User size={16} strokeWidth={1.5} />
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold text-white">Nhập giáo viên</h2>
                      <p className="text-xs text-white/40">Thêm từng giáo viên vào danh sách</p>
                    </div>
                  </div>

                  <div className="mb-4 grid grid-cols-2 gap-2">
                    {[
                      { id: 'bulk', label: 'Bulk Update', color: '#6699FF' },
                      { id: 'update', label: 'Update', color: '#FFCC00' },
                    ].map((option) => {
                      const isActive = teacherImportMode === option.id

                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setTeacherImportMode(option.id)}
                          className={`rounded px-3 py-2 text-sm font-medium transition ${isActive ? 'text-black' : 'border border-white/[0.08] text-white/60 hover:text-white'}`}
                          style={{ backgroundColor: isActive ? option.color : 'transparent' }}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-white/50">Nhập tên giáo viên</span>
                    {teacherImportMode === 'bulk' ? (
                      <textarea
                        id="teacher-input"
                        ref={teacherInputRef}
                        value={teacherInput}
                        onChange={(event) => setTeacherInput(event.target.value)}
                        onInput={(event) => setTeacherInput(event.currentTarget.value)}
                        placeholder={`Nguyễn Văn A\nTrần Thị B\nLê Văn C`}
                        rows={6}
                        className={`${inputClass} min-h-36 resize-y`}
                      />
                    ) : (
                      <input
                        id="teacher-input"
                        ref={teacherInputRef}
                        type="text"
                        value={teacherInput}
                        onChange={(event) => setTeacherInput(event.target.value)}
                        onInput={(event) => setTeacherInput(event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            importTeacher()
                          }
                        }}
                        placeholder="Ví dụ: Nguyễn Văn A"
                        className={inputClass}
                      />
                    )}
                  </label>

                  <button
                    type="submit"
                    disabled={!teacherInput.trim()}
                    className={`${primaryButtonClass} ${disabledPrimaryButtonClass} mt-4 w-full`}
                  >
                    <Plus size={14} strokeWidth={1.5} />
                    Import
                  </button>
                </form>
              </section>

              <aside className={`${panelClass} p-4`}>
                <div className="mb-4 flex items-center gap-2.5">
                  <span className={iconShellClass}>
                    <Check size={16} strokeWidth={1.5} />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-white">Teacher list</h2>
                    <p className="text-xs text-white/40">Có thể xóa từng giáo viên bằng nút bên cạnh</p>
                  </div>
                </div>

                <div className="space-y-0">
                    {teacherList.length ? (
                      sortedTeacherList.map((teacher, index) => {
                        const teacherColor = teacherColors[index % teacherColors.length]

                        return (
                          <div
                            key={teacher}
                            className="flex items-center justify-between gap-3 border-b border-white/[0.04] py-3 last:border-b-0"
                          >
                            <div className="flex items-center gap-2.5">
                              <span
                                className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-medium"
                                style={{ backgroundColor: teacherColor.bg, color: teacherColor.text, border: `1px solid ${teacherColor.border}` }}
                              >
                                {index + 1}
                              </span>
                              <span className="text-sm text-white">{teacher}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => deleteTeacher(teacher)}
                              className="p-1 transition hover:bg-white/[0.04]"
                            >
                              <Trash2 size={14} className="text-red-400/60 hover:text-red-400" strokeWidth={1.5} />
                            </button>
                          </div>
                        )
                      })
                    ) : (
                    <div className={`${panelMutedClass} p-4 text-sm text-white/30`}>
                      Chưa có giáo viên nào. Hãy nhập tên giáo viên và nhấn Import.
                    </div>
                  )}
                </div>
              </aside>
            </div>

            </section>
            ) : page === 'subjects' ? (
              <section className="relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16">
                <div className={navBarClass}>
                <button
                  type="button"
                  onClick={() => setPage('details')}
                  className={navBackClass}
                >
                  <ArrowLeft size={14} strokeWidth={1.5} />
                  Quay lại
                </button>
                  <button
                    type="button"
                    onClick={() => setPage('classes')}
                    className={navNextClass}
                  >
                    Tiếp tục
                    <ChevronRight size={14} strokeWidth={1.5} />
                  </button>
              </div>
                <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30">
                      <BookOpen size={14} strokeWidth={1.5} />
                      Danh sách môn học
                    </div>
                  <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                    Nhập tên môn học
                  </h1>
                  <p className="mt-4 max-w-3xl text-sm text-white/40">
                    Trang này dùng để nhập và quản lý danh sách môn học. Nhập tên môn học rồi nhấn Import để thêm vào danh sách.
                  </p>
                </div>
                <div className={`${panelClass} p-4 text-sm text-white/50 lg:max-w-md`}>
                  <p className="font-medium text-white">Tổng môn học</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{subjectList.length}</p>
                </div>
              </header>

              <div className="grid flex-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <section className={`${panelClass} p-4`}>
                  <div className="mb-4 flex items-center gap-2.5">
                    <span className={iconShellClass}>
                      <BookOpen size={16} strokeWidth={1.5} />
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold text-white">Nhập môn học</h2>
                      <p className="text-xs text-white/40">Thêm từng môn học vào danh sách</p>
                    </div>
                  </div>

                  <div className="mb-4 grid grid-cols-2 gap-2">
                    {[
                      { id: 'bulk', label: 'Bulk Update', color: '#6699FF' },
                      { id: 'update', label: 'Update', color: '#FFCC00' },
                    ].map((option) => {
                      const isActive = subjectImportMode === option.id

                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setSubjectImportMode(option.id as 'update' | 'bulk')}
                          className={`rounded px-3 py-2 text-sm font-medium transition ${isActive ? 'text-black' : 'border border-white/[0.08] text-white/60 hover:text-white'}`}
                          style={{ backgroundColor: isActive ? option.color : 'transparent' }}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-white/50">Nhập tên môn học</span>
                    {subjectImportMode === 'bulk' ? (
                      <textarea
                        value={subjectInput}
                        onChange={(event) => setSubjectInput(event.target.value)}
                        placeholder={`Toán\nNgữ văn\nTiếng Anh`}
                        rows={6}
                        className={`${inputClass} min-h-36 resize-y`}
                      />
                    ) : (
                      <input
                        type="text"
                        value={subjectInput}
                        onChange={(event) => setSubjectInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            importSubject()
                          }
                        }}
                        placeholder="Ví dụ: Toán"
                        className={inputClass}
                      />
                    )}
                  </label>

                    <button
                      type="button"
                      onClick={() => importSubject()}
                      disabled={!subjectInput.trim()}
                      className={`${primaryButtonClass} ${disabledPrimaryButtonClass} mt-4 w-full`}
                    >
                      <Plus size={14} strokeWidth={1.5} />
                      Import
                    </button>

                    <div className={`${panelMutedClass} mt-4 p-4`}>
                      <p className="text-xs font-medium text-white/70">Môn học cấp 2</p>
                      <p className="mt-1 text-[11px] leading-5 text-white/30">
                        Bấm vào môn để import nhanh. Môn có viết tắt sẽ được lưu bằng mã viết tắt.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {subjectPresets.map((subject) => {
                          const isAdded = subjectList.includes(subject.value)
                          return (
                          <button
                            key={subject.value}
                            type="button"
                            onClick={() => importSubject(subject.value)}
                            className={`rounded-full border px-3 py-1.5 text-xs transition active:scale-95 active:transition-transform ${
                              isAdded
                                ? 'border-white/[0.04] bg-white/[0.02] text-white/25 cursor-default'
                                : 'border-white/[0.12] bg-white/[0.04] text-white/80 hover:bg-white/[0.08] hover:border-white/[0.18] hover:text-white'
                            }`}
                            title={isAdded ? `Đã thêm: ${subject.value}` : `Import: ${subject.value}`}
                          >
                            <span>{subject.label}</span>
                            {subject.value !== subject.label && (
                              <span className={`ml-1.5 rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                                isAdded
                                  ? 'border-white/[0.06] bg-white/[0.02] text-white/20'
                                  : 'border-[#4DB848]/25 bg-[#4DB848]/10 text-[#4DB848]'
                              }`}>{subject.value}</span>
                            )}
                          </button>
                          )
                        })}
                      </div>
                    </div>
                  </section>


                <aside className={`${panelClass} p-4`}>
                  <div className="mb-4 flex items-center gap-2.5">
                    <span className={iconShellClass}>
                      <Check size={16} strokeWidth={1.5} />
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold text-white">Subject list</h2>
                      <p className="text-xs text-white/40">Có thể xóa từng môn học bằng nút bên cạnh</p>
                    </div>
                  </div>

                  <div className="space-y-0">
                    {subjectList.length ? (
                      sortedSubjectList.map((subject, index) => (
                        <div
                          key={subject}
                          className="flex items-center justify-between gap-3 border-b border-white/[0.04] py-3 last:border-b-0"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.06] bg-[#141414] text-[10px] font-medium text-white/50">
                              {index + 1}
                            </span>
                            <span className="text-sm text-white">{subject}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => deleteSubject(subject)}
                            className="p-1 transition hover:bg-white/[0.04]"
                          >
                            <Trash2 size={14} className="text-red-400/60 hover:text-red-400" strokeWidth={1.5} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className={`${panelMutedClass} p-4 text-sm text-white/30`}>
                        Chưa có môn học nào. Hãy nhập tên môn học và nhấn Import.
                      </div>
                    )}
                  </div>
                </aside>
              </div>

              </section>
              ) : page === 'classes' ? (
                <section className="relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16">
                <div className={navBarClass}>
                  <button
                    type="button"
                    onClick={() => setPage('subjects')}
                    className={navBackClass}
                  >
                    <ArrowLeft size={14} strokeWidth={1.5} />
                    Quay lại
                  </button>
                    <button
                      type="button"
                      onClick={() => setPage('assignments')}
                      className={navNextClass}
                    >
                      Tiếp tục
                      <ChevronRight size={14} strokeWidth={1.5} />
                    </button>
                </div>

                <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30">
                      <Hash size={14} strokeWidth={1.5} />
                      Danh sách lớp học
                    </div>
                    <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                      Nhập lớp học
                    </h1>
                    <p className="mt-4 max-w-3xl text-sm text-white/40">
                      Nhập từng lớp một. Ví dụ nhập 6A rồi bấm Enter hoặc Import, sau đó nhập tiếp 6B.
                    </p>
                  </div>
                  <div className={`${panelClass} p-4 text-sm text-white/50 lg:max-w-md`}>
                    <p className="font-medium text-white">Tổng lớp học</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{classList.length}</p>
                  </div>
                </header>

                <div className="grid flex-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                  <section className={`${panelClass} p-4`}>
                    <div className="mb-4 flex items-center gap-2.5">
                      <span className={iconShellClass}>
                        <Hash size={16} strokeWidth={1.5} />
                      </span>
                        <div>
                          <h2 className="text-sm font-semibold text-white">Nhập lớp học</h2>
                          <p className="text-xs text-white/40">Nhập từng lớp một, ví dụ 6A rồi Enter</p>
                        </div>
                      </div>

                      <label className="block">
                        <span className="mb-2 block text-xs font-medium text-white/50">Nhập tên lớp học</span>
                        <input
                          type="text"
                          value={classInput}
                          onChange={(event) => setClassInput(event.target.value.toUpperCase())}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              importClass()
                            }
                          }}
                          placeholder="Ví dụ: 6A"
                          className={inputClass}
                        />
                      </label>

                        <div className={`${panelMutedClass} mt-3 p-3 text-xs text-white/30`}>
                          Nhập một lớp duy nhất mỗi lần hoặc bấm nhanh các lớp mẫu bên dưới. Sau khi thêm, ô nhập sẽ tự xóa để bạn nhập lớp tiếp theo.
                        </div>

                          <div className={`${panelMutedClass} mt-3 p-4`}>
                            <p className="mb-3 text-xs font-medium text-white/70">Thêm nhanh lớp mẫu</p>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {classPresetGroups.map((presetGroup) => {
                                const allAdded = presetGroup.classes.every((className) => classList.includes(className))

                                return (
                                  <button
                                    key={presetGroup.label}
                                    type="button"
                                    onClick={() => addClassPresetGroup(presetGroup.classes)}
                                    disabled={allAdded}
                                    className={`rounded-md border px-3 py-2 text-xs font-medium transition active:scale-95 active:transition-transform ${
                                      allAdded
                                        ? 'border-white/[0.04] bg-white/[0.02] text-white/20 cursor-not-allowed'
                                        : 'border-white/[0.12] bg-white/[0.04] text-white/80 hover:bg-white/[0.08] hover:border-white/[0.18] hover:text-white'
                                    }`}
                                  >
                                    {allAdded ? `${presetGroup.label} ✓` : presetGroup.label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                        <button
                          type="button"
                          onClick={importClass}
                          disabled={!classInput.trim()}
                          className={`${primaryButtonClass} ${disabledPrimaryButtonClass} mt-4 w-full`}
                        >
                          <Plus size={14} strokeWidth={1.5} />
                          Import
                        </button>

                  </section>

                  <aside className={`${panelClass} p-4`}>
                    <div className="mb-4 flex items-center gap-2.5">
                      <span className={iconShellClass}>
                        <Check size={16} strokeWidth={1.5} />
                      </span>
                      <div>
                        <h2 className="text-sm font-semibold text-white">Class list</h2>
                        <p className="text-xs text-white/40">Có thể xóa từng lớp bằng nút bên cạnh</p>
                      </div>
                    </div>

                    <div className="grid gap-0 sm:grid-cols-2">
                      {classList.length ? (
                        sortedClassList.map((className, index) => (
                          <div
                            key={className}
                            className="flex items-center justify-between gap-3 border-b border-white/[0.04] py-3 px-1"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.06] bg-[#141414] text-[10px] font-medium text-white/50">
                                {index + 1}
                              </span>
                              <span className="text-sm text-white">{className}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => deleteClass(className)}
                              className="p-1 transition hover:bg-white/[0.04]"
                            >
                              <Trash2 size={14} className="text-red-400/60 hover:text-red-400" strokeWidth={1.5} />
                            </button>
                          </div>
                        ))
                      ) : (
                          <div className={`${panelMutedClass} p-4 text-sm text-white/30 sm:col-span-2`}>
                            Chưa có lớp học nào. Nhập 6A rồi nhấn Enter hoặc Import để thêm lớp đầu tiên.
                          </div>
                      )}
                    </div>
                  </aside>
                </div>

                </section>
                ) : page === 'assignments' ? (
                  <section className="relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16">
                  <div className={navBarClass}>
                    <button type="button" onClick={() => setPage('classes')} className={navBackClass}>
                      <ArrowLeft size={14} strokeWidth={1.5} />
                      Quay lại
                    </button>
                        <button type="button" onClick={() => setPage('constraints')} className={navNextClass}>
                          Tiếp tục
                          <ChevronRight size={14} strokeWidth={1.5} />
                        </button>
                  </div>
                  <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30">
                        <BookOpen size={14} strokeWidth={1.5} />
                        Phân công chuyên môn
                      </div>
                      <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                        Gán giáo viên, môn học và lớp
                      </h1>
                      <p className="mt-4 max-w-3xl text-sm text-white/40">
                        Chọn từ danh sách đã nhập ở các trang trước để tạo từng phân công chuyên môn.
                      </p>
                    </div>
                    <div className={`${panelClass} p-4 text-sm text-white/50 lg:max-w-md`}>
                      <p className="font-medium text-white">Tổng phân công</p>
                      <p className="mt-2 text-3xl font-semibold text-white">{assignmentList.length}</p>
                    </div>
                  </header>

                    <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(300px,0.55fr)_minmax(0,1.45fr)]">
                      <section className={`${panelClass} p-4`}>
                      <div className="mb-4 flex items-center gap-2.5">
                        <span className={iconShellClass}>
                          <Plus size={16} strokeWidth={1.5} />
                        </span>
                          <div>
                            <h2 className="text-sm font-semibold text-white">Tạo phân công</h2>
                            <p className="text-xs text-white/40">Dùng giáo viên, môn học, lớp đã nhập và số tiết/tuần</p>
                          </div>
                      </div>

                        <div className="mb-4 grid grid-cols-2 gap-2">
                          {[
                            { id: 'bulk', label: 'Bulk Update', color: '#6699FF' },
                            { id: 'update', label: 'Update', color: '#FFCC00' },
                          ].map((option) => {
                            const isActive = assignmentImportMode === option.id

                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => setAssignmentImportMode(option.id)}
                                className={`rounded px-3 py-2 text-sm font-medium transition ${isActive ? 'text-black' : 'border border-white/[0.08] text-white/60 hover:text-white'}`}
                                style={{ backgroundColor: isActive ? option.color : 'transparent' }}
                              >
                                {option.label}
                              </button>
                            )
                          })}
                        </div>

                        {assignmentImportMode === 'bulk' ? (
                          <div>
                            <label className="block">
                              <span className="mb-2 block text-xs font-medium text-white/50">Teacher-Subject-Class-Number</span>
                              <textarea
                                value={bulkAssignmentText}
                                onChange={(event) => {
                                  setBulkAssignmentText(event.target.value)
                                  setBulkAssignmentErrors([])
                                }}
                                placeholder="Huy-Toán-8A-4"
                                rows={7}
                                className={`${inputClass} min-h-40 resize-y ${bulkAssignmentErrors.length ? 'border-red-400/60 decoration-red-400' : ''}`}
                              />
                            </label>

                            {bulkAssignmentErrors.length ? (
                              <div className="mt-3 space-y-2 rounded border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-200">
                                <p>Sai format. Đúng: Teacher-Subject-Class-Number.</p>
                                {bulkAssignmentErrors.map((error) => (
                                  <p key={error.line}>
                                    Dòng {error.line}: {renderBulkAssignmentErrorLine(error)}
                                  </p>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="grid gap-3">
                            <SelectField
                              icon={User}
                              label="Giáo viên"
                              placeholder="Chọn giáo viên đã nhập"
                              value={assignmentDraft.teacher}
                              options={sortedTeacherList}
                              onChange={(value) => setAssignmentDraft((current) => ({ ...current, teacher: value }))}
                            />
                            <SelectField
                              icon={BookOpen}
                              label="Môn học"
                              placeholder="Chọn môn học đã nhập"
                              value={assignmentDraft.subject}
                              options={sortedSubjectList}
                              onChange={(value) => setAssignmentDraft((current) => ({ ...current, subject: value }))}
                            />
                            <SelectField
                              icon={Hash}
                              label="Lớp"
                              placeholder="Chọn lớp đã nhập"
                              value={assignmentDraft.className}
                              options={sortedClassList}
                              onChange={(value) => setAssignmentDraft((current) => ({ ...current, className: value }))}
                            />
                            <label className={`${panelClass} block p-4`}>
                              <div className="mb-3 flex items-center gap-2.5">
                                <span className={iconShellClass}>
                                  <CalendarDays size={16} strokeWidth={1.5} />
                                </span>
                                <span className="text-sm font-medium text-white">Số tiết cần dạy trong tuần</span>
                              </div>
                              <input
                                type="number"
                                min="1"
                                max="60"
                                value={assignmentDraft.weeklyPeriods}
                                onChange={(event) => setAssignmentDraft((current) => ({ ...current, weeklyPeriods: event.target.value }))}
                                placeholder="Ví dụ: 6"
                                className={inputClass}
                              />
                            </label>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={assignmentImportMode === 'bulk' ? importBulkAssignments : importAssignment}
                          disabled={assignmentImportMode === 'bulk' ? !bulkAssignmentText.trim() : !assignmentDraft.teacher || !assignmentDraft.subject || !assignmentDraft.className || !assignmentDraft.weeklyPeriods.trim()}
                          className={`${primaryButtonClass} ${disabledPrimaryButtonClass} mt-4 w-full`}
                        >
                          <Plus size={14} strokeWidth={1.5} />
                          {assignmentImportMode === 'bulk' ? 'Import' : 'Thêm phân công'}
                        </button>
                    </section>

                    <aside className={`${panelClass} p-4`}>
                      <div className="mb-4 flex items-center gap-2.5">
                        <span className={iconShellClass}>
                          <Check size={16} strokeWidth={1.5} />
                        </span>
                        <div>
                          <h2 className="text-sm font-semibold text-white">Danh sách phân công</h2>
                          <p className="text-xs text-white/40">Mỗi dòng là một giáo viên - môn - lớp</p>
                        </div>
                      </div>

                      <div className="space-y-0">
                          {assignmentList.length ? (
                            sortedAssignmentList.map((assignment, index) => {
                              const teacherColor = teacherColorMap[assignment.teacher] ?? teacherColors[0]

                              return (
                                  <div
                                    key={assignment.key}
                                    className="border-b border-white/[0.04] py-3 last:border-b-0"
                                  >
                                    <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="text-[11px] font-medium uppercase tracking-widest" style={{ color: teacherColor.text }}>Phân công {index + 1}</p>
                                          <span
                                            className="rounded-full border px-2 py-0.5 text-[11px] font-medium"
                                            style={{ borderColor: teacherColor.text, color: teacherColor.text, backgroundColor: 'rgba(0,0,0,0.3)' }}
                                          >
                                            {assignment.teacher}
                                          </span>
                                        </div>
                                        <div className="mt-2 grid gap-2 sm:grid-cols-4">
                                          <div className="rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5">
                                            <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Giáo viên</p>
                                            <p className="mt-0.5 truncate text-xs text-white/60">{assignment.teacher}</p>
                                          </div>
                                          <div className="rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5">
                                            <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Môn học</p>
                                            <p className="mt-0.5 truncate text-xs text-white/60">{assignment.subject}</p>
                                          </div>
                                          <div className="rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5">
                                            <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Lớp</p>
                                            <p className="mt-0.5 truncate text-xs text-white/60">{assignment.className}</p>
                                          </div>
                                          <div className="rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5">
                                            <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Số tiết/tuần</p>
                                            <p className="mt-0.5 truncate text-xs text-white/60">{assignment.weeklyPeriods}</p>
                                          </div>
                                        </div>
                                      </div>
                                      <button type="button" onClick={() => deleteAssignment(assignment.key)} className="mt-2 p-1 transition hover:bg-white/[0.04] xl:mt-0">
                                        <Trash2 size={14} className="text-red-400/60 hover:text-red-400" strokeWidth={1.5} />
                                      </button>
                                    </div>
                                  </div>
                              )
                            })

                        ) : (
                          <div className={`${panelMutedClass} p-4 text-sm text-white/30`}>
                            Chưa có phân công nào. Hãy chọn giáo viên, môn học, lớp rồi bấm Thêm phân công.
                          </div>
                        )}
                      </div>
                    </aside>
                  </div>

                </section>
              ) : page === 'constraints' ? (
                <section className="relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16">
                  <div className={navBarClass}>
                    <button type="button" onClick={() => setPage('assignments')} className={navBackClass}>
                      <ArrowLeft size={14} strokeWidth={1.5} />
                      Quay lại
                    </button>
                    <button type="button" onClick={() => setPage('summary')} className={navNextClass}>
                      Tiếp tục
                      <ChevronRight size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                  <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30">
                        <ClipboardList size={14} strokeWidth={1.5} />
                        Ràng buộc xếp lịch
                      </div>
                      <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                        Nhập constraints cho thời khóa biểu
                      </h1>
                      <p className="mt-4 max-w-3xl text-sm text-white/40">
                        Chọn loại ràng buộc, nhập mỗi ràng buộc một dòng, rồi bấm Import để thêm tất cả vào bảng.
                      </p>
                    </div>
                    <div className={`${panelClass} p-4 text-sm text-white/50 lg:max-w-md`}>
                      <p className="font-medium text-white">Tổng ràng buộc</p>
                      <p className="mt-2 text-3xl font-semibold text-white">{constraintList.length}</p>
                    </div>
                  </header>

                  <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(330px,0.7fr)_minmax(0,1.3fr)]">
                    <section className={`${panelClass} p-4`}>
                      <div className="mb-4 flex items-center gap-2.5">
                        <span className={iconShellClass}>
                          <Plus size={16} strokeWidth={1.5} />
                        </span>
                        <div>
                          <h2 className="text-sm font-semibold text-white">Tạo ràng buộc</h2>
                          <p className="text-xs text-white/40">Vàng là bắt buộc, xám là nên có</p>
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        {constraintTypeList.map((constraintType) => {
                          const selected = constraintDraft.type === constraintType.id

                          return (
                            <button
                              key={constraintType.id}
                              type="button"
                              onClick={() => setConstraintDraft((current) => ({ ...current, type: constraintType.id }))}
                              className={`rounded-md border p-3 text-left transition ${
                                selected
                                  ? constraintType.boxClass
                                  : 'border-white/[0.06] bg-[#141414] text-white hover:border-white/[0.12] hover:bg-white/[0.04]'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <Circle className={selected ? constraintType.iconClass : 'text-white/30'} size={16} strokeWidth={1.5} />
                                <span className="text-sm font-medium">{constraintType.label}</span>
                              </div>
                              <p className={`mt-2 text-xs leading-4 ${selected ? 'text-white/70' : 'text-white/30'}`}>{constraintType.description}</p>
                            </button>
                          )
                        })}
                      </div>

                      <label className={`${panelClass} mt-4 block p-4`}>
                        <div className="mb-3 flex items-center gap-2.5">
                          <span className={iconShellClass}>
                            <ClipboardList size={16} strokeWidth={1.5} />
                          </span>
                          <span className="text-sm font-medium text-white">Nội dung ràng buộc</span>
                        </div>
                          <textarea
                            value={constraintDraft.text}
                            onChange={(event) => setConstraintDraft((current) => ({ ...current, text: event.target.value }))}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter' || event.shiftKey) return
                              event.preventDefault()
                              importConstraint()
                            }}
                            placeholder={"Ví dụ:\nSơn không dạy thứ 2\nHương không dạy tiết 1\n(mỗi dòng là một ràng buộc)"}
                            rows={5}
                            className="w-full resize-none rounded-md border border-white/[0.08] bg-[#0a0a0a] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                          />
                      </label>

                      {constraintDraft.type === 'preferred' && (
                        <div className="mt-3 flex items-center gap-2">
                          <span className="text-xs text-white/40">Độ ưu tiên:</span>
                          {([['Thấp', 3], ['TB', 5], ['Cao', 8]] as const).map(([label, val]) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setConstraintDraft((c) => ({ ...c, weight: val }))}
                              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                                constraintDraft.weight === val
                                  ? 'bg-white/10 text-white'
                                  : 'text-white/40 hover:text-white/70'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                          <span className="ml-1 text-xs text-white/25">{constraintDraft.weight}/10</span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={importConstraint}
                        disabled={!constraintDraft.text.trim()}
                        className={`${primaryButtonClass} ${disabledPrimaryButtonClass} mt-4 w-full`}
                      >
                        <Plus size={14} strokeWidth={1.5} />
                        Import
                      </button>
                    </section>

                    <aside className={`${panelClass} p-4`}>
                      <div className="mb-4 flex items-center gap-2.5">
                        <span className={iconShellClass}>
                          <Check size={16} strokeWidth={1.5} />
                        </span>
                        <div>
                          <h2 className="text-sm font-semibold text-white">Bảng constraints</h2>
                          <p className="text-xs text-white/40">Màu vàng hiển thị Bắt buộc, màu xám hiển thị Nên có</p>
                        </div>
                      </div>

                      <div className="space-y-0">
                          {constraintList.length ? (
                            sortedConstraintList.map((constraint) => {
                              const constraintType = constraintTypes[constraint.type] ?? constraintTypes.required

                              return (
                                  <div key={constraint.id} className={`rounded-md border p-3 ${constraintType.boxClass}`}>

                                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${constraintType.badgeClass}`}>
                                      <Circle className={constraintType.iconClass} size={10} fill="currentColor" strokeWidth={0} />
                                      {constraintType.label}
                                    </span>
                                    {constraint.type === 'preferred' && constraint.weight != null && (
                                      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/40">
                                        w={constraint.weight}
                                      </span>
                                    )}
                                  </div>
                                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                  <p className="min-w-0 flex-1 rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5 text-sm text-white/60">
                                    {constraint.text}
                                  </p>
                                    <button type="button" onClick={() => deleteConstraint(constraint.id)} className="p-1 transition hover:bg-white/[0.04]">
                                      <Trash2 size={14} className="text-red-400/60 hover:text-red-400" strokeWidth={1.5} />
                                    </button>
                                </div>
                              </div>
                            )
                          })
                        ) : (
                          <div className={`${panelMutedClass} p-4 text-sm text-white/30`}>
                            Chưa có ràng buộc nào. Chọn loại, nhập mỗi ràng buộc một dòng rồi bấm Import.
                          </div>
                        )}
                      </div>
                    </aside>
                  </div>

                </section>
              ) : (
                <section className="relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16">
                  <div className={navBarClass}>
                    <button type="button" onClick={() => setPage('constraints')} className={navBackClass}>
                      <ArrowLeft size={14} strokeWidth={1.5} />
                      Quay lại
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGenerate()}
                      disabled={aiLoading || !lowprizoApiKey.trim() || activePeriodCount <= 0}
                      className={`${navNextClass} disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {aiLoading ? (
                        <>
                          <Loader2 size={14} className="animate-spin" strokeWidth={1.5} />
                          Đang xếp lịch...
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} strokeWidth={1.5} />
                          Xếp lịch
                        </>
                      )}
                    </button>
                  </div>
                  <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30">
                        <ClipboardList size={14} strokeWidth={1.5} />
                        Tổng hợp thông tin
                      </div>
                      <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                        Xem lại toàn bộ thiết lập
                      </h1>
                        <p className="mt-4 max-w-3xl text-sm text-white/40">
                          Trang cuối tổng hợp bảng thời khóa biểu theo ngày học đã chọn, phân công chuyên môn và constraints xếp lịch.
                        </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3 lg:max-w-2xl">
                      <div className={`${panelClass} p-4 text-sm text-white/50`}>
                        <p className="font-medium text-white">Số ngày học</p>
                        <p className="mt-2 text-3xl font-semibold text-white">{selectedSpreadsheetDays.length}</p>
                      </div>
                      <div className={`${panelClass} p-4 text-sm text-white/50`}>
                        <p className="font-medium text-white">Phân công</p>
                        <p className="mt-2 text-3xl font-semibold text-white">{assignmentList.length}</p>
                      </div>
                      <div className={`${panelClass} p-4 text-sm text-white/50`}>
                        <p className="font-medium text-white">Ràng buộc</p>
                        <p className="mt-2 text-3xl font-semibold text-white">{constraintList.length}</p>
                      </div>
                    </div>
                  </header>

                  <div className="grid flex-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                    <div className="space-y-4">
                      <section className={`${panelClass} overflow-hidden p-4`}>
                      <div className="mb-4 flex items-center gap-2.5">
                        <span className={iconShellClass}>
                          <CalendarDays size={16} strokeWidth={1.5} />
                        </span>
                        <div>
                          <h2 className="text-sm font-semibold text-white">Bảng thời khóa biểu mẫu</h2>
                          <p className="text-xs text-white/40">Chỉ hiển thị những ô tiết đã chọn ở trang chỉnh thời khóa biểu.</p>
                        </div>
                      </div>

                      <div className="mb-4 rounded-md border border-dashed border-white/[0.06] bg-[#0a0a0a] px-4 py-3 text-sm text-white/45">
                        AI sẽ xử lý phần xếp lịch trong nền và chỉ trả ra kết quả cuối cùng ở bảng bên dưới.
                      </div>

                      <label className="mb-4 block rounded-md border border-white/[0.06] bg-[#0a0a0a] p-4">
                        <span className="mb-2 block text-xs font-medium text-white/50">Lowprizo API key</span>
                        <input
                          type="password"
                          value={lowprizoApiKey}
                          onChange={(event) => setLowprizoApiKey(event.target.value)}
                          placeholder="lpr_..."
                          autoComplete="off"
                          className={inputClass}
                        />
                        <span className="mt-2 block text-xs text-white/35">Key này dùng để gọi api.lowprizo.com và được lưu trên máy này.</span>
                      </label>

                      {aiLoading && (
                        <div className="mb-4 rounded-md border border-white/[0.08] bg-[#0a0a0a] p-4">
                          {/* Header with timer */}
                          <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm font-medium text-white/70">
                              <Loader2 size={14} className="animate-spin text-blue-400" strokeWidth={2} />
                              <span>Coding Agent đang hoạt động</span>
                            </div>
                            <span className="text-xs tabular-nums text-white/30">
                              {Math.floor(agentElapsed / 60)}:{String(agentElapsed % 60).padStart(2, '0')}
                            </span>
                          </div>

                          {/* Step indicators */}
                          <div className="mb-3 flex items-center gap-1">
                            {(['thinking', 'coding', 'running', 'checking', 'fixing'] as const).map((step) => {
                              const labels: Record<string, string> = { thinking: 'Suy nghĩ', coding: 'Viết code', running: 'Chạy thử', checking: 'Kiểm tra', fixing: 'Sửa lỗi' }
                              const isActive = agentStep === step
                              const isPast = ['thinking', 'coding', 'running', 'checking', 'fixing'].indexOf(agentStep) > ['thinking', 'coding', 'running', 'checking', 'fixing'].indexOf(step)
                              return (
                                <div key={step} className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-all ${isActive ? 'bg-blue-500/20 text-blue-400' : isPast ? 'bg-white/[0.04] text-white/30' : 'bg-white/[0.02] text-white/15'}`}>
                                  {isPast ? <Check size={9} strokeWidth={2.5} /> : isActive ? <Circle size={7} className="animate-pulse fill-current" /> : <Circle size={7} />}
                                  <span>{labels[step]}</span>
                                </div>
                              )
                            })}
                          </div>

                          {/* Progress bar */}
                          <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                            <div
                              className="h-full rounded-full bg-blue-500/60 transition-all duration-500"
                              style={{ width: `${agentIteration > 0 ? Math.min((agentIteration / agentMaxIterations) * 100, 100) : 5}%` }}
                            />
                          </div>

                          {/* Status message */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-white/40">{agentStatus || 'Đang khởi tạo...'}</span>
                            {agentIteration > 0 && (
                              <span className="text-[10px] text-white/25">Lần {agentIteration}/{agentMaxIterations}</span>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="mb-4 flex items-center gap-2.5">
                        <span className={iconShellClass}>
                          <Sparkles size={16} strokeWidth={1.5} />
                        </span>
                        <div>
                          <h2 className="text-sm font-semibold text-white">Thời khóa biểu đã xếp</h2>
                          <p className="text-xs text-white/40">Kết quả cuối cùng theo giáo viên và môn học</p>
                        </div>
                      </div>

                      {aiResult && !aiLoading && (
                        <div className="mb-4 space-y-4">
                          {aiResult.telemetry && (
                            <section className={`${panelClass} p-4`}>
                              <div className="mb-4 flex items-start justify-between gap-3">
                                <div>
                                  <h3 className="text-sm font-semibold text-white">Telemetry & orchestration</h3>
                                  <p className="text-xs text-white/40">Tổng quan tiến trình solver, checker và guardrail.</p>
                                </div>
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${getVerdictBadge(aiResult.verdict).className}`}>
                                  {getVerdictBadge(aiResult.verdict).label}
                                </span>
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                <MetricCard label="Status" value={aiResult.status} />
                                <MetricCard label="Verdict" value={aiResult.verdict} />
                                <MetricCard label="Duration" value={formatDuration(aiResult.telemetry.totalDurationMs)} />
                                <MetricCard label="Guardrail" value={aiResult.telemetry.guardrailStopReason ?? '—'} />
                                <MetricCard label="Compile attempts" value={formatNullableNumber(aiResult.telemetry.compileAttempts)} />
                                <MetricCard label="Repair attempts" value={formatNullableNumber(aiResult.telemetry.repairAttempts)} />
                                <MetricCard label="Solver attempts" value={formatNullableNumber(aiResult.telemetry.solverAttempts)} />
                                <MetricCard label="LLM calls" value={formatNullableNumber(aiResult.telemetry.llmCallCount)} />
                                <MetricCard label="Chars in" value={formatNullableNumber(aiResult.telemetry.tokenEstimateCharsIn)} />
                                <MetricCard label="Chars out" value={formatNullableNumber(aiResult.telemetry.tokenEstimateCharsOut)} />
                                <MetricCard label="Loop attempts" value={formatNullableNumber(aiResult.telemetry.totalAttempts)} />
                                <MetricCard label="No-progress count" value={formatNullableNumber(aiResult.telemetry.noProgressCount)} />
                              </div>
                            </section>
                          )}

                          {(aiResult.artifactSummary || aiResult.solverStats) && (
                            <section className={`${panelClass} p-4`}>
                              <div className="mb-4 flex items-center gap-2.5">
                                <span className={iconShellClass}>
                                  <Hash size={16} strokeWidth={1.5} className="text-sky-300" />
                                </span>
                                <div>
                                  <h3 className="text-sm font-semibold text-white">Artifact & solver runtime</h3>
                                  <p className="text-xs text-white/40">Thông tin artifact Python và thống kê solve lần cuối.</p>
                                </div>
                              </div>
                              <div className="grid gap-2 lg:grid-cols-2">
                                <div className={`${panelMutedClass} space-y-2 p-3`}>
                                  <p className="text-[10px] uppercase tracking-widest text-white/35">Artifact summary</p>
                                  <p className="text-sm text-white/70">{aiResult.artifactSummary?.summary ?? 'Không có artifact summary.'}</p>
                                  <div className="space-y-1 text-xs text-white/45">
                                    <p><span className="text-white/30">Path:</span> {aiResult.artifactSummary?.path ?? '—'}</p>
                                    <p><span className="text-white/30">Entrypoint:</span> {aiResult.artifactSummary?.entrypoint ?? '—'}</p>
                                    <p><span className="text-white/30">Source hash:</span> {aiResult.artifactSummary?.sourceHash ?? '—'}</p>
                                  </div>
                                  <div>
                                    <p className="mb-1 text-[10px] uppercase tracking-widest text-white/35">Assumptions</p>
                                    {renderList(aiResult.artifactSummary?.assumptions, 'Không có assumptions')}
                                  </div>
                                </div>
                                <div className={`${panelMutedClass} p-3`}>
                                  <p className="mb-2 text-[10px] uppercase tracking-widest text-white/35">Solver stats</p>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <MetricCard label="Wall time (s)" value={formatNullableNumber(aiResult.solverStats?.wallTimeSeconds)} />
                                    <MetricCard label="Objective" value={formatNullableNumber(aiResult.solverStats?.objectiveValue)} />
                                    <MetricCard label="Best bound" value={formatNullableNumber(aiResult.solverStats?.bestBound)} />
                                    <MetricCard label="Conflicts" value={formatNullableNumber(aiResult.solverStats?.numConflicts)} />
                                    <MetricCard label="Branches" value={formatNullableNumber(aiResult.solverStats?.numBranches)} />
                                    <MetricCard label="Request ID" value={aiResult.requestId ?? '—'} />
                                  </div>
                                </div>
                              </div>
                            </section>
                          )}

                          {aiResult.deterministicReport && (
                            <section className={`${panelClass} p-4`}>
                              <div className="mb-4 flex items-center justify-between gap-3">
                                <div>
                                  <h3 className="text-sm font-semibold text-white">Deterministic validation</h3>
                                  <p className="text-xs text-white/40">Layer kiểm tra base/hard/soft constraints sau solver run.</p>
                                </div>
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${aiResult.deterministicReport.valid ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-red-400/30 bg-red-400/10 text-red-300'}`}>
                                  {aiResult.deterministicReport.valid ? 'Valid' : 'Invalid'}
                                </span>
                              </div>
                              <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                <MetricCard label="Base constraints" value={aiResult.deterministicReport.baseConstraintPass ? 'Pass' : 'Fail'} />
                                <MetricCard label="Hard constraints" value={aiResult.deterministicReport.hardConstraintPass ? 'Pass' : 'Fail'} />
                                <MetricCard label="Soft score" value={formatNullableNumber(aiResult.deterministicReport.softConstraintScore)} />
                                <MetricCard label="Unchecked" value={formatNullableNumber(aiResult.deterministicReport.uncheckedConstraintIds.length)} />
                              </div>
                              <p className="mb-3 text-sm text-white/65">{aiResult.deterministicReport.summary}</p>
                              <div className="space-y-2">
                                {aiResult.deterministicReport.checks.map((check) => (
                                  <div key={`det-${check.constraintId}`} className="rounded-md border border-white/[0.06] bg-[#141414] p-3">
                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getCheckSeverityBadge(check.severity)}`}>{check.severity}</span>
                                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getCheckStatusBadge(check.passed)}`}>{check.passed ? 'Pass' : 'Fail'}</span>
                                      <span className="text-xs text-white/35">{check.constraintId}</span>
                                    </div>
                                    <p className="text-sm text-white/75">{check.original}</p>
                                    <p className="mt-1 text-xs text-white/45">{check.reason}</p>
                                    {check.suggestion ? <p className="mt-1 text-xs text-sky-300/70">Gợi ý: {check.suggestion}</p> : null}
                                  </div>
                                ))}
                              </div>
                              {aiResult.deterministicReport.uncheckedConstraintIds.length > 0 ? (
                                <div className="mt-3 rounded-md border border-amber-400/15 bg-amber-400/[0.04] p-3 text-xs text-amber-200/80">
                                  Chưa kiểm tra được: {aiResult.deterministicReport.uncheckedConstraintIds.join(', ')}
                                </div>
                              ) : null}
                            </section>
                          )}

                          {aiResult.checkerReport && (
                            <section className={`${panelClass} p-4`}>
                              <div className="mb-4 flex items-center justify-between gap-3">
                                <div>
                                  <h3 className="text-sm font-semibold text-white">Checker report</h3>
                                  <p className="text-xs text-white/40">Kết luận cuối cùng từ lớp checker sau deterministic validation.</p>
                                </div>
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${getVerdictBadge(aiResult.checkerReport.verdict === 'accept' ? 'accept' : aiResult.checkerReport.verdict === 'infeasible' ? 'infeasible' : aiResult.checkerReport.verdict === 'retry' ? 'retry' : 'error').className}`}>
                                  {aiResult.checkerReport.verdict}
                                </span>
                              </div>
                              <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                <MetricCard label="Base constraints" value={aiResult.checkerReport.baseConstraintPass ? 'Pass' : 'Fail'} />
                                <MetricCard label="Hard constraints" value={aiResult.checkerReport.hardConstraintPass ? 'Pass' : 'Fail'} />
                                <MetricCard label="Soft score" value={formatNullableNumber(aiResult.checkerReport.softConstraintScore)} />
                                <MetricCard label="Violations" value={formatNullableNumber(aiResult.checkerReport.violations.length)} />
                              </div>
                              <p className="mb-3 text-sm text-white/65">{aiResult.checkerReport.summary}</p>
                              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                                <div className="space-y-2">
                                  {aiResult.checkerReport.violations.map((check) => (
                                    <div key={`checker-${check.constraintId}`} className="rounded-md border border-white/[0.06] bg-[#141414] p-3">
                                      <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getCheckSeverityBadge(check.severity)}`}>{check.severity}</span>
                                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getCheckStatusBadge(check.passed)}`}>{check.passed ? 'Pass' : 'Fail'}</span>
                                        <span className="text-xs text-white/35">{check.constraintId}</span>
                                      </div>
                                      <p className="text-sm text-white/75">{check.original}</p>
                                      <p className="mt-1 text-xs text-white/45">{check.reason}</p>
                                      {check.suggestion ? <p className="mt-1 text-xs text-sky-300/70">Gợi ý: {check.suggestion}</p> : null}
                                    </div>
                                  ))}
                                </div>
                                <div className={`${panelMutedClass} p-3`}>
                                  <p className="mb-2 text-[10px] uppercase tracking-widest text-white/35">Retry instructions</p>
                                  {renderList(aiResult.checkerReport.retryInstructions, 'Checker không yêu cầu retry')}
                                </div>
                              </div>
                            </section>
                          )}

                          {(aiResult.attemptHistorySummary?.length ?? 0) > 0 && (
                            <section className={`${panelClass} p-4`}>
                              <div className="mb-4 flex items-center gap-2.5">
                                <span className={iconShellClass}>
                                  <ClipboardList size={16} strokeWidth={1.5} className="text-violet-300" />
                                </span>
                                <div>
                                  <h3 className="text-sm font-semibold text-white">Attempt history</h3>
                                  <p className="text-xs text-white/40">Dấu vết coder/checker/validation cho từng vòng lặp.</p>
                                </div>
                              </div>
                              <div className="space-y-2">
                                {aiResult.attemptHistorySummary?.map((attempt, index) => (
                                  <div key={`${attempt.phase}-${attempt.attempt}-${index}`} className="rounded-md border border-white/[0.06] bg-[#141414] p-3">
                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/70">Attempt {attempt.attempt}</span>
                                      <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-2 py-0.5 text-[10px] font-medium text-violet-300">{attempt.phase}</span>
                                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${attempt.status === 'success' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : attempt.status === 'retry' ? 'border-amber-400/25 bg-amber-400/10 text-amber-300' : attempt.status === 'failed' ? 'border-red-400/25 bg-red-400/10 text-red-300' : 'border-white/15 bg-white/[0.04] text-white/70'}`}>{attempt.status}</span>
                                    </div>
                                    <p className="text-sm text-white/75">{attempt.summary}</p>
                                    {attempt.details?.length ? <div className="mt-2">{renderList(attempt.details)}</div> : null}
                                    <div className="mt-2 grid gap-1 text-xs text-white/35 sm:grid-cols-2">
                                      <p>Artifact: {attempt.artifactPath ?? '—'}</p>
                                      <p>Source hash: {attempt.sourceHash ?? '—'}</p>
                                      <p>Started: {attempt.startedAt ?? '—'}</p>
                                      <p>Finished: {attempt.finishedAt ?? '—'}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}
                        </div>
                      )}

                      {/* Hard violations — red, serious */}
                      {aiResult && aiResult.violations && aiResult.violations.filter(v => v.violated).length > 0 && (
                        <div className="mb-4 rounded-md border border-red-500/20 bg-red-500/[0.04] p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm font-medium text-red-400">
                              <AlertTriangle size={14} strokeWidth={2} />
                              <span>{aiResult.violations.filter(v => v.violated).length} ràng buộc cứng bị vi phạm</span>
                            </div>
                            <button
                              onClick={() => handleGenerate()}
                              disabled={aiLoading}
                              className="flex items-center gap-1.5 rounded-md bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/[0.1] hover:text-white disabled:opacity-50"
                            >
                              <RotateCcw size={12} strokeWidth={2} />
                              Thử lại
                            </button>
                          </div>
                          <div className="space-y-1.5">
                            {aiResult.violations.filter(v => v.violated).map((v, i) => (
                              <div key={i} className="rounded bg-white/[0.02] px-2.5 py-1.5 text-xs">
                                <div className="flex items-start gap-2">
                                  <span className="mt-0.5 shrink-0 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-400">Vi phạm</span>
                                  <div>
                                    <span className="text-white/70">{v.original}</span>
                                    <span className="ml-1.5 text-white/30">— {v.reason}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Soft violations — yellow, informational */}
                      {aiResult && aiResult.violations && aiResult.violations.filter(v => !v.violated).length > 0 && (
                        <div className="mb-4 rounded-md border border-yellow-500/20 bg-yellow-500/[0.04] p-4">
                          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-yellow-400">
                            <AlertTriangle size={14} strokeWidth={2} />
                            <span>{aiResult.violations.filter(v => !v.violated).length} ràng buộc mềm chưa đạt tối ưu</span>
                          </div>
                          <div className="space-y-2">
                            {aiResult.violations.filter(v => !v.violated).map((v, i) => (
                              <div key={i} className="rounded bg-white/[0.02] px-2.5 py-2 text-xs space-y-0.5">
                                <p className="text-white/70 font-medium">"{v.original}"</p>
                                <p className="text-white/40">{v.reason}</p>
                                {v.conflictsWith && (
                                  <p className="text-yellow-400/60">Xung đột với: {v.conflictsWith}</p>
                                )}
                                {v.suggestion && (
                                  <p className="text-blue-400/60">Gợi ý: {v.suggestion}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Success message */}
                      {aiResult?.status === 'solved' && (aiResult.violations?.length ?? 0) === 0 && (
                        <div className="mb-4 flex items-center gap-2 rounded-md border border-green-500/20 bg-green-500/[0.04] px-4 py-2.5 text-xs text-green-400">
                          <Check size={14} strokeWidth={2} />
                          <span>Tất cả ràng buộc thỏa mãn</span>
                        </div>
                      )}

                        {aiResult?.status === 'solved' ? (
                          <>
                          <div className="overflow-auto rounded-md border border-white/[0.12] bg-white text-black">
                          <table className="min-w-[1540px] w-full border-collapse border-2 border-black text-[11px] font-normal leading-4 text-black [font-family:Arial,Helvetica,sans-serif]">
                            <thead>
                              <tr>
                                <th className="w-20 border-2 border-black bg-white px-2 py-1.5 text-center align-middle font-bold uppercase">Thứ</th>
                                <th className="w-12 border-2 border-black bg-white px-2 py-1.5 text-center align-middle font-bold uppercase">Tiết</th>
                                {resultTableClassColumns.map((className, index) => (
                                  <Fragment key={`class-pair-head-${index}`}>
                                    <th className="w-24 border-2 border-black bg-white px-2 py-1.5 text-center align-middle font-bold uppercase">
                                      {className || `Lớp ${index + 1}`}
                                    </th>
                                    <th className="w-24 border-2 border-black bg-white px-2 py-1.5 text-center align-middle font-bold uppercase">
                                      GV Dạy
                                    </th>
                                  </Fragment>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {fixedResultTableSections.map((section, sectionIndex) => (
                                <Fragment key={section.key}>
                                  {sectionIndex > 0 && section.divider && (
                                    <tr>
                                      <td colSpan={18} className="border-2 border-black bg-white px-2 py-2 text-center text-sm font-bold uppercase tracking-wide">
                                        {section.divider}
                                      </td>
                                    </tr>
                                  )}
                                  {section.rows.map((group) => (
                                    <Fragment key={group.key}>
                                      {group.rows.map((row, rowIndex) => {
                                        const cellKey = getCellKey(row.day.id, row.session.id, row.period)
                                        const isLastGroupRow = rowIndex === group.rows.length - 1

                                        return (
                                          <tr key={`${group.key}-${row.period}`}>
                                            {rowIndex === 0 ? (
                                              <td rowSpan={group.rows.length} className="border-2 border-black bg-white px-2 py-1 text-center align-middle font-bold">
                                                {group.label}
                                              </td>
                                            ) : null}
                                            <td className={`border border-black bg-white px-2 py-1 text-center align-middle ${isLastGroupRow ? 'border-b-2' : ''}`}>
                                              {row.period}
                                            </td>
                                            {resultTableClassColumns.map((className, classIndex) => {
                                              const entry = className ? solvedCellMap.get(cellKey)?.entries.find((item) => item.className === className) : null

                                              return (
                                                <Fragment key={`${cellKey}-${classIndex}-${className || 'blank'}`}>
                                                  <td className={`border border-black bg-white px-2 py-1 text-left align-middle ${isLastGroupRow ? 'border-b-2' : ''}`}>
                                                    {entry?.subject ?? ''}
                                                  </td>
                                                  <td className={`border border-black bg-white px-2 py-1 text-left align-middle ${isLastGroupRow ? 'border-b-2' : ''}`}>
                                                    {entry?.teacher ?? ''}
                                                  </td>
                                                </Fragment>
                                              )
                                            })}
                                          </tr>
                                        )
                                      })}
                                    </Fragment>
                                  ))}
                                </Fragment>
                              ))}
                            </tbody>
                            </table>
                            </div>
                            <div className="mt-4 flex justify-end">
                              <button
                                type="button"
                                onClick={handleDownloadExcel}
                                className="inline-flex items-center gap-2 rounded-md border border-white/[0.12] bg-[#4DB848]/10 px-4 py-2 text-sm font-medium text-[#4DB848] transition-colors hover:bg-[#4DB848]/20"
                              >
                                <Download size={16} strokeWidth={1.5} />
                                Tải về Excel
                              </button>
                            </div>
                          </>
                          ) : !aiLoading && !aiError ? (
                        <div className="rounded-md border border-dashed border-white/[0.06] bg-[#0a0a0a] py-12 text-center text-sm text-white/30">
                          Nhấn Xếp lịch để tạo bảng kết quả cuối.
                        </div>
                        ) : aiResult || aiError ? (
                          <div className="rounded-md border border-white/[0.06] bg-[#0a0a0a] px-4 py-12 text-center text-sm font-semibold text-white">
                            <div>{aiError || aiResult?.message || RESULT_NOT_FOUND_MESSAGE}</div>
                            {aiResult?.diagnostics?.length ? (
                              <div className="mx-auto mt-3 max-w-2xl text-xs font-normal text-white/45">
                                {aiResult.diagnostics.slice(0, 3).join(' · ')}
                              </div>
                            ) : null}
                          </div>
                        ) : null}


                      </section>

                      {/* ========== AI Overall Assessment ========== */}
                      {aiResult && !aiLoading && aiResult.overallAssessment && (
                        <section className={`${panelClass} p-4`}>
                          <div className="flex items-center gap-2.5">
                            <span className={iconShellClass}>
                              <Check size={16} strokeWidth={1.5} className="text-[#4DB848]" />
                            </span>
                            <div>
                              <h2 className="text-sm font-semibold text-white">Đánh giá tổng quan</h2>
                              <p className="text-xs text-white/40">{aiResult.overallAssessment}</p>
                            </div>
                          </div>
                        </section>
                      )}

                      {aiResult && !aiLoading && aiResult.status === 'error' && aiResult.message.includes('Coder không tạo được') && (
                        <section className={`${panelClass} p-4`}>
                          <div className="mb-3 flex items-center gap-2.5">
                            <span className={iconShellClass}>
                              <AlertTriangle size={16} strokeWidth={1.5} className="text-amber-400" />
                            </span>
                            <div>
                              <h2 className="text-sm font-semibold text-white">Lỗi xếp lịch</h2>
                              <p className="text-xs text-white/40">{aiResult.message}</p>
                            </div>
                          </div>
                          <div className="mb-3 max-h-48 space-y-2 overflow-auto">
                            {aiResult.diagnostics.map((diagnostic, index) => (
                              <div key={`${diagnostic}-${index}`} className="rounded border border-white/[0.06] bg-[#141414] px-3 py-2 text-xs text-white/55">
                                {diagnostic}
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleGenerate(true)}
                            className="inline-flex items-center gap-2 rounded-md border border-white/[0.12] bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.08]"
                          >
                            <RotateCcw size={16} strokeWidth={1.5} />
                            Thử lại bằng template
                          </button>
                        </section>
                      )}

                      {/* ========== Solve / Verification Results ========== */}
                      {aiResult && !aiLoading && (
                        <>
                          {aiResult.telemetry && (
                            <section className={`${panelClass} p-4`}>
                              <div className="mb-4 flex items-center gap-2.5">
                                <span className={iconShellClass}>
                                  <Check size={16} strokeWidth={1.5} className="text-[#4DB848]" />
                                </span>
                                <div>
                                  <h2 className="text-sm font-semibold text-white">Quá trình xếp lịch</h2>
                                  <p className="text-xs text-white/40">{aiResult.message}</p>
                                </div>
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                                <div className={`${panelMutedClass} p-3`}><p className="text-[10px] uppercase tracking-widest text-white/35">Duration</p><p className="mt-1 text-sm text-white/70">{aiResult.telemetry.totalDurationMs}ms</p></div>
                                <div className={`${panelMutedClass} p-3`}><p className="text-[10px] uppercase tracking-widest text-white/35">LLM calls</p><p className="mt-1 text-sm text-white/70">{aiResult.telemetry.llmCallCount}</p></div>
                                <div className={`${panelMutedClass} p-3`}><p className="text-[10px] uppercase tracking-widest text-white/35">Solver attempts</p><p className="mt-1 text-sm text-white/70">{aiResult.telemetry.solverAttempts}</p></div>
                                <div className={`${panelMutedClass} p-3`}><p className="text-[10px] uppercase tracking-widest text-white/35">Status</p><p className="mt-1 text-sm text-white/70">{aiResult.status}</p></div>
                                <div className={`${panelMutedClass} p-3`}><p className="text-[10px] uppercase tracking-widest text-white/35">Chars in</p><p className="mt-1 text-sm text-white/70">{aiResult.telemetry.tokenEstimateCharsIn}</p></div>
                              </div>
                            </section>
                          )}

                          {/* a) Hard violations detail panel */}
                          {aiResult.violations && aiResult.violations.filter((v) => v.violated).length > 0 && (
                            <section className={`${panelClass} p-4`}>
                              <div className="mb-4 flex items-center gap-2.5">
                                <span className={iconShellClass}>
                                  <AlertTriangle size={16} strokeWidth={1.5} className="text-red-400" />
                                </span>
                                <div>
                                  <h2 className="text-sm font-semibold text-white">Ràng buộc cứng bị vi phạm</h2>
                                  <p className="text-xs text-white/40">Solver cần sửa lại để đảm bảo các ràng buộc bắt buộc này</p>
                                </div>
                              </div>
                              <div className="space-y-2">
                                {aiResult.violations.filter((v) => v.violated).map((v, idx) => (
                                  <div key={`${v.constraintId}-${idx}`} className="rounded-md border border-red-400/20 bg-red-400/[0.04] p-3 space-y-1">
                                    <p className="text-sm text-white/80 font-medium">"{v.original}"</p>
                                    <p className="text-xs text-red-300/70">{v.reason}</p>
                                    {v.conflictsWith && (
                                      <p className="text-xs text-white/40">Xung đột với: <span className="text-white/60">{v.conflictsWith}</span></p>
                                    )}
                                    {v.suggestion && (
                                      <p className="text-xs text-blue-400/60">Gợi ý: {v.suggestion}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}

                          {/* c2) Soft violations detail panel */}
                          {aiResult.violations && aiResult.violations.filter((v) => !v.violated).length > 0 && (
                            <section className={`${panelClass} p-4`}>
                              <div className="mb-4 flex items-center gap-2.5">
                                <span className={iconShellClass}>
                                  <AlertTriangle size={16} strokeWidth={1.5} className="text-yellow-400" />
                                </span>
                                <div>
                                  <h2 className="text-sm font-semibold text-white">Ràng buộc mềm chưa đạt tối ưu</h2>
                                  <p className="text-xs text-white/40">Thời khóa biểu đã tạo được, nhưng một số ưu tiên chưa đạt</p>
                                </div>
                              </div>
                              <div className="space-y-2">
                                {aiResult.violations.filter((v) => !v.violated).map((v, idx) => (
                                  <div key={`${v.constraintId}-${idx}`} className="rounded-md border border-yellow-400/15 bg-yellow-400/[0.03] p-3 space-y-1">
                                    <p className="text-sm text-white/80 font-medium">"{v.original}"</p>
                                    <p className="text-xs text-white/40">{v.reason}</p>
                                    {v.conflictsWith && (
                                      <p className="text-xs text-yellow-400/60">Xung đột với: {v.conflictsWith}</p>
                                    )}
                                    {v.suggestion && (
                                      <p className="text-xs text-blue-400/60">Gợi ý: {v.suggestion}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}

                          {/* d) Infeasible reason (only when status='infeasible') */}
                          {aiResult.status === 'infeasible' && (
                            <section className={`${panelClass} p-4`}>
                              <div className="mb-4 flex items-center gap-2.5">
                                <span className={iconShellClass}>
                                  <AlertTriangle size={16} strokeWidth={1.5} className="text-red-400" />
                                </span>
                                <div>
                                  <h2 className="text-sm font-semibold text-white">Không thể tạo thời khóa biểu</h2>
                                  <p className="text-xs text-white/40">Các ràng buộc sau xung đột nhau, không có lịch nào thỏa mãn đồng thời</p>
                                </div>
                              </div>
                              {(aiResult.conflictingConstraints ?? []).length > 0 ? (
                                <div className="rounded-md border border-red-400/15 bg-red-400/[0.03] p-4">
                                  <p className="mb-3 text-xs text-white/50">Nguyên nhân — các ràng buộc xung đột:</p>
                                  <div className="space-y-2">
                                    {(aiResult.conflictingConstraints ?? []).map((c) => (
                                      <div key={c.id} className="flex items-start gap-2 rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5">
                                        <span className="mt-0.5 shrink-0 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                                          Cứng
                                        </span>
                                        <p className="text-sm text-white/70">"{c.text}"</p>
                                      </div>
                                    ))}
                                  </div>
                                  <p className="mt-3 text-xs text-red-300/60">
                                    Hãy bỏ hoặc nới lỏng một trong các ràng buộc trên, hoặc thêm nhiều slot thời gian hơn.
                                  </p>
                                </div>
                              ) : (
                                <div className="rounded-md border border-red-400/15 bg-red-400/[0.03] p-4">
                                  <p className="text-sm text-white/60">
                                    {aiResult.diagnostics?.[0] ?? 'Không xác định được ràng buộc cụ thể gây xung đột. Thử giảm số ràng buộc cứng hoặc tăng số slot thời gian.'}
                                  </p>
                                </div>
                              )}
                            </section>
                          )}

                          {/* e) Technical errors (collapsible, only shown when there are errors) */}
                          {((aiResult.executionErrors && aiResult.executionErrors.length > 0) ||
                            (aiResult.validationErrors && aiResult.validationErrors.length > 0)) && (
                            <section className={`${panelClass} p-4`}>
                              <button
                                type="button"
                                onClick={() => setShowTechnicalErrors(!showTechnicalErrors)}
                                className="mb-3 flex w-full items-center gap-2 text-left text-sm text-white/50 hover:text-white/70 transition-colors"
                              >
                                <ChevronDown
                                  size={14}
                                  className={`transition-transform ${showTechnicalErrors ? 'rotate-180' : ''}`}
                                  strokeWidth={1.5}
                                />
                                <span>Lỗi kỹ thuật</span>
                                <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px]">
                                  {(aiResult.executionErrors?.length || 0) + (aiResult.validationErrors?.length || 0)}
                                </span>
                              </button>
                              {showTechnicalErrors && (
                                <div className="space-y-2">
                                  {aiResult.validationErrors?.map((e, idx) => (
                                    <div key={`val-${e.constraintId}-${idx}`} className="rounded border border-red-400/15 bg-red-400/[0.03] p-2.5">
                                      <p className="text-xs font-medium text-red-300/70">Validation Error — {e.constraintId}</p>
                                      <p className="mt-0.5 text-xs text-white/40">{e.error}</p>
                                    </div>
                                  ))}
                                  {aiResult.executionErrors?.map((e, idx) => (
                                    <div key={`exec-${e.constraintId}-${idx}`} className="rounded border border-amber-400/15 bg-amber-400/[0.03] p-2.5">
                                      <p className="text-xs font-medium text-amber-300/70">Execution Error — {e.constraintId}</p>
                                      <p className="mt-0.5 text-xs text-white/40 font-mono">{e.error}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </section>
                          )}
                        </>
                      )}

                      <section className={`${panelClass} p-4`}>
                        <div className="mb-4 flex items-center gap-2.5">
                          <span className={iconShellClass}>
                            <ClipboardList size={16} strokeWidth={1.5} />
                          </span>
                          <div>
                            <h2 className="text-sm font-semibold text-white">Ràng buộc xếp lịch</h2>
                            <p className="text-xs text-white/40">Bắt buộc và Nên có</p>
                          </div>
                        </div>

                        <div className="space-y-0">
                            {constraintList.length ? (
                              sortedConstraintList.map((constraint) => {
                                const constraintType = constraintTypes[constraint.type] ?? constraintTypes.required

                                return (
                                    <div key={constraint.id} className={`rounded-md border p-3 ${constraintType.boxClass}`}>

                                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${constraintType.badgeClass}`}>
                                        <Circle className={constraintType.iconClass} size={10} fill="currentColor" strokeWidth={0} />
                                        {constraintType.label}
                                      </span>
                                  </div>
                                  <p className="rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5 text-sm text-white/60">
                                    {constraint.text}
                                  </p>
                                </div>
                              )
                            })
                          ) : (
                            <div className={`${panelMutedClass} p-4 text-sm text-white/30`}>
                              Chưa có ràng buộc xếp lịch nào.
                            </div>
                          )}
                        </div>
                      </section>
                    </div>

                      <aside className={`${panelClass} p-4`}>
                      <div className="mb-4 flex items-center gap-2.5">
                        <span className={iconShellClass}>
                          <BookOpen size={16} strokeWidth={1.5} />
                        </span>
                        <div>
                          <h2 className="text-sm font-semibold text-white">Phân công chuyên môn</h2>
                          <p className="text-xs text-white/40">Tổng hợp giáo viên - môn - lớp - số tiết/tuần</p>
                        </div>
                      </div>

                      <div className="space-y-0">
                        {assignmentList.length ? (
                          sortedAssignmentList.map((assignment, index) => {
                            const teacherColor = teacherColorMap[assignment.teacher] ?? teacherColors[0]

                            return (
                              <div key={assignment.key} className="border-b border-white/[0.04] py-3 last:border-b-0">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <p className="text-[11px] font-medium uppercase tracking-widest" style={{ color: teacherColor.text }}>Phân công {index + 1}</p>
                                  <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium" style={{ borderColor: teacherColor.text, color: teacherColor.text, backgroundColor: 'rgba(0,0,0,0.3)' }}>
                                    {assignment.teacher}
                                  </span>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <div className="rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5">
                                    <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Giáo viên</p>
                                    <p className="mt-0.5 truncate text-xs text-white/60">{assignment.teacher}</p>
                                  </div>
                                  <div className="rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5">
                                    <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Môn học</p>
                                    <p className="mt-0.5 truncate text-xs text-white/60">{assignment.subject}</p>
                                  </div>
                                  <div className="rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5">
                                    <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Lớp</p>
                                    <p className="mt-0.5 truncate text-xs text-white/60">{assignment.className}</p>
                                  </div>
                                  <div className="rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5">
                                    <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Số tiết/tuần</p>
                                    <p className="mt-0.5 truncate text-xs text-white/60">{assignment.weeklyPeriods}</p>
                                  </div>
                                </div>
                              </div>
                            )
                          })
                          ) : (
                            <div className={`${panelMutedClass} p-4 text-sm text-white/30`}>
                              Chưa có phân công chuyên môn nào.
                            </div>
                          )}
                        </div>

                      </aside>
                    </div>

                    {false && (aiLoading || aiResult || aiError) && (
                      <section className={`${panelClass} mt-4 overflow-hidden p-4`}>
                        <div className="mb-4 flex items-center gap-2.5">
                          <span className={iconShellClass}>
                            <Sparkles size={16} strokeWidth={1.5} />
                          </span>
                          <div>
                            <h2 className="text-sm font-semibold text-white">Kết quả xếp thời khóa biểu</h2>
                            <p className="text-xs text-white/40">Được tạo tự động bởi AI</p>
                          </div>
                        </div>

                        {aiLoading && (
                          <div className="flex items-center justify-center gap-3 rounded-md border border-dashed border-white/[0.06] bg-[#0a0a0a] py-12 text-sm text-white/30">
                            <Loader2 size={18} className="animate-spin" strokeWidth={1.5} />
                            <span>AI đang xếp thời khóa biểu, vui lòng chờ...</span>
                          </div>
                        )}

                        {aiError && !aiLoading && (
                          <div className="rounded-md border border-[#4DB848]/20 bg-[#4DB848]/[0.03] p-4">
                            <p className="font-medium text-white">Lỗi xảy ra:</p>
                            <p className="mt-2 text-sm text-white/50">{aiError}</p>
                            <button
                              type="button"
                              onClick={() => handleGenerate()}
                              className={ghostButtonClass + ' mt-3'}
                            >
                              <RotateCcw size={14} strokeWidth={1.5} />
                              Thử lại
                            </button>
                          </div>
                        )}

                        {aiResult && !aiLoading && (() => {
                          const currentResult = aiResult as TimetableSolveResult
                          const currentSolverStats = currentResult.solverStats

                          return (
                            <div className="space-y-4 rounded-md border border-white/[0.06] bg-[#0a0a0a] p-4 text-white">
                              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
                                <div>
                                  <p className="text-sm font-semibold text-white">{currentResult.message}</p>
                                  <p className="mt-1 text-xs text-white/35">
                                    Trạng thái: {currentResult.status === 'solved' ? 'Đã xếp được lịch' : currentResult.status === 'infeasible' ? 'Không khả thi' : 'Có lỗi'}
                                  </p>
                                </div>
                                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${currentResult.status === 'solved' ? 'border-[#4DB848]/25 bg-[#4DB848]/10 text-[#4DB848]' : currentResult.status === 'infeasible' ? 'border-amber-500/25 bg-amber-500/10 text-amber-300' : 'border-red-500/25 bg-red-500/10 text-red-300'}`}>
                                  {currentResult.status === 'solved' ? 'Solved' : currentResult.status === 'infeasible' ? 'Infeasible' : 'Error'}
                                </span>
                              </div>

                              {currentSolverStats ? (() => {
                                const stats = currentSolverStats!
                                return (
                                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                                  <div className={`${panelMutedClass} p-3`}><p className="text-[10px] uppercase tracking-widest text-white/35">Wall time</p><p className="mt-1 text-sm text-white/70">{stats.wallTimeSeconds.toFixed(3)}s</p></div>
                                  <div className={`${panelMutedClass} p-3`}><p className="text-[10px] uppercase tracking-widest text-white/35">Objective</p><p className="mt-1 text-sm text-white/70">{stats.objectiveValue ?? '—'}</p></div>
                                  <div className={`${panelMutedClass} p-3`}><p className="text-[10px] uppercase tracking-widest text-white/35">Best bound</p><p className="mt-1 text-sm text-white/70">{stats.bestBound ?? '—'}</p></div>
                                  <div className={`${panelMutedClass} p-3`}><p className="text-[10px] uppercase tracking-widest text-white/35">Conflicts</p><p className="mt-1 text-sm text-white/70">{stats.numConflicts}</p></div>
                                  <div className={`${panelMutedClass} p-3`}><p className="text-[10px] uppercase tracking-widest text-white/35">Branches</p><p className="mt-1 text-sm text-white/70">{stats.numBranches}</p></div>
                                </div>
                                )
                              })() : null}

                              {currentResult.diagnostics?.length ? (
                                <div className="space-y-2">
                                  {currentResult.diagnostics.map((diagnostic, index) => (
                                    <div key={`${diagnostic}-${index}`} className="rounded border border-white/[0.06] bg-[#141414] px-3 py-2 text-sm text-white/55">
                                      {diagnostic}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-white/45">Không có chẩn đoán bổ sung.</p>
                              )}

                            </div>
                          )
                        })()}
                      </section>
                    )}


                </section>
              )}
          </main>


  )
}
