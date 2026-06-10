import type { ConstraintKind } from './constraint-spec';

export type BuiltInConstraintScope = 'teacher' | 'subject' | 'class' | 'assignment' | 'global';
export type ConstraintParamSchema = {
  required: readonly string[];
  optional?: readonly string[];
};

export interface ConstraintMeta {
  kind: ConstraintKind;
  label: string;
  group: BuiltInConstraintScope;
  hasChecker: boolean;
  requiredParams: string[];
}

export interface BuiltInConstraintDefinition {
  kind: Exclude<ConstraintKind, 'custom_dsl'>;
  scope: BuiltInConstraintScope;
  labelVi: string;
  descriptionVi: string;
  exampleVi: string;
  severityAllowed: Array<'hard' | 'soft'>;
  paramsSchema: ConstraintParamSchema;
  hasSolverEncoder: boolean;
  hasValidator: boolean;
}

export const CONSTRAINT_REGISTRY: ConstraintMeta[] = [
  { kind: 'teacher_block_day', label: 'Teacher block day', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'day'] },
  { kind: 'teacher_block_period', label: 'Teacher block period', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'period'] },
  { kind: 'teacher_block_slot', label: 'Teacher block slot', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'day', 'period'] },
  { kind: 'teacher_max_per_day', label: 'Teacher max per day', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'maxPerDay'] },
  { kind: 'teacher_max_consecutive', label: 'Teacher max consecutive', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'maxConsecutive'] },
  { kind: 'teacher_max_working_days', label: 'Teacher max working days', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'maxDays'] },
  { kind: 'teacher_min_per_day', label: 'Teacher min per day', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'minPerDay'] },
  { kind: 'teacher_no_gaps', label: 'Teacher no gaps', group: 'teacher', hasChecker: true, requiredParams: ['teacher'] },
  { kind: 'teacher_allowed_days', label: 'Teacher allowed days', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'days'] },
  { kind: 'teacher_allowed_periods', label: 'Teacher allowed periods', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'periods'] },
  { kind: 'teacher_min_working_days', label: 'Teacher min working days', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'minDays'] },
  { kind: 'teacher_max_gaps', label: 'Teacher max gaps', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'maxGaps'] },
  { kind: 'teacher_min_consecutive', label: 'Teacher min consecutive', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'minConsecutive'] },
  { kind: 'teacher_balanced_load', label: 'Teacher balanced load', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'tolerance'] },
  { kind: 'teacher_max_subjects_per_day', label: 'Teacher max subjects per day', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'max'] },
  { kind: 'teacher_max_consecutive_days', label: 'Teacher max consecutive days', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'maxDays'] },
  { kind: 'teacher_min_off_days', label: 'Teacher min off days', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'minOffDays'] },
  { kind: 'teacher_preferred_periods', label: 'Teacher preferred periods', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'periods'] },
  { kind: 'teacher_max_classes_per_day', label: 'Teacher max classes per day', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'maxClasses'] },
  { kind: 'teacher_pair_not_same_slot', label: 'Teacher pair not same slot', group: 'teacher', hasChecker: true, requiredParams: ['teachers'] },
  { kind: 'teacher_pair_not_same_day', label: 'Teacher pair not same day', group: 'teacher', hasChecker: true, requiredParams: ['teachers'] },
  { kind: 'teacher_homeroom_first_period', label: 'Teacher homeroom first period', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'class'] },
  { kind: 'subject_pin_period', label: 'Subject pin period', group: 'subject', hasChecker: true, requiredParams: ['subject', 'period'] },
  { kind: 'subject_preferred_periods', label: 'Subject preferred periods', group: 'subject', hasChecker: true, requiredParams: ['subject', 'periods'] },
  { kind: 'subject_not_last_period', label: 'Subject not last period', group: 'subject', hasChecker: true, requiredParams: ['subject'] },
  { kind: 'subject_consecutive', label: 'Subject consecutive', group: 'subject', hasChecker: true, requiredParams: ['subject'] },
  { kind: 'subject_max_consecutive', label: 'Subject max consecutive', group: 'subject', hasChecker: true, requiredParams: ['subject', 'max'] },
  { kind: 'subject_allowed_days', label: 'Subject allowed days', group: 'subject', hasChecker: true, requiredParams: ['subject', 'days'] },
  { kind: 'subject_min_gap_days', label: 'Subject min gap days', group: 'subject', hasChecker: true, requiredParams: ['subject', 'minGap'] },
  { kind: 'subject_daily_max_periods', label: 'Subject daily max periods', group: 'subject', hasChecker: true, requiredParams: ['subject', 'max'] },
  { kind: 'subject_block_period', label: 'Subject block period', group: 'subject', hasChecker: true, requiredParams: ['subject', 'periods'] },
  { kind: 'subject_block_days', label: 'Subject block days', group: 'subject', hasChecker: true, requiredParams: ['subject', 'days'] },
  { kind: 'subject_not_consecutive', label: 'Subject not consecutive', group: 'subject', hasChecker: true, requiredParams: ['subject'] },
  { kind: 'subject_min_days', label: 'Subject min days', group: 'subject', hasChecker: true, requiredParams: ['subject', 'minDays'] },
  { kind: 'subject_spread_evenly', label: 'Subject spread evenly', group: 'subject', hasChecker: true, requiredParams: ['subject'] },
  { kind: 'subject_order_before', label: 'Subject order before', group: 'subject', hasChecker: true, requiredParams: ['subjectA', 'subjectB'] },
  { kind: 'subject_not_after_subject', label: 'Subject not after subject', group: 'subject', hasChecker: true, requiredParams: ['subjectA', 'subjectB'] },
  { kind: 'class_block_day', label: 'Class block day', group: 'class', hasChecker: true, requiredParams: ['class', 'day'] },
  { kind: 'class_block_period', label: 'Class block period', group: 'class', hasChecker: true, requiredParams: ['class', 'period'] },
  { kind: 'class_block_slot', label: 'Class block slot', group: 'class', hasChecker: true, requiredParams: ['class', 'day', 'period'] },
  { kind: 'class_max_per_day', label: 'Class max per day', group: 'class', hasChecker: true, requiredParams: ['class', 'max'] },
  { kind: 'class_min_per_day', label: 'Class min per day', group: 'class', hasChecker: true, requiredParams: ['class', 'min'] },
  { kind: 'class_no_gaps', label: 'Class no gaps', group: 'class', hasChecker: true, requiredParams: ['class'] },
  { kind: 'class_no_double_subject_day', label: 'Class no double subject day', group: 'class', hasChecker: true, requiredParams: ['class', 'subject'] },
  { kind: 'class_subjects_not_same_day', label: 'Class subjects not same day', group: 'class', hasChecker: true, requiredParams: ['subjects'] },
  { kind: 'class_fixed_period', label: 'Class fixed period', group: 'class', hasChecker: true, requiredParams: ['class', 'day', 'period'] },
  { kind: 'class_allowed_days', label: 'Class allowed days', group: 'class', hasChecker: true, requiredParams: ['class', 'days'] },
  { kind: 'class_allowed_periods', label: 'Class allowed periods', group: 'class', hasChecker: true, requiredParams: ['class', 'periods'] },
  { kind: 'class_max_consecutive', label: 'Class max consecutive', group: 'class', hasChecker: true, requiredParams: ['class', 'maxConsecutive'] },
  { kind: 'class_max_subjects_per_day', label: 'Class max subjects per day', group: 'class', hasChecker: true, requiredParams: ['class', 'max'] },
  { kind: 'class_balanced_load', label: 'Class balanced load', group: 'class', hasChecker: true, requiredParams: ['class', 'tolerance'] },
  { kind: 'class_subjects_same_day', label: 'Class subjects same day', group: 'class', hasChecker: true, requiredParams: ['class', 'subjects'] },
  { kind: 'class_min_working_days', label: 'Class min working days', group: 'class', hasChecker: true, requiredParams: ['class', 'minDays'] },
  { kind: 'class_max_heavy_subjects_per_day', label: 'Class max heavy subjects per day', group: 'class', hasChecker: true, requiredParams: ['subjects', 'maxHeavy'] },
  { kind: 'class_max_heavy_subjects_per_session', label: 'Class max heavy subjects per session', group: 'class', hasChecker: true, requiredParams: ['subjects', 'maxHeavyInSession', 'sessionIds'] },
  { kind: 'class_first_period_required', label: 'Class first period required', group: 'class', hasChecker: true, requiredParams: ['class'] },
  { kind: 'subject_flag_ceremony_slot', label: 'Subject flag ceremony slot', group: 'global', hasChecker: true, requiredParams: ['day', 'period'] },
  { kind: 'global_teacher_utilization_balance', label: 'Global teacher utilization balance', group: 'global', hasChecker: true, requiredParams: ['tolerance'] },
  { kind: 'assignment_pin_slot', label: 'Assignment pin slot', group: 'assignment', hasChecker: true, requiredParams: ['assignmentId', 'day', 'period'] },
  { kind: 'assignment_block_slot', label: 'Assignment block slot', group: 'assignment', hasChecker: true, requiredParams: ['assignmentId', 'day', 'period'] },
  { kind: 'assignment_allowed_slots', label: 'Assignment allowed slots', group: 'assignment', hasChecker: true, requiredParams: ['assignmentId', 'slots'] },
  { kind: 'assignment_spread_days', label: 'Assignment spread days', group: 'assignment', hasChecker: true, requiredParams: ['assignmentId', 'minDays'] },
  { kind: 'weekly_periods_exact', label: 'Weekly periods exact', group: 'assignment', hasChecker: true, requiredParams: ['assignmentId', 'count'] },
  { kind: 'assignment_consecutive', label: 'Assignment consecutive', group: 'assignment', hasChecker: true, requiredParams: ['assignmentId', 'length'] },
  { kind: 'assignment_max_per_day', label: 'Assignment max per day', group: 'assignment', hasChecker: true, requiredParams: ['assignmentId', 'max'] },
  { kind: 'assignment_same_day', label: 'Assignment same day', group: 'assignment', hasChecker: true, requiredParams: ['assignmentIds'] },
  { kind: 'assignment_not_same_day', label: 'Assignment not same day', group: 'assignment', hasChecker: true, requiredParams: ['assignmentIds'] },
  { kind: 'if_then', label: 'If-then implication', group: 'global', hasChecker: true, requiredParams: ['if', 'then'] },
  { kind: 'pair_not_same_slot', label: 'Pair not same slot', group: 'assignment', hasChecker: true, requiredParams: ['assignmentIds'] },
  { kind: 'pair_same_slot', label: 'Pair same slot', group: 'assignment', hasChecker: true, requiredParams: ['assignmentIds'] },
  { kind: 'mutual_exclusion', label: 'Mutual exclusion', group: 'assignment', hasChecker: true, requiredParams: ['assignmentIds'] },
  { kind: 'session_limit', label: 'Session limit', group: 'assignment', hasChecker: true, requiredParams: ['teacher', 'maxPeriods', 'session'] },
  { kind: 'subject_group', label: 'Subject group', group: 'subject', hasChecker: false, requiredParams: ['subjects'] },
  { kind: 'subject_group_daily_limit', label: 'Subject group daily limit', group: 'subject', hasChecker: true, requiredParams: ['subjects', 'max'] },
  { kind: 'subject_session_max_periods', label: 'Subject session max periods', group: 'subject', hasChecker: true, requiredParams: ['subject', 'session', 'max'] },
  // THEN positive atoms (F-6, F-7): used inside if_then.params.then[].
  { kind: 'teacher_required_day', label: 'Teacher required day', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'day'] },
  { kind: 'teacher_required_slot', label: 'Teacher required slot', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'day', 'period'] },
  { kind: 'teacher_pair_required_same_day', label: 'Teacher pair required same day', group: 'teacher', hasChecker: true, requiredParams: ['teachers', 'day'] },
  { kind: 'teacher_pair_required_same_slot', label: 'Teacher pair required same slot', group: 'teacher', hasChecker: true, requiredParams: ['teachers', 'day', 'period'] },
  // Phase 0 require-family: positive at-least constraints.
  { kind: 'teacher_required_period', label: 'Teacher required period', group: 'teacher', hasChecker: true, requiredParams: ['teacher', 'period', 'minCount'] },
  { kind: 'class_required_period', label: 'Class required period', group: 'class', hasChecker: true, requiredParams: ['class', 'period', 'minCount'] },
  { kind: 'subject_required_period', label: 'Subject required period', group: 'subject', hasChecker: true, requiredParams: ['subject', 'period', 'minCount'] },
  { kind: 'custom_dsl', label: 'Custom DSL', group: 'global', hasChecker: false, requiredParams: [] },
];

export const CONSTRAINT_KINDS = CONSTRAINT_REGISTRY.map((m) => m.kind) as ConstraintKind[];

const LABEL_VI_BY_KIND: Partial<Record<ConstraintKind, string>> = {
  teacher_block_day: 'Giáo viên không dạy ngày',
  teacher_block_period: 'Giáo viên không dạy tiết',
  teacher_block_slot: 'Giáo viên không dạy slot',
  teacher_max_per_day: 'Giáo viên dạy tối đa N tiết mỗi ngày',
  teacher_allowed_days: 'Giáo viên chỉ dạy một số ngày',
  teacher_required_period: 'Giáo viên phải có ít nhất N tiết trong tuần',
  class_required_period: 'Lớp phải có ít nhất N tiết trong tuần',
  subject_required_period: 'Môn phải có ít nhất N tiết trong tuần',
  pair_not_same_slot: 'Hai phân công không trùng tiết',
  pair_same_slot: 'Hai phân công cùng tiết',
  mutual_exclusion: 'Nhóm phân công không trùng slot',
  session_limit: 'Giới hạn số tiết của giáo viên theo buổi',
};

const EXAMPLE_VI_BY_KIND: Partial<Record<ConstraintKind, string>> = {
  teacher_block_day: 'Giáo viên Sơn không dạy Thứ 2.',
  teacher_block_period: 'Giáo viên Sơn không dạy tiết 1.',
  teacher_block_slot: 'Giáo viên Sơn không dạy Thứ 2 tiết 1.',
  teacher_max_per_day: 'Giáo viên Sơn dạy tối đa 4 tiết mỗi ngày.',
  teacher_allowed_days: 'Giáo viên Sơn chỉ dạy Thứ 3 và Thứ 5.',
  teacher_required_period: 'Giáo viên Thủy phải có ít nhất 1 tiết 4 trong tuần.',
  class_required_period: 'Lớp 6A phải có ít nhất 2 tiết Toán trong tuần.',
  subject_required_period: 'Môn Toán phải có ít nhất 3 tiết trong tuần.',
  pair_not_same_slot: 'Toán 6A và Văn 6A không được trùng tiết.',
  pair_same_slot: 'Sinh hoạt 6A và Sinh hoạt 6B phải cùng tiết.',
  mutual_exclusion: 'Trong nhóm phân công này, không được có 2 phân công trùng slot.',
  session_limit: 'Giáo viên Sơn buổi sáng tối đa 3 tiết.',
};

function defaultLabelVi(meta: ConstraintMeta): string {
  const scopeLabel: Record<BuiltInConstraintScope, string> = {
    teacher: 'Giáo viên',
    subject: 'Môn học',
    class: 'Lớp',
    assignment: 'Phân công',
    global: 'Toàn trường',
  };
  return `${scopeLabel[meta.group]}: ${meta.label}`;
}

function defaultExampleVi(meta: ConstraintMeta): string {
  return `${defaultLabelVi(meta)}.`;
}

export const CHECKED_KINDS = new Set<ConstraintKind>(
  CONSTRAINT_REGISTRY.filter((m) => m.hasChecker).map((m) => m.kind)
);

export const SOLVER_ENCODABLE_KIND_LIST = [
  // Teacher constraints
  'teacher_block_day',
  'teacher_block_period',
  'teacher_block_slot',
  'teacher_max_per_day',
  'teacher_max_consecutive',
  'teacher_max_working_days',
  'teacher_min_per_day',
  'teacher_no_gaps',
  'teacher_allowed_days',
  'teacher_allowed_periods',
  'teacher_min_working_days',
  'teacher_max_gaps',
  'teacher_min_consecutive',
  'teacher_balanced_load',
  'teacher_max_subjects_per_day',
  'teacher_max_consecutive_days',
  'teacher_min_off_days',
  'teacher_preferred_periods',
  'teacher_max_classes_per_day',
  'teacher_pair_not_same_slot',
  'teacher_pair_not_same_day',
  'teacher_homeroom_first_period',
  // Subject constraints
  'subject_pin_period',
  'subject_preferred_periods',
  'subject_not_last_period',
  'subject_consecutive',
  'subject_max_consecutive',
  'subject_allowed_days',
  'subject_min_gap_days',
  'subject_daily_max_periods',
  'subject_block_period',
  'subject_block_days',
  'subject_not_consecutive',
  'subject_min_days',
  'subject_spread_evenly',
  'subject_order_before',
  'subject_not_after_subject',
  // Class constraints
  'class_block_day',
  'class_block_period',
  'class_block_slot',
  'class_max_per_day',
  'class_min_per_day',
  'class_no_gaps',
  'class_no_double_subject_day',
  'class_subjects_not_same_day',
  'class_fixed_period',
  'class_allowed_days',
  'class_allowed_periods',
  'class_max_consecutive',
  'class_max_subjects_per_day',
  'class_balanced_load',
  'class_subjects_same_day',
  'class_min_working_days',
  'class_max_heavy_subjects_per_day',
  'class_max_heavy_subjects_per_session',
  'class_first_period_required',
  // Global / assignment / pair / session
  'subject_flag_ceremony_slot',
  'global_teacher_utilization_balance',
  'assignment_pin_slot',
  'assignment_block_slot',
  'assignment_allowed_slots',
  'assignment_spread_days',
  'weekly_periods_exact',
  'assignment_consecutive',
  'assignment_max_per_day',
  'assignment_same_day',
  'assignment_not_same_day',
  'if_then',
  'pair_not_same_slot',
  'pair_same_slot',
  'mutual_exclusion',
  'session_limit',
  'subject_group',
  'subject_group_daily_limit',
  'subject_session_max_periods',
  // THEN positive atoms (F-6, F-7)
  'teacher_required_day',
  'teacher_required_slot',
  'teacher_pair_required_same_day',
  'teacher_pair_required_same_slot',
  // Phase 0 require-family: atLeast semantics (positive; must have ≥N of X).
  'teacher_required_period',
  'class_required_period',
  'subject_required_period',
] as const satisfies readonly ConstraintKind[];

export const SOLVER_ENCODABLE_KINDS = new Set<ConstraintKind>(SOLVER_ENCODABLE_KIND_LIST);

export const BUILT_IN_CONSTRAINT_DEFINITIONS: BuiltInConstraintDefinition[] = CONSTRAINT_REGISTRY
  .filter((meta): meta is ConstraintMeta & { kind: Exclude<ConstraintKind, 'custom_dsl'> } => meta.kind !== 'custom_dsl')
  .map((meta) => ({
    kind: meta.kind,
    scope: meta.group,
    labelVi: LABEL_VI_BY_KIND[meta.kind] ?? defaultLabelVi(meta),
    descriptionVi: LABEL_VI_BY_KIND[meta.kind] ?? defaultLabelVi(meta),
    exampleVi: EXAMPLE_VI_BY_KIND[meta.kind] ?? defaultExampleVi(meta),
    severityAllowed: ['hard', 'soft'],
    paramsSchema: { required: meta.requiredParams },
    hasSolverEncoder: SOLVER_ENCODABLE_KINDS.has(meta.kind),
    hasValidator: meta.hasChecker,
  }));

export const BUILT_IN_CONSTRAINT_KINDS = new Set<Exclude<ConstraintKind, 'custom_dsl'>>(
  BUILT_IN_CONSTRAINT_DEFINITIONS.map((definition) => definition.kind)
);

// M1.1: Centralized built-in kind set - single source of truth
// This prevents drift when new kinds are added to BUILT_IN_CONSTRAINT_DEFINITIONS
// All other modules should import this instead of maintaining their own hardcoded lists
export const BUILT_IN_KIND_SET = BUILT_IN_CONSTRAINT_KINDS;

export function getConstraintMeta(kind: ConstraintKind): ConstraintMeta | undefined {
  return CONSTRAINT_REGISTRY.find((m) => m.kind === kind);
}

export function isSolverEncodableKind(kind: ConstraintKind): boolean {
  return SOLVER_ENCODABLE_KINDS.has(kind);
}
