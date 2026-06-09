import type { AgentInputPayload, AIProviderConfig } from '../ai/types';
import type { ReparseResult } from '../ai/semantic-constraint';
import type { CustomConstraintNormalizationResult } from '../ai/custom-normalization-service';
import { buildCustomNormalizationInput } from '../ai/custom-normalization-service';
import type { RawConstraintInput } from '../ai/constraint-review-types';

export type ConstraintIntakeAiResult =
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

/** AI phân tích raw input (ưu tiên reparse built-in, fallback custom normalize). */
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
  const rejectedDisplay = options?.rejectedDisplayText?.trim() || raw.text;
  const reparseRes = await fetch('/api/ai/reparse-constraint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request: {
        rawConstraint: {
          id: raw.id,
          text: raw.text,
          type: raw.type,
          weight: raw.weight,
        },
        rejectedDraft: {
          summary: '',
          displayText: rejectedDisplay,
        },
        previousAttempts: options?.previousAttempts ?? [],
        context: buildIntakeContext(agentInput),
      },
      providerConfig: provider,
      agentInput,
    }),
  });
  const reparseJson = (await reparseRes.json().catch(() => null)) as ReparseResult | { error?: string } | null;
  if (
    reparseRes.ok &&
    reparseJson &&
    'status' in reparseJson &&
    reparseJson.status === 'candidate' &&
    reparseJson.candidate.specs?.length
  ) {
    return { kind: 'reparse', result: reparseJson };
  }

  const normRes = await fetch('/api/ai/normalize-custom-constraint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request: {
        severity: raw.type === 'required' ? 'hard' : 'soft',
        originalText: raw.text,
      },
      providerConfig: provider,
      agentInput,
    }),
  });
  const normBody = (await normRes.json().catch(() => null)) as
    | CustomConstraintNormalizationResult
    | { error?: string }
    | null;
  if (!normBody || !('status' in normBody)) {
    throw new Error(
      (normBody && 'error' in normBody && normBody.error) || 'AI phân tích thất bại.'
    );
  }
  if (!normRes.ok) {
    throw new Error('AI phân tích thất bại.');
  }
  return { kind: 'custom', body: normBody };
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
