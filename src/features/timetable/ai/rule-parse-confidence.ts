import type { ConstraintSpec } from './constraint-spec';
import type { ConstraintParseIssue } from './constraint-review-types';
import { isRoomConstraintText } from './constraint-draft-validator';
import { normalizeConstraintText } from './translator-text';

export type RuleParseContext = {
  teachers?: string[];
  classes?: string[];
  subjects?: string[];
};

export type RuleParseResult = {
  specs: ConstraintSpec[];
  confidence: 'high' | 'medium' | 'low';
  issues: ConstraintParseIssue[];
};

const VAGUE_PATTERNS =
  /\b(nhe nhang|nang|de thoai|thoai mai|hop ly|linh hoat|tot nhat)\b/u;

function isUnparsedHard(spec: ConstraintSpec): boolean {
  return (
    spec.kind === 'custom_dsl' &&
    spec.severity === 'hard' &&
    (spec.notes?.includes('UNPARSED_HARD') || spec.notes === 'fallback_parser:UNPARSED_HARD')
  );
}

function isIgnoredRoomSpec(spec: ConstraintSpec): boolean {
  return spec.notes === 'ignored:room_constraint' || spec.params?.ignoredReason === 'room_constraints_ignored';
}

function entityExistsInContext(
  kind: 'teacher' | 'class' | 'subject',
  label: unknown,
  context?: RuleParseContext
): boolean {
  if (typeof label !== 'string' || !label.trim()) return true;
  const pool = kind === 'teacher' ? context?.teachers : kind === 'class' ? context?.classes : context?.subjects;
  if (!pool?.length) return true;
  return pool.includes(label);
}

function specsReferenceKnownEntities(specs: ConstraintSpec[], context?: RuleParseContext): boolean {
  if (!context) return true;
  for (const spec of specs) {
    if (!entityExistsInContext('teacher', spec.params.teacher, context)) return false;
    if (!entityExistsInContext('class', spec.params.class, context)) return false;
    if (!entityExistsInContext('subject', spec.params.subject, context)) return false;
    const teachers = spec.params.teachers;
    if (Array.isArray(teachers) && teachers.some((t) => !entityExistsInContext('teacher', t, context))) {
      return false;
    }
  }
  return true;
}

/** Heuristic confidence for deterministic rule-parser output (per constraint text). */
export function inferRuleParseConfidence(
  text: string,
  specs: ConstraintSpec[],
  context?: RuleParseContext
): RuleParseResult {
  const issues: ConstraintParseIssue[] = [];
  const normalized = normalizeConstraintText(text);

  if (isRoomConstraintText(text)) {
    return {
      specs,
      confidence: 'high',
      issues: [{ code: 'room_constraint_ignored', message: 'Ràng buộc phòng học (rule).' }],
    };
  }

  if (!specs.length) {
    return {
      specs: [],
      confidence: 'low',
      issues: [{ code: 'low_confidence', message: 'Mình chưa chắc cách hiểu câu này.' }],
    };
  }

  if (specs.every(isIgnoredRoomSpec)) {
    return {
      specs,
      confidence: 'high',
      issues: [{ code: 'room_constraint_ignored', message: 'Ràng buộc phòng học (rule).' }],
    };
  }

  if (specs.some(isUnparsedHard)) {
    return {
      specs,
      confidence: 'low',
      issues: [{ code: 'low_confidence', message: 'Cần bạn xác nhận thêm để áp dụng.' }],
    };
  }

  if (specs.some((s) => s.kind === 'custom_dsl')) {
    return {
      specs,
      confidence: 'low',
      issues: [{ code: 'low_confidence', message: 'Mình hiểu một phần — cần bạn xác nhận thêm.' }],
    };
  }

  if (VAGUE_PATTERNS.test(normalized)) {
    return {
      specs,
      confidence: 'low',
      issues: [{ code: 'low_confidence', message: 'Câu mơ hồ, cần chọn mẫu hoặc LLM.' }],
    };
  }

  const broadScope =
    /\b(moi|tat ca|bat ky|bất kỳ|mọi)\b/u.test(normalized) &&
    /(lien tiep|liên tiếp|mon|môn|lop|lớp)/u.test(normalized);
  if (broadScope && specs.length > 3) {
    return {
      specs,
      confidence: 'medium',
      issues: [{ code: 'scope_too_broad', message: 'Phạm vi rộng — cần user xác nhận.' }],
    };
  }

  if (!specsReferenceKnownEntities(specs, context)) {
    return {
      specs,
      confidence: 'low',
      issues: [
        {
          code: 'unknown_entity',
          message: 'Có tên giáo viên/lớp/môn chưa có trong dữ liệu. Kiểm tra lại giúp mình nhé.',
        },
      ],
    };
  }

  if (specs.length === 1 && specs[0].kind !== 'custom_dsl') {
    const kind = specs[0].kind;
    if (kind === 'teacher_block_day' || kind === 'class_block_day' || kind === 'subject_not_last_period') {
      return { specs, confidence: 'high', issues };
    }
    if (kind === 'if_then') {
      const thenList = specs[0].params.then;
      if (Array.isArray(thenList) && thenList.length > 0) {
        return { specs, confidence: 'high', issues };
      }
    }
    // Phase 1 quick wins: no-op marker is high-confidence because we explicitly
    // detected "all days in week" or "all days except day-not-in-fixture".
    if (kind === 'teacher_no_constraint') {
      return { specs, confidence: 'high', issues };
    }
  }

  // Phase 1 quick wins: working-days count + max-per-day are deterministic.
  // Both single-spec and multi-spec outputs are unambiguous.
  if (specs.every((s) =>
    s.kind === 'teacher_min_working_days' ||
    s.kind === 'teacher_max_working_days' ||
    s.kind === 'teacher_max_per_day'
  )) {
    return { specs, confidence: 'high', issues };
  }

  // Phase 2 quick wins: frequency comparison (nhóm 7). Parser fully resolves
  // teacher_count_relative, teacher_total_periods, teacher_argmax_weekly from
  // common Vietnamese patterns, so high confidence is appropriate.
  if (specs.every((s) =>
    s.kind === 'teacher_count_relative' ||
    s.kind === 'teacher_total_periods' ||
    s.kind === 'teacher_argmax_weekly'
  )) {
    return { specs, confidence: 'high', issues };
  }

  // Phase 3 quick wins: order/distance pair constraints (nhóm 6). Parser fully
  // resolves teacher_pair_period_order, teacher_pair_not_adjacent,
  // teacher_pair_day_distance from common Vietnamese patterns, so high
  // confidence is appropriate.
  if (specs.every((s) =>
    s.kind === 'teacher_pair_period_order' ||
    s.kind === 'teacher_pair_not_adjacent' ||
    s.kind === 'teacher_pair_day_distance'
  )) {
    return { specs, confidence: 'high', issues };
  }

  const phase48Kinds = new Set([
    'teacher_group_not_same_day',
    'teacher_group_min_per_day',
    'teacher_group_not_same_period',
    'teacher_group_max_concurrent',
    'teacher_group_exact_per_day',
    'teacher_group_total_periods',
    'subject_consecutive_periods',
    'global_min_teachers_per_period',
    'global_max_teachers_per_period',
    'global_exact_teachers_per_period',
    'global_max_workload_diff',
    'subject_before_subject_week',
    'subject_after_subject_week',
    'subject_same_week',
    'subject_after_break',
    'teacher_conflict',
    'teacher_max_hours_per_day',
    'teacher_no_constraint',
    'teacher_block_day',
  ]);
  if (specs.length > 0 && specs.every((s) => phase48Kinds.has(s.kind))) {
    return { specs, confidence: 'high', issues };
  }

  if (specs.every((s) => s.kind === 'subject_max_consecutive')) {
    return {
      specs,
      confidence: broadScope ? 'medium' : 'high',
      issues: broadScope
        ? [{ code: 'scope_too_broad', message: 'Áp dụng nhiều môn/lớp — cần xác nhận.' }]
        : issues,
    };
  }

  return { specs, confidence: 'medium', issues };
}
