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

// ---------------------------------------------------------------------------
// Updated solve result type
// ---------------------------------------------------------------------------

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
}
