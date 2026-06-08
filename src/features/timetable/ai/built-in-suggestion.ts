import {
  BUILT_IN_CONSTRAINT_DEFINITIONS,
  type BuiltInConstraintDefinition,
} from './constraint-registry';
import type { BuiltInConstraintKind, TimetableConstraintScope } from './timetable-constraint-contract';
import type { NormalizedAssignment } from './types';
import { extractDayId, extractFirstNumber, extractPeriodNumber, normalizeConstraintText } from './translator-text';

export const BUILT_IN_SUGGESTION_THRESHOLD = 0.82;

export type BuiltInSuggestionInput = {
  userText: string;
  teachers: string[];
  subjects: string[];
  classes: string[];
  assignments: NormalizedAssignment[];
  builtInDefinitions?: BuiltInConstraintDefinition[];
  days?: Array<{ id: string; label: string }>;
};

export type BuiltInSuggestion =
  | {
      decision: 'suggest_built_in';
      confidence: number;
      scope: TimetableConstraintScope;
      kind: BuiltInConstraintKind;
      paramsDraft: Record<string, unknown>;
      missingParams: string[];
      explanation: string;
    }
  | {
      decision: 'use_custom';
      confidence: number;
      reason: string;
    };

type EntityMatch =
  | { status: 'matched'; label: string }
  | { status: 'missing'; reason: string }
  | { status: 'ambiguous'; reason: string };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWholePhrase(text: string, phrase: string): boolean {
  const normalizedPhrase = normalizeConstraintText(phrase);
  if (!normalizedPhrase) return false;
  return new RegExp(`(?:^|\\s)${escapeRegExp(normalizedPhrase)}(?:\\s|$)`, 'u').test(text);
}

function matchEntity(text: string, labels: string[], entityName: string): EntityMatch {
  const exactMatches = labels.filter((label) => hasWholePhrase(text, label));
  if (exactMatches.length === 1) return { status: 'matched', label: exactMatches[0] };
  if (exactMatches.length > 1) {
    return { status: 'ambiguous', reason: `${entityName} bị mơ hồ: ${exactMatches.join(', ')}` };
  }

  const tokens = new Set(text.split(/\s+/u).filter(Boolean));
  const partialMatches = labels.filter((label) => {
    const firstToken = normalizeConstraintText(label).split(/\s+/u)[0];
    return firstToken ? tokens.has(firstToken) : false;
  });
  if (partialMatches.length === 1) return { status: 'matched', label: partialMatches[0] };
  if (partialMatches.length > 1) {
    return { status: 'ambiguous', reason: `${entityName} bị mơ hồ: ${partialMatches.join(', ')}` };
  }
  return { status: 'missing', reason: `Không tìm thấy ${entityName}` };
}

function supportedDefinition(
  definitions: BuiltInConstraintDefinition[],
  kind: BuiltInConstraintKind
): BuiltInConstraintDefinition | null {
  return definitions.find((definition) => definition.kind === kind) ?? null;
}

function customDecision(confidence: number, reason: string): BuiltInSuggestion {
  return { decision: 'use_custom', confidence, reason };
}

function suggest(
  definition: BuiltInConstraintDefinition,
  confidence: number,
  paramsDraft: Record<string, unknown>,
  explanation: string
): BuiltInSuggestion {
  if (confidence < BUILT_IN_SUGGESTION_THRESHOLD) {
    return customDecision(confidence, 'Độ tin cậy thấp, nên dùng Custom.');
  }
  const missingParams = definition.paramsSchema.required.filter((paramName) => {
    const value = paramsDraft[paramName];
    return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
  });
  if (missingParams.length > 0) {
    return customDecision(confidence, `Thiếu thông tin: ${missingParams.join(', ')}`);
  }
  return {
    decision: 'suggest_built_in',
    confidence,
    scope: definition.scope,
    kind: definition.kind,
    paramsDraft,
    missingParams,
    explanation,
  };
}

export function suggestBuiltInConstraint(input: BuiltInSuggestionInput): BuiltInSuggestion {
  const normalized = normalizeConstraintText(input.userText);
  const definitions = input.builtInDefinitions ?? BUILT_IN_CONSTRAINT_DEFINITIONS;
  if (!normalized) return customDecision(0, 'Chưa có nội dung để gợi ý.');
  if (/\bneu\b/u.test(normalized) && /\bthi\b/u.test(normalized)) {
    return customDecision(0.4, 'Ràng buộc điều kiện phức tạp nên nhập bằng Custom.');
  }

  const teacherMatch = matchEntity(normalized, input.teachers, 'giáo viên');
  if (teacherMatch.status !== 'matched') {
    return customDecision(0.55, teacherMatch.reason);
  }

  const day = input.days ? extractDayId(input.userText, input.days) : null;
  const period = extractPeriodNumber(input.userText);
  const mentionsBlock = /\b(khong|cam|nghi)\b/u.test(normalized) && /\bday\b/u.test(normalized);
  const mentionsOnly = /\bchi\b/u.test(normalized) && /\bday\b/u.test(normalized);
  const mentionsDailyMax = /\b(toi da|khong qua|khong hon)\b/u.test(normalized) && /\btiet\b/u.test(normalized) && /\bngay\b/u.test(normalized);

  if (mentionsBlock && day && period) {
    const definition = supportedDefinition(definitions, 'teacher_block_slot');
    if (!definition) return customDecision(0.5, 'Loại ràng buộc không có trong registry.');
    return suggest(definition, 0.94, { teacher: teacherMatch.label, day, period }, 'Khớp giáo viên không dạy ngày và tiết cụ thể.');
  }

  if (mentionsBlock && day) {
    const definition = supportedDefinition(definitions, 'teacher_block_day');
    if (!definition) return customDecision(0.5, 'Loại ràng buộc không có trong registry.');
    return suggest(definition, 0.92, { teacher: teacherMatch.label, day }, 'Khớp giáo viên không dạy một ngày.');
  }

  if (mentionsBlock && period) {
    const definition = supportedDefinition(definitions, 'teacher_block_period');
    if (!definition) return customDecision(0.5, 'Loại ràng buộc không có trong registry.');
    return suggest(definition, 0.91, { teacher: teacherMatch.label, period }, 'Khớp giáo viên không dạy một tiết.');
  }

  if (mentionsOnly && day) {
    const definition = supportedDefinition(definitions, 'teacher_allowed_days');
    if (!definition) return customDecision(0.5, 'Loại ràng buộc không có trong registry.');
    return suggest(definition, 0.88, { teacher: teacherMatch.label, days: [day] }, 'Khớp giáo viên chỉ dạy một số ngày.');
  }

  if (mentionsDailyMax) {
    const maxPerDay = extractFirstNumber(input.userText);
    const definition = supportedDefinition(definitions, 'teacher_max_per_day');
    if (!definition) return customDecision(0.5, 'Loại ràng buộc không có trong registry.');
    return suggest(definition, maxPerDay ? 0.87 : 0.72, { teacher: teacherMatch.label, maxPerDay }, 'Khớp giới hạn số tiết mỗi ngày của giáo viên.');
  }

  return customDecision(0.5, 'Không đủ chắc chắn để map sang built-in.');
}
