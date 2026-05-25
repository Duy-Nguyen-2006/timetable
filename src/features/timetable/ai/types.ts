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

export type GenerateTimetableRequest = {
  apiKey?: string
  days: Array<{ id: string; label: string }>
  sessions: Array<{ id: string; label: string }>
  periodCounts: Record<string, number>
  deletedPeriods: Record<string, boolean>
  assignments: Array<{
    teacher: string
    subject: string
    className: string
    weeklyPeriods: number | string
  }>
  constraints: Array<{ type: 'required' | 'preferred'; text: string; weight?: number }>
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
  } | null
  checkerReport?: CheckerReport | null
  deterministicReport?: DeterministicValidationReport | null
  attemptHistorySummary?: AttemptSummary[]
  finalReason?: string | null
  telemetry?: SolveTelemetry
}

export type AgentEvent =
  | { type: 'status'; message: string; iteration: number; maxIterations: number }
  | { type: 'phase'; phase: string; message: string; iteration: number; maxIterations: number }
  | { type: 'coder_started'; attempt: number; message: string }
  | { type: 'coder_artifact_generated'; attempt: number; summary: string; artifactPath?: string; sourceHash?: string }
  | { type: 'coder_run_started'; attempt: number; message: string }
  | { type: 'coder_run_failed'; attempt: number; error: string }
  | { type: 'coder_runtime_error'; attempt: number; error: string }
  | { type: 'coder_schema_error'; attempt: number; error: string }
  | { type: 'checker_started'; attempt: number; message: string }
  | { type: 'checker_retry_requested'; attempt: number; message: string; retryInstructions: string[] }
  | { type: 'checker_accepted'; attempt: number; message: string }
  | { type: 'checker_infeasible'; attempt: number; message: string }
  | { type: 'loop_progress'; attempt: number; maxIterations: number; message: string }
  | { type: 'code_fix'; attempt: number; error: string }
  | { type: 'verified'; violations: ConstraintViolation[]; allSatisfied: boolean }
  | { type: 'debug'; message: string; detail?: string }
  | { type: 'result'; data: TimetableSolveResult }
  | { type: 'error'; message: string }
