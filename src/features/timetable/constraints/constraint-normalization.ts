import { buildDraftFromSpecs } from '../ai/constraint-draft-validator';
import type { RawConstraintInput, ParsedConstraintDraft } from '../ai/constraint-review-types';
import { suggestBuiltInConstraint } from '../ai/built-in-suggestion';
import type { AgentInputPayload } from '../ai/types';
import {
  applyFormToDraft,
  buildContextFromAgentInput,
  defaultFormValues,
  isFormTemplateKind,
  type ConstraintFormValues,
} from './constraint-form-schema';

function uniqueLabels(labels: string[]): string[] {
  return Array.from(new Set(labels)).filter(Boolean);
}

function paramsToFormValues(values: ConstraintFormValues, params: Record<string, unknown>): ConstraintFormValues {
  const next: ConstraintFormValues = { ...values };
  if (typeof params.teacher === 'string') next.teacher = params.teacher;
  if (typeof params.subject === 'string') next.subject = params.subject;
  if (typeof params.class === 'string') next.className = params.class;
  if (typeof params.day === 'string') next.day = params.day;
  if (typeof params.period === 'number') next.period = params.period;
  if (typeof params.maxPerDay === 'number') next.maxPerDay = params.maxPerDay;
  if (typeof params.maxConsecutive === 'number') next.maxConsecutive = params.maxConsecutive;
  if (typeof params.max === 'number') {
    next.max = params.max;
    next.maxConsecutive = params.max;
  }
  if (Array.isArray(params.days)) next.days = params.days.map(String);
  if (Array.isArray(params.periods)) next.periods = params.periods.map(Number);
  if (Array.isArray(params.subjects)) next.subjects = params.subjects.map(String);
  if (Array.isArray(params.assignmentIds)) next.assignmentIds = params.assignmentIds.map(String);
  return next;
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

  if (suggestion.decision !== 'suggest_built_in' || !isFormTemplateKind(suggestion.kind)) {
    return fallbackDraft(raw);
  }

  const baseDraft = buildDraftFromSpecs(`draft_${raw.id}`, raw, [], input, {
    source: 'rule',
    confidence: 'high',
    explanation: suggestion.explanation,
  });
  const values = paramsToFormValues(
    defaultFormValues(suggestion.kind, raw.type),
    suggestion.paramsDraft
  );

  return {
    ...applyFormToDraft(input, baseDraft, raw.type, values, buildContextFromAgentInput(input)),
    source: 'rule',
    confidence: 'high',
    explanation: suggestion.explanation,
  };
}

export function normalizeConstraintsToBuiltInDrafts(
  raws: RawConstraintInput[],
  input: AgentInputPayload
): ParsedConstraintDraft[] {
  return raws.map((raw) => normalizeConstraintToBuiltInDraft(raw, input));
}
