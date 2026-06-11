/**
 * Stage 1 Resolver — Shared function (Section 4)
 *
 * Extracts deterministic hints from a Vietnamese constraint text:
 *   - resolved entities (teacher / subject / class / assignment)
 *   - extracted numbers (max, periods, etc.)
 *   - inferred scope (teacher / subject / class / assignment / global)
 *   - keyword flags (block, max, min, consecutive, only, preferred, if-then)
 *
 * This function is shared by:
 *   - built-in-suggestion.ts (rule parser)
 *   - constraint-retriever.ts (Stage 2 input)
 *   - analyze-constraint-service.ts (small-prompt LLM context)
 *
 * Pure code; no LLM.
 */

import {
  extractDayId,
  extractFirstNumber,
  extractPeriodNumber,
  normalizeConstraintText,
} from './translator-text';
import { matchEntity, matchKnownEntities } from './built-in-suggestion';
import type { BuiltInConstraintScope } from './constraint-registry';
import type { NormalizedAssignment } from './types';

export type ResolverHints = {
  /** Normalized user text. */
  normalizedText: string;
  /** Resolved teacher label (first match). */
  resolvedTeacher: string | null;
  /** All resolved teacher labels. */
  resolvedTeachers: string[];
  /** Resolved subject label (first match). */
  resolvedSubject: string | null;
  /** All resolved subject labels. */
  resolvedSubjects: string[];
  /** Resolved class label (first match). */
  resolvedClass: string | null;
  /** All resolved class labels. */
  resolvedClasses: string[];
  /** Numeric hints extracted by code. */
  extractedNumber: number | null;
  extractedPeriods: number[];
  extractedDays: string[];
  /** Illustration phrases stripped from trusted numeric/entity hints. */
  droppedIllustrations: string[];
  illustrationSpans: Array<{ start: number; end: number; text: string }>;
  /** Scope inferred from entity match. */
  inferredScope: BuiltInConstraintScope | null;
  /** Whether the text mentions specific constraint keywords. */
  mentionsBlock: boolean;
  mentionsMax: boolean;
  mentionsMin: boolean;
  mentionsConsecutive: boolean;
  mentionsOnly: boolean;
  mentionsPreferred: boolean;
  mentionsIfThen: boolean;
  /** Any entity that was ambiguous (e.g., "Lan" matches "Lan Anh" and "Lan An"). */
  ambiguousEntity: { kind: 'teacher' | 'subject' | 'class'; candidates: string[] } | null;
};

export type ResolverInput = {
  userText: string;
  teachers: string[];
  subjects: string[];
  classes: string[];
  assignments: NormalizedAssignment[];
  days?: Array<{ id: string; label: string }>;
};

function stripIllustrations(text: string): {
  trustedText: string;
  droppedIllustrations: string[];
  illustrationSpans: Array<{ start: number; end: number; text: string }>;
} {
  const match = text.match(/\s*(?:,?\s*)(ví dụ|chẳng hạn|kiểu như|như là)\s+(.+)$/iu);
  if (!match || match.index == null) {
    return { trustedText: text, droppedIllustrations: [], illustrationSpans: [] };
  }
  const dropped = match[0].replace(/^[,\s]+/u, '').trim();
  return {
    trustedText: text.slice(0, match.index).trim(),
    droppedIllustrations: [dropped],
    illustrationSpans: [{ start: match.index, end: text.length, text: dropped }],
  };
}

/** Run Stage 1: deterministic extraction of all hints. */
export function resolveConstraintHints(input: ResolverInput): ResolverHints {
  const { trustedText, droppedIllustrations, illustrationSpans } = stripIllustrations(input.userText);
  const normalized = normalizeConstraintText(trustedText);
  const teacherMatch = matchEntity(normalized, input.teachers, 'giáo viên');
  const subjectMatch = matchEntity(normalized, input.subjects, 'môn học');
  const classMatch = matchEntity(normalized, input.classes, 'lớp');
  const subjectMatches = matchKnownEntities(trustedText, input.subjects);
  const teacherMatches = matchKnownEntities(trustedText, input.teachers);
  const classMatches = matchKnownEntities(trustedText, input.classes);

  const extractedNumber = extractFirstNumber(trustedText);
  const periods: number[] = [];
  const day = input.days ? extractDayId(trustedText, input.days) : null;
  const period = extractPeriodNumber(trustedText);
  if (period !== null) periods.push(period);
  if (day) {
    // Day is already in extractedDays
  }

  const mentionsBlock = /\b(khong|cam|nghi|ko)\b/iu.test(normalized) && /\b(day|hoc)\b/iu.test(normalized);
  const mentionsMax = /\b(toi\s*da|khong\s*qua|khong\s*hon|gioi\s*han|qua\s*\d|khong\s*day\s*qua|day\s*qua)\b/iu.test(normalized);
  const mentionsMin = /\b(it\s*nhat|toi\s*thieu)\b/iu.test(normalized);
  const mentionsConsecutive = /\b(lien\s*tiep|lien\s*tuc)\b/iu.test(normalized);
  const mentionsOnly = /\b(chi)\b/iu.test(normalized) && /\b(day|hoc)\b/iu.test(normalized);
  const mentionsPreferred = /\b(uu\s*tien|thich|\bnen)\b/iu.test(normalized);
  const mentionsIfThen = /\b(neu)\b/iu.test(normalized) && /\b(thi)\b/iu.test(normalized);

  // Infer scope from entity match
  let inferredScope: BuiltInConstraintScope | null = null;
  if (teacherMatches.length > 0) inferredScope = 'teacher';
  else if (subjectMatches.length > 0) inferredScope = 'subject';
  else if (classMatches.length > 0) inferredScope = 'class';

  // If-then → global
  if (mentionsIfThen) inferredScope = 'global';

  // Detect ambiguous entity
  let ambiguousEntity: ResolverHints['ambiguousEntity'] = null;
  const mentionsTeacherPair = /\b(va|cung|dong\s+thoi)\b/iu.test(normalized) && teacherMatches.length >= 2;
  if (teacherMatch.status === 'ambiguous' && !mentionsIfThen && !mentionsTeacherPair) {
    ambiguousEntity = { kind: 'teacher', candidates: teacherMatches };
  } else if (subjectMatch.status === 'ambiguous' && !mentionsIfThen) {
    ambiguousEntity = { kind: 'subject', candidates: subjectMatches };
  } else if (classMatch.status === 'ambiguous' && !mentionsIfThen) {
    ambiguousEntity = { kind: 'class', candidates: classMatches };
  }

  return {
    normalizedText: normalized,
    resolvedTeacher: teacherMatch.status === 'matched' ? teacherMatch.label : null,
    resolvedTeachers: teacherMatches,
    resolvedSubject: subjectMatch.status === 'matched' ? subjectMatch.label : null,
    resolvedSubjects: subjectMatches,
    resolvedClass: classMatch.status === 'matched' ? classMatch.label : null,
    resolvedClasses: classMatches,
    extractedNumber,
    extractedPeriods: periods,
    extractedDays: day ? [day] : [],
    droppedIllustrations,
    illustrationSpans,
    inferredScope,
    mentionsBlock,
    mentionsMax,
    mentionsMin,
    mentionsConsecutive,
    mentionsOnly,
    mentionsPreferred,
    mentionsIfThen,
    ambiguousEntity,
  };
}
