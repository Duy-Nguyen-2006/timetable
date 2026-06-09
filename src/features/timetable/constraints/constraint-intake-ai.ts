import { buildDraftFromSpecs } from '../ai/constraint-draft-validator';
import { humanizeConstraintSpec } from '../ai/constraint-humanizer';
import { preferCanonicalNormalizedText } from '../ai/constraint-canonical-text';
import type { ParsedConstraintDraft, RawConstraintInput } from '../ai/constraint-review-types';
import type { ReparseResult } from '../ai/semantic-constraint';
import {
  buildCustomDraftFromNormalization,
  severityFromConstraintType,
} from './custom-normalization-draft';
import type { CustomConstraintNormalizationResult } from '../ai/custom-normalization-service';
import type { AnalyzeConstraintResult } from '../ai/analyze-constraint-service';
import type { AgentInputPayload } from '../ai/types';

export function finalizeAiDisplayText(
  agentInput: AgentInputPayload,
  rawText: string,
  modelText: string,
  specs: ParsedConstraintDraft['proposedSpecs']
): string {
  const canonical = preferCanonicalNormalizedText(agentInput, rawText, modelText);
  if (specs.length === 1 && specs[0].kind !== 'custom_dsl') {
    return specs.map((s) => humanizeConstraintSpec(s)).join('\n');
  }
  return canonical;
}

export function buildDraftFromReparseResult(
  raw: RawConstraintInput,
  result: ReparseResult,
  agentInput: AgentInputPayload,
  reparseCount: number
): ParsedConstraintDraft | null {
  const specs = result.candidate.specs;
  if (result.status === 'candidate' && specs?.length) {
    const built = buildDraftFromSpecs(`draft_${raw.id}`, raw, specs, agentInput, {
      source: 'ai_reparse',
      confidence: result.candidate.confidence,
      explanation: result.displayText,
    });
    const displayText = finalizeAiDisplayText(agentInput, raw.text, result.displayText, built.proposedSpecs);
    return {
      ...built,
      displayText,
      reparseCount,
      source: 'ai_reparse',
    };
  }

  if (result.status === 'unsupported' || result.candidate.unresolvedQuestions.length) {
    const norm: CustomConstraintNormalizationResult = {
      status: result.status === 'unsupported' ? 'unsupported' : 'needs_clarification',
      normalizedText: result.displayText,
      detectedEntities: {
        teachers: [],
        subjects: [],
        classes: [],
        assignments: [],
        days: [],
        periods: [],
      },
      confidence: 0.4,
      needsClarification: true,
      clarificationQuestions: result.candidate.unresolvedQuestions,
    };
    return {
      ...buildCustomDraftFromNormalization(raw, norm, agentInput),
      reparseCount,
      source: 'ai_reparse',
    };
  }

  return null;
}

export function buildDraftFromCustomNormalization(
  raw: RawConstraintInput,
  body: CustomConstraintNormalizationResult,
  agentInput: AgentInputPayload
): ParsedConstraintDraft {
  return buildCustomDraftFromNormalization(raw, body, agentInput);
}

export function buildDraftFromAnalyzeResult(
  raw: RawConstraintInput,
  result: AnalyzeConstraintResult,
  agentInput: AgentInputPayload,
  reparseCount: number
): ParsedConstraintDraft {
  // mapped_builtin: has built-in specs
  if (result.status === 'mapped_builtin' && result.specs.length > 0) {
    const built = buildDraftFromSpecs(`draft_${raw.id}`, raw, result.specs, agentInput, {
      source: 'ai_reparse',
      confidence: result.confidence,
      explanation: result.normalizedText,
    });
    const displayText = finalizeAiDisplayText(agentInput, raw.text, result.normalizedText, built.proposedSpecs);
    return {
      ...built,
      displayText,
      reparseCount,
      source: 'ai_reparse',
      semanticRepresentation: result.semantic,
    };
  }

  // semantic_only: understood but no built-in match
  if (result.status === 'semantic_only' && result.semantic) {
    const customNorm: CustomConstraintNormalizationResult = {
      status: 'normalized',
      normalizedText: result.normalizedText,
      detectedEntities: {
        teachers: [],
        subjects: [],
        classes: [],
        assignments: [],
        days: [],
        periods: [],
      },
      confidence: result.confidence === 'high' ? 0.8 : result.confidence === 'medium' ? 0.6 : 0.4,
      needsClarification: false,
      clarificationQuestions: [],
    };
    return {
      ...buildCustomDraftFromNormalization(raw, customNorm, agentInput),
      reparseCount,
      source: 'ai_reparse',
      semanticRepresentation: result.semantic,
      displayText: result.normalizedText,
    };
  }

  // needs_clarification: AI needs more info
  if (result.status === 'needs_clarification') {
    const customNorm: CustomConstraintNormalizationResult = {
      status: 'needs_clarification',
      normalizedText: result.normalizedText,
      detectedEntities: {
        teachers: [],
        subjects: [],
        classes: [],
        assignments: [],
        days: [],
        periods: [],
      },
      confidence: 0.35,
      needsClarification: true,
      clarificationQuestions: result.clarificationQuestions,
    };
    return {
      ...buildCustomDraftFromNormalization(raw, customNorm, agentInput),
      reparseCount,
      source: 'ai_reparse',
      displayText: result.normalizedText,
    };
  }

  // unsupported: outside timetable domain
  const customNorm: CustomConstraintNormalizationResult = {
    status: 'unsupported',
    normalizedText: result.normalizedText,
    detectedEntities: {
      teachers: [],
      subjects: [],
      classes: [],
      assignments: [],
      days: [],
      periods: [],
    },
    confidence: 0.2,
    needsClarification: true,
    clarificationQuestions: result.unresolvedQuestions.length > 0
      ? result.unresolvedQuestions
      : ['Ràng buộc này không thể áp dụng cho thời khóa biểu.'],
  };
  return {
    ...buildCustomDraftFromNormalization(raw, customNorm, agentInput),
    reparseCount,
    source: 'ai_reparse',
    displayText: result.normalizedText,
  };
}

export function rawInputFromText(
  text: string,
  type: 'required' | 'preferred',
  weight?: number,
  id?: string
): RawConstraintInput {
  return {
    id: id ?? `raw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    text: text.trim(),
    type,
    weight,
    createdAt: new Date().toISOString(),
  };
}

export function severityForRaw(raw: RawConstraintInput) {
  return severityFromConstraintType(raw.type);
}
