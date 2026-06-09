import type { AgentInputPayload, AIProviderConfig } from '../ai/types';
import type { AnalyzeConstraintResult } from '../ai/analyze-constraint-service';
import type { ReparseResult } from '../ai/semantic-constraint';
import type { CustomConstraintNormalizationResult } from '../ai/custom-normalization-service';
import { buildCustomNormalizationInput } from '../ai/custom-normalization-service';
import type { RawConstraintInput } from '../ai/constraint-review-types';

export type ConstraintIntakeAiResult =
  | { kind: 'analyze'; result: AnalyzeConstraintResult }
  | { kind: 'reparse'; result: ReparseResult }
  | { kind: 'custom'; body: CustomConstraintNormalizationResult };

function buildIntakeContext(agentInput: AgentInputPayload) {
  return {
    teachers: agentInput.assignments.map((a) => a.teacher.label),
    classes: agentInput.assignments.map((a) => a.class.label),
    subjects: agentInput.assignments.map((a) => a.subject.label),
    days: agentInput.days,
    periods: agentInput.sessions.flatMap((session) =>
      Array.from({ length: agentInput.periodCounts[session.id] ?? 0 }, (_, i) => ({
        session: session.id,
        period: i + 1,
      }))
    ),
    assignments: agentInput.assignments.map((a) => ({
      id: a.id,
      teacher: a.teacher.label,
      class: a.class.label,
      subject: a.subject.label,
      weeklyPeriods: a.weeklyPeriods,
    })),
  };
}

/** AI phân tích raw input — unified flow via /api/ai/analyze-constraint. */
export async function fetchConstraintIntakeAiAnalysis(
  raw: RawConstraintInput,
  agentInput: AgentInputPayload,
  provider: AIProviderConfig,
  options?: {
    rejectedDisplayText?: string;
    previousAttempts?: Array<{
      summary: string;
      displayText: string;
      source: 'built_in' | 'semantic';
      confidence: 'high' | 'medium' | 'low';
    }>;
  }
): Promise<ConstraintIntakeAiResult> {
  // Use new unified analyze-constraint endpoint
  const analyzeRes = await fetch('/api/ai/analyze-constraint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rawText: raw.text,
      constraintType: raw.type,
      weight: raw.weight,
      agentInput,
      providerConfig: provider,
      previousAttempts: options?.previousAttempts?.map((a) => ({
        displayText: a.displayText,
        source: a.source,
        confidence: a.confidence,
      })),
    }),
  });

  const analyzeJson = (await analyzeRes.json().catch(() => null)) as
    | AnalyzeConstraintResult
    | { error?: string }
    | null;

  if (!analyzeRes.ok || !analyzeJson || !('status' in analyzeJson)) {
    throw new Error(
      (analyzeJson && 'error' in analyzeJson && analyzeJson.error) || 'AI phân tích thất bại.'
    );
  }

  return { kind: 'analyze', result: analyzeJson };
}

export function buildCustomNormalizationInputForRaw(
  raw: RawConstraintInput,
  agentInput: AgentInputPayload
) {
  return buildCustomNormalizationInput(
    raw.type === 'required' ? 'hard' : 'soft',
    raw.text,
    agentInput
  );
}
