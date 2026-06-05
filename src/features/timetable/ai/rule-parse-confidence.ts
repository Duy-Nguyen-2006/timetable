import type { ConstraintSpec } from './constraint-spec';
import type { ConstraintParseIssue } from './constraint-review-types';
import { isRoomConstraintText } from './constraint-draft-validator';
import { normalizeConstraintText } from './translator-text';

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

/** Heuristic confidence for deterministic rule-parser output (per constraint text). */
export function inferRuleParseConfidence(text: string, specs: ConstraintSpec[]): RuleParseResult {
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
      issues: [{ code: 'low_confidence', message: 'Rule parser không tạo được spec.' }],
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
      issues: [{ code: 'low_confidence', message: 'Rule parser chưa hiểu ràng buộc bắt buộc.' }],
    };
  }

  if (specs.some((s) => s.kind === 'custom_dsl')) {
    return {
      specs,
      confidence: 'low',
      issues: [{ code: 'low_confidence', message: 'Rule parser chỉ hiểu một phần (custom_dsl).' }],
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

  if (specs.length === 1 && specs[0].kind !== 'custom_dsl') {
    const kind = specs[0].kind;
    if (kind === 'teacher_block_day' || kind === 'class_block_day' || kind === 'subject_not_last_period') {
      return { specs, confidence: 'high', issues };
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
