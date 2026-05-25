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

export type ConstraintViolation = {
  constraintId: string
  original: string
  violated: boolean
  reason: string
  confidence: number
  conflictsWith?: string
  suggestion?: string
}

export type ExecutionError = { constraintId: string; error: string }
export type ValidationError = { constraintId: string; error: string }

export type GeneratedSolverArtifact = {
  path: string
  solverCode: string
  entrypoint: string
  summary: string
  assumptions: string[]
  sourceHash?: string
}

export type PiRuntimeAttemptRecord = {
  attempt: number
  prompt: string
  checkerFeedback: string[]
  artifactSummary: string
  executionStatus: SolverExecutionOutput['status']
  diagnostics: string[]
  artifactPath?: string
  sourceHash?: string
  logPath?: string
}

export type AgentLifecyclePhase = 'thinking' | 'coding' | 'running' | 'checking' | 'fixing'

export type AgentLifecycleEvent = {
  id: string
  phase: AgentLifecyclePhase
  title: string
  detail: string
  status: 'pending' | 'active' | 'completed' | 'failed'
  attempt?: number
  timestamp: string
  artifactPath?: string
  logPath?: string
  sourceHash?: string
  tags?: string[]
}

export type SolverStats = {
  wallTimeSeconds: number
  objectiveValue: number | null
  bestBound: number | null
  numConflicts: number
  numBranches: number
}

export type ConstraintConfirmationItem = {
  id: string
  original: string
  interpreted: string
  accepted: boolean
}

export type RawAssignment = {
  teacher: string
  subject: string
  className: string
  weeklyPeriods: number | string
}

export type NormalizedAssignment = {
  id: string
  teacher: {
    id: string
    label: string
  }
  subject: {
    id: string
    label: string
  }
  class: {
    id: string
    label: string
  }
  weeklyPeriods: number
}

export type SolverConstraint =
  | { type: 'required'; text: string }
  | { type: 'preferred'; text: string; weight: 8 | 5 | 3 }

export type GenerateTimetableRequest = {
  apiKey?: string
  days: Array<{ id: string; label: string }>
  sessions: Array<{ id: string; label: string }>
  periodCounts: Record<string, number>
  deletedPeriods: Record<string, boolean>
  assignments: RawAssignment[]
  constraints: Array<{ type: 'required' | 'preferred'; text: string; weight?: number }>
  constraintConfirmations?: ConstraintConfirmationItem[]
  debug?: boolean
  trace?: boolean
  userNotes?: string
}

export type SolverRequestPayload = {
  apiKey?: string
  days: Array<{ id: string; label: string }>
  sessions: Array<{ id: string; label: string }>
  periodCounts: Record<string, number>
  deletedPeriods: Record<string, boolean>
  assignments: NormalizedAssignment[]
  constraints: SolverConstraint[]
  constraintConfirmations?: ConstraintConfirmationItem[]
  debug?: boolean
  trace?: boolean
  userNotes?: string
}

export type SolverExecutionOutput = {
  status: 'solved' | 'infeasible' | 'error'
  message: string
  diagnostics: string[]
  cells: TimetableSolveCell[]
  iisConstraintIds: string[]
  executionErrors: ExecutionError[]
  validationErrors: ValidationError[]
  violations: ConstraintViolation[]
  solverStats: SolverStats | null
  artifactPath?: string
  loadError?: string | null
  runtimeError?: string | null
}

export type VerifierAssessment = {
  verdict: 'solved' | 'retryable' | 'infeasible'
  confidence: number
  rationale: string
  unmetRequirements: string[]
  repairInstructions: string[]
  confidentlyInfeasible: boolean
}

export type AttemptSummary = {
  attempt: number
  phase: 'coder' | 'checker' | 'validation' | 'system'
  status: 'running' | 'success' | 'retry' | 'failed' | 'skipped'
  summary: string
  details?: string[]
  artifactPath?: string
  sourceHash?: string
  startedAt?: string
  finishedAt?: string
}

export type ConstraintCheckItem = {
  constraintId: string
  original: string
  passed: boolean
  severity: 'base' | 'hard' | 'soft'
  reason: string
  suggestion?: string
}

export type DeterministicValidationReport = {
  valid: boolean
  baseConstraintPass: boolean
  hardConstraintPass: boolean
  softConstraintScore: number
  summary: string
  checks: ConstraintCheckItem[]
  uncheckedConstraintIds: string[]
}

export type CheckerReport = {
  verdict: 'accept' | 'retry' | 'infeasible' | 'error'
  baseConstraintPass: boolean
  hardConstraintPass: boolean
  softConstraintScore: number
  summary: string
  retryInstructions: string[]
  violations: ConstraintCheckItem[]
  userSoftWarnings: ConstraintCheckItem[]
}

export type SolveTelemetry = {
  totalDurationMs: number
  compileAttempts: number
  repairAttempts: number
  solverAttempts: number
  llmCallCount: number
  tokenEstimateCharsIn: number
  tokenEstimateCharsOut: number
  inputRejected: boolean
  requestId?: string
  totalAttempts?: number
  noProgressCount?: number
  guardrailStopReason?: string | null
  checkerFeedbackCount?: number
}

export type TimetableSolveResult = {
  status: 'solved' | 'infeasible' | 'error'
  verdict: 'accept' | 'retry' | 'infeasible' | 'error'
  requestId?: string
  message: string
  diagnostics: string[]
  cells: TimetableSolveCell[]
  executionErrors: ExecutionError[]
  validationErrors: ValidationError[]
  iisConstraintIds: string[]
  conflictingConstraints: Array<{ id: string; text: string }>
  violations: ConstraintViolation[]
  overallAssessment: string | null
  solverStats: SolverStats | null
  artifactSummary?: {
    path?: string
    entrypoint?: string
    summary: string
    assumptions: string[]
    sourceHash?: string
    attempt?: number
    logPath?: string
  } | null
  checkerReport?: CheckerReport | null
  deterministicReport?: DeterministicValidationReport | null
  attemptHistorySummary?: AttemptSummary[]
  lifecycleEvents?: AgentLifecycleEvent[]
  finalReason?: string | null
  telemetry?: SolveTelemetry
}

export type AgentEvent =
  | { type: 'status'; message: string; iteration: number; maxIterations: number }
  | { type: 'phase'; phase: string; message: string; iteration: number; maxIterations: number }
  | { type: 'pi_coder_started'; attempt: number; message: string }
  | { type: 'pi_coder_finished'; attempt: number; message: string; artifactPath?: string; sourceHash?: string }
  | { type: 'sandbox_started'; attempt: number; message: string; artifactPath?: string }
  | { type: 'sandbox_finished'; attempt: number; message: string; artifactPath?: string; logPath?: string; sourceHash?: string; status: SolverExecutionOutput['status'] }
  | { type: 'pi_runtime_missing'; message: string }
  | { type: 'checker_started'; attempt: number; message: string }
  | { type: 'checker_retry_requested'; attempt: number; message: string; retryInstructions: string[] }
  | { type: 'checker_accepted'; attempt: number; message: string }
  | { type: 'checker_infeasible'; attempt: number; message: string }
  | { type: 'verified'; violations: ConstraintViolation[]; allSatisfied: boolean }
  | { type: 'debug'; message: string; detail?: string }
  | { type: 'result'; data: TimetableSolveResult }
  | { type: 'error'; message: string }
