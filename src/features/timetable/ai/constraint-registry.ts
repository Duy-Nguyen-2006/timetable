import type { ConstraintKind } from './constraint-spec';

export interface ConstraintMeta {
  kind: ConstraintKind;
  label: string;
  group: 'teacher' | 'subject' | 'class' | 'assignment' | 'global';
  hasChecker: boolean;
  requiredParams: string[];
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
  { kind: 'subject_pin_period', label: 'Subject pin period', group: 'subject', hasChecker: true, requiredParams: ['subject', 'period'] },
  { kind: 'subject_consecutive', label: 'Subject consecutive', group: 'subject', hasChecker: true, requiredParams: ['subject'] },
  { kind: 'subject_max_consecutive', label: 'Subject max consecutive', group: 'subject', hasChecker: true, requiredParams: ['subject', 'max'] },
  { kind: 'subject_allowed_days', label: 'Subject allowed days', group: 'subject', hasChecker: true, requiredParams: ['subject', 'days'] },
  { kind: 'subject_min_gap_days', label: 'Subject min gap days', group: 'subject', hasChecker: true, requiredParams: ['subject', 'minGap'] },
  { kind: 'subject_daily_max_periods', label: 'Subject daily max periods', group: 'subject', hasChecker: true, requiredParams: ['subject', 'max'] },
  { kind: 'class_block_day', label: 'Class block day', group: 'class', hasChecker: true, requiredParams: ['class', 'day'] },
  { kind: 'class_block_period', label: 'Class block period', group: 'class', hasChecker: true, requiredParams: ['class', 'period'] },
  { kind: 'class_block_slot', label: 'Class block slot', group: 'class', hasChecker: true, requiredParams: ['class', 'day', 'period'] },
  { kind: 'class_max_per_day', label: 'Class max per day', group: 'class', hasChecker: true, requiredParams: ['class', 'max'] },
  { kind: 'class_min_per_day', label: 'Class min per day', group: 'class', hasChecker: true, requiredParams: ['class', 'min'] },
  { kind: 'class_no_gaps', label: 'Class no gaps', group: 'class', hasChecker: true, requiredParams: ['class'] },
  { kind: 'class_no_double_subject_day', label: 'Class no double subject day', group: 'class', hasChecker: true, requiredParams: ['class', 'subject'] },
  { kind: 'class_subjects_not_same_day', label: 'Class subjects not same day', group: 'class', hasChecker: true, requiredParams: ['class', 'subjects'] },
  { kind: 'assignment_pin_slot', label: 'Assignment pin slot', group: 'assignment', hasChecker: true, requiredParams: ['assignmentId', 'day', 'period'] },
  { kind: 'assignment_block_slot', label: 'Assignment block slot', group: 'assignment', hasChecker: true, requiredParams: ['assignmentId', 'day', 'period'] },
  { kind: 'assignment_allowed_slots', label: 'Assignment allowed slots', group: 'assignment', hasChecker: true, requiredParams: ['assignmentId', 'slots'] },
  { kind: 'assignment_spread_days', label: 'Assignment spread days', group: 'assignment', hasChecker: true, requiredParams: ['assignmentId', 'minDays'] },
  { kind: 'weekly_periods_exact', label: 'Weekly periods exact', group: 'assignment', hasChecker: true, requiredParams: ['assignmentId', 'count'] },
  { kind: 'if_then', label: 'If-then implication', group: 'global', hasChecker: true, requiredParams: ['condition', 'then'] },
  { kind: 'pair_not_same_slot', label: 'Pair not same slot', group: 'global', hasChecker: true, requiredParams: ['assignmentIds'] },
  { kind: 'session_limit', label: 'Session limit', group: 'global', hasChecker: true, requiredParams: ['day', 'period', 'max'] },
  { kind: 'subject_group', label: 'Subject group', group: 'subject', hasChecker: false, requiredParams: ['subjects'] },
  { kind: 'subject_group_daily_limit', label: 'Subject group daily limit', group: 'subject', hasChecker: true, requiredParams: ['subjects', 'max'] },
  { kind: 'subject_session_max_periods', label: 'Subject session max periods', group: 'subject', hasChecker: true, requiredParams: ['subject', 'session', 'max'] },
  { kind: 'custom_dsl', label: 'Custom DSL', group: 'global', hasChecker: false, requiredParams: ['pythonPredicate'] },
];

export const CONSTRAINT_KINDS = CONSTRAINT_REGISTRY.map((m) => m.kind) as ConstraintKind[];

export const CHECKED_KINDS = new Set<ConstraintKind>(
  CONSTRAINT_REGISTRY.filter((m) => m.hasChecker).map((m) => m.kind)
);

export function getConstraintMeta(kind: ConstraintKind): ConstraintMeta | undefined {
  return CONSTRAINT_REGISTRY.find((m) => m.kind === kind);
}
