import type { ConstraintKind, ConstraintSpec, ConstraintSeverity } from '../ai/constraint-spec';
import { buildDraftFromSpecs } from '../ai/constraint-draft-validator';
import { humanizeDraft } from '../ai/constraint-humanizer';
import type { AgentInputPayload } from '../ai/types';
import type { ParsedConstraintDraft } from '../ai/constraint-review-types';

export type ConstraintFormTemplateId = ConstraintKind;

export type ConstraintTemplateMeta = {
  id: ConstraintFormTemplateId;
  label: string;
  group: 'teacher' | 'subject' | 'class' | 'assignment' | 'global';
  defaultSeverity: ConstraintSeverity;
  fields: string[];
  description?: string;
};

export const CONSTRAINT_GROUP_LABELS: Record<string, string> = {
  teacher: 'Giáo viên',
  subject: 'Môn học',
  class: 'Lớp',
  assignment: 'Phân công',
  global: 'Toàn trường',
};

export const CONSTRAINT_GROUPS = ['teacher', 'subject', 'class', 'assignment', 'global'] as const;

export const CONSTRAINT_TEMPLATES: ConstraintTemplateMeta[] = [
  // Giáo viên
  { id: 'teacher_block_day', label: 'GV không dạy một ngày', group: 'teacher', defaultSeverity: 'hard', fields: ['teacher', 'day'], description: 'Cấm giáo viên dạy vào một ngày cụ thể' },
  { id: 'teacher_block_period', label: 'GV không dạy một tiết', group: 'teacher', defaultSeverity: 'hard', fields: ['teacher', 'period'], description: 'Cấm giáo viên dạy tiết cụ thể' },
  { id: 'teacher_block_slot', label: 'GV không dạy một slot', group: 'teacher', defaultSeverity: 'hard', fields: ['teacher', 'day', 'period'], description: 'Cấm giáo viên dạy tại ngày + tiết cụ thể' },
  { id: 'teacher_max_per_day', label: 'GV tối đa N tiết/ngày', group: 'teacher', defaultSeverity: 'hard', fields: ['teacher', 'maxPerDay'], description: 'Giới hạn số tiết tối đa mỗi ngày' },
  { id: 'teacher_max_consecutive', label: 'GV tối đa N tiết liên tiếp', group: 'teacher', defaultSeverity: 'hard', fields: ['teacher', 'maxConsecutive'], description: 'Giới hạn số tiết liên tiếp tối đa' },
  { id: 'teacher_max_working_days', label: 'GV tối đa N ngày/tuần', group: 'teacher', defaultSeverity: 'hard', fields: ['teacher', 'maxDays'], description: 'Giới hạn số ngày dạy tối đa trong tuần' },
  { id: 'teacher_min_per_day', label: 'GV ít nhất N tiết/ngày', group: 'teacher', defaultSeverity: 'hard', fields: ['teacher', 'minPerDay'], description: 'Đảm bảo giáo viên dạy đủ số tiết mỗi ngày' },
  { id: 'teacher_no_gaps', label: 'GV không có tiết trống', group: 'teacher', defaultSeverity: 'hard', fields: ['teacher'], description: 'Giáo viên dạy liên tục, không có tiết trống xen giữa' },
  { id: 'teacher_allowed_days', label: 'GV chỉ dạy một số ngày', group: 'teacher', defaultSeverity: 'hard', fields: ['teacher', 'days'], description: 'Giáo viên chỉ được dạy vào các ngày đã chọn' },
  { id: 'teacher_allowed_periods', label: 'GV chỉ dạy một số tiết', group: 'teacher', defaultSeverity: 'hard', fields: ['teacher', 'periods'], description: 'Giáo viên chỉ được dạy vào các tiết đã chọn' },
  { id: 'teacher_max_classes_per_day', label: 'GV tối đa N lớp/ngày', group: 'teacher', defaultSeverity: 'hard', fields: ['teacher', 'maxClasses'], description: 'Giới hạn số lớp dạy mỗi ngày' },
  { id: 'teacher_max_subjects_per_day', label: 'GV tối đa N môn/ngày', group: 'teacher', defaultSeverity: 'hard', fields: ['teacher', 'max'], description: 'Giới hạn số môn dạy mỗi ngày' },
  { id: 'teacher_pair_not_same_slot', label: 'Hai GV không trùng tiết', group: 'teacher', defaultSeverity: 'hard', fields: ['teachers'], description: 'Hai giáo viên không dạy cùng một tiết' },
  { id: 'teacher_homeroom_first_period', label: 'GV chủ nhiệm dạy tiết 1', group: 'teacher', defaultSeverity: 'hard', fields: ['teacher', 'class'], description: 'Giáo viên chủ nhiệm luôn dạy tiết 1' },
  // Môn học
  { id: 'subject_pin_period', label: 'Môn chỉ học một số tiết', group: 'subject', defaultSeverity: 'hard', fields: ['subject', 'periods'], description: 'Môn chỉ được xếp vào các tiết đã chọn' },
  { id: 'subject_not_last_period', label: 'Môn không học tiết cuối', group: 'subject', defaultSeverity: 'hard', fields: ['subject'], description: 'Môn không được xếp vào tiết cuối cùng của ngày' },
  { id: 'subject_consecutive', label: 'Môn học liên tiếp', group: 'subject', defaultSeverity: 'hard', fields: ['subject'], description: 'Môn nên có cụm tiết liên tiếp' },
  { id: 'subject_max_consecutive', label: 'Môn tối đa N tiết liên tiếp', group: 'subject', defaultSeverity: 'hard', fields: ['subject', 'max'], description: 'Giới hạn số tiết liên tiếp tối đa mỗi ngày' },
  { id: 'subject_allowed_days', label: 'Môn chỉ học một số ngày', group: 'subject', defaultSeverity: 'hard', fields: ['subject', 'days'], description: 'Môn chỉ được xếp vào các ngày đã chọn' },
  { id: 'subject_block_period', label: 'Môn không học một số tiết', group: 'subject', defaultSeverity: 'hard', fields: ['subject', 'periods'], description: 'Môn bị cấm xếp vào các tiết đã chọn' },
  { id: 'subject_block_days', label: 'Môn không học một số ngày', group: 'subject', defaultSeverity: 'hard', fields: ['subject', 'days'], description: 'Môn bị cấm xếp vào các ngày đã chọn' },
  { id: 'subject_not_consecutive', label: 'Môn không học liên tiếp', group: 'subject', defaultSeverity: 'hard', fields: ['subject'], description: 'Môn không được xếp vào tiết liên tiếp' },
  { id: 'subject_daily_max_periods', label: 'Môn tối đa N tiết/ngày', group: 'subject', defaultSeverity: 'hard', fields: ['subject', 'max'], description: 'Giới hạn số tiết mỗi ngày cho môn' },
  { id: 'subject_spread_evenly', label: 'Môn phân bổ đều', group: 'subject', defaultSeverity: 'soft', fields: ['subject'], description: 'Môn được trải đều trong tuần' },
  { id: 'subject_order_before', label: 'Môn A trước môn B', group: 'subject', defaultSeverity: 'hard', fields: ['subjectA', 'subjectB'], description: 'Môn A phải xếp trước môn B trong ngày' },
  { id: 'subject_not_after_subject', label: 'Môn A không sau môn B', group: 'subject', defaultSeverity: 'hard', fields: ['subjectA', 'subjectB'], description: 'Môn A không được xếp sau môn B' },
  { id: 'subject_min_gap_days', label: 'Môn cách nhau N ngày', group: 'subject', defaultSeverity: 'soft', fields: ['subject', 'minGap'], description: 'Các buổi học cách nhau ít nhất N ngày' },
  // Lớp
  { id: 'class_block_day', label: 'Lớp không học một ngày', group: 'class', defaultSeverity: 'hard', fields: ['class', 'day'], description: 'Lớp không học vào ngày đã chọn' },
  { id: 'class_block_period', label: 'Lớp không học một tiết', group: 'class', defaultSeverity: 'hard', fields: ['class', 'period'], description: 'Lớp không học tiết đã chọn' },
  { id: 'class_block_slot', label: 'Lớp không học một slot', group: 'class', defaultSeverity: 'hard', fields: ['class', 'day', 'period'], description: 'Lớp không học tại ngày + tiết đã chọn' },
  { id: 'class_max_per_day', label: 'Lớp tối đa N tiết/ngày', group: 'class', defaultSeverity: 'hard', fields: ['class', 'max'], description: 'Giới hạn số tiết tối đa mỗi ngày' },
  { id: 'class_min_per_day', label: 'Lớp ít nhất N tiết/ngày', group: 'class', defaultSeverity: 'hard', fields: ['class', 'min'], description: 'Đảm bảo lớp học đủ số tiết mỗi ngày' },
  { id: 'class_no_gaps', label: 'Lớp không có tiết trống', group: 'class', defaultSeverity: 'hard', fields: ['class'], description: 'Lớp học liên tục, không có tiết trống xen giữa' },
  { id: 'class_no_double_subject_day', label: 'Lớp không học 2 môn/ngày', group: 'class', defaultSeverity: 'hard', fields: ['class', 'subject'], description: 'Môn không học 2 lần trong cùng ngày' },
  { id: 'class_subjects_not_same_day', label: 'Lớp: môn không cùng ngày', group: 'class', defaultSeverity: 'hard', fields: ['subjects'], description: 'Các môn trong danh sách không xếp cùng ngày' },
  { id: 'class_allowed_days', label: 'Lớp chỉ học một số ngày', group: 'class', defaultSeverity: 'hard', fields: ['class', 'days'], description: 'Lớp chỉ học vào các ngày đã chọn' },
  { id: 'class_max_consecutive', label: 'Lớp tối đa N tiết liên tiếp', group: 'class', defaultSeverity: 'hard', fields: ['class', 'maxConsecutive'], description: 'Giới hạn số tiết liên tiếp tối đa' },
  { id: 'class_max_subjects_per_day', label: 'Lớp tối đa N môn/ngày', group: 'class', defaultSeverity: 'hard', fields: ['class', 'max'], description: 'Giới hạn số môn học mỗi ngày' },
  { id: 'class_first_period_required', label: 'Lớp phải có tiết 1', group: 'class', defaultSeverity: 'hard', fields: ['class'], description: 'Lớp phải có tiết đầu tiên mỗi ngày' },
  { id: 'class_max_heavy_subjects_per_day', label: 'Lớp tối đa N môn nặng/ngày', group: 'class', defaultSeverity: 'hard', fields: ['subjects', 'maxHeavy'], description: 'Giới hạn số môn nặng mỗi ngày' },
  { id: 'class_max_heavy_subjects_per_session', label: 'Lớp tối đa N môn nặng/buổi', group: 'class', defaultSeverity: 'hard', fields: ['subjects', 'maxHeavyInSession'], description: 'Giới hạn số môn nặng mỗi buổi' },
  // Phân công
  { id: 'assignment_pin_slot', label: 'Phân công cố định slot', group: 'assignment', defaultSeverity: 'hard', fields: ['assignmentId', 'day', 'period'], description: 'Ghim phân công vào slot cụ thể' },
  { id: 'assignment_block_slot', label: 'Phân công cấm slot', group: 'assignment', defaultSeverity: 'hard', fields: ['assignmentId', 'day', 'period'], description: 'Phân công không được xếp vào slot' },
  { id: 'assignment_allowed_slots', label: 'Phân công chỉ ở một số slot', group: 'assignment', defaultSeverity: 'hard', fields: ['assignmentId', 'slots'], description: 'Phân công chỉ được xếp vào các slot đã chọn' },
  { id: 'assignment_spread_days', label: 'Phân công trải đều N ngày', group: 'assignment', defaultSeverity: 'soft', fields: ['assignmentId', 'minDays'], description: 'Phân công phải trải trên ít nhất N ngày' },
  { id: 'assignment_max_per_day', label: 'Phân công tối đa N tiết/ngày', group: 'assignment', defaultSeverity: 'hard', fields: ['assignmentId', 'max'], description: 'Giới hạn số tiết mỗi ngày cho phân công' },
  { id: 'assignment_same_day', label: 'Hai phân công cùng ngày', group: 'assignment', defaultSeverity: 'hard', fields: ['assignmentIds'], description: 'Hai phân công phải xếp cùng ngày' },
  { id: 'assignment_not_same_day', label: 'Hai phân công không cùng ngày', group: 'assignment', defaultSeverity: 'hard', fields: ['assignmentIds'], description: 'Hai phân công không được xếp cùng ngày' },
  // Toàn trường
  { id: 'subject_flag_ceremony_slot', label: 'Chào cờ / sinh hoạt cố định', group: 'global', defaultSeverity: 'hard', fields: ['day', 'period'], description: 'Cố định slot chào cờ/sinh hoạt' },
  { id: 'global_teacher_utilization_balance', label: 'Cân bằng tải GV (mềm)', group: 'global', defaultSeverity: 'soft', fields: ['tolerance'], description: 'Cân bằng số tiết dạy giữa các giáo viên' },
  { id: 'pair_not_same_slot', label: 'Hai GV không trùng tiết (global)', group: 'global', defaultSeverity: 'hard', fields: ['assignmentIds'], description: 'Hai phân công không dạy cùng tiết' },
  { id: 'pair_same_slot', label: 'Hai phân công cùng tiết', group: 'global', defaultSeverity: 'hard', fields: ['assignmentIds'], description: 'Hai phân công phải dạy cùng tiết' },
  { id: 'mutual_exclusion', label: 'Loại trừ lẫn nhau', group: 'global', defaultSeverity: 'hard', fields: ['assignmentIds'], description: 'Các phân công không được trùng slot' },
  { id: 'session_limit', label: 'Giới hạn tiết tại slot', group: 'global', defaultSeverity: 'hard', fields: ['day', 'period', 'max'], description: 'Giới hạn số tiết tại một slot cụ thể' },
  { id: 'if_then', label: 'Nếu... thì...', group: 'global', defaultSeverity: 'hard', fields: ['if_then_condition', 'if_then_then'], description: 'Ràng buộc điều kiện: nếu A thì B' },
  { id: 'custom_dsl', label: 'Ràng buộc đặc biệt', group: 'global', defaultSeverity: 'hard', fields: ['pythonPredicate'], description: 'Ràng buộc viết bằng Python' },
];

export type ScopeAllOrList = 'all' | string[];

export type ConstraintFormValues = {
  templateId: ConstraintFormTemplateId;
  severity: ConstraintSeverity;
  weight?: number;
  teacher?: string;
  teachers?: [string, string];
  subject?: string;
  subjects?: string[];
  subjectA?: string;
  subjectB?: string;
  subjectsScope: ScopeAllOrList;
  className?: string;
  classesScope: ScopeAllOrList;
  day?: string;
  days?: string[];
  period?: number;
  periods?: number[];
  maxPerDay?: number;
  maxConsecutive?: number;
  maxClasses?: number;
  maxHeavy?: number;
  maxHeavyInSession?: number;
  tolerance?: number;
  assignmentId?: string;
  assignmentIds?: string[];
  max?: number;
  min?: number;
  maxDays?: number;
  minDays?: number;
  minPerDay?: number;
  maxGaps?: number;
  minConsecutive?: number;
  minGap?: number;
  length?: number;
  slots?: Array<{ day: string; period: number }>;
  sessionIds?: string[];
  pythonPredicate?: string;
  ifThenCondition?: ConditionExpr;
  ifThenThen?: Array<{ kind: string; params: Record<string, unknown> }>;
  extraParams?: Record<string, unknown>;
};

type ConditionExpr =
  | { op: 'teacher_teaches_on_day'; teacher: string; day: string }
  | { op: 'teacher_teaches_at_slot'; teacher: string; day: string; period: number };

export type FormEntityContext = {
  teachers: string[];
  subjects: string[];
  classes: string[];
  days: Array<{ id: string; label: string }>;
  maxPeriod: number;
  assignments?: Array<{ id: string; label: string }>;
};

function expandSubjects(scope: ScopeAllOrList, allSubjects: string[]): string[] {
  if (scope === 'all') return allSubjects;
  return scope.filter(Boolean);
}

function expandClasses(scope: ScopeAllOrList, allClasses: string[]): string[] {
  if (scope === 'all') return allClasses;
  return scope.filter(Boolean);
}

let specIdSeq = 0;
function nextSpecId(): string {
  specIdSeq += 1;
  return `form_c${specIdSeq}`;
}

function getFieldValue(values: ConstraintFormValues, paramName: string): unknown {
  if (paramName in values) return (values as Record<string, unknown>)[paramName];
  return values.extraParams?.[paramName];
}

function buildGenericParams(values: ConstraintFormValues, fields: string[]): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const field of fields) {
    const val = getFieldValue(values, field);
    if (val !== undefined && val !== null && val !== '') {
      params[field] = val;
    }
  }
  return params;
}

export function formValuesToSpecs(
  original: string,
  values: ConstraintFormValues,
  ctx: FormEntityContext
): ConstraintSpec[] {
  const severity = values.severity;
  const id = nextSpecId();
  const kind = values.templateId;
  const base = { original, severity, kind } as const;

  // Custom forms for specific kinds (preserve exact behavior)
  switch (kind) {
    case 'teacher_block_day':
      return [{ ...base, id, params: { teacher: values.teacher ?? '', day: values.day ?? '' } }];
    case 'teacher_block_slot':
      return [{ ...base, id, params: { teacher: values.teacher ?? '', day: values.day ?? '', period: values.period ?? 1 } }];
    case 'teacher_max_per_day':
      return [{ ...base, id, params: { teacher: values.teacher ?? '', maxPerDay: values.maxPerDay ?? 1 } }];
    case 'teacher_max_consecutive':
      return [{ ...base, id, params: { teacher: values.teacher ?? '', maxConsecutive: values.maxConsecutive ?? 1 } }];
    case 'teacher_max_classes_per_day':
      return [{ ...base, id, params: { ...(values.teacher ? { teacher: values.teacher } : {}), maxClasses: values.maxClasses ?? 1 } }];
    case 'pair_not_same_slot': {
      const t = values.teachers ?? ['', ''];
      return [{ ...base, id, params: { teachers: t, ...(values.day ? { scope: { day: values.day } } : {}) } }];
    }
    case 'subject_max_consecutive': {
      const subjects = values.subject ? [values.subject] : expandSubjects(values.subjectsScope, ctx.subjects);
      const classes = expandClasses(values.classesScope, ctx.classes);
      const max = values.maxConsecutive ?? 1;
      if (subjects.length <= 1) {
        return [{ ...base, id, params: { subject: subjects[0] ?? '', max, maxConsecutive: max, ...(classes.length === 1 ? { classes } : {}) } }];
      }
      return subjects.map((subject, idx) => ({
        ...base, id: `${id}_${idx + 1}`, kind: 'subject_max_consecutive' as const,
        params: { subject, max, maxConsecutive: max, ...(classes.length === 1 ? { classes } : {}) },
      }));
    }
    case 'subject_not_last_period':
      return [{ ...base, id, params: { subject: values.subject ?? '', ...(values.className ? { classes: [values.className] } : {}) } }];
    case 'subject_pin_period':
      return [{ ...base, id, params: { subject: values.subject ?? '', periods: values.periods ?? [1], ...(values.className ? { classes: [values.className] } : {}) } }];
    case 'class_block_day':
      return [{ ...base, id, params: { class: values.className ?? '', day: values.day ?? '' } }];
    case 'class_first_period_required': {
      const targets = values.classesScope === 'all' ? ctx.classes : expandClasses(values.classesScope, ctx.classes);
      return targets.map((klass, idx) => ({
        ...base, id: targets.length === 1 ? id : `${id}_${idx + 1}`, kind: 'class_first_period_required' as const,
        params: { class: klass },
      }));
    }
    case 'class_max_heavy_subjects_per_day':
      return [{ ...base, id, params: { subjects: values.subjects ?? [], maxHeavy: values.maxHeavy ?? 1, ...(values.className ? { class: values.className } : {}) } }];
    case 'class_max_heavy_subjects_per_session':
      return [{ ...base, id, params: { subjects: values.subjects ?? [], maxHeavyInSession: values.maxHeavyInSession ?? 2, sessionIds: ['morning', 'afternoon'], ...(values.classesScope === 'all' ? {} : { class: values.className ?? '' }) } }];
    case 'class_max_subjects_per_day':
      return [{ ...base, id, params: { max: values.maxPerDay ?? 4, ...(values.className ? { class: values.className } : {}) } }];
    case 'teacher_allowed_days':
      return [{ ...base, id, params: { teacher: values.teacher ?? '', days: values.days ?? [] } }];
    case 'subject_block_period':
      return [{ ...base, id, params: { subject: values.subject ?? '', periods: values.periods ?? [] } }];
    case 'subject_flag_ceremony_slot':
      return [{ ...base, id, params: { day: values.day ?? '', period: values.period ?? 1 } }];
    case 'global_teacher_utilization_balance':
      return [{ ...base, id, params: { tolerance: values.tolerance ?? 1 }, weight: values.weight ?? 5 }];
    case 'if_then': {
      const cond = values.ifThenCondition;
      const thenSpecs = values.ifThenThen ?? [];
      if (cond && thenSpecs.length > 0) {
        return [{ ...base, id, params: { if: cond, then: thenSpecs } }];
      }
      return [{ ...base, id, params: {} }];
    }
    default: {
      // Generic fallback: build params from fields
      const meta = CONSTRAINT_TEMPLATES.find((t) => t.id === kind);
      if (meta) {
        const params = buildGenericParams(values, meta.fields);
        return [{ ...base, id, params }];
      }
      return [{ ...base, id, params: {} }];
    }
  }
}

export function defaultFormValues(
  templateId: ConstraintFormTemplateId,
  preferredType: 'required' | 'preferred'
): ConstraintFormValues {
  const meta = CONSTRAINT_TEMPLATES.find((t) => t.id === templateId);
  const severity: ConstraintSeverity =
    preferredType === 'preferred' ? 'soft' : (meta?.defaultSeverity ?? 'hard');
  return {
    templateId,
    severity,
    subjectsScope: 'all',
    classesScope: 'all',
    weight: preferredType === 'preferred' ? 5 : undefined,
    maxConsecutive: 2,
    maxPerDay: 4,
    maxClasses: 2,
    maxHeavy: 2,
    maxHeavyInSession: 2,
    tolerance: 2,
    periods: [1, 2],
    max: 2,
    min: 1,
    maxDays: 5,
    minDays: 3,
    minPerDay: 2,
    minGap: 1,
    maxGaps: 2,
    minConsecutive: 2,
    length: 2,
  };
}

export function specToFormValues(spec: ConstraintSpec): ConstraintFormValues | null {
  const kind = spec.kind;
  if (!CONSTRAINT_TEMPLATES.some((t) => t.id === kind)) return null;
  const v: ConstraintFormValues = {
    templateId: kind,
    severity: spec.severity,
    weight: spec.weight,
    subjectsScope: 'all',
    classesScope: 'all',
  };
  const p = spec.params;
  if (typeof p.teacher === 'string') v.teacher = p.teacher;
  if (typeof p.subject === 'string') v.subject = p.subject;
  if (typeof p.class === 'string') v.className = p.class;
  if (typeof p.day === 'string') v.day = p.day;
  if (typeof p.period === 'number') v.period = p.period;
  if (typeof p.maxPerDay === 'number') v.maxPerDay = p.maxPerDay;
  if (typeof p.maxConsecutive === 'number') v.maxConsecutive = p.maxConsecutive;
  if (typeof p.max === 'number') v.max = p.max;
  if (typeof p.maxClasses === 'number') v.maxClasses = p.maxClasses;
  if (typeof p.maxHeavy === 'number') v.maxHeavy = p.maxHeavy;
  if (typeof p.maxHeavyInSession === 'number') v.maxHeavyInSession = p.maxHeavyInSession;
  if (typeof p.tolerance === 'number') v.tolerance = p.tolerance;
  if (typeof p.maxDays === 'number') v.maxDays = p.maxDays;
  if (typeof p.minDays === 'number') v.minDays = p.minDays;
  if (typeof p.minPerDay === 'number') v.minPerDay = p.minPerDay;
  if (typeof p.minGap === 'number') v.minGap = p.minGap;
  if (typeof p.maxGaps === 'number') v.maxGaps = p.maxGaps;
  if (typeof p.minConsecutive === 'number') v.minConsecutive = p.minConsecutive;
  if (typeof p.length === 'number') v.length = p.length;
  if (typeof p.min === 'number') v.min = p.min;
  if (typeof p.subjectA === 'string') v.subjectA = p.subjectA;
  if (typeof p.subjectB === 'string') v.subjectB = p.subjectB;
  if (typeof p.assignmentId === 'string') v.assignmentId = p.assignmentId;
  if (Array.isArray(p.periods)) v.periods = p.periods.map(Number);
  if (Array.isArray(p.days)) v.days = p.days.map(String);
  if (Array.isArray(p.subjects)) v.subjects = p.subjects.map(String);
  if (Array.isArray(p.assignmentIds)) v.assignmentIds = p.assignmentIds.map(String);
  if (Array.isArray(p.teachers) && p.teachers.length >= 2) {
    v.teachers = [String(p.teachers[0]), String(p.teachers[1])];
  }
  // if_then
  if (p.if && typeof p.if === 'object') {
    v.ifThenCondition = p.if as ConditionExpr;
  }
  if (Array.isArray(p.then)) {
    v.ifThenThen = p.then as Array<{ kind: string; params: Record<string, unknown> }>;
  }
  return v;
}

export function applyFormToDraft(
  input: AgentInputPayload,
  draft: ParsedConstraintDraft,
  constraintType: 'required' | 'preferred',
  values: ConstraintFormValues,
  ctx: FormEntityContext
): ParsedConstraintDraft {
  const specs = formValuesToSpecs(draft.original, values, ctx).map((s) => ({
    ...s,
    severity: constraintType === 'preferred' ? ('soft' as const) : s.severity,
    ...(constraintType === 'preferred' && values.weight
      ? { weight: values.weight, params: { ...s.params, weight: values.weight } }
      : {}),
  }));
  const raw = {
    id: draft.rawConstraintId,
    text: draft.original,
    type: constraintType,
    weight: values.weight,
  };
  const built = buildDraftFromSpecs(draft.id, raw, specs, input, {
    source: 'manual',
    confidence: 'high',
    explanation: humanizeDraft({ ...draft, proposedSpecs: specs, source: 'manual' }),
  });
  return { ...built, source: 'manual' };
}

export function buildContextFromAgentInput(input: AgentInputPayload): FormEntityContext {
  const teachers = [...new Set(input.assignments.map((a) => a.teacher.label))];
  const subjects = [...new Set(input.assignments.map((a) => a.subject.label))];
  const classes = [...new Set(input.assignments.map((a) => a.class.label))];
  const periodNums = Object.values(input.periodCounts).filter((n) => typeof n === 'number') as number[];
  const maxPeriod = periodNums.length ? Math.max(...periodNums) : 5;
  const assignments = input.assignments.map((a) => ({
    id: a.id,
    label: `${a.teacher.label} - ${a.subject.label} - ${a.class.label}`,
  }));
  return { teachers, subjects, classes, days: input.days, maxPeriod, assignments };
}

export function isFormTemplateKind(kind: ConstraintKind): boolean {
  return CONSTRAINT_TEMPLATES.some((t) => t.id === kind);
}
