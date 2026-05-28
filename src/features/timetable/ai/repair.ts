import { z } from 'zod';

import type { Plan, Violation } from './constraint-spec';
import { parseModelJson } from './parse-model-json';
import type { AIProviderConfig, ChatUsage, RepairTurnResult } from './types';

type ChatInvoke = (payload: Record<string, unknown>) => Promise<{ content?: string; usage?: ChatUsage }>;

const repairResponseSchema = z.object({
  summary: z.string(),
  patches: z.array(
    z.object({
      oldStr: z.string(),
      newStr: z.string(),
      reason: z.string(),
    })
  ),
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

function loadRepairSystemPrompt(): Promise<string> {
  return fetch('/prompts/repair.system.md')
    .then(async (response) => {
      if (!response.ok) {
        return 'You are a repair agent. Return strict JSON patches.';
      }
      return response.text();
    })
    .catch(() => 'You are a repair agent. Return strict JSON patches.');
}

export async function runRepairTurn(
  config: AIProviderConfig,
  payload: {
    plan: Plan;
    constraintCode: string;
    violations: Violation[];
    compileOrRunError?: string;
  },
  invokeChat: ChatInvoke = defaultInvokeChat
): Promise<RepairTurnResult> {
  const systemPrompt = await loadRepairSystemPrompt();
  const chatPayload = {
    baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
    apiKey: config.apiKey,
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: JSON.stringify({
          plan: payload.plan,
          currentCode: payload.constraintCode,
          constraintCode: payload.constraintCode,
          violations: payload.violations.map((violation) => ({
            constraintId: violation.constraintId,
            kind: violation.kind,
            message: violation.message,
            count: violation.offendingEntries.length,
            sample: violation.offendingEntries.slice(0, 3),
          })),
          compileOrRunError: payload.compileOrRunError ?? '',
        }),
      },
    ],
    temperature: 0.1,
    max_tokens: 2200,
    cache_control: { enable: true },
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'repair_output',
        schema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            patches: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  oldStr: { type: 'string' },
                  newStr: { type: 'string' },
                  reason: { type: 'string' },
                },
                required: ['oldStr', 'newStr', 'reason'],
                additionalProperties: false,
              },
            },
            assumptions: { type: 'array', items: { type: 'string' } },
          },
          required: ['summary', 'patches', 'assumptions'],
          additionalProperties: false,
        },
      },
    },
  };

  const response = await invokeChat(chatPayload);
  const parsed = repairResponseSchema.parse(parseModelJson(response.content));
  return {
    ...parsed,
    rawResponse: response.content,
    usageTokens: response.usage?.total_tokens,
  };
}

export function applyRepairPatches(source: string, patches: RepairTurnResult['patches']): string {
  let updated = source;
  for (const patch of patches) {
    if (!patch.oldStr) continue;
    if (!updated.includes(patch.oldStr)) {
      const preview = patch.oldStr.slice(0, 100);
      throw new Error(`Repair patch failed to apply: oldStr not found.\n${preview}`);
    }
    updated = updated.replace(patch.oldStr, patch.newStr);
  }
  return updated;
}
