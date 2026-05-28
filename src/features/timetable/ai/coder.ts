import { z } from 'zod';

import type { ConstraintSpec, Plan } from './constraint-spec';
import { parseModelJson } from './parse-model-json';
import type { AIProviderConfig, ChatUsage, CoderTurnResult } from './types';

type ChatInvoke = (payload: Record<string, unknown>) => Promise<{ content?: string; usage?: ChatUsage }>;

const coderResponseSchema = z.object({
  plan_summary: z.string(),
  constraint_code: z.string(),
  covered_constraint_ids: z.array(z.string()),
  assumptions: z.array(z.string()),
});

function defaultInvokeChat(payload: Record<string, unknown>): Promise<{ content?: string; usage?: ChatUsage }> {
  return fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(async (response) => {
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) {
      throw new Error(body?.error || `Chat API failed with status ${response.status}`);
    }
    return { content: String(body.content ?? ''), usage: body.usage as ChatUsage | undefined };
  });
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
  const hardIds = specs
    .filter((spec) => spec.severity === 'hard')
    .filter((spec) => !(spec.kind === 'weekly_periods_exact' && spec.tags?.includes('auto_base')))
    .map((spec) => spec.id);
  const covered = new Set(result.covered_constraint_ids);
  const missing = hardIds.filter((id) => !covered.has(id));
  if (missing.length) {
    throw new Error(`Coder failed to cover hard constraints: ${missing.join(', ')}`);
  }
  return result;
}

function reflectConstraintCode(result: CoderTurnResult): CoderTurnResult {
  const forbidden = ['import ', 'print(', 'open(', '__import__'];
  const hit = forbidden.find((token) => result.constraint_code.includes(token));
  if (!hit) return result;
  return {
    ...result,
    constraint_code: result.constraint_code
      .split('\n')
      .filter((line) => !forbidden.some((token) => line.includes(token)))
      .join('\n'),
    assumptions: [...result.assumptions, `reflection_removed_forbidden_token:${hit.trim()}`],
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
            constraints: payload.dataset.constraints,
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
  return reflectConstraintCode(
    ensureCoverage(
    {
      ...parsed,
      rawResponse: response.content,
      usageTokens: response.usage?.total_tokens,
    },
    payload.dataset.constraints
    )
  );
}
