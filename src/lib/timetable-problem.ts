import type {
  ConstraintConfirmationItem,
  GenerateTimetableRequest,
} from '@/features/timetable/ai/types'
import type { ParsedConstraint } from '@/lib/constraint-parser'
import { parseConstraint } from '@/lib/constraint-parser'
import { estimateSolverConfig } from '@/lib/timetable-prompt'
import type { InputPayload } from '@/lib/timetable-prompt'

export type NormalizedConstraint = {
  id: string
  original: string
  parsed: ParsedConstraint
  weight?: number
  confirmation?: ConstraintConfirmationItem | null
}

export type ProblemMeta = {
  teacherToAsgIds: Record<string, string[]>
  classToAsgIds: Record<string, string[]>
  subjectToAsgIds: Record<string, string[]>
  assignmentMap: Record<string, InputPayload['assignments'][number]>
  slotMap: Record<string, InputPayload['slots'][number]>
  slotsByDayId: Record<string, string[]>
  slotsBySessionId: Record<string, string[]>
  slotsByPeriod: Record<string, string[]>
  slotsByDayPeriod: Record<string, string[]>
  slotsByDaySession: Record<string, string[]>
  slotsBySessionPeriod: Record<string, string[]>
}

export type NormalizedSolverProblem = {
  requestId: string
  problem: {
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
    hardConstraints: InputPayload['hardConstraints']
    softConstraints: InputPayload['softConstraints']
    parsedHard: NormalizedConstraint[]
    parsedSoft: NormalizedConstraint[]
    solverConfig: ReturnType<typeof estimateSolverConfig>
    meta: ProblemMeta
  }
  payload: InputPayload
  parsedHard: NormalizedConstraint[]
  parsedSoft: NormalizedConstraint[]
  meta: ProblemMeta
}

function pushIndex(map: Record<string, string[]>, key: string, value: string) {
  if (!map[key]) map[key] = []
  map[key].push(value)
}

function summarizePayload(payload: InputPayload): ProblemMeta {
  const teacherToAsgIds: Record<string, string[]> = {}
  const classToAsgIds: Record<string, string[]> = {}
  const subjectToAsgIds: Record<string, string[]> = {}
  const assignmentMap: ProblemMeta['assignmentMap'] = {}
  const slotMap: ProblemMeta['slotMap'] = {}
  const slotsByDayId: Record<string, string[]> = {}
  const slotsBySessionId: Record<string, string[]> = {}
  const slotsByPeriod: Record<string, string[]> = {}
  const slotsByDayPeriod: Record<string, string[]> = {}
  const slotsByDaySession: Record<string, string[]> = {}
  const slotsBySessionPeriod: Record<string, string[]> = {}

  for (const assignment of payload.assignments) {
    assignmentMap[assignment.id] = assignment
    pushIndex(teacherToAsgIds, assignment.teacherLabel, assignment.id)
    pushIndex(classToAsgIds, assignment.classLabel, assignment.id)
    pushIndex(subjectToAsgIds, assignment.subjectLabel, assignment.id)
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
    teacherToAsgIds,
    classToAsgIds,
    subjectToAsgIds,
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

function buildParseContext(request: GenerateTimetableRequest) {
  return {
    teacherLabels: [...new Set(request.assignments.map((item) => item.teacher).filter(Boolean))],
    classLabels: [...new Set(request.assignments.map((item) => item.className).filter(Boolean))],
    subjectLabels: [...new Set(request.assignments.map((item) => item.subject).filter(Boolean))],
    dayIds: Object.fromEntries(request.days.map((day) => [day.label, day.id])),
    sessionIds: Object.fromEntries(request.sessions.map((session) => [session.label, session.id])),
  }
}

function buildNormalizedConstraints(
  list: InputPayload['hardConstraints'] | InputPayload['softConstraints'],
  confirmations: ConstraintConfirmationItem[] | undefined,
  request: GenerateTimetableRequest,
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

export function buildNormalizedSolverProblem(
  request: GenerateTimetableRequest,
  payload: InputPayload,
  requestId: string,
): NormalizedSolverProblem {
  const solverConfig = estimateSolverConfig(payload)
  const meta = summarizePayload(payload)
  const parsedHard = buildNormalizedConstraints(payload.hardConstraints, request.constraintConfirmations, request)
  const parsedSoft = buildNormalizedConstraints(payload.softConstraints, request.constraintConfirmations, request)

  return {
    requestId,
    payload,
    parsedHard,
    parsedSoft,
    meta,
    problem: {
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
      hardConstraints: payload.hardConstraints,
      softConstraints: payload.softConstraints,
      parsedHard,
      parsedSoft,
      solverConfig,
      meta,
    },
  }
}
