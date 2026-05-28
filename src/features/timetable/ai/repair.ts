import { z } from 'zod';

import type { Plan, Violation } from './constraint-spec';
import { parseModelJson } from './parse-model-json';
import type { AIProviderConfig, ChatUsage, RepairTurnResult } from './types';
import { invokeChat } from './chat-client';

type ChatInvoke = (payload: Record<string, unknown>) => Promise<{ content?: string; usage?: ChatUsage }>;

const repairResponseSchema = z.object({
  summary: z.string(),
  patches: z.array(
    z.object({
      oldStr: z.string(),
      newStr: z.string(),
      reason: z.string(),
      replaceAll: z.boolean().optional(),
    })
  ),
  assumptions: z.array(z.string()),
});

const defaultInvokeChat = (payload: Record<string, unknown>) => invokeChat(payload as any);

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
                  replaceAll: { type: 'boolean' },
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

export function applyRepairPatches(
  source: string,
  patches: RepairTurnResult['patches']
): string {
  // 1) Validate TẤT CẢ patches trên source GỐC trước khi apply bất kỳ patch nào (atomic).
  const plan: Array<{ index: number; patch: typeof patches[0] }> = [];
  for (const patch of patches) {
    if (!patch.oldStr) continue;
    const occurrences = source.split(patch.oldStr).length - 1;
    if (occurrences === 0) {
      throw new Error(
        `Repair patch oldStr not found in source. Preview: ${patch.oldStr.slice(0, 120)}`
      );
    }
    if (occurrences > 1 && !patch.replaceAll) {
      throw new Error(
        `Repair patch ambiguous: oldStr xuất hiện ${occurrences} lần. Mở rộng context hoặc set replaceAll=true. Preview: ${patch.oldStr.slice(0, 120)}`
      );
    }
    plan.push({ index: source.indexOf(patch.oldStr), patch });
  }

  // 2) Apply theo thứ tự xuất hiện trong source (tránh overlap).
  plan.sort((a, b) => a.index - b.index);

  let updated = source;
  for (const { patch } of plan) {
    updated = patch.replaceAll
      ? updated.split(patch.oldStr).join(patch.newStr)
      : updated.replace(patch.oldStr, patch.newStr);
  }
  return updated;
}
