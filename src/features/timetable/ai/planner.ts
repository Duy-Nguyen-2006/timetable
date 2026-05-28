import { z } from 'zod';

import type { ConstraintSpec, Plan } from './constraint-spec';
import type { AIProviderConfig, ChatUsage, PlannerTurnResult } from './types';

type ChatInvoke = (payload: Record<string, unknown>) => Promise<{ content?: string; usage?: ChatUsage }>;

const planSchema = z.object({
  decisionVars: z.string(),
  domainSize: z.object({
    classes: z.number(),
    days: z.number(),
    periods: z.number(),
    estimated: z.number().optional(),
    estimatedVars: z.number().optional(),
  }),
  constraintOrder: z.array(z.string()),
  reifiedNeeded: z.array(z.string()),
  objective: z.enum(['none', 'maximize_soft', 'minimize_gaps']),
  templatesUsed: z.array(z.string()),
  objectiveFunction: z.string().optional(),
  provenPatterns: z.array(z.string()).optional(),
  risks: z.array(z.string()),
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

function loadPlannerSystemPrompt(): Promise<string> {
  return fetch('/prompts/planner.system.md')
    .then(async (response) => {
      if (!response.ok) {
        return 'You are a CP-SAT planner. Output strict JSON plan.';
      }
      return response.text();
    })
    .catch(() => 'You are a CP-SAT planner. Output strict JSON plan.');
}

function fallbackPlan(datasetDigest: Plan['domainSize'], constraints: ConstraintSpec[]): Plan {
  return {
    decisionVars: 'slots[(assignment_id, day, period)] = BoolVar',
    domainSize: datasetDigest,
    constraintOrder: constraints.map((constraint) => constraint.id),
    reifiedNeeded: constraints
      .filter((constraint) => constraint.kind === 'if_then' || constraint.severity === 'soft')
      .map((constraint) => constraint.id),
    objective: 'none',
    templatesUsed: ['teacher_slot_capacity', 'class_slot_capacity', 'implication_reified'],
    objectiveFunction: 'satisfy_all_hard_then_minimize_soft_violations',
    provenPatterns: ['teacher_slot_capacity', 'class_slot_capacity', 'implication_reified'],
    risks: [],
  };
}

function validatePlanCoverage(plan: Plan, constraints: ConstraintSpec[]): Plan {
  const hardIds = new Set(constraints.filter((constraint) => constraint.severity === 'hard').map((c) => c.id));
  const providedIds = new Set(plan.constraintOrder);
  const missing = [...hardIds].filter((id) => !providedIds.has(id));
  if (!missing.length) return plan;
  return {
    ...plan,
    constraintOrder: [...plan.constraintOrder, ...missing],
    risks: [...plan.risks, `missing_hard_constraints:${missing.join(',')}`],
  };
}

export async function runPlannerTurn(
  config: AIProviderConfig,
  input: {
    datasetDigest: Plan['domainSize'];
    constraintSpecs: ConstraintSpec[];
    previousAttemptSummary?: string;
  },
  invokeChat: ChatInvoke = defaultInvokeChat
): Promise<PlannerTurnResult> {
  const systemPrompt = await loadPlannerSystemPrompt();
  const payload = {
    baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
    apiKey: config.apiKey,
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(input) },
    ],
    temperature: 0,
    max_tokens: 2500,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'solver_plan',
        schema: {
          type: 'object',
          properties: {
            decisionVars: { type: 'string' },
            domainSize: {
              type: 'object',
              properties: {
                classes: { type: 'number' },
                days: { type: 'number' },
                periods: { type: 'number' },
                estimated: { type: 'number' },
                estimatedVars: { type: 'number' },
              },
              required: ['classes', 'days', 'periods'],
            },
            constraintOrder: { type: 'array', items: { type: 'string' } },
            reifiedNeeded: { type: 'array', items: { type: 'string' } },
            objective: {
              type: 'string',
              enum: ['none', 'maximize_soft', 'minimize_gaps'],
            },
            templatesUsed: { type: 'array', items: { type: 'string' } },
            objectiveFunction: { type: 'string' },
            provenPatterns: { type: 'array', items: { type: 'string' } },
            risks: { type: 'array', items: { type: 'string' } },
          },
          required: [
            'decisionVars',
            'domainSize',
            'constraintOrder',
            'reifiedNeeded',
            'objective',
            'templatesUsed',
            'risks',
          ],
        },
      },
    },
  };

  try {
    const response = await invokeChat(payload);
    const candidate = planSchema.parse(JSON.parse(response.content ?? '{}'));
    return {
      plan: validatePlanCoverage(candidate, input.constraintSpecs),
      rawResponse: response.content,
      usageTokens: response.usage?.total_tokens,
    };
  } catch {
    return {
      plan: fallbackPlan(input.datasetDigest, input.constraintSpecs),
      rawResponse: '',
      usageTokens: 0,
    };
  }
}
