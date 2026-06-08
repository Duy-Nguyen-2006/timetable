'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  Plus,
  RotateCcw,
  AlertTriangle,
  ClipboardList,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react'
import ExcelJS from 'exceljs'

// Local AI Agent (new implementation following the approved architecture plan)
import { runLocalAgent } from './ai/local-agent'
import {
  confirmedFromDraftsAfterUserAccept,
  constraintItemsToRaw,
  validateConfirmedSolveRequest,
} from './ai/solver-constraint-gate'
import { ConstraintInputPanel } from './constraints/ConstraintInputPanel'
import { ConstraintReviewPanel } from './constraints/ConstraintReviewPanel'
import {
  ConstraintInterpretationCard,
  type InterpretationCandidate,
} from './constraints/ConstraintInterpretationCard'
import { useConstraintReview } from './constraints/useConstraintReview'
import {
  buildDatasetSignature,
  readConstraintWorkspace,
  writeConstraintWorkspace,
} from './constraints/constraint-workspace-storage'
import {
  buildCustomDraftFromNormalization,
  severityFromConstraintType,
} from './constraints/custom-normalization-draft'
import { normalizeConstraintsToBuiltInDrafts } from './constraints/constraint-normalization'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SettingsModal } from './SettingsModal'
import type { CustomConstraintNormalizationResult } from './ai/custom-normalization-service'
import type {
  AIProviderConfig,
  AgentLifecycleEvent,
} from './ai/types'
import { Settings as SettingsIcon } from 'lucide-react'
import type {
  AgentProgressStep,
  AssignmentItem,
  BulkAssignmentError,
  ConstraintItem,
  ParsedConstraintDraft,
  RawConstraintInput,
  SolverRequestPayload,
  TimetableAppProps,
  TimetableSolveResult,
} from './types'
import {
  NO_ACTIVE_PERIOD_MESSAGE,
  RESULT_NOT_FOUND_MESSAGE,
  SOLVER_STATUS_LABELS,
  STEP_LABELS,
  STEP_ORDER,
  buildReportRows,
  toProgressStep,
} from './solver-ui'
import { MetricCard, SelectField } from './components/TimetableFields'
import { SelectPage, PeriodsPage } from './components/SetupPages'
import { PreviewPage } from './components/PreviewPage'
import {
  loadProviderConfig,
  persistProviderConfig,
} from './ai/provider-storage'
import {
  buildRunCacheDigest,
  readCachedRuns,
  writeCachedRun,
} from './ai/run-cache'
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
import { normalizeAssignments } from './utils'
import { parseQuickImportText } from './quick-import'
import {
  getBulkAssignmentErrorMessage,
  parseBulkAssignments,
  parseLines,
  renderBulkAssignmentErrorLine,
} from './assignment-helpers'

type SolvedCellEntry = { className: string; subject: string; teacher: string }
type SolvedCell = { slotId: string; entries: SolvedCellEntry[] }

function userFacingAgentError(message: string): string {
  if (/Agent timeout/i.test(message)) {
    return 'Hệ thống mất quá nhiều thời gian để xếp lịch. Hãy kiểm tra lại các ràng buộc chưa được chuẩn hóa thành mẫu có sẵn, hoặc đổi hồ sơ giải sang “Sâu” trong phần cấu hình.';
  }
  return message.replace(/\bAI Agent\b/gu, 'bộ xếp lịch');
}

export default function App({ onBackToLanding, quickDatasetText }: TimetableAppProps) {
  const [page, setPage] = useState('select')
  const [selectedDays, setSelectedDays] = useState(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])
  const [selectedSessions, setSelectedSessions] = useState(['morning'])
  const [periods, setPeriods] = useState<Record<'morning' | 'afternoon' | 'night', number>>(defaultPeriods)
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
    const [assignmentValidationMessage, setAssignmentValidationMessage] = useState<string | null>(null)
    const [constraintDraft, setConstraintDraft] = useState<{ type: keyof typeof constraintTypes; text: string; weight: number }>({ type: 'required', text: '', weight: 5 })
  const [constraintList, setConstraintList] = useState<ConstraintItem[]>([])
  const {
    constraintDrafts,
    confirmedConstraints,
    reparseLoading,
    parseError,
    invalidateReview,
    confirmDraft,
    ignoreDraft,
    updateDraft,
    rejectAndReparse,
    applyTemplate,
    markConstraintsAdded,
    removeConstraintReview,
    newConstraintIds,
    preflight: constraintPreflight,
    hydrateFromWorkspace,
  } = useConstraintReview()
  const constraintWorkspaceLoaded = useRef(false)
  const [aiResult, setAiResult] = useState<TimetableSolveResult | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [agentStatus, setAgentStatus] = useState<string | null>(null)
  const [agentStep, setAgentStep] = useState<AgentProgressStep>('idle')
  const [agentIteration, setAgentIteration] = useState(0)
  const [agentMaxIterations, setAgentMaxIterations] = useState(5)
  const [agentElapsed, setAgentElapsed] = useState(0)
  const [agentTimeline, setAgentTimeline] = useState<AgentLifecycleEvent[]>([])
  const agentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [showTechnicalErrors, setShowTechnicalErrors] = useState(false)
  const [quickImportError, setQuickImportError] = useState<string | null>(null)
  const [customNormalizeLoading, setCustomNormalizeLoading] = useState(false)
  const [customNormalizeError, setCustomNormalizeError] = useState<string | null>(null)

  // === NEW: Local AI Provider Settings (Base URL + Key + Model) ===
  const [aiProvider, setAiProvider] = useState<AIProviderConfig | null>(null)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [isFirstRun, setIsFirstRun] = useState(false)
  const [solverRuntimeNotice, setSolverRuntimeNotice] = useState<string | null>(null)
  const [secureStorageNotice, setSecureStorageNotice] = useState<string | null>(null)

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTitle, setConfirmTitle] = useState('')
  const [confirmDescription, setConfirmDescription] = useState('')
  const [confirmVariant, setConfirmVariant] = useState<'danger' | 'warning'>('danger')
  const confirmActionRef = useRef<(() => void) | null>(null)

  const openConfirmDialog = (
    title: string,
    description: string,
    variant: 'danger' | 'warning',
    onConfirm: () => void,
  ) => {
    setConfirmTitle(title)
    setConfirmDescription(description)
    setConfirmVariant(variant)
    confirmActionRef.current = onConfirm
    setConfirmOpen(true)
  }

  const pushSolverRuntimeMode = (mode: AIProviderConfig['solverRuntimeMode']) => {
    try {
      window.electron?.solverRuntime?.setMode?.(mode || 'bundled')
    } catch {
      /* renderer may not have the bridge in dev/web mode */
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const config = await loadProviderConfig()
        if (cancelled) return
        if (config) {
          setAiProvider(config)
          pushSolverRuntimeMode(config.solverRuntimeMode)
          const hasSecureBridge = Boolean(window.electron?.secureStore?.isAvailable)
          const secureAvailable = hasSecureBridge ? await window.electron!.secureStore.isAvailable() : true
          const localFallback = typeof window !== 'undefined' && Boolean(window.localStorage.getItem('tack_ai_provider_config'))
          if (!secureAvailable || localFallback) {
            setSecureStorageNotice('API key có thể đang được lưu không mã hóa vì máy/renderer chưa hỗ trợ secure storage. Hãy cân nhắc không lưu key trên máy này.')
          }
        } else {
          setIsFirstRun(true)
        }
      } catch (err) {
        if (typeof console !== 'undefined') console.warn('loadProviderConfig failed', err)
        if (!cancelled) setIsFirstRun(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.electron?.solverRuntime?.onNotice?.(
      (payload: { level: string; message: string }) => {
        if (!payload?.message) return
        setSolverRuntimeNotice(payload.message)
      }
    )
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!quickDatasetText) return

    try {
      const quickData = parseQuickImportText(quickDatasetText)
      const now = Date.now()
      const nextConstraints: ConstraintItem[] = [
        ...quickData.hardConstraints.map((text, index) => ({
          id: `quick-hard-${now}-${index}`,
          type: 'required' as const,
          text,
        })),
        ...quickData.softConstraints.map((text, index) => ({
          id: `quick-soft-${now}-${index}`,
          type: 'preferred' as const,
          text,
          weight: 5,
        })),
      ]

      // Quick import is the source of truth: prevent the localStorage
      // hydration effect (declared below) from reloading the previous
      // dataset's constraint list on top of the freshly imported one,
      // and clear any leftover parsed/confirmed state from the old dataset.
      constraintWorkspaceLoaded.current = true
      invalidateReview()

      const quickAgentInput = {
        days: days.filter((day) => quickData.selectedDays.includes(day.id)),
        sessions: sessions.filter((session) => quickData.selectedSessions.includes(session.id)),
        periodCounts: quickData.periods,
        deletedPeriods: {},
        assignments: normalizeAssignments(quickData.assignments),
        constraints: nextConstraints.map((constraint) =>
          constraint.type === 'required'
            ? { type: 'required' as const, text: constraint.text }
            : { type: 'preferred' as const, text: constraint.text, weight: constraint.weight ?? 5 }
        ),
      }
      const rawConstraints = constraintItemsToRaw(
        nextConstraints.map((constraint) => ({
          id: constraint.id,
          type: constraint.type,
          text: constraint.text,
          weight: constraint.weight,
        }))
      )
      const quickDrafts = normalizeConstraintsToBuiltInDrafts(rawConstraints, quickAgentInput)
      const autoConfirmed = confirmedFromDraftsAfterUserAccept(
        quickDrafts.filter((draft) => draft.confidence === 'high' && draft.proposedSpecs.length > 0)
      )

      setSelectedDays(quickData.selectedDays)
      setSelectedSessions(quickData.selectedSessions)
      setPeriods(quickData.periods)
      setDeletedPeriods({})
      setTeacherList(quickData.teachers)
      setSubjectList(quickData.subjects)
      setClassList(quickData.classes)
      setAssignmentList(quickData.assignments)
      setConstraintList(nextConstraints)
      hydrateFromWorkspace({
        constraintDrafts: quickDrafts,
        confirmedConstraints: autoConfirmed,
      })
      setAssignmentValidationMessage(null)
      setAiError(null)
      setAiResult(null)
      setShowTechnicalErrors(false)
      setQuickImportError(null)
      setPage('select')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không đọc được dữ liệu nhập nhanh.'
      setQuickImportError(message)
      setPage('select')
    }
  }, [hydrateFromWorkspace, invalidateReview, quickDatasetText])

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

  const constraintAgentInput = useMemo(() => {
    const requestConstraints: SolverRequestPayload['constraints'] = constraintList.map((constraint) =>
      constraint.type === 'required'
        ? { type: 'required', text: constraint.text }
        : {
            type: 'preferred',
            text: constraint.text,
            weight:
              constraint.weight === 8 || constraint.weight === 5 || constraint.weight === 3 ? constraint.weight : 5,
          }
    )
    return {
      days: selectedSpreadsheetDays,
      sessions: selectedSessionData,
      periodCounts: periods,
      deletedPeriods,
      assignments: normalizeAssignments(assignmentList),
      constraints: requestConstraints,
    }
  }, [
    assignmentList,
    constraintList,
    deletedPeriods,
    periods,
    selectedSessionData,
    selectedSpreadsheetDays,
  ])

  const constraintSolvePreflight = useMemo(
    () => constraintPreflight(constraintList),
    [constraintList, constraintPreflight]
  )

  const canProceedToSolve =
    constraintList.length === 0 || constraintSolvePreflight.canSolve

  const solveBlockHint = useMemo(() => {
    if (canProceedToSolve) return null
    return constraintSolvePreflight.messages[0] ??
      'Còn ràng buộc chưa được duyệt. Phân tích và bấm «Đúng rồi» trên từng dòng trước khi sang bước xếp lịch.'
  }, [canProceedToSolve, constraintSolvePreflight.messages])

  useEffect(() => {
    if (constraintWorkspaceLoaded.current) return
    if (quickDatasetText) {
      // Quick import owns the new dataset; the quickDatasetText effect
      // already marked the workspace as loaded.
      constraintWorkspaceLoaded.current = true
      return
    }
    const ws = readConstraintWorkspace()
    if (ws?.constraintList.length) {
      setConstraintList(ws.constraintList)
      hydrateFromWorkspace({
        constraintDrafts: ws.constraintDrafts,
        confirmedConstraints: ws.confirmedConstraints,
      })
    }
    constraintWorkspaceLoaded.current = true
  }, [hydrateFromWorkspace, quickDatasetText])

  const datasetSignature = useMemo(
    () => (assignmentList.length ? buildDatasetSignature(constraintAgentInput) : ''),
    [assignmentList.length, constraintAgentInput]
  )
  const prevDatasetSignatureRef = useRef<string | null>(null)

  useEffect(() => {
    if (!constraintWorkspaceLoaded.current || !datasetSignature) return
    if (
      prevDatasetSignatureRef.current &&
      prevDatasetSignatureRef.current !== datasetSignature
    ) {
      invalidateReview()
    }
    prevDatasetSignatureRef.current = datasetSignature
    writeConstraintWorkspace({
      version: 1,
      constraintList,
      constraintDrafts,
      confirmedConstraints,
      datasetSignature,
    })
  }, [
    datasetSignature,
    constraintList,
    constraintDrafts,
    confirmedConstraints,
    invalidateReview,
  ])

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

  const solvedCellMap = useMemo(() => {
    const scheduleRows = aiResult?.schedule ?? []
    if (scheduleRows.length === 0) {
      return new Map<string, SolvedCell>()
    }

    const dayAliasToId = new Map<string, string>()
    selectedSpreadsheetDays.forEach((day) => {
      dayAliasToId.set(String(day.id).toLowerCase(), day.id)
      dayAliasToId.set(String(day.label).toLowerCase(), day.id)
      dayAliasToId.set(String(day.tableLabel).toLowerCase(), day.id)
    })

    const resolveSessionAndPeriod = (globalPeriod: number) => {
      let cursor = 0
      for (const session of selectedSessionData) {
        const count = periods[session.id] ?? defaultPeriods[session.id]
        if (globalPeriod <= cursor + count) {
          return { sessionId: session.id, period: globalPeriod - cursor }
        }
        cursor += count
      }
      return null
    }

    const bySlot = new Map<string, { slotId: string; entries: Array<{ className: string; subject: string; teacher: string }> }>()

    scheduleRows.forEach((row) => {
      const dayRaw = String(row?.day ?? '').trim().toLowerCase()
      const dayId = dayAliasToId.get(dayRaw)
      const className = String(row.class ?? '').trim()
      const subject = String(row?.subject ?? '').trim()
      const teacher = String(row?.teacher ?? '').trim()
      const periodRaw = Number(row?.period)

      if (!dayId || !className || !Number.isFinite(periodRaw) || periodRaw <= 0) return

      const slot = resolveSessionAndPeriod(periodRaw)
      if (!slot) return

      const slotId = getCellKey(dayId, slot.sessionId, slot.period)
      const existing = bySlot.get(slotId) ?? { slotId, entries: [] }
      existing.entries.push({ className, subject, teacher })
      bySlot.set(slotId, existing)
    })

    return new Map(Array.from(bySlot.values()).map((cell) => [cell.slotId, cell]))
  }, [aiResult, periods, selectedSessionData, selectedSpreadsheetDays])

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

  const restoreDeletedPeriods = () => {
    setDeletedPeriods({})
  }

  const toggleDeletedPeriod = (dayId: string, sessionId: string, period: number) => {
    const cellKey = getCellKey(dayId, sessionId, period)
    const dayLabel = days.find((day) => day.id === dayId)?.label ?? dayId
    const sessionLabel = sessions.find((session) => session.id === sessionId)?.label ?? sessionId
    const willRestore = Boolean(deletedPeriods[cellKey])
    setDeletedPeriods((current) => {
      const next = { ...current }
      if (next[cellKey]) {
        delete next[cellKey]
      } else {
        next[cellKey] = true
      }
      return next
    })
    window.alert(
      willRestore
        ? `Đã khôi phục tiết ${period} - ${sessionLabel} - ${dayLabel}.`
        : `Đã xóa tiết ${period} - ${sessionLabel} - ${dayLabel} khỏi khung thời khóa biểu.`,
    )
  }

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

  const deleteTeacher = (name: string) => {
    openConfirmDialog(
      'Xác nhận xóa giáo viên',
      `Bạn có chắc chắn muốn xóa giáo viên "${name}"? Hành động này không thể hoàn tác.`,
      'danger',
      () => {
        setTeacherList((current) => current.filter((teacher) => teacher !== name))
      },
    )
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

  const deleteSubject = (name: string) => {
    openConfirmDialog(
      'Xác nhận xóa môn học',
      `Bạn có chắc chắn muốn xóa môn "${name}"? Hành động này không thể hoàn tác.`,
      'danger',
      () => {
        setSubjectList((current) => current.filter((subject) => subject !== name))
      },
    )
  }

  const importClass = () => {
    const name = classInput.trim().toUpperCase()
    if (!name) return

    setClassList((current) => (current.includes(name) ? current : [...current, name]))
    setClassInput('')
  }

  const deleteClass = (name: string) => {
    const removedAssignmentCount = assignmentList.filter((assignment) => assignment.className === name).length
    const message = removedAssignmentCount > 0
      ? `Lớp "${name}" có ${removedAssignmentCount} phân công chuyên môn liên quan sẽ bị xóa theo. Bạn có chắc chắn muốn xóa?`
      : `Bạn có chắc chắn muốn xóa lớp "${name}"?`
    openConfirmDialog(
      'Xác nhận xóa lớp học',
      message,
      'danger',
      () => {
        setClassList((current) => current.filter((className) => className !== name))
        setAssignmentList((current) => current.filter((assignment) => assignment.className !== name))
      },
    )
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


    const importBulkAssignments = () => {
      const { parsed, errors } = parseBulkAssignments(bulkAssignmentText, teacherList, subjectList, classList)
      setBulkAssignmentErrors(errors)
      setAssignmentValidationMessage(null)
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

      if (!teacherList.includes(teacher)) {
        setAssignmentValidationMessage(`Giáo viên ${teacher} không được nhập ở bước trước, vui lòng nhập lại.`)
        return
      }

      if (!subjectList.includes(subject)) {
        setAssignmentValidationMessage(`Môn ${subject} không được nhập ở bước trước, vui lòng nhập lại.`)
        return
      }

      if (!classList.includes(className)) {
        setAssignmentValidationMessage(`Lớp ${className} không được nhập ở bước trước, vui lòng nhập lại.`)
        return
      }

      setAssignmentValidationMessage(null)
  
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

    const deleteAssignment = (key: string) => {
      const deletedAssignment = assignmentList.find((assignment) => assignment.key === key)
      openConfirmDialog(
        'Xác nhận xóa phân công',
        deletedAssignment
          ? `Bạn có chắc chắn muốn xóa phân công: ${deletedAssignment.teacher} - ${deletedAssignment.subject} - ${deletedAssignment.className} (${deletedAssignment.weeklyPeriods} tiết)?`
          : 'Bạn có chắc chắn muốn xóa phân công này?',
        'danger',
        () => {
          setAssignmentList((current) => current.filter((assignment) => assignment.key !== key))
        },
      )
    }

    const validateAssignmentsBeforeNext = () => {
      const invalidAssignment = assignmentList.find((assignment) => !teacherList.includes(assignment.teacher) || !subjectList.includes(assignment.subject) || !classList.includes(assignment.className))
      if (invalidAssignment) {
        const message = !teacherList.includes(invalidAssignment.teacher)
          ? `Giáo viên ${invalidAssignment.teacher} không được nhập ở bước trước, vui lòng nhập lại.`
          : !subjectList.includes(invalidAssignment.subject)
            ? `Môn ${invalidAssignment.subject} không được nhập ở bước trước, vui lòng nhập lại.`
            : `Lớp ${invalidAssignment.className} không được nhập ở bước trước, vui lòng nhập lại.`
        setAssignmentValidationMessage(message)
        return false
      }

      if (assignmentList.length === 0) {
        setAssignmentValidationMessage('Vui lòng tạo ít nhất một phân công chuyên môn trước khi tiếp tục.')
        return false
      }

      if (totalAssignedPeriods !== totalRequiredClassPeriods) {
        setAssignmentValidationMessage(`Tổng số tiết trong phân công chuyên môn là ${totalAssignedPeriods}, tổng số tiết cần xếp của tất cả các lớp là ${totalRequiredClassPeriods}.`)
        return false
      }

      setAssignmentValidationMessage(null)
      setPage('constraints')
      return true
    }
  
  const normalizeCustomConstraintDraft = async () => {
    const lines = parseLines(constraintDraft.text)
    if (!lines.length) return
    if (!aiProvider) {
      setShowSettingsModal(true)
      setCustomNormalizeError('Vui lòng cấu hình AI provider trước khi chuẩn hóa ràng buộc đặc biệt.')
      return
    }

    setCustomNormalizeLoading(true)
    setCustomNormalizeError(null)
    try {
      const now = Date.now()
      const createdAt = new Date().toISOString()
      const newItems: ConstraintItem[] = []
      const newDrafts: ParsedConstraintDraft[] = []

      for (const [index, text] of lines.entries()) {
        const item: ConstraintItem = {
          id: `${now}-${index}-${text}`,
          type: constraintDraft.type,
          text,
          weight: constraintDraft.type === 'preferred' ? constraintDraft.weight : undefined,
        }
        const raw: RawConstraintInput = {
          id: item.id,
          text: item.text,
          type: item.type,
          weight: item.weight,
          createdAt,
        }
        const response = await fetch('/api/ai/normalize-custom-constraint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request: {
              severity: severityFromConstraintType(item.type),
              originalText: item.text,
            },
            providerConfig: aiProvider,
            agentInput: constraintAgentInput,
          }),
        })
        const body = (await response.json().catch(() => null)) as
          | CustomConstraintNormalizationResult
          | { error?: string }
          | null
        if (!body) {
          throw new Error('Chuẩn hóa ràng buộc đặc biệt thất bại.')
        }
        if (!('status' in body)) {
          throw new Error(body.error || 'Chuẩn hóa ràng buộc đặc biệt thất bại.')
        }
        if (!response.ok) {
          throw new Error('Chuẩn hóa ràng buộc đặc biệt thất bại.')
        }
        newItems.push(item)
        newDrafts.push(buildCustomDraftFromNormalization(raw, body))
      }

      setConstraintList((current) => [...current, ...newItems])
      newDrafts.forEach((draft) => updateDraft(draft))
      setConstraintDraft((current) => ({ ...current, text: '' }))
      markConstraintsAdded(newItems.map((item) => item.id))
    } catch (error) {
      setCustomNormalizeError(error instanceof Error ? error.message : 'Chuẩn hóa ràng buộc đặc biệt thất bại.')
    } finally {
      setCustomNormalizeLoading(false)
    }
  }

  const createBuiltInConstraint = (constraint: ConstraintItem, draft: ParsedConstraintDraft) => {
    setConstraintList((current) => [...current, constraint])
    updateDraft(draft)
    markConstraintsAdded([constraint.id])
  }

  const deleteConstraint = (id: string) => {
    const deletedConstraint = constraintList.find((constraint) => constraint.id === id)
    openConfirmDialog(
      'Xác nhận xóa ràng buộc',
      deletedConstraint
        ? `Bạn có chắc chắn muốn xóa ràng buộc: "${deletedConstraint.text}"?`
        : 'Bạn có chắc chắn muốn xóa ràng buộc này?',
      'danger',
      () => {
        setConstraintList((current) => current.filter((constraint) => constraint.id !== id))
        removeConstraintReview(id)
      },
    )
  }

  const pushTimelineEvent = useCallback((event: AgentLifecycleEvent) => {
    setAgentTimeline((current) => [...current, event])
  }, [])

    const handleGenerate = async () => {

    if (activePeriodCount <= 0) {
      setAiError(NO_ACTIVE_PERIOD_MESSAGE)
      setAiResult(null)
      return
    }

    if (!canProceedToSolve) {
      setAiError(solveBlockHint ?? 'Chưa thể xếp lịch: ràng buộc bắt buộc chưa xác nhận.')
      setPage('constraints')
      return
    }

    const agentInputBase = {
      ...constraintAgentInput,
      ...(aiResult?.schedule?.length ? { previousSchedule: aiResult.schedule } : {}),
    }

    const solveGate = validateConfirmedSolveRequest(
      constraintItemsToRaw(
        constraintList.map((c) => ({ id: c.id, type: c.type, text: c.text, weight: c.weight }))
      ),
      constraintDrafts,
      {
        input: {
          days: agentInputBase.days,
          sessions: agentInputBase.sessions,
          periodCounts: agentInputBase.periodCounts,
          deletedPeriods: agentInputBase.deletedPeriods,
          assignments: agentInputBase.assignments,
        },
        confirmedConstraints,
      }
    )

    if (!solveGate.ok) {
      setAiError([solveGate.error, ...(solveGate.messages ?? [])].filter(Boolean).join('\n'))
      setPage('constraints')
      return
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
      setAgentTimeline([
        {
          id: crypto.randomUUID(),
          phase: 'thinking',
          title: 'Request queued',
          detail: 'Da nhan input va bat dau chuan bi pipeline agent.',
          status: 'active',
          timestamp: new Date().toISOString(),
          tags: ['request'],
        },
      ])

      if (agentTimerRef.current) clearInterval(agentTimerRef.current)

    agentTimerRef.current = setInterval(() => {
      setAgentElapsed((prev) => prev + 1)
    }, 1000)

      // === NEW LOCAL AGENT INTEGRATION ===
      if (!aiProvider) {
        setAiError('Vui lòng cấu hình AI Provider (Base URL + API Key + Model) trước khi dùng tính năng AI.')
        setShowSettingsModal(true)
        setAiLoading(false)
        return
      }

      try {
        const agentInput = solveGate.agentInput
        const inputDigest = buildRunCacheDigest(agentInput, aiProvider, confirmedConstraints)
        const cachedRun = readCachedRuns().find((run) => run.inputDigest === inputDigest)
        if (cachedRun) {
          setAiResult(cachedRun.result)
          setAgentStatus('Hoàn thành từ cache.')
          setAgentStep('idle')
          return
        }

        const agentResult = await runLocalAgent(
          agentInput,
          {
            ...aiProvider,
            onEvent: (event) => {
              // Map new local agent events to existing UI state (reusing all the beautiful timeline UI)
              if (event.type === 'status' || event.type === 'phase') {
                setAgentStatus(event.message)
                setAgentStep(event.type === 'phase' ? toProgressStep(event.phase) : 'thinking')
              }
              const eventPhase = event.type === 'phase' ? event.phase : 'coding'
              const eventTitle = 'message' in event ? (event as { message: string }).message : event.type
              pushTimelineEvent({
                id: crypto.randomUUID(),
                phase: eventPhase,
                title: eventTitle,
                detail: JSON.stringify(event).slice(0, 200),
                status: 'active',
                timestamp: new Date().toISOString(),
              })
            },
          },
          { preTranslatedConstraintSpecs: solveGate.preTranslatedSpecs }
        )

        if (agentResult && agentResult.success && agentResult.finalResult) {
          setAiResult(agentResult.finalResult);
          writeCachedRun(inputDigest, agentResult.finalResult as TimetableSolveResult);
          setAgentStatus("Hoàn thành!");
          setAgentStep("idle");
        } else if (agentResult?.error) {
          setAiError(userFacingAgentError(agentResult.error));
        }
      } catch (err) {
        setAiError(userFacingAgentError(err instanceof Error ? err.message : 'Lỗi khi chạy bộ xếp lịch'));
      } finally {
        setAiLoading(false);
        if (agentTimerRef.current) {
          clearInterval(agentTimerRef.current);
          agentTimerRef.current = null;
        }
      }
  }

const handleDownloadExcel = useCallback(async () => {
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
              ? solvedCellMap.get(cellKey)?.entries?.find((item) => item.className === className)
              : null
            dataRow.push(entry?.subject ?? '')
            dataRow.push(entry?.teacher ?? '')
          })

          rows.push(dataRow)
        })
      })
    })

    const wb = new ExcelJS.Workbook()
    const timetableSheet = wb.addWorksheet('Thời khóa biểu')
    rows.forEach((row) => timetableSheet.addRow(row))
    timetableSheet.columns = [
      { width: 12 },
      { width: 6 },
      ...resultTableClassColumns.flatMap(() => [{ width: 18 }, { width: 18 }]),
    ]

    const checkerRows = buildReportRows('Checker report', aiResult.checkerReport)
    const deterministicRows = buildReportRows('Deterministic validation', aiResult.deterministicReport)
    const diagnosticsRows: string[][] = [
      ['Field', 'Value'],
      ['Status', aiResult.solverStatus ?? aiResult.status],
      ['Message', aiResult.message],
      ['Diagnostics', aiResult.diagnostics.join(' | ') || ''],
      ['Execution errors', aiResult.executionErrors.map((item) => `${item.constraintId}: ${item.error}`).join(' | ')],
      ['Validation errors', aiResult.validationErrors.map((item) => `${item.constraintId}: ${item.error}`).join(' | ')],
      ['IIS constraint ids', aiResult.iisConstraintIds.join(' | ')],
      ['Conflicting constraints', aiResult.conflictingConstraints.map((item) => `${item.id}: ${item.text}`).join(' | ')],
      [],
      ['Stage', 'Summary', 'At'],
      ...(aiResult.attemptHistorySummary ?? []).map((attempt) => [
        attempt.stage,
        attempt.summary,
        attempt.at,
      ]),
    ]

    const checkerSheet = wb.addWorksheet('Checker report')
    checkerRows.forEach((row) => checkerSheet.addRow(row))
    const validationSheet = wb.addWorksheet('Validation report')
    deterministicRows.forEach((row) => validationSheet.addRow(row))
    const diagnosticsSheet = wb.addWorksheet('Diagnostics')
    diagnosticsRows.forEach((row) => diagnosticsSheet.addRow(row))

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'thoi-khoa-bieu.xlsx'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
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
    const totalRequiredClassPeriods = activePeriodCount * classList.length
    const totalAssignedPeriods = useMemo(
      () => assignmentList.reduce((total, assignment) => total + Number(assignment.weeklyPeriods || 0), 0),
      [assignmentList],
    )
  
    return (
    <>
    <main className="w-full overflow-x-hidden bg-[#0A0A0A] font-normal text-white">
      {page === 'select' ? (
        <SelectPage
          onBackToLanding={onBackToLanding}
          canContinue={canContinue}
          quickImportError={quickImportError}
          aiProvider={aiProvider}
          selectedDays={selectedDays}
          selectedSessions={selectedSessions}
          selectedDayNames={selectedDayNames}
          selectedSessionNames={selectedSessionNames}
          setShowSettingsModal={setShowSettingsModal}
          setPage={setPage}
          setSelectedDays={setSelectedDays}
          setSelectedSessions={setSelectedSessions}
          toggleItem={toggleItem}
        />
      ) : page === 'periods' ? (
        <PeriodsPage
          selectedDayNames={selectedDayNames}
          selectedSessionData={selectedSessionData}
          periods={periods}
          setPage={setPage}
          updatePeriod={updatePeriod}
        />
      ) : page === 'final' ? (
        <PreviewPage
          activePeriodCount={activePeriodCount}
          deletedPeriods={deletedPeriods}
          periods={periods}
          selectedSessionData={selectedSessionData}
          selectedSpreadsheetDays={selectedSpreadsheetDays}
          timetableRows={timetableRows}
          restoreDeletedPeriods={restoreDeletedPeriods}
          setPage={setPage}
          toggleDeletedPeriod={toggleDeletedPeriod}
        />
          ) : page === 'details' ? (
            <section className="app-page relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16">
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
                              <Trash2 size={20} className="text-red-400/60 hover:text-red-400" strokeWidth={1.5} />
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
              <section className="app-page relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16">
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
                            <Trash2 size={20} className="text-red-400/60 hover:text-red-400" strokeWidth={1.5} />
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
                <section className="app-page relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16">
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
                              <Trash2 size={20} className="text-red-400/60 hover:text-red-400" strokeWidth={1.5} />
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
                  <section className="app-page relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16">
                  <div className={navBarClass}>
                    <button type="button" onClick={() => setPage('classes')} className={navBackClass}>
                      <ArrowLeft size={14} strokeWidth={1.5} />
                      Quay lại
                    </button>
                          <button type="button" onClick={validateAssignmentsBeforeNext} className={navNextClass}>
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

                          {assignmentValidationMessage ? (
                            <div className="mb-4 rounded border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">
                              {assignmentValidationMessage}
                            </div>
                          ) : null}

                          {assignmentImportMode === 'bulk' ? (
                            <div>
                              <label className="block">
                                <span className="mb-2 block text-xs font-medium text-white/50">Teacher-Subject-Class-Number</span>
                              <textarea
                                value={bulkAssignmentText}
                                  onChange={(event) => {
                                    setBulkAssignmentText(event.target.value)
                                    setBulkAssignmentErrors([])
                                    setAssignmentValidationMessage(null)
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
                                    <div key={error.line} className="space-y-1">
                                      <p>Dòng {error.line}: {renderBulkAssignmentErrorLine(error)}</p>
                                      <p>{getBulkAssignmentErrorMessage(error)}</p>
                                    </div>
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
                                onChange={(value) => {
                                  setAssignmentDraft((current) => ({ ...current, teacher: value }))
                                  setAssignmentValidationMessage(null)
                                }}
                            />
                            <SelectField
                              icon={BookOpen}
                              label="Môn học"
                              placeholder="Chọn môn học đã nhập"
                              value={assignmentDraft.subject}
                              options={sortedSubjectList}
                                onChange={(value) => {
                                  setAssignmentDraft((current) => ({ ...current, subject: value }))
                                  setAssignmentValidationMessage(null)
                                }}
                            />
                            <SelectField
                              icon={Hash}
                              label="Lớp"
                              placeholder="Chọn lớp đã nhập"
                              value={assignmentDraft.className}
                              options={sortedClassList}
                                onChange={(value) => {
                                  setAssignmentDraft((current) => ({ ...current, className: value }))
                                  setAssignmentValidationMessage(null)
                                }}
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
                                  onChange={(event) => {
                                    setAssignmentDraft((current) => ({ ...current, weeklyPeriods: event.target.value }))
                                    setAssignmentValidationMessage(null)
                                  }}
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

                        <div className={`${totalAssignedPeriods === totalRequiredClassPeriods ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200' : 'border-amber-400/20 bg-amber-500/10 text-amber-200'} mb-4 rounded border p-3 text-xs`}>
                          <p>Tổng số tiết cần xếp của tất cả các lớp: {totalRequiredClassPeriods}</p>
                          <p>Tổng số tiết được phân công chuyên môn: {totalAssignedPeriods}</p>
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
                                        <Trash2 size={20} className="text-red-400/60 hover:text-red-400" strokeWidth={1.5} />
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
                <section className="app-page relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16">
                  <div className={navBarClass}>
                    <button type="button" onClick={() => setPage('assignments')} className={navBackClass}>
                      <ArrowLeft size={14} strokeWidth={1.5} />
                      Quay lại
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage('summary')}
                      disabled={!canProceedToSolve}
                      title={solveBlockHint ?? undefined}
                      className={`${navNextClass} ${navDisabledClass}`}
                    >
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
                        Import ràng buộc, bấm Phân tích, xác nhận từng dòng (Đúng rồi) rồi mới Tiếp tục xếp lịch.
                      </p>
                    </div>
                    <div className={`${panelClass} p-4 text-sm text-white/50 lg:max-w-md`}>
                      <p className="font-medium text-white">Tổng ràng buộc</p>
                      <p className="mt-2 text-3xl font-semibold text-white">{constraintList.length}</p>
                    </div>
                  </header>

                  <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(330px,0.7fr)_minmax(0,1.3fr)]">
                    <ConstraintInputPanel
                      draft={constraintDraft}
                      onDraftChange={(patch) => setConstraintDraft((current) => ({ ...current, ...patch }))}
                      onNormalizeCustom={() => void normalizeCustomConstraintDraft()}
                      onCreateBuiltIn={createBuiltInConstraint}
                      agentInput={constraintAgentInput}
                      totalCount={constraintList.length}
                      customNormalizeLoading={customNormalizeLoading}
                      customNormalizeError={customNormalizeError}
                    />
                    <ConstraintReviewPanel
                      constraints={sortedConstraintList}
                      drafts={constraintDrafts}
                      confirmed={confirmedConstraints}
                      newConstraintIds={newConstraintIds}
                      agentInput={constraintAgentInput}
                      parseError={parseError}
                      canSolve={canProceedToSolve}
                      solveBlockHint={solveBlockHint}
                      onConfirmDraft={(rawId) => confirmDraft(rawId, constraintDrafts)}
                      onIgnoreDraft={ignoreDraft}
                      onDeleteConstraint={deleteConstraint}
                      onSaveDraft={updateDraft}
                      onApplyTemplate={(c, templateId) =>
                        applyTemplate(c, templateId, constraintAgentInput, constraintDrafts.find((d) => d.rawConstraintId === c.id))
                      }
                      onRejectAndReparse={
                        aiProvider
                          ? (constraint, draft) => {
                              if (!aiProvider) return
                              void rejectAndReparse(
                                { id: constraint.id, text: constraint.text, type: constraint.type, weight: constraint.weight },
                                draft,
                                constraintAgentInput,
                                aiProvider
                              )
                            }
                          : undefined
                      }
                      reparseLoading={reparseLoading}
                    />
                  </div>

                  <InterpretationCardSection
                    drafts={constraintDrafts}
                    confirmed={confirmedConstraints}
                    onConfirmSpec={(rawId, spec) => {
                      const updatedDrafts = constraintDrafts.map((draft) =>
                        draft.rawConstraintId === rawId ? { ...draft, proposedSpecs: [spec] } : draft
                      )
                      const updatedDraft = updatedDrafts.find((draft) => draft.rawConstraintId === rawId)
                      if (updatedDraft) {
                        updateDraft(updatedDraft)
                        confirmDraft(rawId, updatedDrafts)
                      }
                    }}
                    onEditSpec={(rawId, spec) => {
                      const existing = constraintDrafts.find((d) => d.rawConstraintId === rawId)
                      if (existing) {
                        updateDraft({ ...existing, proposedSpecs: [spec] })
                      }
                    }}
                    onDismissSpec={() => {
                      // user dismissed; do nothing destructive
                    }}
                  />

                </section>
              ) : (
                <section className="app-page relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16">
                  <div className={navBarClass}>
                    <button type="button" onClick={() => setPage('constraints')} className={navBackClass}>
                      <ArrowLeft size={14} strokeWidth={1.5} />
                      Quay lại
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGenerate()}
                      disabled={aiLoading || !aiProvider || activePeriodCount <= 0 || !canProceedToSolve}
                      title={!canProceedToSolve ? (solveBlockHint ?? undefined) : undefined}
                      className={`${navNextClass} ${navDisabledClass}`}
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

                      {/* === NEW AI Provider Settings (replaces old Lowprizo key) === */}
                      <div className="mb-4 rounded-md border border-white/[0.06] bg-[#0a0a0a] p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="block text-xs font-medium text-white/50">AI Provider (Local)</span>
                          <button
                            type="button"
                            onClick={() => setShowSettingsModal(true)}
                            className="flex items-center gap-1 text-xs text-white/60 hover:text-white"
                          >
                            <SettingsIcon size={14} /> Cấu hình
                          </button>
                        </div>

                        <div className="text-sm text-white/80">
                          {aiProvider ? (
                            <div>
                              <div>Model: <span className="font-mono text-xs">{aiProvider.model}</span></div>
                              <div className="text-[10px] text-emerald-400">Đã cấu hình • Click "Cấu hình" để thay đổi</div>
                            </div>
                          ) : (
                            <div className="text-amber-400">Chưa cấu hình AI Provider</div>
                          )}
                        </div>
                      </div>

                      {solverRuntimeNotice && (
                        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-xs text-amber-200">
                          <span>{solverRuntimeNotice}</span>
                          <button
                            type="button"
                            onClick={() => setSolverRuntimeNotice(null)}
                            className="shrink-0 text-amber-200/70 hover:text-amber-100"
                          >
                            Đóng
                          </button>
                        </div>
                      )}

                      {secureStorageNotice && (
                        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-xs text-amber-200">
                          <span>{secureStorageNotice}</span>
                          <button
                            type="button"
                            onClick={() => setSecureStorageNotice(null)}
                            className="shrink-0 text-amber-200/70 hover:text-amber-100"
                          >
                            Đóng
                          </button>
                        </div>
                      )}

                      {aiLoading && (
                        <div className="mb-4 rounded-md border border-white/[0.08] bg-[#0a0a0a] p-4">
                          {/* Header with timer */}
                          <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm font-medium text-white/70">
                              <Loader2 size={14} className="animate-spin text-blue-400" strokeWidth={2} />
                              <span>Bộ xếp lịch đang hoạt động</span>
                            </div>
                            <span className="text-xs tabular-nums text-white/30">
                              {Math.floor(agentElapsed / 60)}:{String(agentElapsed % 60).padStart(2, '0')}
                            </span>
                          </div>

                            {/* Step indicators */}
                            <div className="mb-3 flex items-center gap-1">
                                {STEP_ORDER.map((step) => {
                                  const isActive = agentStep === step
                                  const currentStepIndex = agentStep === 'idle' ? -1 : STEP_ORDER.indexOf(agentStep)
                                  const isPast = currentStepIndex > STEP_ORDER.indexOf(step)
                                  return (

                                  <div key={step} className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-all ${isActive ? 'bg-blue-500/20 text-blue-400' : isPast ? 'bg-white/[0.04] text-white/30' : 'bg-white/[0.02] text-white/15'}`}>
                                    {isPast ? <Check size={9} strokeWidth={2.5} /> : isActive ? <Circle size={7} className="animate-pulse fill-current" /> : <Circle size={7} />}
                                    <span>{STEP_LABELS[step]}</span>
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
                          <section className={`${panelClass} p-4`}>
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <h3 className="text-sm font-semibold text-white">Kết quả kiểm tra lịch</h3>
                              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                                {SOLVER_STATUS_LABELS[aiResult.solverStatus ?? ''] ?? aiResult.status}
                              </span>
                            </div>
                            <p className="mb-3 text-xs text-white/55">{aiResult.message}</p>
                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                              <MetricCard label="Luật nền" value={aiResult.deterministicReport.baseConstraintPass ? 'Đạt' : 'Lỗi'} />
                              <MetricCard label="Bắt buộc" value={aiResult.deterministicReport.hardConstraintPass ? 'Đạt' : 'Lỗi'} />
                              <MetricCard label="Nên có" value={aiResult.deterministicReport.softConstraintPass ? 'Đạt' : 'Lỗi'} />
                              <MetricCard label="Vi phạm" value={aiResult.deterministicReport.violations.length} />
                              <MetricCard label="Bộ giải" value={SOLVER_STATUS_LABELS[aiResult.solverStatus ?? ''] ?? 'Đã giải'} />
                            </div>
                          </section>

                          {aiResult.deterministicReport.hardViolations.length > 0 ? (
                            <section className={`${panelClass} p-4`}>
                              <h3 className="mb-3 text-sm font-semibold text-white">Ràng buộc bắt buộc chưa đạt</h3>
                              <div className="space-y-2">
                                {aiResult.deterministicReport.hardViolations.map((violation, index) => (
                                  <div key={`${violation.constraintId}-${index}`} className="rounded-md border border-red-400/20 bg-red-400/[0.04] p-3">
                                    <p className="text-xs font-medium text-red-300/80">{violation.constraintId}</p>
                                    <p className="mt-1 text-sm text-white/75">{violation.message}</p>
                                  </div>
                                ))}
                              </div>
                            </section>
                          ) : null}

                          {aiResult.deterministicReport.uncheckedConstraintIds.length > 0 ? (
                            <section className={`${panelClass} p-4`}>
                              <p className="text-xs text-amber-200/80">
                                Chưa kiểm tra được: {aiResult.deterministicReport.uncheckedConstraintIds.join(', ')}
                              </p>
                            </section>
                          ) : null}

                          {showTechnicalErrors && (agentTimeline.length > 0 || (aiResult.attemptHistorySummary?.length ?? 0) > 0) && (
                            <section className={`${panelClass} p-4`}>
                              <h3 className="mb-3 text-sm font-semibold text-white">Timeline</h3>
                              {agentTimeline.length > 0 ? (
                                <div className="space-y-2">
                                  {agentTimeline.map((event) => (
                                    <div key={event.id} className="rounded-md border border-white/[0.06] bg-[#141414] p-3">
                                      <p className="text-xs text-white/35">{new Date(event.timestamp).toLocaleTimeString('vi-VN')}</p>
                                      <p className="text-sm font-medium text-white/80">{event.title}</p>
                                      <p className="text-xs text-white/45">{event.detail}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              {(aiResult.attemptHistorySummary?.length ?? 0) > 0 ? (
                                <div className="mt-3 space-y-2">
                                  {aiResult.attemptHistorySummary.map((attempt, index) => (
                                    <div key={`${attempt.stage}-${index}`} className="rounded-md border border-white/[0.06] bg-[#101010] p-3">
                                      <p className="text-xs text-white/35">{attempt.at}</p>
                                      <p className="text-sm text-white/75">{attempt.stage}: {attempt.summary}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </section>
                          )}

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
                                      <p className="text-xs font-medium text-red-300/70">Lỗi kiểm tra — {e.constraintId}</p>
                                      <p className="mt-0.5 text-xs text-white/40">{e.error}</p>
                                    </div>
                                  ))}
                                  {aiResult.executionErrors?.map((e, idx) => (
                                    <div key={`exec-${e.constraintId}-${idx}`} className="rounded border border-amber-400/15 bg-amber-400/[0.03] p-2.5">
                                      <p className="text-xs font-medium text-amber-300/70">Lỗi chạy solver — {e.constraintId}</p>
                                      <p className="mt-0.5 text-xs text-white/40 font-mono">{e.error}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </section>
                          )}
                        </div>
                      )}

                      {aiResult?.status === 'solved' && aiResult.deterministicReport.hardConstraintPass && (
                        <div className="mb-4 flex items-center gap-2 rounded-md border border-green-500/20 bg-green-500/[0.04] px-4 py-2.5 text-xs text-green-400">
                          <Check size={14} strokeWidth={2} />
                          <span>Tất cả ràng buộc cứng thỏa mãn</span>
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
                                              const entry = className ? solvedCellMap.get(cellKey)?.entries?.find((item) => item.className === className) : null

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
                          <div className="space-y-3">
                            <div className="rounded-md border border-white/[0.06] bg-[#0a0a0a] px-4 py-8 text-center text-sm font-semibold text-white">
                              <div>{aiError || aiResult?.message || RESULT_NOT_FOUND_MESSAGE}</div>
                              {aiResult?.diagnostics?.length ? (
                                <div className="mx-auto mt-3 max-w-2xl text-xs font-normal text-white/45">
                                  {aiResult.diagnostics.slice(0, 3).join(' · ')}
                                </div>
                              ) : null}
                            </div>
                            {aiResult?.deterministicReport?.hardViolations?.length ? (
                              <div className={`${panelClass} p-4`}>
                                <h3 className="mb-3 text-sm font-semibold text-red-300">Ràng buộc bắt buộc bị vi phạm</h3>
                                <div className="space-y-2">
                                  {aiResult.deterministicReport.hardViolations.map((v, i) => (
                                    <div key={`fail-v-${v.constraintId}-${i}`} className="rounded-md border border-red-400/20 bg-red-400/[0.04] p-3">
                                      <p className="text-xs font-medium text-red-300/80">{v.constraintId}</p>
                                      <p className="mt-1 text-sm text-white/75">{v.message}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {aiResult?.deterministicReport?.uncheckedConstraintIds?.length ? (
                              <div className={`${panelClass} p-3`}>
                                <p className="text-xs text-amber-200/80">
                                  Chưa kiểm tra được: {aiResult.deterministicReport.uncheckedConstraintIds.join(', ')}
                                </p>
                              </div>
                            ) : null}
                          </div>
                        ) : null}


                      </section>
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
                                const confirmed = confirmedConstraints.find((c) => c.rawConstraintId === constraint.id)
                                const draft = constraintDrafts.find((d) => d.rawConstraintId === constraint.id)
                                const displayText = confirmed?.summary
                                  ?? (draft?.proposedSpecs.length
                                    ? draft.proposedSpecs.map((s) => {
                                        const p = s.params as Record<string, unknown>
                                        if (s.kind === 'class_max_heavy_subjects_per_session') {
                                          return `Mỗi lớp, mỗi ngày, trong cùng một buổi: không dồn quá ${p.maxHeavyInSession ?? 2} môn nặng trong danh sách (${Array.isArray(p.subjects) ? p.subjects.join(', ') : ''})`
                                        }
                                        return s.original
                                      }).join('\n')
                                    : constraint.text)

                                return (
                                    <div key={constraint.id} className={`rounded-md border p-3 ${constraintType.boxClass}`}>

                                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${constraintType.badgeClass}`}>
                                        <Circle className={constraintType.iconClass} size={10} fill="currentColor" strokeWidth={0} />
                                        {constraintType.label}
                                      </span>
                                      {confirmed && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                                          <Check size={10} strokeWidth={2} />
                                          Đã duyệt
                                        </span>
                                      )}
                                  </div>
                                  <p className="rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5 text-sm text-white/60 whitespace-pre-line">
                                    {displayText}
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

                </section>
              )}
          </main>


      {/* AI Provider Settings Modal */}
      <SettingsModal
        open={showSettingsModal}
        onOpenChange={(open) => {
          setShowSettingsModal(open);
          if (!open && isFirstRun && !aiProvider) setShowSettingsModal(true);
        }}
        initialConfig={aiProvider || undefined}
        onSave={async (config) => {
          setAiProvider(config);
          const result = await persistProviderConfig(config);
          setSecureStorageNotice(
            result.secure
              ? null
              : 'API key đang được lưu không mã hóa vì máy/renderer chưa hỗ trợ secure storage. Hãy cân nhắc không lưu key trên máy này.',
          );
          pushSolverRuntimeMode(config.solverRuntimeMode);
          setIsFirstRun(false);
        }}
        requireValid={isFirstRun}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmTitle}
        description={confirmDescription}
        variant={confirmVariant}
        onConfirm={() => confirmActionRef.current?.()}
      />
    </>
  );
}

/**
 * Tier 4 — renders ConstraintInterpretationCard for any draft that needs clarification
 * (confidence='low' or custom_dsl hard). Surfaces 2-3 candidates and lets the user confirm / edit / dismiss.
 */
function InterpretationCardSection({
  drafts,
  confirmed,
  onConfirmSpec,
  onEditSpec,
  onDismissSpec,
}: {
  drafts: import('./ai/constraint-review-types').ParsedConstraintDraft[];
  confirmed: import('./ai/constraint-review-types').ConfirmedConstraint[];
  onConfirmSpec: (rawId: string, spec: import('./ai/constraint-spec').ConstraintSpec) => void;
  onEditSpec: (rawId: string, spec: import('./ai/constraint-spec').ConstraintSpec) => void;
  onDismissSpec: () => void;
}) {
  const confirmedRawIds = new Set(confirmed.map((c) => c.rawConstraintId));
  const ambiguous = drafts.filter(
    (d) =>
      !confirmedRawIds.has(d.rawConstraintId) &&
      (d.confidence === 'low' ||
        d.proposedSpecs.some((s) => s.kind === 'custom_dsl' && s.severity === 'hard')),
  );
  if (ambiguous.length === 0) return null;

  return (
    <div className="mt-4 space-y-3">
      {ambiguous.map((draft) => {
        const candidates: InterpretationCandidate[] = draft.proposedSpecs.slice(0, 3).map((spec) => ({
          spec,
          description: humanizeSpecSummary(spec),
        }));
        return (
          <ConstraintInterpretationCard
            key={draft.id}
            draft={draft}
            candidates={candidates}
            onConfirm={(spec) => onConfirmSpec(draft.rawConstraintId, spec)}
            onEdit={(spec) => onEditSpec(draft.rawConstraintId, spec)}
            onDismiss={onDismissSpec}
          />
        );
      })}
    </div>
  );
}

function humanizeSpecSummary(spec: import('./ai/constraint-spec').ConstraintSpec): string {
  if (spec.kind === 'custom_dsl' && spec.pythonPredicate) {
    return 'Mẫu tự do (Python)';
  }
  if (spec.kind === 'custom_dsl') {
    return 'Ràng buộc tự do';
  }
  if (spec.kind === 'if_then') {
    return 'Có điều kiện (nếu… thì…)';
  }
  if (spec.kind.startsWith('teacher_block')) {
    return 'Giáo viên không dạy vào';
  }
  if (spec.kind.startsWith('class_block')) {
    return 'Lớp không học vào';
  }
  return spec.kind;
}
