import type {
  ConstraintConfirmationItem,
  NormalizedAssignment,
  SolverConstraint,
  SolverRequestPayload,
} from '@/features/timetable/ai/types'
import type { ParsedConstraint } from '@/lib/constraint-parser'
import { parseConstraint } from '@/lib/constraint-parser'
import { estimateSolverConfig } from '@/lib/timetable-prompt'

export type SolverSlot = {
  id: string
  dayId: string
  dayLabel: string
  sessionId: string
  sessionLabel: string
  period: number
}

export type SolverHardConstraint = {
  id: string
  text: string
}

export type SolverSoftConstraint = {
  id: string
  text: string
  weight: number
}

export type SolverPayload = {
  days: SolverRequestPayload['days']
  sessions: SolverRequestPayload['sessions']
  periodCounts: SolverRequestPayload['periodCounts']
  deletedPeriods: SolverRequestPayload['deletedPeriods']
  slots: SolverSlot[]
  assignments: Array<{
    id: string
    teacherId: string
    teacherLabel: string
    classId: string
    classLabel: string
    subjectId: string
    subjectLabel: string
    weeklyPeriods: number
  }>
  hardConstraints: SolverHardConstraint[]
  softConstraints: SolverSoftConstraint[]
}

export type NormalizedConstraint = {
  id: string
  original: string
  parsed: ParsedConstraint
  weight?: number
  confirmation?: ConstraintConfirmationItem | null
}

export type ProblemMeta = {
  teacherToAssignmentIds: Record<string, string[]>
  classToAssignmentIds: Record<string, string[]>
  subjectToAssignmentIds: Record<string, string[]>
}

export type InternalProblemMeta = ProblemMeta & {
  assignmentMap: Record<string, SolverPayload['assignments'][number]>
  slotMap: Record<string, SolverPayload['slots'][number]>
  slotsByDayId: Record<string, string[]>
  slotsBySessionId: Record<string, string[]>
  slotsByPeriod: Record<string, string[]>
  slotsByDayPeriod: Record<string, string[]>
  slotsByDaySession: Record<string, string[]>
  slotsBySessionPeriod: Record<string, string[]>
}

export type SolverProblemContext = {
  requestId: string
  request: SolverRequestPayload
  payload: SolverPayload
  parsedHard: NormalizedConstraint[]
  parsedSoft: NormalizedConstraint[]
  meta: InternalProblemMeta
  problem: {
    days: SolverRequestPayload['days']
    sessions: SolverRequestPayload['sessions']
    periodCounts: SolverRequestPayload['periodCounts']
    deletedPeriods: SolverRequestPayload['deletedPeriods']
    slots: Array<{
      slotId: string
      dayId: string
      dayLabel: string
      sessionId: string
      sessionLabel: string
      period: number
    }>
    assignments: Array<{
      assignmentId: string
      teacherId: string
      teacherLabel: string
      classId: string
      classLabel: string
      subjectId: string
      subjectLabel: string
      weeklyPeriods: number
    }>
    constraints: SolverRequestPayload['constraints']
    hardConstraints: SolverHardConstraint[]
    softConstraints: SolverSoftConstraint[]
    solverConfig: ReturnType<typeof estimateSolverConfig>
    meta: ProblemMeta
  }
}

function toAgentProblemMeta(meta: InternalProblemMeta): ProblemMeta {
  return {
    teacherToAssignmentIds: meta.teacherToAssignmentIds,
    classToAssignmentIds: meta.classToAssignmentIds,
    subjectToAssignmentIds: meta.subjectToAssignmentIds,
  }
}

function buildSlots(request: SolverRequestPayload): SolverSlot[] {
  const slots: SolverSlot[] = []
  for (const day of request.days) {
    for (const session of request.sessions) {
      const count = request.periodCounts[session.id] ?? 0
      for (let i = 0; i < count; i += 1) {
        const period = i + 1
        const key = `${day.id}-${session.id}-${period}`
        if (request.deletedPeriods[key]) continue
        slots.push({
          id: key,
          dayId: day.id,
          dayLabel: day.label,
          sessionId: session.id,
          sessionLabel: session.label,
          period,
        })
      }
    }
  }
  return slots
}

function buildAssignments(assignments: NormalizedAssignment[]): SolverPayload['assignments'] {
  return assignments.map((assignment) => ({
    id: assignment.id,
    teacherId: assignment.teacher.id,
    teacherLabel: assignment.teacher.label,
    classId: assignment.class.id,
    classLabel: assignment.class.label,
    subjectId: assignment.subject.id,
    subjectLabel: assignment.subject.label,
    weeklyPeriods: assignment.weeklyPeriods,
  }))
}

function buildConstraintBuckets(constraints: SolverConstraint[]) {
  const hardConstraints: SolverHardConstraint[] = []
  const softConstraints: SolverSoftConstraint[] = []

  constraints.forEach((constraint, index) => {
    if (constraint.type === 'required') {
      hardConstraints.push({ id: `hc_${index + 1}`, text: constraint.text })
      return
    }

    softConstraints.push({
      id: `sc_${index + 1}`,
      text: constraint.text,
      weight: constraint.weight,
    })
  })

  return { hardConstraints, softConstraints }
}

function pushIndex(map: Record<string, string[]>, key: string, value: string) {
  if (!map[key]) map[key] = []
  map[key].push(value)
}

function summarizePayload(payload: SolverPayload): InternalProblemMeta {
  const teacherToAssignmentIds: Record<string, string[]> = {}
  const classToAssignmentIds: Record<string, string[]> = {}
  const subjectToAssignmentIds: Record<string, string[]> = {}
  const assignmentMap: InternalProblemMeta['assignmentMap'] = {}
  const slotMap: InternalProblemMeta['slotMap'] = {}
  const slotsByDayId: Record<string, string[]> = {}
  const slotsBySessionId: Record<string, string[]> = {}
  const slotsByPeriod: Record<string, string[]> = {}
  const slotsByDayPeriod: Record<string, string[]> = {}
  const slotsByDaySession: Record<string, string[]> = {}
  const slotsBySessionPeriod: Record<string, string[]> = {}

  for (const assignment of payload.assignments) {
    assignmentMap[assignment.id] = assignment
    pushIndex(teacherToAssignmentIds, assignment.teacherLabel, assignment.id)
    pushIndex(classToAssignmentIds, assignment.classLabel, assignment.id)
    pushIndex(subjectToAssignmentIds, assignment.subjectLabel, assignment.id)
  }

  for (const slot of payload.slots) {
    slotMap[slot.id] = slot
    pushIndex(slotsByDayId, slot.dayId, slot.id)
    pushIndex(slotsBySessionId, slot.sessionId, slot.id)
    pushIndex(slotsByPeriod, String(slot.period), slot.id)
    pushIndex(slotsByDayPeriod, `${slot.dayId}__${slot.period}`, slot.id)
    pushIndex(slotsByDaySession, `${slot.dayId}__${slot.sessionId}`, slot.id)
    pushIndex(slotsBySessionPeriod, `${slot.sessionId}__${slot.period}`, slot.id)
  }

  return {
    teacherToAssignmentIds,
    classToAssignmentIds,
    subjectToAssignmentIds,
    assignmentMap,
    slotMap,
    slotsByDayId,
    slotsBySessionId,
    slotsByPeriod,
    slotsByDayPeriod,
    slotsByDaySession,
    slotsBySessionPeriod,
  }
}

function buildParseContext(request: SolverRequestPayload) {
  return {
    teacherLabels: [...new Set(request.assignments.map((item) => item.teacher.label).filter(Boolean))],
    classLabels: [...new Set(request.assignments.map((item) => item.class.label).filter(Boolean))],
    subjectLabels: [...new Set(request.assignments.map((item) => item.subject.label).filter(Boolean))],
    dayIds: Object.fromEntries(request.days.map((day) => [day.label, day.id])),
    sessionIds: Object.fromEntries(request.sessions.map((session) => [session.label, session.id])),
  }
}

function buildNormalizedConstraints(
  list: SolverHardConstraint[] | SolverSoftConstraint[],
  confirmations: ConstraintConfirmationItem[] | undefined,
  request: SolverRequestPayload,
) {
  const ctx = buildParseContext(request)
  return list.map((constraint) => ({
    id: constraint.id,
    original: constraint.text,
    parsed: parseConstraint(constraint.text, ctx),
    weight: 'weight' in constraint ? constraint.weight : undefined,
    confirmation: confirmations?.find((item) => item.id === constraint.id) ?? null,
  }))
}

export function buildSolverProblemContext(
  request: SolverRequestPayload,
  requestId: string,
): SolverProblemContext {
  const slots = buildSlots(request)
  const assignments = buildAssignments(request.assignments)
  const { hardConstraints, softConstraints } = buildConstraintBuckets(request.constraints)
  const payload: SolverPayload = {
    days: request.days,
    sessions: request.sessions,
    periodCounts: request.periodCounts,
    deletedPeriods: request.deletedPeriods,
    slots,
    assignments,
    hardConstraints,
    softConstraints,
  }

  const solverConfig = estimateSolverConfig({
    days: request.days,
    sessions: request.sessions,
    periodCounts: request.periodCounts,
    deletedPeriods: request.deletedPeriods,
    assignments: request.assignments,
  })
  const meta = summarizePayload(payload)
  const parsedHard = buildNormalizedConstraints(hardConstraints, request.constraintConfirmations, request)
  const parsedSoft = buildNormalizedConstraints(softConstraints, request.constraintConfirmations, request)
  const agentProblemMeta = toAgentProblemMeta(meta)

  return {
    requestId,
    request,
    payload,
    parsedHard,
    parsedSoft,
    meta,
    problem: {
      days: request.days,
      sessions: request.sessions,
      periodCounts: request.periodCounts,
      deletedPeriods: request.deletedPeriods,
      slots: payload.slots.map((slot) => ({
        slotId: slot.id,
        dayId: slot.dayId,
        dayLabel: slot.dayLabel,
        sessionId: slot.sessionId,
        sessionLabel: slot.sessionLabel,
        period: slot.period,
      })),
      assignments: payload.assignments.map((assignment) => ({
        assignmentId: assignment.id,
        teacherId: assignment.teacherId,
        teacherLabel: assignment.teacherLabel,
        classId: assignment.classId,
        classLabel: assignment.classLabel,
        subjectId: assignment.subjectId,
        subjectLabel: assignment.subjectLabel,
        weeklyPeriods: assignment.weeklyPeriods,
      })),
      constraints: request.constraints,
      hardConstraints,
      softConstraints,
      solverConfig,
      meta: agentProblemMeta,
    },
  }
}
