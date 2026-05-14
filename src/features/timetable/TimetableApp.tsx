'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Circle,
  Hash,
  Loader2,
  Minus,
  Plus,
  RadioTower,
  RotateCcw,
  ClipboardList,
  Sparkles,
  Sun,
  Trash2,
  User,
  Zap,
} from 'lucide-react'

import { generateTimetableWithAI } from './ai/client'
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

function SessionTile({ selected, icon: Icon, title, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center justify-center gap-2.5 rounded-md px-4 py-3 transition-all duration-200 ${
        selected
          ? 'bg-[#4DB848] text-[#0a0a0a]'
          : 'border border-white/[0.06] bg-[#141414] text-white hover:border-white/[0.12] hover:bg-white/[0.04]'
      }`}
    >
      <Icon size={18} className={selected ? 'text-[#0a0a0a]' : 'text-white/50'} strokeWidth={1.5} />
      <span className={`text-sm font-semibold ${selected ? 'text-[#0a0a0a]' : 'text-white'}`}>{title}</span>
    </button>
  )
}

function PeriodControl({ session, value, onChange }) {
  const Icon = session.icon
  const [rawInput, setRawInput] = useState(String(value))
  const [isInvalid, setIsInvalid] = useState(false)

  // Sync rawInput when parent value changes externally (e.g. +/- buttons)
  const prevValue = useRef(value)
  useEffect(() => {
    if (value !== prevValue.current) {
      setRawInput(String(value))
      setIsInvalid(false)
      prevValue.current = value
    }
  }, [value])

  const clampValue = (nextValue) => Math.min(12, Math.max(1, nextValue))

  const commitValue = (nextValue) => {
    const cleanValue = Number.isNaN(nextValue) ? value : clampValue(nextValue)
    onChange(session.id, cleanValue)
    setRawInput(String(cleanValue))
    setIsInvalid(false)
    prevValue.current = cleanValue
  }

  const handleInputChange = (event) => {
    const raw = event.target.value
    setRawInput(raw)

    if (raw === '') {
      setIsInvalid(true)
      return
    }

    const num = Number(raw)
    if (Number.isNaN(num) || num < 1 || num > 12 || !Number.isInteger(num)) {
      setIsInvalid(true)
    } else {
      setIsInvalid(false)
      onChange(session.id, num)
    }
  }

  const handleBlur = () => {
    if (rawInput === '' || isInvalid) {
      commitValue(value)
    } else {
      commitValue(Number(rawInput))
    }
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleBlur()
    }
  }

  // Sync raw input when parent value changes (e.g. via +/- buttons)
  const displayValue = rawInput

  return (
    <div className={`${panelClass} p-4`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`${iconShellClass} shrink-0`}>
            <Icon size={16} strokeWidth={1.5} />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">{session.label}</p>
            <p className="text-xs text-white/40">Số tiết tối đa cho buổi này</p>
          </div>
        </div>

        <div className={`${panelMutedClass} flex items-center gap-2 p-1.5`}>
          <button
            type="button"
            onClick={() => commitValue(value - 1)}
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
            onClick={() => commitValue(value + 1)}
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

function AiMarkdown({ content }) {
  const lines = content.split('\n')
  const elements = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="mb-2 mt-4 text-base font-semibold text-white">{line.slice(4)}</h3>)
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="mb-2 mt-5 text-lg font-semibold text-white">{line.slice(3)}</h2>)
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="mb-3 mt-6 text-xl font-semibold text-white">{line.slice(2)}</h1>)
    } else if (line.startsWith('|')) {
      const tableLines = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      const [header, separator, ...rows] = tableLines
      if (header) {
        const headers = header.split('|').filter((c) => c.trim())
        elements.push(
          <div key={`table-${i}`} className="my-3 overflow-x-auto rounded-md border border-white/[0.06] bg-[#141414]">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr>
                  {headers.map((h, idx) => (
                    <th key={idx} className="border-b border-white/[0.06] bg-white/[0.02] px-3 py-2 text-left text-xs font-medium text-white/70">
                      {h.trim()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-[#0a0a0a]' : ''}>
                    {row.split('|').filter((c) => c.trim() !== undefined && c !== '').map((cell, cellIdx) => (
                      <td key={cellIdx} className="border-b border-white/[0.04] px-3 py-2 text-sm text-white/60">
                        {cell.trim()}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      continue
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <li key={i} className="ml-4 list-disc text-white/60">
          {line.slice(2).replace(/\*\*(.*?)\*\*/g, '$1')}
        </li>
      )
    } else if (line.trim() === '') {
      elements.push(<br key={i} />)
    } else {
      const formatted = line.replace(/\*\*(.*?)\*\*/g, (_, m) => m)
      elements.push(<p key={i} className="my-1 text-sm leading-6 text-white/60">{formatted}</p>)
    }
    i++
  }

  return <div>{elements}</div>
}

export default function App() {
  const [page, setPage] = useState('select')
  const [selectedDays, setSelectedDays] = useState(['monday', 'wednesday', 'friday'])
  const [selectedSessions, setSelectedSessions] = useState(['morning'])
  const [periods, setPeriods] = useState(defaultPeriods)
  const [deletedPeriods, setDeletedPeriods] = useState({})
  const [teacherInput, setTeacherInput] = useState('')
  const [teacherList, setTeacherList] = useState([])
  const [subjectInput, setSubjectInput] = useState('')
  const [subjectList, setSubjectList] = useState([])
  const [classInput, setClassInput] = useState('')
  const [classList, setClassList] = useState([])
  const [assignmentDraft, setAssignmentDraft] = useState({ teacher: '', subject: '', className: '', weeklyPeriods: '' })
  const [assignmentList, setAssignmentList] = useState([])
  const [constraintDraft, setConstraintDraft] = useState({ type: 'required', text: '' })
  const [constraintList, setConstraintList] = useState([])
  const [aiResult, setAiResult] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)

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

  const importTeacher = () => {
    const name = teacherInput.trim()
    if (!name) return

    setTeacherList((current) => (current.includes(name) ? current : [...current, name]))
    setTeacherInput('')
  }

  const deleteTeacher = (name) => {
    setTeacherList((current) => current.filter((teacher) => teacher !== name))
  }

  const importSubject = (presetValue) => {
    const name = normalizeSubjectName(presetValue ?? subjectInput)
    if (!name) return

    setSubjectList((current) => (current.includes(name) ? current : [...current, name]))
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
        if (!next.includes(className)) {
          next.push(className)
        }
      })
      return next
    })
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
    const text = constraintDraft.text.trim()
    if (!text) return

    const nextConstraint = {
      id: `${Date.now()}-${text}`,
      type: constraintDraft.type,
      text,
    }

    setConstraintList((current) => [...current, nextConstraint])
    setConstraintDraft((current) => ({ ...current, text: '' }))
  }

  const deleteConstraint = (id) => {
    setConstraintList((current) => current.filter((constraint) => constraint.id !== id))
  }

  const handleGenerate = async () => {
    setAiLoading(true)
    setAiError(null)
    setAiResult(null)
    try {
      const result = await generateTimetableWithAI({
        days: selectedSpreadsheetDays,
        sessions: selectedSessionData,
        periodCounts: periods,
        deletedPeriods,
        assignments: assignmentList,
        constraints: constraintList,
      })
      setAiResult(result)
    } catch (err) {
      setAiError(err.message)
    } finally {
      setAiLoading(false)
    }
  }

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
                disabled
                className={`${navBackClass} ${navDisabledClass}`}
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
              <div className={`${panelClass} p-4 text-sm text-white/50 lg:max-w-md`}>
                <p className="font-medium text-white">Giao diện</p>
                <div className="mt-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/50">
                  <Zap size={14} strokeWidth={1.5} className="text-[#4DB848]" />
                  <span>Xanh</span>
                </div>
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
              onClick={() => setPage('details')}
              className={navNextClass}
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
                <div className="mb-4 flex items-center gap-2.5">
                  <span className={iconShellClass}>
                    <User size={16} strokeWidth={1.5} />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-white">Nhập giáo viên</h2>
                    <p className="text-xs text-white/40">Thêm từng giáo viên vào danh sách</p>
                  </div>
                </div>

                <label className="block">
                  <span className="mb-2 block text-xs font-medium text-white/50">Nhập tên giáo viên</span>
                  <input
                    type="text"
                    value={teacherInput}
                    onChange={(event) => setTeacherInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        importTeacher()
                      }
                    }}
                    placeholder="Ví dụ: Nguyễn Văn A"
                    className={inputClass}
                  />
                </label>

                <button
                  type="button"
                  onClick={importTeacher}
                  disabled={!teacherInput.trim()}
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

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-white/50">Nhập tên môn học</span>
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
  
                        <button type="button" onClick={importAssignment} disabled={!assignmentDraft.teacher || !assignmentDraft.subject || !assignmentDraft.className || !assignmentDraft.weeklyPeriods.trim()} className={`${primaryButtonClass} ${disabledPrimaryButtonClass} mt-4 w-full`}>
                        <Plus size={14} strokeWidth={1.5} />
                        Thêm phân công
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
                        Chọn loại ràng buộc trước, nhập nội dung, rồi bấm Import để append vào bảng constraints.
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
                            placeholder="Ví dụ: Giáo viên Long không dạy tiết 1 sáng thứ 2"
                            rows={4}
                            className="w-full resize-none rounded-md border border-white/[0.08] bg-[#0a0a0a] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                          />
                      </label>

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
                            Chưa có ràng buộc nào. Chọn Bắt buộc hoặc Nên có, nhập nội dung rồi bấm Import.
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
                      onClick={handleGenerate}
                      disabled={aiLoading}
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
                          <h2 className="text-sm font-semibold text-white">Bảng thời khóa biểu</h2>
                            <p className="text-xs text-white/40">Chỉ hiển thị những ô tiết đã chọn ở trang chỉnh thời khóa biểu.</p>
                        </div>
                      </div>

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
                              <p className="text-xs text-white/30">ô tiết trong thời khóa biểu</p>
                            </div>
                          )
                        })}
                      </div>

                      <div className="overflow-auto rounded-md border border-white/[0.06] bg-[#141414] text-white">
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
                                <th key={day.id} className="sticky top-0 z-10 h-12 border-b border-r border-white/[0.06] bg-[#141414] px-3 text-center text-sm font-semibold text-white">
                                  {day.tableLabel}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                              {summaryTimetableRows.map((row) => (
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
                                      <td key={cellKey} className="border-b border-r border-white/[0.04] p-2">
                                        {!isDeleted ? (
                                            <div className="flex h-7 w-full items-center justify-center rounded border border-white/[0.06] bg-[#141414] px-2 text-xs font-medium text-white/50">
                                            {row.period}
                                          </div>
                                        ) : null}
                                      </td>
                                    )
                                })}
                              </tr>
                            ))}
                          </tbody>
                          </table>
                        </div>
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

                    {(aiLoading || aiResult || aiError) && (
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
                              onClick={handleGenerate}
                              className={ghostButtonClass + ' mt-3'}
                            >
                              <RotateCcw size={14} strokeWidth={1.5} />
                              Thử lại
                            </button>
                          </div>
                        )}

                        {aiResult && !aiLoading && (
                          <div className="rounded-md border border-white/[0.06] bg-[#0a0a0a] p-4 text-white">
                            <AiMarkdown content={aiResult} />
                          </div>
                        )}
                      </section>
                    )}


                </section>
              )}
          </main>


  )
}
