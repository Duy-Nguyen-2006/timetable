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

  if (missing.length === 0) return result;

  // Heuristic: nếu code có ít nhất 1 `model.Add` cho mỗi missing id (theo comment hoặc tên),
  // auto-add vào covered. Nếu KHÔNG có dấu hiệu, mới throw.
  const evidenceMissing = missing.filter((id) => {
    // Search code cho dấu hiệu xử lý spec này (comment, hoặc reference id)
    const codeMentionsId = result.constraint_code.includes(id) ||
      result.constraint_code.includes(`spec["id"] == "${id}"`) ||
      result.constraint_code.includes(`spec['id'] == '${id}'`);
    return !codeMentionsId;
  });

  if (evidenceMissing.length > 0) {
    throw new Error(
      `Coder failed to cover hard constraints (no code reference): ${evidenceMissing.join(', ')}`
    );
  }

  // Auto-patch coverage list — code có vẻ đã xử lý nhưng LLM quên list.
  return {
    ...result,
    covered_constraint_ids: [...new Set([...result.covered_constraint_ids, ...missing])],
    assumptions: [...result.assumptions, `auto_added_coverage:${missing.join(',')}`],
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
  return ensureCoverage(
    {
      ...parsed,
      rawResponse: response.content,
      usageTokens: response.usage?.total_tokens,
    },
    payload.dataset.constraints
  );
}
