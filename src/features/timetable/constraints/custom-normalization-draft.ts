import type {
  CustomConstraintNormalizationResult,
  CustomConstraintSeverity,
} from '../ai/custom-normalization-service';
import type { ParsedConstraintDraft, RawConstraintInput } from '../ai/constraint-review-types';

function confidenceLabel(value: number): ParsedConstraintDraft['confidence'] {
  if (value >= 0.8) return 'high';
  if (value >= 0.55) return 'medium';
  return 'low';
}

function statusFromNormalization(
  result: CustomConstraintNormalizationResult
): ParsedConstraintDraft['status'] {
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
  const issues: ParsedConstraintDraft['issues'] = needsClarification
    ? result.clarificationQuestions.map((message) => ({
        code: 'needs_user_clarification' as const,
        message,
      }))
    : [
        {
          code: 'low_confidence' as const,
          message: 'Ràng buộc custom đã được chuẩn hóa để xem lại; solver adapter sẽ xử lý ở bước sau.',
        },
      ];

  if (result.status === 'unsupported' && issues.length === 0) {
    issues.push({
      code: 'unsupported_kind',
      message: 'Ràng buộc custom này chưa đủ chính xác để chuẩn hóa.',
    });
  }

  return {
    id: `draft_${raw.id}`,
    rawConstraintId: raw.id,
    original: raw.text,
    proposedSpecs: [],
    status: statusFromNormalization(result),
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
