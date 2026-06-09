import type { RawConstraintInput, ParsedConstraintDraft } from '../ai/constraint-review-types';
import { suggestBuiltInConstraint } from '../ai/built-in-suggestion';
import type { AgentInputPayload } from '../ai/types';
import { buildDraftFromBuiltInSuggestion } from './constraint-import-from-suggestion';

function uniqueLabels(labels: string[]): string[] {
  return Array.from(new Set(labels)).filter(Boolean);
}

function fallbackDraft(raw: RawConstraintInput): ParsedConstraintDraft {
  return {
    id: `draft_${raw.id}`,
    rawConstraintId: raw.id,
    original: raw.text,
    displayText: raw.text,
    proposedSpecs: [],
    status: 'unparsed',
    confidence: 'low',
    source: 'rule',
    explanation: 'Chưa đủ chắc chắn để tự động chọn mẫu có sẵn.',
    issues: [
      {
        code: 'low_confidence',
        message: 'Cần người dùng chọn mẫu có sẵn hoặc chuẩn hóa bằng ràng buộc đặc biệt.',
      },
    ],
  };
}

export function normalizeConstraintToBuiltInDraft(
  raw: RawConstraintInput,
  input: AgentInputPayload
): ParsedConstraintDraft {
  const suggestion = suggestBuiltInConstraint({
    userText: raw.text,
    teachers: uniqueLabels(input.assignments.map((assignment) => assignment.teacher.label)),
    subjects: uniqueLabels(input.assignments.map((assignment) => assignment.subject.label)),
    classes: uniqueLabels(input.assignments.map((assignment) => assignment.class.label)),
    assignments: input.assignments,
    days: input.days,
  });

  if (suggestion.decision !== 'suggest_built_in') {
    return fallbackDraft(raw);
  }

  return buildDraftFromBuiltInSuggestion(raw, suggestion, input);
}

export function normalizeConstraintsToBuiltInDrafts(
  raws: RawConstraintInput[],
  input: AgentInputPayload
): ParsedConstraintDraft[] {
  return raws.map((raw) => normalizeConstraintToBuiltInDraft(raw, input));
}
