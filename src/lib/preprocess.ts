import type { InputPayload } from '@/lib/timetable-prompt'
import { getBaseSolverTemplatePath, getGeneratedSolverArtifactPath, readBaseSolverTemplate } from '@/lib/generated-solver-artifacts'

export type PreprocessWarning = {
  code: string
  message: string
}

export type PreprocessStats = {
  slotCount: number
  assignmentCount: number
  teacherCount: number
  classCount: number
  subjectCount: number
}

export type PreprocessMetadata = {
  teacherToAssignments: Record<string, string[]>
  classToAssignments: Record<string, string[]>
  subjectToAssignments: Record<string, string[]>
  slotsByDay: Record<string, string[]>
  slotsBySession: Record<string, string[]>
  slotsByDaySession: Record<string, string[]>
}

export type SolverAuthoringContext = {
  generatedArtifactPath: string
  baseTemplatePath: string
  baseTemplateCode: string
  requirementDigest: {
    hardConstraints: string[]
    softConstraints: string[]
    teacherCount: number
    classCount: number
    subjectCount: number
    slotCount: number
    assignmentCount: number
  }
}

export type PreprocessResult =
  | {
      ok: true
      normalizedPayload: InputPayload
      warnings: PreprocessWarning[]
      diagnostics: string[]
      stats: PreprocessStats
      metadata: PreprocessMetadata
      authoringContext: SolverAuthoringContext
    }
  | {
      ok: false
      fatalErrors: string[]
      warnings: PreprocessWarning[]
      diagnostics: string[]
    }

function normalizeText(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim()
}

function pushIndex(map: Record<string, string[]>, key: string, value: string) {
  if (!map[key]) map[key] = []
  map[key].push(value)
}

export function preprocessInputPayload(payload: InputPayload): PreprocessResult {
  const warnings: PreprocessWarning[] = []
  const fatalErrors: string[] = []

  const seenSlotIds = new Set<string>()
  const seenSlotCoords = new Set<string>()
  const normalizedSlots: InputPayload['slots'] = []

  for (const slot of payload.slots) {
    const id = normalizeText(String(slot.id ?? ''))
    const dayId = normalizeText(String(slot.dayId ?? ''))
    const dayLabel = normalizeText(String(slot.dayLabel ?? ''))
    const sessionId = normalizeText(String(slot.sessionId ?? ''))
    const sessionLabel = normalizeText(String(slot.sessionLabel ?? ''))
    const period = Number(slot.period)

    if (!id) fatalErrors.push('Có slot bị thiếu id.')
    if (!dayId) fatalErrors.push(`Slot ${id || '(không rõ id)'} bị thiếu dayId.`)
    if (!sessionId) fatalErrors.push(`Slot ${id || '(không rõ id)'} bị thiếu sessionId.`)
    if (!dayLabel) fatalErrors.push(`Slot ${id || '(không rõ id)'} bị thiếu dayLabel.`)
    if (!sessionLabel) fatalErrors.push(`Slot ${id || '(không rõ id)'} bị thiếu sessionLabel.`)
    if (!Number.isInteger(period) || period <= 0) fatalErrors.push(`Slot ${id || '(không rõ id)'} có period không hợp lệ.`)

    if (id) {
      if (seenSlotIds.has(id)) fatalErrors.push(`Trùng slot id: ${id}`)
      seenSlotIds.add(id)
    }

    const coordKey = `${dayId}__${sessionId}__${period}`
    if (dayId && sessionId && Number.isInteger(period) && period > 0) {
      if (seenSlotCoords.has(coordKey)) fatalErrors.push(`Trùng slot theo tọa độ: ${coordKey}`)
      seenSlotCoords.add(coordKey)
    }

    normalizedSlots.push({
      id,
      dayId,
      dayLabel,
      sessionId,
      sessionLabel,
      period,
    })
  }

  const seenAssignmentIds = new Set<string>()
  const normalizedAssignments: InputPayload['assignments'] = []

  for (const assignment of payload.assignments) {
    const id = normalizeText(String(assignment.id ?? ''))
    const teacherId = normalizeText(String(assignment.teacherId ?? ''))
    const teacherLabel = normalizeText(String(assignment.teacherLabel ?? ''))
    const classId = normalizeText(String(assignment.classId ?? ''))
    const classLabel = normalizeText(String(assignment.classLabel ?? ''))
    const subjectId = normalizeText(String(assignment.subjectId ?? ''))
    const subjectLabel = normalizeText(String(assignment.subjectLabel ?? ''))
    const weeklyPeriods = Number(assignment.weeklyPeriods)

    if (!id) fatalErrors.push('Có assignment bị thiếu id.')
    if (!teacherId) fatalErrors.push(`Assignment ${id || '(không rõ id)'} bị thiếu teacherId.`)
    if (!teacherLabel) fatalErrors.push(`Assignment ${id || '(không rõ id)'} bị thiếu teacherLabel.`)
    if (!classId) fatalErrors.push(`Assignment ${id || '(không rõ id)'} bị thiếu classId.`)
    if (!classLabel) fatalErrors.push(`Assignment ${id || '(không rõ id)'} bị thiếu classLabel.`)
    if (!subjectId) fatalErrors.push(`Assignment ${id || '(không rõ id)'} bị thiếu subjectId.`)
    if (!subjectLabel) fatalErrors.push(`Assignment ${id || '(không rõ id)'} bị thiếu subjectLabel.`)
    if (!Number.isInteger(weeklyPeriods) || weeklyPeriods <= 0) {
      fatalErrors.push(`Assignment ${id || '(không rõ id)'} có weeklyPeriods không hợp lệ.`)
    }

    if (id) {
      if (seenAssignmentIds.has(id)) fatalErrors.push(`Trùng assignment id: ${id}`)
      seenAssignmentIds.add(id)
    }

    normalizedAssignments.push({
      id,
      teacherId,
      teacherLabel,
      classId,
      classLabel,
      subjectId,
      subjectLabel,
      weeklyPeriods,
    })
  }

  if (normalizedSlots.length === 0) fatalErrors.push('Không có slot khả dụng.')
  if (normalizedAssignments.length === 0) fatalErrors.push('Không có phân công để xếp.')

  const normalizedPayload: InputPayload = {
    slots: normalizedSlots,
    assignments: normalizedAssignments,
    hardConstraints: payload.hardConstraints.map((constraint) => ({
      id: normalizeText(String(constraint.id ?? '')),
      text: normalizeText(String(constraint.text ?? '')),
    })),
    softConstraints: payload.softConstraints.map((constraint) => ({
      id: normalizeText(String(constraint.id ?? '')),
      text: normalizeText(String(constraint.text ?? '')),
      weight: Number(constraint.weight),
    })),
  }

  for (const constraint of normalizedPayload.hardConstraints) {
    if (!constraint.id) fatalErrors.push('Có hard constraint bị thiếu id.')
    if (!constraint.text) warnings.push({ code: 'EMPTY_HARD_CONSTRAINT', message: 'Có hard constraint rỗng, AI compiler có thể bỏ qua.' })
  }

  for (const constraint of normalizedPayload.softConstraints) {
    if (!constraint.id) fatalErrors.push('Có soft constraint bị thiếu id.')
    if (!constraint.text) warnings.push({ code: 'EMPTY_SOFT_CONSTRAINT', message: 'Có soft constraint rỗng, AI compiler có thể bỏ qua.' })
    if (!Number.isFinite(constraint.weight) || constraint.weight <= 0) {
      fatalErrors.push(`Soft constraint ${constraint.id || '(không rõ id)'} có weight không hợp lệ.`)
    }
  }

  if (fatalErrors.length > 0) {
    return {
      ok: false,
      fatalErrors,
      warnings,
      diagnostics: ['Preprocess phát hiện dữ liệu đầu vào không hợp lệ về mặt cấu trúc.'],
    }
  }

  const teacherToAssignments: Record<string, string[]> = {}
  const classToAssignments: Record<string, string[]> = {}
  const subjectToAssignments: Record<string, string[]> = {}
  const slotsByDay: Record<string, string[]> = {}
  const slotsBySession: Record<string, string[]> = {}
  const slotsByDaySession: Record<string, string[]> = {}

  for (const assignment of normalizedAssignments) {
    pushIndex(teacherToAssignments, assignment.teacherId, assignment.id)
    pushIndex(classToAssignments, assignment.classId, assignment.id)
    pushIndex(subjectToAssignments, assignment.subjectId, assignment.id)
  }

  for (const slot of normalizedSlots) {
    pushIndex(slotsByDay, slot.dayId, slot.id)
    pushIndex(slotsBySession, slot.sessionId, slot.id)
    pushIndex(slotsByDaySession, `${slot.dayId}__${slot.sessionId}`, slot.id)
  }

  const stats: PreprocessStats = {
    slotCount: normalizedSlots.length,
    assignmentCount: normalizedAssignments.length,
    teacherCount: Object.keys(teacherToAssignments).length,
    classCount: Object.keys(classToAssignments).length,
    subjectCount: Object.keys(subjectToAssignments).length,
  }

  const diagnostics = [
    'Preprocess chỉ kiểm tra cấu trúc dữ liệu đầu vào và chuẩn hóa payload.',
    'Base constraints chắc chắn sẽ được template solver áp dụng trước.',
    'Toàn bộ hard/soft constraints người dùng nhập sẽ được Agent 1 hiện thực trực tiếp trong solver generated.',
  ]

  return {
    ok: true,
    normalizedPayload,
    warnings,
    diagnostics,
    stats,
    metadata: {
      teacherToAssignments,
      classToAssignments,
      subjectToAssignments,
      slotsByDay,
      slotsBySession,
      slotsByDaySession,
    },
    authoringContext: {
      generatedArtifactPath: getGeneratedSolverArtifactPath(),
      baseTemplatePath: getBaseSolverTemplatePath(),
      baseTemplateCode: readBaseSolverTemplate(),
      requirementDigest: {
        hardConstraints: normalizedPayload.hardConstraints.map((constraint) => constraint.text),
        softConstraints: normalizedPayload.softConstraints.map((constraint) => constraint.text),
        teacherCount: stats.teacherCount,
        classCount: stats.classCount,
        subjectCount: stats.subjectCount,
        slotCount: stats.slotCount,
        assignmentCount: stats.assignmentCount,
      },
    },
  }
}
