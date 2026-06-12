export type ConstraintKind =
  | 'teacher_block_day'
  | 'teacher_block_period'
  | 'teacher_block_slot'
  | 'teacher_max_per_day'
  | 'teacher_max_consecutive'
  | 'teacher_max_working_days'
  | 'teacher_min_per_day'
  | 'teacher_no_gaps'
  | 'teacher_allowed_days'
  | 'teacher_allowed_periods'
  | 'teacher_min_working_days'
  | 'teacher_max_gaps'
  | 'teacher_min_consecutive'
  | 'teacher_balanced_load'
  | 'teacher_max_subjects_per_day'
  | 'teacher_max_consecutive_days'
  | 'teacher_min_off_days'
  | 'teacher_preferred_periods'
  | 'teacher_max_classes_per_day'
  | 'teacher_pair_not_same_slot'
  | 'teacher_pair_not_same_day'
  | 'teacher_homeroom_first_period'
  | 'subject_pin_period'
  | 'subject_preferred_periods'
  | 'subject_not_last_period'
  | 'subject_consecutive'
  | 'subject_max_consecutive'
  | 'subject_allowed_days'
  | 'subject_min_gap_days'
  | 'subject_daily_max_periods'
  | 'subject_block_period'
  | 'subject_block_days'
  | 'subject_not_consecutive'
  | 'subject_min_days'
  | 'subject_spread_evenly'
  | 'subject_order_before'
  | 'subject_not_after_subject'
  | 'class_block_day'
  | 'class_block_period'
  | 'class_block_slot'
  | 'class_max_per_day'
  | 'class_min_per_day'
  | 'class_no_gaps'
  | 'class_no_double_subject_day'
  | 'class_subjects_not_same_day'
  | 'class_fixed_period'
  | 'class_allowed_days'
  | 'class_allowed_periods'
  | 'class_max_consecutive'
  | 'class_max_subjects_per_day'
  | 'class_balanced_load'
  | 'class_subjects_same_day'
  | 'class_min_working_days'
  | 'class_max_heavy_subjects_per_day'
  | 'class_max_heavy_subjects_per_session'
  | 'class_first_period_required'
  | 'subject_flag_ceremony_slot'
  | 'global_teacher_utilization_balance'
  | 'assignment_pin_slot'
  | 'assignment_block_slot'
  | 'assignment_allowed_slots'
  | 'assignment_spread_days'
  | 'weekly_periods_exact'
  | 'assignment_consecutive'
  | 'assignment_max_per_day'
  | 'assignment_same_day'
  | 'assignment_not_same_day'
  | 'if_then'
  | 'pair_not_same_slot'
  | 'pair_same_slot'
  | 'mutual_exclusion'
  | 'session_limit'
  | 'subject_group'
  | 'subject_group_daily_limit'
  | 'subject_session_max_periods'
  // THEN positive atoms (F-6, F-7): used inside `if_then.params.then[]`.
  | 'teacher_required_day'
  | 'teacher_required_slot'
  | 'teacher_pair_required_same_day'
  | 'teacher_pair_required_same_slot'
  // Phase 0 require-family: positive at-least constraints (must have ≥N of X).
  // Distinct from *_allowed_*/block_* (which constrain TO or OUT OF a set).
  | 'teacher_required_period'
  | 'class_required_period'
  | 'subject_required_period'
  // Phase 1 quick wins: no-op marker for constraints that resolve to "all days" in the
  // current fixture (e.g. "Trang dạy tất cả các ngày trong tuần" on a 5-day fixture).
  // Validators and solver encoders must treat this as a no-op.
  | 'teacher_no_constraint'
  // Phase 2 quick wins: frequency comparison (nhóm 7).
  | 'teacher_count_relative'
  | 'teacher_total_periods'
  | 'teacher_argmax_weekly'
  // Phase 3 quick wins: order/distance between 2 teachers (nhóm 6).
  | 'teacher_pair_period_order'
  | 'teacher_pair_not_adjacent'
  | 'teacher_pair_day_distance'
  // Phase 4–8: 300-constraint dataset (teacher groups, global concurrent, soft markers, etc.)
  | 'teacher_group_not_same_day'
  | 'teacher_group_min_per_day'
  | 'teacher_group_not_same_period'
  | 'teacher_group_max_concurrent'
  | 'teacher_group_exact_per_day'
  | 'teacher_group_total_periods'
  | 'subject_consecutive_periods'
  | 'global_min_teachers_per_period'
  | 'global_max_teachers_per_period'
  | 'global_exact_teachers_per_period'
  | 'teacher_priority_day'
  | 'teacher_priority_session'
  | 'teacher_unavailable_holiday'
  | 'teacher_unavailable_sudden'
  | 'teacher_break_time_minutes'
  | 'global_max_workload_diff'
  | 'subject_after_subject_week'
  | 'subject_before_subject_week'
  | 'subject_same_week'
  | 'subject_gap_weeks'
  | 'subject_min_gap_hours'
  | 'subject_after_break'
  | 'teacher_min_rest_between_days'
  | 'teacher_max_hours_per_day'
  | 'teacher_lunch_break_required'
  | 'teacher_mentorship'
  | 'teacher_conflict'
  | 'custom_dsl';

export type ConditionExpr =
  | { op: 'teacher_teaches_on_day'; teacher: string; day: string }
  | { op: 'teacher_teaches_at_slot'; teacher: string; day: string; period: number }
  | { op: 'teacher_pair_teaches_same_slot'; teachers: [string, string]; day: string; period: number }
  | { op: 'teacher_pair_teaches_same_day'; teachers: [string, string]; day: string }
  | { op: 'class_teacher_at_slot'; class: string; subject: string; day: string; period: number }
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
  /** Chỉ dùng cho kind='custom_dsl': mã Python nhận schedule và trả true/false hoặc list violation */
  pythonPredicate?: string;
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
