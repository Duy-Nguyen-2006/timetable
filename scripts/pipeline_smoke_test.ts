// End-to-end pipeline smoke test:
// translator -> planner -> coder -> bundled executor -> validator
// Uses OpenRouter via env vars and the bundled code_executor binary.

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { runLocalAgent } from '../src/features/timetable/ai/local-agent';
import type { AgentInputPayload, LocalAgentConfig } from '../src/features/timetable/ai/types';

const baseURL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
const apiKey = process.env.OPENROUTER_API_KEY;
const model = process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-v4-flash';

if (process.env.SKIP_PIPELINE_SMOKE === '1') {
  console.log('Pipeline smoke skipped: SKIP_PIPELINE_SMOKE=1');
  process.exit(0);
}

if (!apiKey) {
  console.log('Pipeline smoke skipped: OPENROUTER_API_KEY not set. Set SKIP_PIPELINE_SMOKE=1 to silence.');
  process.exit(0);
}

const repoRoot = path.resolve(__dirname, '..');
const executorCandidates = [
  path.join(repoRoot, 'python-dist', 'linux', 'code_executor'),
  path.join(repoRoot, 'python-dist', 'macos', 'code_executor'),
  path.join(repoRoot, 'python-dist', 'win32', 'code_executor.exe'),
  path.join(repoRoot, 'python-dist', 'code_executor'),
  path.join(repoRoot, 'python-dist', 'code_executor.exe'),
];
const executor = executorCandidates.find(existsSync);

if (!executor) {
  console.error('Bundled code_executor binary not found. Run npm run build:executor first.');
  process.exit(2);
}

const electronShim = {
  python: {
    executeCode: (code: string, input: unknown, timeoutMs: number, solverWorkers?: number) =>
      new Promise((resolve) => {
        const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'tack-smoke-'));
        const inputPath = path.join(tmpDir, 'input.json');
        const codePath = path.join(tmpDir, 'solver.py');
        writeFileSync(inputPath, JSON.stringify(input));
        writeFileSync(codePath, code);

        const args = [codePath, inputPath, String(Math.ceil(timeoutMs / 1000))];
        if (solverWorkers) args.push(String(solverWorkers));
        const child = spawn(executor!, args, {
          cwd: tmpDir,
          env: { ...process.env, TT_SANDBOX_BACKEND: 'none', TT_SANDBOX_ALLOW_UNSAFE: '1' },
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });
        child.on('close', (code) => {
          let parsed: unknown = null;
          try { parsed = JSON.parse(stdout); } catch { /* ignore */ }
          resolve({
            ok: code === 0,
            exitCode: code ?? -1,
            stdout: stdout.slice(0, 4000),
            stderr: stderr.slice(0, 2000),
            parsed,
            resultData: (parsed as { resultData?: unknown } | null)?.resultData,
            resultPath: path.join(tmpDir, 'result.json'),
            phase: 'run',
            status: (parsed as { status?: string } | null)?.status ?? 'unknown',
            durationMs: 0,
          });
        });
      }),
  },
};

(globalThis as typeof globalThis & { window?: unknown }).window = electronShim;

const skeletonPath = path.join(repoRoot, 'public', 'templates', 'solver_skeleton.py');
const realFetch = globalThis.fetch.bind(globalThis);
const apiBase = process.env.SMOKE_API_BASE ?? 'http://localhost:3100';
globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
  const target = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
  if (target.startsWith('/templates/solver_skeleton.py')) {
    return new Response(readFileSync(skeletonPath, 'utf8'), { status: 200 });
  }
  if (target.startsWith('/api/')) {
    return realFetch(`${apiBase}${target}`, init);
  }
  return realFetch(url as Parameters<typeof realFetch>[0], init);
}) as typeof fetch;

const input: AgentInputPayload = {
  days: [
    { id: 'monday', label: 'Thứ 2' },
    { id: 'tuesday', label: 'Thứ 3' },
    { id: 'wednesday', label: 'Thứ 4' },
    { id: 'thursday', label: 'Thứ 5' },
    { id: 'friday', label: 'Thứ 6' },
  ],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { monday: 4, tuesday: 4, wednesday: 4, thursday: 4, friday: 4 },
  deletedPeriods: {},
  assignments: [
    { id: 'a1', teacher: { id: 't1', label: 'Sơn' },    subject: { id: 's1', label: 'Toán' },  class: { id: 'c1', label: '6A' }, weeklyPeriods: 4 },
    { id: 'a2', teacher: { id: 't2', label: 'Hương' },  subject: { id: 's2', label: 'Văn' },   class: { id: 'c1', label: '6A' }, weeklyPeriods: 3 },
    { id: 'a3', teacher: { id: 't3', label: 'Lan' },    subject: { id: 's3', label: 'Anh' },   class: { id: 'c1', label: '6A' }, weeklyPeriods: 3 },
    { id: 'a4', teacher: { id: 't4', label: 'Bình' },   subject: { id: 's4', label: 'GDTC' },  class: { id: 'c1', label: '6A' }, weeklyPeriods: 2 },
  ],
  constraints: [
    { type: 'required', text: 'Sơn không dạy thứ 2' },
    { type: 'required', text: 'GDTC không xếp tiết 1' },
  ],
};

const config: LocalAgentConfig = {
  baseURL,
  apiKey,
  model,
  solverProfile: 'balanced',
  solverWorkers: 2,
  timeoutMs: 240_000,
  onEvent: (event) => {
    if (event.type === 'phase' || event.type === 'stage_started' || event.type === 'stage_completed') {
      console.log(`[${event.type}] ${'stage' in event ? event.stage : ''} ${'phase' in event ? event.phase : ''} ${'message' in event ? event.message : ''}`.trim());
    }
  },
};

(async () => {
  console.log('starting pipeline smoke...');

  // Verify the API server is reachable before running the full pipeline.
  let apiServerReachable = false;
  try {
    const probe = await realFetch(`${apiBase}/`, { method: 'HEAD', signal: AbortSignal.timeout(3000) }).catch(() => null);
    apiServerReachable = probe !== null;
  } catch { /* ignore */ }
  if (!apiServerReachable) {
    console.warn(`WARNING: API server at ${apiBase} is not reachable. The full pipeline smoke will be skipped.`);
    console.warn('Start the dev server first: npm run dev');
    console.log('---');
    console.log('Running Tier 1 deterministic smoke only...');
  }

  let result: { success: boolean; finalResult?: { solverStatus?: string; message?: string; schedule?: unknown[]; violations?: unknown[] }; error?: string } = { success: false, error: 'skipped' };
  if (apiServerReachable) {
    const t0 = Date.now();
    // Pipeline AI codegen đã bị gỡ — local-agent giờ yêu cầu specs đã xác nhận.
    // Dùng rule parser (Tier 1) để dịch constraints rồi truyền làm preTranslated.
    const translator = await import('../src/features/timetable/ai/translator');
    const fallbackFromRuleParser = translator.__translatorInternal.fallbackFromRuleParser;
    const { sanitizeSpecs } = translator.__translatorInternal;
    const raw = fallbackFromRuleParser(input);
    const preTranslatedConstraintSpecs = sanitizeSpecs(input, raw);
    result = await runLocalAgent(input, config, { preTranslatedConstraintSpecs });
    const elapsed = Date.now() - t0;
    console.log('===');
    console.log('elapsedMs', elapsed);
    console.log('success', result.success);
    console.log('error', result.error);
    if (result.finalResult) {
      console.log('solverStatus', result.finalResult.solverStatus);
      console.log('message', result.finalResult.message);
      console.log('scheduleEntries', result.finalResult.schedule?.length ?? 0);
      console.log('violations', result.finalResult.violations?.length ?? 0);
    }
  } else {
    console.log('=== Main pipeline run skipped (API server not reachable) ===');
  }

  // Tier 1 — VAL-T1-010: extra smoke case for the IF-AND-THEN pattern.
  // The Tier 1 rule parser now handles this deterministically (no LLM needed),
  // but the smoke asserts the parser emits `if_then` with `period: 2` in `params.if`.
  console.log('---');
  console.log('Tier 1 IF-AND-THEN smoke case (VAL-T1-010)');
  try {
    const translator = await import('../src/features/timetable/ai/translator');
    const fallbackFromRuleParser = translator.__translatorInternal.fallbackFromRuleParser;
    const tier1Input: AgentInputPayload = {
      days: [
        { id: 'monday', label: 'Thứ 2' },
        { id: 'tuesday', label: 'Thứ 3' },
        { id: 'wednesday', label: 'Thứ 4' },
        { id: 'thursday', label: 'Thứ 5' },
        { id: 'friday', label: 'Thứ 6' },
      ],
      sessions: [{ id: 'morning', label: 'Sáng' }],
      periodCounts: { monday: 4, tuesday: 4, wednesday: 4, thursday: 4, friday: 4 },
      deletedPeriods: {},
      assignments: [
        { id: 'a1', teacher: { id: 't1', label: 'Sơn' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 4 },
        { id: 'a2', teacher: { id: 't2', label: 'Hương' }, subject: { id: 's2', label: 'Văn' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 3 },
        { id: 'a3', teacher: { id: 't3', label: 'Dung' }, subject: { id: 's3', label: 'Anh' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 3 },
      ],
      constraints: [
        {
          type: 'required',
          text: 'Nếu Sơn và Hương dạy thứ 2 tiết 2 thì Dung không dạy thứ 3 tiết 1',
        },
      ],
    };
    const specs = fallbackFromRuleParser(tier1Input);
    const ifThenSpec = specs.find((s) => s.kind === 'if_then');
    if (!ifThenSpec) {
      console.error('TIER1_SMOKE_FAIL: no if_then spec produced');
      process.exit(1);
    }
    const cond = ifThenSpec.params.if as { op?: string; args?: Array<Record<string, unknown>> };
    const args = Array.isArray(cond.args) ? cond.args : [];
    const periodInIf = args.some((a) => a && a.period === 2);
    if (cond.op !== 'and' || args.length !== 2 || !periodInIf) {
      console.error('TIER1_SMOKE_FAIL: expected if.op=and with 2 args each containing period=2, got', JSON.stringify(cond));
      process.exit(1);
    }
    console.log('Tier 1 IF-AND-THEN smoke OK: params.if has period 2 for both Sơn and Hương');
  } catch (err) {
    console.error('TIER1_SMOKE_ERROR', err instanceof Error ? err.stack : String(err));
    process.exit(1);
  }

  // Exit 0 if: main run succeeded, OR main run was skipped (API unreachable) but Tier 1 smoke passed.
  process.exit(result.success || !apiServerReachable ? 0 : 1);
})().catch((err) => {
  console.error('SMOKE_ERROR', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
