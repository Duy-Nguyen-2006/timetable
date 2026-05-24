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

// ---------------------------------------------------------------------------
// New AI-compiled constraint types
// ---------------------------------------------------------------------------

export type AICompiledConstraint = {
  id: string
  description: string   // short Vietnamese explanation
  original: string      // user's original text
  priority: 'hard' | 'soft'
  weight?: number       // 1-10, required if priority='soft'
  code: string          // Python OR-Tools code
  checkerCode?: string  // pure Python post-solve checker: cells_map → result=(bool, str)
}

export type AIUnparsedConstraint = {
  id: string
  original: string
  reason: string
}

export type CompilerResult = {
  constraints: AICompiledConstraint[]
  unparsed: AIUnparsedConstraint[]
}

export type ConstraintViolation = {
  constraintId: string
  original: string
  violated: boolean     // true = hard constraint violated; false = soft constraint not fully met
  reason: string
  confidence: number
  conflictsWith?: string  // which constraint causes the conflict
  suggestion?: string     // how to resolve (mainly for soft violations)
}

export type VerifierResult = {
  violations: ConstraintViolation[]
  overallAssessment: string
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

// ---------------------------------------------------------------------------
// Common types
// ---------------------------------------------------------------------------

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
  constraints: Array<{ type: 'required' | 'preferred'; text: string }>
  constraintConfirmations?: ConstraintConfirmationItem[]
}

export type AgentEvent =
  | { type: 'status'; message: string; iteration: number; maxIterations: number }
  | { type: 'code_fix'; attempt: number; error: string }
  | { type: 'verified'; violations: ConstraintViolation[]; allSatisfied: boolean }
  | { type: 'result'; data: TimetableSolveResult }
  | { type: 'error'; message: string }

// ---------------------------------------------------------------------------
// Updated solve result type
// ---------------------------------------------------------------------------

export type PipelineTelemetry = {
  totalDurationMs: number
  compileAttempts: number
  repairAttempts: number
  solverAttempts: number
  llmCallCount: number
  tokenEstimateCharsIn: number
  tokenEstimateCharsOut: number
  inputRejected: boolean
}

export type TimetableSolveResult = {
  status: 'solved' | 'infeasible' | 'error'
  message: string
  diagnostics: string[]
  cells: TimetableSolveCell[]
  compiledConstraints: AICompiledConstraint[]
  unparsedConstraints: AIUnparsedConstraint[]
  executionErrors: ExecutionError[]
  validationErrors: ValidationError[]
  iisConstraintIds: string[]
  violations: ConstraintViolation[]
  overallAssessment: string | null
  solverStats: SolverStats | null
  modelRequestPreview: ModelRequestPreview | null
  telemetry?: PipelineTelemetry
}
