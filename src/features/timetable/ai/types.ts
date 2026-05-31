import type {
  ConstraintSpec,
  DeterministicValidationReport,
  Plan,
  ScheduleEntry,
  Violation,
} from './constraint-spec';

export type AIProviderType = 'openrouter' | 'openai-responses' | 'generic-chat-completion-api';
export type SolverProfile = 'fast' | 'balanced' | 'deep';

export interface AIProviderConfig {
  provider?: AIProviderType;
  baseURL: string;
  apiKey: string;
  model: string;
  solverProfile?: SolverProfile;
}

export interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface NormalizedEntity {
  id: string;
  label: string;
}

export interface NormalizedAssignment {
  id: string;
  teacher: NormalizedEntity;
  subject: NormalizedEntity;
  class: NormalizedEntity;
  weeklyPeriods: number;
}

export interface ConstraintItemInput {
  type: 'required' | 'preferred';
  text: string;
  weight?: number;
}

export interface AgentInputPayload {
  days: Array<{ id: string; label: string }>;
  sessions: Array<{ id: string; label: string }>;
  periodCounts: Record<string, number>;
  deletedPeriods: Record<string, boolean>;
  assignments: NormalizedAssignment[];
  constraints: ConstraintItemInput[];
  previousSchedule?: ScheduleEntry[];
  metadata?: {
    schoolName?: string;
    semester?: string;
  };
}

export interface ExecutionResult {
  phase: 'compile' | 'run' | 'parse';
  ok: boolean;
  status: 'optimal' | 'feasible' | 'infeasible' | 'unknown' | 'timeout' | 'timeout_with_solution' | 'crashed';
  durationMs: number;
  resultPath?: string;
  resultSummary?: {
    scheduledCount: number;
    unscheduledAssignments: string[];
  };
  resultData?: {
    classes: string[];
    days: string[];
    periods: Array<number | string>;
    status?: string;
    schedule: ScheduleEntry[];
    customChecks?: Array<{
      id: string;
      checked: boolean;
      ok: boolean;
      violations: Array<{ constraintId: string; kind: string; message: string }>;
    }>;
    unsupportedSoftKinds?: string[];
  };
  errorDigest?: string;
  stdout?: string;
  stderr?: string;
}

export interface LocalAgentFinalResult {
  classes: string[];
  days: string[];
  periods: Array<number | string>;
  schedule: ScheduleEntry[];
  status: 'solved';
  solverStatus?: 'optimal' | 'feasible' | 'timeout_with_solution';
  message: string;
  deterministicReport: DeterministicValidationReport;
  checkerReport: DeterministicValidationReport;
  violations: Violation[];
  diagnostics: string[];
  executionErrors: Array<{ constraintId: string; error: string }>;
  validationErrors: Array<{ constraintId: string; error: string }>;
  iisConstraintIds: string[];
  conflictingConstraints: Array<{ id: string; text: string }>;
  attemptHistorySummary: Array<{
    stage: string;
    summary: string;
    at: string;
  }>;
}

export type AgentLifecyclePhase =
  | 'thinking'
  | 'coding'
  | 'running'
  | 'checking'
  | 'fixing'
  | 'translator'
  | 'planner'
  | 'idle';

export interface AgentLifecycleEvent {
  id: string;
  phase: AgentLifecyclePhase;
  title: string;
  detail?: string;
  status: 'active' | 'success' | 'error' | 'warning';
  timestamp: string;
  attempt?: number;
  tags?: string[];
}

export type AgentEvent =
  | { type: 'status'; message: string; iteration: number; maxIterations?: number }
  | { type: 'phase'; phase: AgentLifecyclePhase; message: string; iteration: number }
  | { type: 'stage_started'; stage: string; attempt?: number; message: string }
  | { type: 'stage_completed'; stage: string; attempt?: number; message: string }
  | { type: 'violations_found'; count: number; sample?: string[] }
  | { type: 'execution_result'; attempt: number; result: ExecutionResult }
  | { type: 'final_result'; result: LocalAgentFinalResult }
  | { type: 'error'; message: string; fatal?: boolean };

export interface CoderTurnResult {
  plan_summary: string;
  constraint_code: string;
  covered_constraint_ids: string[];
  assumptions: string[];
  rawResponse?: string;
  usageTokens?: number;
}

export interface RepairTurnResult {
  summary: string;
  patches: Array<{ oldStr: string; newStr: string; reason: string; replaceAll?: boolean }>;
  assumptions: string[];
  rawResponse?: string;
  usageTokens?: number;
}

export interface TranslatorTurnResult {
  constraintSpecs: ConstraintSpec[];
  rawResponse?: string;
  usageTokens?: number;
}

export interface PlannerTurnResult {
  plan: Plan;
  rawResponse?: string;
  usageTokens?: number;
}

export interface LocalAgentConfig extends AIProviderConfig {
  modelTranslator?: string;
  modelPlanner?: string;
  modelCoder?: string;
  modelRepair?: string;
  timeoutMs?: number;
  solverProfile?: SolverProfile;
  solverWorkers?: number;
  onEvent?: (event: AgentEvent) => void;
}

export type SolveArtifact = {
  schedule: ScheduleEntry[];
  report: DeterministicValidationReport;
  violations: Violation[];
};
