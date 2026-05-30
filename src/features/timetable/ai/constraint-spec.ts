export type ConstraintKind =
  | 'teacher_block_day'
  | 'teacher_block_period'
  | 'teacher_block_slot'
  | 'teacher_max_per_day'
  | 'teacher_max_consecutive'
  | 'subject_pin_period'
  | 'subject_consecutive'
  | 'class_no_double_subject_day'
  | 'class_subjects_not_same_day'
  | 'teacher_max_working_days'
  | 'subject_max_consecutive'
  | 'weekly_periods_exact'
  | 'if_then'
  | 'pair_not_same_slot'
  | 'resource_capacity'
  | 'session_limit'
  | 'subject_group'
  | 'subject_group_daily_limit'
  | 'subject_spread_evenly'
  | 'teacher_max_consecutive_global'
  | 'subject_not_at_period'
  | 'teacher_prefer_compact'
  | 'class_balanced_daily_load'
  | 'teacher_fixed_slot'
  | 'subject_not_consecutive_days'
  | 'multi_school_availability'
  | 'custom_dsl';

export type ConditionExpr =
  | { op: 'teacher_teaches_on_day'; teacher: string; day: string }
  | { op: 'teacher_teaches_at_slot'; teacher: string; day: string; period: number }
  | { op: 'and'; args: ConditionExpr[] }
  | { op: 'or'; args: ConditionExpr[] }
  | { op: 'not'; arg: ConditionExpr };

export type ConstraintSeverity = 'hard' | 'soft' | 'info';
export type ConstraintTag = 'auto_base' | 'user_required' | 'user_preferred';

export type ConstraintSpec = {
  id: string;
  original: string;
  severity: ConstraintSeverity;
  kind: ConstraintKind;
  params: Record<string, unknown>;
  /** Trọng số cho soft constraint. Mặc định 1 nếu bỏ trống. */
  weight?: number;
  tags?: ConstraintTag[];
  notes?: string;
};

export type Plan = {
  decisionVars: string;
  domainSize: {
    classes: number;
    days: number;
    periods: number;
    estimated?: number;
    estimatedVars?: number;
  };
  constraintOrder: string[];
  reifiedNeeded: string[];
  objective: 'none' | 'maximize_soft' | 'minimize_gaps';
  templatesUsed: string[];
  objectiveFunction?: string;
  provenPatterns?: string[];
  risks: string[];
};

export type ScheduleEntry = {
  assignmentId?: string;
  class: string;
  day: string;
  period: number | string;
  subject: string;
  teacher: string;
};

export type Violation = {
  constraintId: string;
  kind: ConstraintKind | 'base_constraint';
  message: string;
  offendingEntries: ScheduleEntry[];
};

export type DeterministicValidationContext = {
  assignments?: Array<{
    id: string;
    class: string;
    subject: string;
    teacher: string;
    weeklyPeriods: number;
  }>;
  constraintSpecs?: ConstraintSpec[];
};

export type DeterministicValidationReport = {
  ok: boolean;
  baseConstraintPass: boolean;
  hardConstraintPass: boolean;
  softConstraintPass: boolean;
  /** True khi MỌI hard constraint đều có checker thực sự kiểm (fail-closed). */
  hardCoverageComplete: boolean;
  violations: Violation[];
  hardViolations: Violation[];
  softViolations: Violation[];
  uncheckedConstraintIds: string[];
  /** Các hard constraint không được deterministic check (custom_dsl/không có checker). */
  hardUncheckedConstraintIds: string[];
};
