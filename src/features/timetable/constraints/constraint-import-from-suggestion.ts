import type { BuiltInSuggestion } from '../ai/built-in-suggestion';
import type { ConstraintSpec } from '../ai/constraint-spec';
import type { RawConstraintInput, ParsedConstraintDraft } from '../ai/constraint-review-types';
import type { AgentInputPayload } from '../ai/types';
import {
  applyFormToDraft,
  buildContextFromAgentInput,
  defaultFormValues,
  isFormTemplateKind,
  type ConstraintFormValues,
} from './constraint-form-schema';
import { buildDraftFromSpecs } from '../ai/constraint-draft-validator';

function paramsToFormValues(values: ConstraintFormValues, params: Record<string, unknown>): ConstraintFormValues {
  const next: ConstraintFormValues = { ...values };
  if (typeof params.teacher === 'string') next.teacher = params.teacher;
  if (typeof params.subject === 'string') next.subject = params.subject;
  if (typeof params.class === 'string') next.className = params.class;
  if (typeof params.day === 'string') next.day = params.day;
  if (typeof params.period === 'number') next.period = params.period;
  if (typeof params.maxPerDay === 'number') next.maxPerDay = params.maxPerDay;
  if (typeof params.maxConsecutive === 'number') next.maxConsecutive = params.maxConsecutive;
  if (typeof params.maxDays === 'number') next.maxDays = params.maxDays;
  if (typeof params.max === 'number') {
    next.max = params.max;
    next.maxConsecutive = params.max;
  }
  if (Array.isArray(params.days)) next.days = params.days.map(String);
  if (Array.isArray(params.periods)) next.periods = params.periods.map(Number);
  if (Array.isArray(params.subjects)) next.subjects = params.subjects.map(String);
  if (Array.isArray(params.teachers) && params.teachers.length >= 2) {
    next.teachers = [String(params.teachers[0]), String(params.teachers[1])];
  }
  if (params.if && typeof params.if === 'object') {
    next.ifThenCondition = params.if as ConstraintFormValues['ifThenCondition'];
  }
  if (Array.isArray(params.then)) {
    next.ifThenThen = params.then as ConstraintFormValues['ifThenThen'];
  }
  return next;
}

/** Build review draft from built-in suggestion params (canonical display via form/humanizer). */
export function buildDraftFromBuiltInSuggestion(
  raw: RawConstraintInput,
  suggestion: Extract<BuiltInSuggestion, { decision: 'suggest_built_in' }>,
  agentInput: AgentInputPayload
): ParsedConstraintDraft {
  const specsDraft = suggestion.specsDraft?.length
    ? suggestion.specsDraft
    : [{ kind: suggestion.kind, paramsDraft: suggestion.paramsDraft }];
  if (specsDraft.some((spec) => !isFormTemplateKind(spec.kind))) {
    return buildDraftFromSpecs(`draft_${raw.id}`, raw, [], agentInput, {
      source: 'rule',
      confidence: 'low',
      explanation: suggestion.explanation,
    });
  }
  if (specsDraft.length > 1) {
    const severity = raw.type === 'required' ? 'hard' : 'soft';
    const specs: ConstraintSpec[] = specsDraft.map((spec, index) => ({
      id: `spec_${raw.id}_${index}`,
      original: raw.text,
      severity,
      kind: spec.kind,
      params: { ...spec.paramsDraft },
      ...(raw.type === 'preferred' ? { weight: raw.weight } : {}),
    }));
    return {
      ...buildDraftFromSpecs(`draft_${raw.id}`, raw, specs, agentInput, {
        source: 'rule',
        confidence: 'high',
        explanation: suggestion.explanation,
      }),
      source: 'rule',
      confidence: 'high',
      explanation: suggestion.explanation,
    };
  }
  const baseDraft = buildDraftFromSpecs(`draft_${raw.id}`, raw, [], agentInput, {
    source: 'rule',
    confidence: 'high',
    explanation: suggestion.explanation,
  });
  const values = paramsToFormValues(
    defaultFormValues(suggestion.kind, raw.type),
    suggestion.paramsDraft
  );
  return {
    ...applyFormToDraft(agentInput, baseDraft, raw.type, values, buildContextFromAgentInput(agentInput)),
    source: 'rule',
    confidence: 'high',
    explanation: suggestion.explanation,
  };
}
