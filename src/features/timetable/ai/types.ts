export type TimetableSolveEntry = {
  assignmentKey: string
  subject: string
  teacher: string
  className: string
}

export type TimetableSolveCell = {
  slotId: string
  dayId: string
  sessionId: string
  period: number
  entries: TimetableSolveEntry[]
}

export type NormalizedHardConstraint = {
  sourceConstraintId: string
  type: 'teacher_unavailable'
  teacherId: string
  slotIds: string[]
  confidence?: number
}

export type NormalizedSoftConstraint = {
  sourceConstraintId: string
  type: 'prefer_subject_session'
  subjectId: string
  sessionIds: string[]
  weight: number
  confidence?: number
}

export type UnparsedConstraint = {
  sourceConstraintId: string
  text: string
  reason: string
}

export type NormalizedConstraintResult = {
  hard: NormalizedHardConstraint[]
  soft: NormalizedSoftConstraint[]
  unparsed: UnparsedConstraint[]
}

export type SolverStats = {
  wallTimeSeconds: number
  objectiveValue: number | null
  bestBound: number | null
  numConflicts: number
  numBranches: number
}

export type ModelRequestPreview = {
  model: string
  temperature: number
  messages: Array<{
    role: 'system' | 'user'
    content: string | Record<string, unknown>
  }>
  response_format?: Record<string, unknown>
}

export type TimetableSolveResult = {
  status: 'solved' | 'infeasible' | 'error'
  message: string
  diagnostics: string[]
  cells: TimetableSolveCell[]
  normalizedConstraints: NormalizedConstraintResult
  solverStats: SolverStats | null
  modelRequestPreview: ModelRequestPreview | null
}
