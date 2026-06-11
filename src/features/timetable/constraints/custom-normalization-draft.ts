import { canonicalDisplayFromRuleParser } from '../ai/constraint-canonical-text';
import type {
  CustomConstraintNormalizationResult,
  CustomConstraintSeverity,
} from '../ai/custom-normalization-service';
import type { ConstraintSpec } from '../ai/constraint-spec';
import type { ParsedConstraintDraft, RawConstraintInput } from '../ai/constraint-review-types';
import type { AgentInputPayload } from '../ai/types';
import { buildClarificationQuestions } from '../ai/constraint-clarification';
import type { ConstraintClarificationQuestion } from '../ai/constraint-review-types';

function confidenceLabel(value: number): ParsedConstraintDraft['confidence'] {
  if (value >= 0.8) return 'high';
  if (value >= 0.55) return 'medium';
  return 'low';
}

function statusFromNormalization(
  result: CustomConstraintNormalizationResult,
  canBuildSpec: boolean
): ParsedConstraintDraft['status'] {
  if (canBuildSpec) return 'parsed';
  if (result.status === 'unsupported') return 'unsupported';
  return 'needs_review';
}

/**
 * Translate free-form `clarificationQuestions` strings (from the LLM) into
 * structured `ConstraintClarificationQuestion` objects with real options.
 *
 * Each raw question becomes one question in the UI. We piggy-back on
 * `buildClarificationQuestions` so the option contract (`recommended`,
 * `specDraft`, `none_fit` escape, Vietnamese labels) stays consistent
 * across the analyze and custom paths.
 */
function clarificationQuestions(
  result: CustomConstraintNormalizationResult,
  raw: RawConstraintInput,
  agentInput?: AgentInputPayload
): ConstraintClarificationQuestion[] {
  if (result.clarificationQuestions.length === 0) return [];

  // Generate a baseline set of structured questions to inherit options
  // (per_class / whole_school / scope / soft_vs_hard, etc.) from. We then
  // surface the model's free-form questions as a `model_clarification_*`
  // variant so the user still sees them but with a real "Đồng ý" path.
  const structured = buildClarificationQuestions(
    raw.text,
    undefined,
    agentInput
      ? {
          teachers: Array.from(new Set(agentInput.assignments.map((a) => a.teacher.label))),
          classes: Array.from(new Set(agentInput.assignments.map((a) => a.class.label))),
          subjects: Array.from(new Set(agentInput.assignments.map((a) => a.subject.label))),
        }
      : undefined
  );

  return result.clarificationQuestions.map((question, index) => {
    const modelOptions = structured.length > 0 ? structured[index % structured.length]?.options ?? [] : [];
    return {
      id: `custom_clarification_${index + 1}`,
      prompt: question,
      allowFreeText: true,
      // Surface at least one option so the user has a deterministic
      // «Đồng ý» path; `model_question_*` is the explicit "skip this LLM
      // question and let the orchestrator commit" choice.
      options: [
        ...modelOptions,
        {
          id: `model_question_${index + 1}`,
          labelVi: 'Bỏ qua câu hỏi này và dùng phần hiểu hiện tại',
          recommended: modelOptions.length === 0,
        },
      ],
    };
  });
}

export function buildCustomDraftFromNormalization(
  raw: RawConstraintInput,
  result: CustomConstraintNormalizationResult,
  agentInput?: AgentInputPayload
): ParsedConstraintDraft {
  const needsClarification = result.needsClarification || result.clarificationQuestions.length > 0;
  const canonicalDisplay =
    agentInput && result.status === 'normalized'
      ? canonicalDisplayFromRuleParser(agentInput, raw.text)
      : null;
  const displayText = canonicalDisplay ?? result.normalizedText;
  const canBuildSpec = result.status === 'normalized' && !needsClarification && Boolean(displayText.trim());
  const proposedSpecs: ConstraintSpec[] = canBuildSpec
    ? [
        {
          id: `custom_${raw.id}`,
          original: raw.text,
          severity: severityFromConstraintType(raw.type),
          kind: 'custom_dsl',
          params: {
            naturalLanguage: raw.text,
            normalizedText: displayText,
            detectedEntities: result.detectedEntities,
            source: 'custom_normalization',
          },
          ...(raw.type === 'preferred' && raw.weight != null ? { weight: raw.weight } : {}),
        },
      ]
    : [];
  const issues: ParsedConstraintDraft['issues'] = needsClarification
    ? result.clarificationQuestions.map((message) => ({
        code: 'needs_user_clarification' as const,
        message,
      }))
    : [];

  if (!canBuildSpec && issues.length === 0) {
    issues.push({
      code: result.status === 'unsupported' ? 'unsupported_kind' : 'low_confidence',
      message:
        result.status === 'unsupported'
          ? 'Ràng buộc đặc biệt này chưa đủ chính xác để chuẩn hóa.'
          : 'Ràng buộc đặc biệt cần làm rõ trước khi xác nhận.',
    });
  }

  return {
    id: `draft_${raw.id}`,
    rawConstraintId: raw.id,
    original: raw.text,
    proposedSpecs,
    status: statusFromNormalization(result, canBuildSpec),
    confidence: confidenceLabel(result.confidence),
    explanation: displayText,
    issues,
    clarificationQuestions: needsClarification ? clarificationQuestions(result, raw, agentInput) : undefined,
    source: 'manual',
    displayText,
    semanticRepresentation: {
      type: 'unsupported_precise_text',
      text: displayText || raw.text,
      reason: result.status,
    },
  };
}

export function severityFromConstraintType(type: RawConstraintInput['type']): CustomConstraintSeverity {
  return type === 'preferred' ? 'soft' : 'hard';
}
