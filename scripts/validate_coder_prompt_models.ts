import fs from 'node:fs/promises';
import path from 'node:path';

type CoderResult = {
  plan_summary: string;
  constraint_code: string;
  covered_constraint_ids: string[];
  assumptions: string[];
};

type ChatApiResponse = {
  ok: boolean;
  content?: string;
  error?: string;
};

const BASE_URL = process.env.TACK_BASE_URL || 'http://127.0.0.1:3000';
const RUNS_PER_MODEL = Number(process.env.CODER_MODEL_RUNS || 10);
const MODELS = (process.env.CODER_MODELS || 'deepseek/deepseek-chat,meta-llama/llama-3.1-70b-instruct')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const PROVIDER_BASE_URL = process.env.CODER_PROVIDER_BASE_URL || 'https://openrouter.ai/api/v1';
const PROVIDER_API_KEY = process.env.CODER_PROVIDER_API_KEY || process.env.OPENROUTER_API_KEY || '';

function buildPayload() {
  const assignments = [
    { id: 'asg_1', class: '6A', subject: 'Toan', teacher: 'Son', weeklyPeriods: 3 },
    { id: 'asg_2', class: '6A', subject: 'Van', teacher: 'Lan', weeklyPeriods: 2 },
    { id: 'asg_3', class: '6B', subject: 'Toan', teacher: 'Thuy', weeklyPeriods: 3 },
    { id: 'asg_4', class: '6B', subject: 'Van', teacher: 'Hoa', weeklyPeriods: 2 },
  ];

  const constraints = [
    {
      id: 'c1',
      original: 'Son toi da 3 tiet/ngay',
      severity: 'hard',
      kind: 'teacher_max_per_day',
      params: { teacher: 'Son', maxPerDay: 3 },
    },
    {
      id: 'c2',
      original: 'Thuy va Son khong cung tiet thu 2',
      severity: 'hard',
      kind: 'pair_not_same_slot',
      params: { teachers: ['Thuy', 'Son'], scope: { day: 'mon' } },
    },
    {
      id: 'c3',
      original: 'asg_1 dung 3 tiet',
      severity: 'info',
      kind: 'weekly_periods_exact',
      tags: ['auto_base'],
      params: { assignmentId: 'asg_1', weeklyPeriods: 3, teacher: 'Son', class: '6A', subject: 'Toan' },
    },
  ];

  return {
    datasetDigest: { classCount: 2, teacherCount: 4, dayCount: 5, periodCount: 7, totalAssignments: 4 },
    assignments,
    constraints,
    plan: {
      decisionVars: 'slots[(assignment, day, period)]',
      domainSize: { classes: 2, days: 5, periods: 7, estimated: 140 },
      constraintOrder: ['teacher_max_per_day', 'pair_not_same_slot', 'weekly_periods_exact'],
      reifiedNeeded: [],
      objective: 'none',
      templatesUsed: ['teacher_max_per_day', 'pair_not_same_slot'],
      risks: [],
    },
    previousAttemptSummary: '',
  };
}

async function loadSystemPrompt(): Promise<string> {
  const promptPath = path.join(process.cwd(), 'prompts', 'coder.system.md');
  return fs.readFile(promptPath, 'utf8');
}

async function callCoderModel(model: string, systemPrompt: string): Promise<CoderResult> {
  const response = await fetch(`${BASE_URL}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseURL: PROVIDER_BASE_URL,
      apiKey: PROVIDER_API_KEY,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(buildPayload()) },
      ],
      temperature: 0.1,
      max_tokens: 3500,
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
    }),
  });

  const body = (await response.json()) as ChatApiResponse;
  if (!response.ok || !body.ok || !body.content) {
    throw new Error(body.error || `Chat request failed for model ${model}`);
  }
  return JSON.parse(body.content) as CoderResult;
}

function hasForbiddenNestedSlots(code: string): boolean {
  return /slots\[[^\]]+\]\[[^\]]+\]\[[^\]]+\]/.test(code);
}

async function main() {
  if (!MODELS.length) {
    console.log(JSON.stringify({ ok: false, reason: 'No models configured' }, null, 2));
    process.exit(1);
  }
  if (!PROVIDER_API_KEY) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          reason: 'Missing provider API key. Set CODER_PROVIDER_API_KEY or OPENROUTER_API_KEY.',
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const systemPrompt = await loadSystemPrompt();
  const results: Array<{ model: string; run: number; nestedSlots: boolean }> = [];

  for (const model of MODELS) {
    for (let run = 1; run <= RUNS_PER_MODEL; run += 1) {
      const coder = await callCoderModel(model, systemPrompt);
      const nestedSlots = hasForbiddenNestedSlots(coder.constraint_code);
      results.push({ model, run, nestedSlots });
    }
  }

  const violations = results.filter((result) => result.nestedSlots);
  const summary = MODELS.map((model) => {
    const modelRuns = results.filter((result) => result.model === model);
    return {
      model,
      runs: modelRuns.length,
      nestedSlotViolations: modelRuns.filter((result) => result.nestedSlots).length,
    };
  });

  console.log(
    JSON.stringify(
      {
        ok: violations.length === 0,
        runsPerModel: RUNS_PER_MODEL,
        summary,
        violations,
      },
      null,
      2
    )
  );

  if (violations.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
