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
  extractCountNumber,
  extractDayId,
  extractPeriodNumber,
  normalizeConstraintText,
} from './translator-text';
import {
  analyzeSemanticDirection,
  mentionsConsecutiveMarker,
  mentionsIfThenMarker,
  mentionsMaxMarker,
  mentionsMinMarker,
} from './semantic-direction';
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
  const trailingMarker = text.match(
    /\s*(?:,?\s*)(?:ví\s*dụ|vd\.?|chẳng\s*hạn|kiểu\s*như|như\s*là)\s+(.+)$/iu
  );
  if (trailingMarker?.index != null) {
    const dropped = trailingMarker[0].replace(/^[,\s]+/u, '').trim();
    return {
      trustedText: text.slice(0, trailingMarker.index).trim(),
      droppedIllustrations: [dropped],
      illustrationSpans: [{ start: trailingMarker.index, end: text.length, text: dropped }],
    };
  }

  const parenthetical = text.match(/\s*\(\s*(?:như|vd\.?|ví\s*dụ)\s+[^)]+\)\s*$/iu);
  if (parenthetical?.index != null) {
    const dropped = parenthetical[0].trim();
    return {
      trustedText: text.slice(0, parenthetical.index).trim(),
      droppedIllustrations: [dropped],
      illustrationSpans: [{ start: parenthetical.index, end: text.length, text: dropped }],
    };
  }

  return { trustedText: text, droppedIllustrations: [], illustrationSpans: [] };
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

  const extractedNumber = extractCountNumber(trustedText);
  const periods: number[] = [];
  const day = input.days ? extractDayId(trustedText, input.days) : null;
  const period = extractPeriodNumber(trustedText);
  if (period !== null) periods.push(period);

  const semantic = analyzeSemanticDirection(trustedText);
  const mentionsBlock = semantic.matched.block.length > 0;
  const mentionsMax = mentionsMaxMarker(trustedText);
  const mentionsMin = mentionsMinMarker(trustedText);
  const mentionsConsecutive = mentionsConsecutiveMarker(trustedText);
  const mentionsOnly = semantic.matched.only.length > 0;
  const mentionsPreferred = semantic.matched.prefer.length > 0;
  const mentionsIfThen = mentionsIfThenMarker(trustedText);

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
