import type { AgentInputPayload, LocalAgentFinalResult } from './ai/types'
import type { constraintTypes } from './constants'

export type { RawConstraintInput, ParsedConstraintDraft, ConfirmedConstraint } from './ai/constraint-review-types'
export type {
  BuiltInConstraint,
  BuiltInConstraintKind,
  CustomConstraint,
  TimetableConstraint,
  TimetableConstraintScope,
  TimetableConstraintSeverity,
} from './ai/timetable-constraint-contract'

export type TimetableSolveResult = LocalAgentFinalResult
export type SolverRequestPayload = Pick<AgentInputPayload, 'constraints'>

export type { ConfirmedSolveRequest } from './ai/solver-constraint-gate'
export type AgentProgressStep = 'preparing' | 'running' | 'checking' | 'idle'

export type CachedRun = {
  id: string
  createdAt: string
  inputDigest: string
  result: TimetableSolveResult
}

export type AssignmentItem = {
  key: string
  teacher: string
  subject: string
  className: string
  weeklyPeriods: string
}

export type ConstraintItem = {
  id: string
  type: keyof typeof constraintTypes
  text: string
  weight?: number
}

export type TimetableAppProps = {
  onBackToLanding?: () => void
  quickDatasetText?: string | null
}

export type BulkAssignmentError = {
  line: number
  rawLine: string
  parts?: string[]
  segmentIndex: number
}
