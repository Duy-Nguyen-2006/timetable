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

const REPAIR_CHAT_TIMEOUT_MS = 30_000;

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
    timeoutMs: REPAIR_CHAT_TIMEOUT_MS,
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
  // Atomic apply thật sự (fix bug #8):
  //   1) Validate TẤT CẢ patches trên source GỐC: tìm vị trí và kiểm duplicate.
  //   2) Sort theo vị trí tăng dần, kiểm tra KHÔNG overlap.
  //   3) Stitch ra string mới bằng slice + concat — mỗi patch gắn 1 lần
  //      đúng tại vị trí nó đã được validate, tránh trường hợp patch trước
  //      làm oldStr của patch sau xuất hiện nhiều hơn.
  const plan: Array<{ start: number; end: number; patch: typeof patches[0]; allOccurrences?: number[] }> = [];
  for (const patch of patches) {
    if (!patch.oldStr) continue;
    const occurrences: number[] = [];
    let from = 0;
    while (from <= source.length) {
      const idx = source.indexOf(patch.oldStr, from);
      if (idx === -1) break;
      occurrences.push(idx);
      from = idx + Math.max(1, patch.oldStr.length);
    }
    if (occurrences.length === 0) {
      throw new Error(
        `Repair patch oldStr not found in source. Preview: ${patch.oldStr.slice(0, 120)}`
      );
    }
    if (occurrences.length > 1 && !patch.replaceAll) {
      throw new Error(
        `Repair patch ambiguous: oldStr xuất hiện ${occurrences.length} lần. Mở rộng context hoặc set replaceAll=true. Preview: ${patch.oldStr.slice(0, 120)}`
      );
    }
    if (patch.replaceAll) {
      for (const idx of occurrences) {
        plan.push({ start: idx, end: idx + patch.oldStr.length, patch });
      }
    } else {
      const idx = occurrences[0];
      plan.push({ start: idx, end: idx + patch.oldStr.length, patch });
    }
  }

  plan.sort((a, b) => a.start - b.start);

  // Detect overlap.
  for (let i = 1; i < plan.length; i += 1) {
    if (plan[i].start < plan[i - 1].end) {
      throw new Error(
        `Repair patches overlap at offset ${plan[i].start}. Tránh đề các patch chồng nhau.`
      );
    }
  }

  // Stitch.
  let cursor = 0;
  const out: string[] = [];
  for (const segment of plan) {
    out.push(source.slice(cursor, segment.start));
    out.push(segment.patch.newStr);
    cursor = segment.end;
  }
  out.push(source.slice(cursor));
  return out.join('');
}
