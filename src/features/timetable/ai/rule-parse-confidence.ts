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
