import { z } from 'zod';

import type { ConstraintSpec, Plan } from './constraint-spec';
import { parseModelJson } from './parse-model-json';
import type { AIProviderConfig, ChatUsage, CoderTurnResult } from './types';
import { invokeChat } from './chat-client';

type ChatInvoke = (payload: Record<string, unknown>) => Promise<{ content?: string; usage?: ChatUsage }>;

const coderResponseSchema = z.object({
  plan_summary: z.string(),
  constraint_code: z.string(),
  covered_constraint_ids: z.array(z.string()),
  assumptions: z.array(z.string()),
});

const defaultInvokeChat = (payload: Record<string, unknown>) => invokeChat(payload as any);

function isAiCodedSpec(spec: ConstraintSpec): boolean {
  return spec.kind === 'custom_dsl';
}

function loadCoderSystemPrompt(): Promise<string> {
  return fetch('/prompts/coder.system.md')
    .then(async (response) => {
      if (!response.ok) {
        return 'You are a CP-SAT coder. Return strict JSON.';
      }
      return response.text();
    })
    .catch(() => 'You are a CP-SAT coder. Return strict JSON.');
}

function ensureCoverage(result: CoderTurnResult, specs: ConstraintSpec[]): CoderTurnResult {
  const customIds = specs
    .filter(isAiCodedSpec)
    .map((spec) => spec.id);

  const hardCustomIds = specs
    .filter((spec) => spec.severity === 'hard' && isAiCodedSpec(spec))
    .map((spec) => spec.id);

  const customIdSet = new Set(customIds);
  const covered = new Set(
    result.covered_constraint_ids.filter((id) => customIdSet.has(id))
  );
  const assumptions = [...result.assumptions];

  for (const id of hardCustomIds) {
    if (covered.has(id)) continue;

    // Dùng word-boundary regex thay vì includes() để tránh false-positive
    // khi id 'c1' trùng với 'c10', 'c12'... (fix bug #15).
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const referenceRegex = new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`, 'm');
    if (!referenceRegex.test(result.constraint_code)) {
      throw new Error(
        `Coder failed to cover hard custom_dsl constraint ${id}: no code reference`
      );
    }

    covered.add(id);
    assumptions.push(`auto_added_coverage:${id}`);
  }

  return {
    ...result,
    covered_constraint_ids: [...covered],
    assumptions,
  };
}

export async function runCoderTurn(
  config: AIProviderConfig,
  payload: {
    dataset: {
      classes: string[];
      days: string[];
      periods: number[];
      assignments: Array<{
        id: string;
        class: string;
        subject: string;
        teacher: string;
        weeklyPeriods: number;
      }>;
      constraints: ConstraintSpec[];
      datasetDigest: {
        classCount: number;
        teacherCount: number;
        dayCount: number;
        periodCount: number;
        totalAssignments: number;
      };
    };
    plan: Plan;
    previousAttemptSummary?: string;
  },
  invokeChat: ChatInvoke = defaultInvokeChat
): Promise<CoderTurnResult> {
  const customSpecs = payload.dataset.constraints.filter(isAiCodedSpec);

  if (customSpecs.length === 0) {
    return {
      plan_summary: 'No AI-coded constraints. Built-in registry handles all constraints.',
      constraint_code: 'pass',
      covered_constraint_ids: [],
      assumptions: ['built_in_registry_handles_non_custom_constraints'],
    };
  }

  const systemPrompt = await loadCoderSystemPrompt();
  const chatPayload = {
    baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
    apiKey: config.apiKey,
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: JSON.stringify(
          {
            datasetDigest: payload.dataset.datasetDigest,
            assignments: payload.dataset.assignments,
            constraints: customSpecs,
            plan: payload.plan,
            previousAttemptSummary: payload.previousAttemptSummary ?? '',
          }
        ),
      },
    ],
    temperature: 0.1,
    max_tokens: 30000,
    cache_control: { enable: true },
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'coder_output',
        schema: {
          type: 'object',
          properties: {
            plan_summary: { type: 'string' },
            constraint_code: { type: 'string' },
            covered_constraint_ids: { type: 'array', items: { type: 'string' } },
            assumptions: { type: 'array', items: { type: 'string' } },
          },
          required: ['plan_summary', 'constraint_code', 'covered_constraint_ids', 'assumptions'],
          additionalProperties: false,
        },
      },
    },
  };

  const response = await invokeChat(chatPayload);
  const parsed = coderResponseSchema.parse(parseModelJson(response.content));
  return ensureCoverage(
    {
      ...parsed,
      rawResponse: response.content,
      usageTokens: response.usage?.total_tokens,
    },
    customSpecs
  );
}
