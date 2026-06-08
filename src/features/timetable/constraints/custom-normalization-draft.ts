import type {
  CustomConstraintNormalizationResult,
  CustomConstraintSeverity,
} from '../ai/custom-normalization-service';
import type { ConstraintSpec } from '../ai/constraint-spec';
import type { ParsedConstraintDraft, RawConstraintInput } from '../ai/constraint-review-types';

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

function clarificationQuestions(result: CustomConstraintNormalizationResult) {
  return result.clarificationQuestions.map((question, index) => ({
    id: `custom_clarification_${index + 1}`,
    prompt: question,
    options: [],
  }));
}

export function buildCustomDraftFromNormalization(
  raw: RawConstraintInput,
  result: CustomConstraintNormalizationResult
): ParsedConstraintDraft {
  const needsClarification = result.needsClarification || result.clarificationQuestions.length > 0;
  const canBuildSpec = result.status === 'normalized' && !needsClarification && Boolean(result.normalizedText.trim());
  const proposedSpecs: ConstraintSpec[] = canBuildSpec
    ? [
        {
          id: `custom_${raw.id}`,
          original: raw.text,
          severity: severityFromConstraintType(raw.type),
          kind: 'custom_dsl',
          params: {
            naturalLanguage: raw.text,
            normalizedText: result.normalizedText,
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
          ? 'Ràng buộc custom này chưa đủ chính xác để chuẩn hóa.'
          : 'Ràng buộc custom cần làm rõ trước khi xác nhận.',
    });
  }

  return {
    id: `draft_${raw.id}`,
    rawConstraintId: raw.id,
    original: raw.text,
    proposedSpecs,
    status: statusFromNormalization(result, canBuildSpec),
    confidence: confidenceLabel(result.confidence),
    explanation: result.normalizedText,
    issues,
    clarificationQuestions: needsClarification ? clarificationQuestions(result) : undefined,
    source: 'manual',
    displayText: result.normalizedText,
    semanticRepresentation: {
      type: 'unsupported_precise_text',
      text: result.normalizedText || raw.text,
      reason: result.status,
    },
  };
}

export function severityFromConstraintType(type: RawConstraintInput['type']): CustomConstraintSeverity {
  return type === 'preferred' ? 'soft' : 'hard';
}
