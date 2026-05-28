export type ConstraintKind =
  | 'teacher_block_day'
  | 'teacher_block_period'
  | 'teacher_block_slot'
  | 'teacher_max_per_day'
  | 'teacher_max_consecutive'
  | 'subject_pin_period'
  | 'subject_consecutive'
  | 'class_no_double_subject_day'
  | 'weekly_periods_exact'
  | 'if_then'
  | 'pair_not_same_slot'
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
};

export type DeterministicValidationReport = {
  ok: boolean;
  baseConstraintPass: boolean;
  hardConstraintPass: boolean;
  softConstraintPass: boolean;
  violations: Violation[];
  hardViolations: Violation[];
  softViolations: Violation[];
  uncheckedConstraintIds: string[];
};
