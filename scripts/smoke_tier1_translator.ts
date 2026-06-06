// Tier 1 smoke: gọi LLM thực với canonical input, kiểm tra trả về if_then có period:2
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });

import { runTranslatorTurn } from '../src/features/timetable/ai/translator';
import type { AgentInputPayload, AIProviderConfig } from '../src/features/timetable/ai/types';

const apiKey = process.env.OPENROUTER_API_KEY;
const baseURL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
const model = process.env.MODEL_NAME ?? 'deepseek/deepseek-v4-flash';

if (!apiKey) {
  console.error('OPENROUTER_API_KEY not set');
  process.exit(1);
}

const cfg: AIProviderConfig = { baseURL, apiKey, model };

const tests: Array<{ name: string; input: AgentInputPayload; validate: (result: { constraintSpecs: Array<{ kind: string; params: Record<string, unknown> }> }) => boolean }> = [
  {
    name: 'VAL-T1-001: canonical IF-AND-THEN with 2-slot IF (deterministic parser)',
    input: {
      days: [
        { id: 'mon', label: 'Thứ 2' },
        { id: 'tue', label: 'Thứ 3' },
      ],
      sessions: [{ id: 'morning', label: 'Sáng' }],
      periodCounts: { mon: 5, tue: 5 },
      deletedPeriods: {},
      assignments: [
        { id: 'a1', teacher: { id: 't1', label: 'Sơn' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 3 },
        { id: 'a2', teacher: { id: 't2', label: 'Hương' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 3 },
        { id: 'a3', teacher: { id: 't3', label: 'Dung' }, subject: { id: 's3', label: 'Anh' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 3 },
      ],
      constraints: [
        { type: 'required', text: 'Nếu Sơn và Hương dạy thứ 2 tiết 2 thì Dung không dạy thứ 3 tiết 1' },
      ],
    },
    validate: (result) => {
      const ifThen = result.constraintSpecs.find((s) => s.kind === 'if_then');
      if (!ifThen) return false;
      const cond = ifThen.params.if as { op?: string; args?: Array<{ period?: number; teacher?: string }> };
      return cond.op === 'and'
        && Array.isArray(cond.args)
        && cond.args.length === 2
        && cond.args.every((a) => a.period === 2);
    },
  },
  {
    name: 'VAL-T2-008: complex input forces LLM call, returns >= 2 specs, >= 1 if_then, 0 custom_dsl',
    input: {
      days: [
        { id: 'mon', label: 'Thứ 2' },
        { id: 'tue', label: 'Thứ 3' },
        { id: 'wed', label: 'Thứ 4' },
        { id: 'thu', label: 'Thứ 5' },
        { id: 'fri', label: 'Thứ 6' },
      ],
      sessions: [{ id: 'morning', label: 'Sáng' }],
      periodCounts: { mon: 5, tue: 5, wed: 5, thu: 5, fri: 5 },
      deletedPeriods: {},
      assignments: [
        { id: 'a1', teacher: { id: 't1', label: 'Sơn' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 4 },
        { id: 'a2', teacher: { id: 't2', label: 'Hương' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 4 },
        { id: 'a3', teacher: { id: 't3', label: 'Dung' }, subject: { id: 's2', label: 'Văn' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 3 },
        { id: 'a4', teacher: { id: 't4', label: 'Lan' }, subject: { id: 's3', label: 'Anh' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 3 },
      ],
      constraints: [
        { type: 'required', text: 'Nếu Sơn và Hương cùng dạy thứ 2 tiết 2 thì không dạy cùng tiết các ngày khác' },
      ],
    },
    validate: (result) => {
      return result.constraintSpecs.length >= 2
        && result.constraintSpecs.some((s) => s.kind === 'if_then')
        && !result.constraintSpecs.some((s) => s.kind === 'custom_dsl' && s.params.naturalLanguage);
    },
  },
];

(async () => {
  let allPass = true;
  for (const t of tests) {
    console.log(`\n--- ${t.name} ---`);
    console.log(`Calling ${model} via ${baseURL}...`);
    const t0 = Date.now();
    const result = await runTranslatorTurn(cfg, t.input);
    const elapsed = Date.now() - t0;
    console.log(`elapsedMs: ${elapsed}`);
    console.log(`specs: ${result.constraintSpecs.length}`);
    for (const spec of result.constraintSpecs) {
      console.log(`  - ${spec.kind} | severity=${spec.severity}`);
      if (spec.kind === 'if_then') {
        console.log(`    if: ${JSON.stringify(spec.params.if)}`);
        console.log(`    then: ${JSON.stringify(spec.params.then)}`);
      }
    }
    const ok = t.validate(result);
    if (ok) {
      console.log('PASS');
    } else {
      console.error('FAIL');
      allPass = false;
    }
  }
  process.exit(allPass ? 0 : 1);
})().catch((err) => {
  console.error('ERROR', err);
  process.exit(1);
});
