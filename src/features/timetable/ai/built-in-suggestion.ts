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

function extractPeriodList(text: string): number[] {
  const periods = new Set<number>();
  const normalized = normalizeConstraintText(text);
  for (const match of normalized.matchAll(/\btiet\s*(\d+)(?:\s*(?:-|den|toi)\s*(\d+))?/gu)) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const low = Math.min(start, end);
    const high = Math.max(start, end);
    for (let period = low; period <= high; period += 1) periods.add(period);
  }
  return [...periods].sort((a, b) => a - b);
}

function resolveBannedConsecutiveMax(text: string): number | null {
  const count = extractFirstNumber(text);
  if (!count || count <= 1) return null;
  const normalized = normalizeConstraintText(text);
  const bansExactRun = /\b(khong|cam|tranh)\b/u.test(normalized) && /\b(lien tiep|lien tuc)\b/u.test(normalized);
  return bansExactRun ? count - 1 : count;
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
  const subjectMatch = matchEntity(normalized, input.subjects, 'môn học');
  const classMatch = matchEntity(normalized, input.classes, 'lớp');

  const day = input.days ? extractDayId(input.userText, input.days) : null;
  const period = extractPeriodNumber(input.userText);
  const periods = extractPeriodList(input.userText);
  const mentionsBlock = /\b(khong|cam|nghi)\b/u.test(normalized) && /\bday\b/u.test(normalized);
  const mentionsClassBlock = /\b(khong|cam|nghi)\b/u.test(normalized) && /\bhoc\b/u.test(normalized);
  const mentionsOnly = /\bchi\b/u.test(normalized) && /\bday\b/u.test(normalized);
  const mentionsDailyMax = /\b(toi da|khong qua|khong hon)\b/u.test(normalized) && /\btiet\b/u.test(normalized) && /\bngay\b/u.test(normalized);
  const mentionsConsecutive = /\b(lien tiep|lien tuc)\b/u.test(normalized);
  const mentionsSubject = /\b(mon|subject)\b/u.test(normalized) || subjectMatch.status === 'matched';
  const mentionsClass = /\b(lop|class)\b/u.test(normalized) || classMatch.status === 'matched';

  if (subjectMatch.status === 'matched' && mentionsSubject && mentionsConsecutive) {
    const max = resolveBannedConsecutiveMax(input.userText);
    if (max) {
      const definition = supportedDefinition(definitions, 'subject_max_consecutive');
      if (!definition) return customDecision(0.5, 'Loại ràng buộc không có trong registry.');
      return suggest(
        definition,
        0.93,
        { subject: subjectMatch.label, max, maxConsecutive: max },
        'Khớp môn học giới hạn số tiết liên tiếp.'
      );
    }

    const length = extractFirstNumber(input.userText);
    if (/\b(nen|uu tien|can|phai)\b/u.test(normalized)) {
      const definition = supportedDefinition(definitions, 'subject_consecutive');
      if (!definition) return customDecision(0.5, 'Loại ràng buộc không có trong registry.');
      return suggest(
        definition,
        0.86,
        { subject: subjectMatch.label, ...(length ? { length } : {}) },
        'Khớp môn học cần xếp thành cụm tiết liên tiếp.'
      );
    }
  }

  if (subjectMatch.status === 'matched' && mentionsSubject && periods.length > 0) {
    const wantsPreference = /\b(nen|uu tien|thich|prefer)\b/u.test(normalized);
    const wantsBlock = /\b(khong|cam|tranh)\b/u.test(normalized);
    const kind: BuiltInConstraintKind = wantsPreference ? 'subject_preferred_periods' : 'subject_block_period';
    if (wantsPreference || wantsBlock) {
      const definition = supportedDefinition(definitions, kind);
      if (!definition) return customDecision(0.5, 'Loại ràng buộc không có trong registry.');
      return suggest(
        definition,
        wantsPreference ? 0.87 : 0.9,
        { subject: subjectMatch.label, periods },
        wantsPreference ? 'Khớp ưu tiên môn học theo tiết.' : 'Khớp môn học không xếp một số tiết.'
      );
    }
  }

  if (classMatch.status === 'matched' && mentionsClass && mentionsClassBlock && day && period) {
    const definition = supportedDefinition(definitions, 'class_block_slot');
    if (!definition) return customDecision(0.5, 'Loại ràng buộc không có trong registry.');
    return suggest(definition, 0.92, { class: classMatch.label, day, period }, 'Khớp lớp không học ngày và tiết cụ thể.');
  }

  if (classMatch.status === 'matched' && mentionsClass && mentionsClassBlock && day) {
    const definition = supportedDefinition(definitions, 'class_block_day');
    if (!definition) return customDecision(0.5, 'Loại ràng buộc không có trong registry.');
    return suggest(definition, 0.9, { class: classMatch.label, day }, 'Khớp lớp không học một ngày.');
  }

  if (classMatch.status === 'matched' && mentionsClass && mentionsClassBlock && period) {
    const definition = supportedDefinition(definitions, 'class_block_period');
    if (!definition) return customDecision(0.5, 'Loại ràng buộc không có trong registry.');
    return suggest(definition, 0.89, { class: classMatch.label, period }, 'Khớp lớp không học một tiết.');
  }

  if (teacherMatch.status === 'matched' && mentionsBlock && day && period) {
    const definition = supportedDefinition(definitions, 'teacher_block_slot');
    if (!definition) return customDecision(0.5, 'Loại ràng buộc không có trong registry.');
    return suggest(definition, 0.94, { teacher: teacherMatch.label, day, period }, 'Khớp giáo viên không dạy ngày và tiết cụ thể.');
  }

  if (teacherMatch.status === 'matched' && mentionsBlock && day) {
    const definition = supportedDefinition(definitions, 'teacher_block_day');
    if (!definition) return customDecision(0.5, 'Loại ràng buộc không có trong registry.');
    return suggest(definition, 0.92, { teacher: teacherMatch.label, day }, 'Khớp giáo viên không dạy một ngày.');
  }

  if (teacherMatch.status === 'matched' && mentionsBlock && period) {
    const definition = supportedDefinition(definitions, 'teacher_block_period');
    if (!definition) return customDecision(0.5, 'Loại ràng buộc không có trong registry.');
    return suggest(definition, 0.91, { teacher: teacherMatch.label, period }, 'Khớp giáo viên không dạy một tiết.');
  }

  if (teacherMatch.status === 'matched' && mentionsOnly && day) {
    const definition = supportedDefinition(definitions, 'teacher_allowed_days');
    if (!definition) return customDecision(0.5, 'Loại ràng buộc không có trong registry.');
    return suggest(definition, 0.88, { teacher: teacherMatch.label, days: [day] }, 'Khớp giáo viên chỉ dạy một số ngày.');
  }

  if (teacherMatch.status === 'matched' && mentionsDailyMax) {
    const maxPerDay = extractFirstNumber(input.userText);
    const definition = supportedDefinition(definitions, 'teacher_max_per_day');
    if (!definition) return customDecision(0.5, 'Loại ràng buộc không có trong registry.');
    return suggest(definition, maxPerDay ? 0.87 : 0.72, { teacher: teacherMatch.label, maxPerDay }, 'Khớp giới hạn số tiết mỗi ngày của giáo viên.');
  }

  for (const match of [teacherMatch, subjectMatch, classMatch]) {
    if (match.status === 'ambiguous') return customDecision(0.55, match.reason);
  }

  return customDecision(0.5, 'Không đủ chắc chắn để map sang built-in.');
}
