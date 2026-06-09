import assert from 'node:assert/strict';
import test from 'node:test';

import { __localAgentInternal, runLocalAgent } from './local-agent';

test('buildViolationSignature normalizes roundtrip dynamic assignment ids', () => {
  const signatureA = __localAgentInternal.buildViolationSignature(
    [],
    false,
    'Schedule entry không khớp assignment asg_12345'
  );
  const signatureB = __localAgentInternal.buildViolationSignature(
    [],
    false,
    'Schedule entry không khớp assignment asg_67890'
  );
  assert.equal(signatureA, signatureB);
  assert.match(signatureA, /rt:fail:/);
});

test('buildViolationSignature distinguishes pass/fail roundtrip states', () => {
  const failSignature = __localAgentInternal.buildViolationSignature([], false, 'roundtrip failed');
  const okSignature = __localAgentInternal.buildViolationSignature([], true, 'roundtrip failed');
  assert.notEqual(failSignature, okSignature);
  assert.match(okSignature, /rt:ok$/);
});

test('dedupeConstraintSpecs keeps one copy of identical constraints', () => {
  const specs = [
    { id: 'c1', original: 'Sơn không dạy thứ 2', severity: 'hard' as const, kind: 'teacher_block_day' as const, params: { teacher: 'Sơn', day: 'mon' } },
    { id: 'c2', original: 'Sơn không dạy thứ 2', severity: 'hard' as const, kind: 'teacher_block_day' as const, params: { day: 'mon', teacher: 'Sơn' } },
  ];
  const result = __localAgentInternal.dedupeConstraintSpecs(specs);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'c1');
});

test('constraintSignature distinguishes soft weights', () => {
  const base = { id: 'c1', original: 'ưu tiên', severity: 'soft' as const, kind: 'teacher_block_day' as const, params: { teacher: 'Sơn', day: 'mon' } };
  assert.notEqual(
    __localAgentInternal.constraintSignature({ ...base, weight: 3 }),
    __localAgentInternal.constraintSignature({ ...base, weight: 8 })
  );
});

test('resolveSolverRuntime maps profiles to bounded timeouts and workers', () => {
  assert.deepEqual(__localAgentInternal.resolveSolverRuntime({ baseURL: 'x', apiKey: 'k', model: 'm', solverProfile: 'fast', solverWorkers: 99 }), { timeoutMs: 20_000, workers: 8 });
  assert.equal(__localAgentInternal.resolveSolverRuntime({ baseURL: 'x', apiKey: 'k', model: 'm', solverProfile: 'deep', timeoutMs: 1234 }).timeoutMs, 1234);
});

test('buildCoderExhaustedMessage includes the last actionable failure', () => {
  assert.equal(
    __localAgentInternal.buildCoderExhaustedMessage('RuntimeError: bad generated code'),
    'Coder could not produce an executable schedule. Last failure: RuntimeError: bad generated code'
  );
});

test('runLocalAgent accepts feasible solver results and passes worker hints', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  let executeBody: any = null;
  let chatCalls = 0;

  (globalThis as typeof globalThis & { window?: unknown }).window = {} as unknown as (Window & typeof globalThis);
  globalThis.fetch = (async (input, init) => {
    const url = String(input);

    if (url.endsWith('/prompts/translator.system.md')) return new Response('translator');
    if (url.endsWith('/prompts/planner.system.md')) return new Response('planner');
    if (url.endsWith('/templates/solver_skeleton.py')) {
      return new Response('def build_custom_constraints(model, slots, data):\n    # <<< AI_FILL_HERE >>>\n');
    }
    if (url.endsWith('/api/ai/chat')) {
      chatCalls += 1;
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ role: string; content: string }> };
      const systemPrompt = body.messages?.[0]?.content;
      if (systemPrompt === 'planner') {
        return Response.json({ ok: true, content: JSON.stringify({ decisionVars: 'slots', domainSize: { classes: 1, days: 1, periods: 1 }, constraintOrder: [], reifiedNeeded: [], objective: 'none', templatesUsed: [], risks: [] }), usage: { total_tokens: 1 } });
      }
    }
    if (url.endsWith('/api/ai/python-syntax-check')) return Response.json({ ok: true, result: { ok: true } });
    if (url.endsWith('/api/ai/python-execute')) {
      executeBody = JSON.parse(String(init?.body ?? '{}'));
      return Response.json({
        ok: true,
        result: {
          phase: 'run',
          ok: true,
          status: 'feasible',
          durationMs: 1,
          resultData: {
            classes: ['6A'],
            days: ['mon'],
            periods: [1],
            schedule: [{ assignmentId: 'a1', class: '6A', day: 'mon', period: 1, subject: 'Math', teacher: 'Lan' }],
          },
        },
      });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const result = await runLocalAgent(
      {
        days: [{ id: 'mon', label: 'Thứ 2' }],
        sessions: [{ id: 'morning', label: 'Sáng' }],
        periodCounts: { mon: 1 },
        deletedPeriods: {},
        assignments: [{ id: 'a1', class: { id: 'c1', label: '6A' }, subject: { id: 'math', label: 'Math' }, teacher: { id: 't1', label: 'Lan' }, weeklyPeriods: 1 }],
        constraints: [],
        previousSchedule: [{ assignmentId: 'a1', class: '6A', day: 'mon', period: 1, subject: 'Math', teacher: 'Lan' }],
      },
      { baseURL: 'http://example.test', apiKey: 'test', model: 'test', solverProfile: 'fast', solverWorkers: 4 }
    );

    assert.equal(result.success, true);
    assert.equal(result.finalResult?.solverStatus, 'feasible');
    assert.match(result.finalResult?.message ?? '', /chưa chứng minh là tối ưu/);
    assert.equal(chatCalls, 0);
    assert.equal(executeBody?.solverWorkers, 4);
    assert.equal(executeBody?.input?.warmStartSchedule?.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
  }
});

test('runLocalAgent repairs runtime failures before returning coder exhausted', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  let coderCalls = 0;
  let repairPayload: any = null;

  (globalThis as typeof globalThis & { window?: unknown }).window = {} as unknown as (Window & typeof globalThis);
  globalThis.fetch = (async (input, init) => {
    const url = String(input);

    if (url.endsWith('/prompts/translator.system.md')) return new Response('translator');
    if (url.endsWith('/prompts/planner.system.md')) return new Response('planner');
    if (url.endsWith('/prompts/coder.system.md')) return new Response('coder');
    if (url.endsWith('/prompts/repair.system.md')) return new Response('repair');
    if (url.endsWith('/templates/solver_skeleton.py')) {
      return new Response('def build_custom_constraints(model, slots, data):\n    # <<< AI_FILL_HERE >>>\n');
    }

    if (url.endsWith('/api/ai/chat')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        messages?: Array<{ role: string; content: string }>;
      };
      const systemPrompt = body.messages?.[0]?.content;

      if (systemPrompt === 'translator') {
        return Response.json({
          ok: true,
          content: JSON.stringify({
            constraintSpecs: [
              { id: 'c1', original: 'custom runtime guard', severity: 'hard', kind: 'custom_dsl', params: {} },
            ],
          }),
          usage: { total_tokens: 1 },
        });
      }

      if (systemPrompt === 'planner') {
        return Response.json({
          ok: true,
          content: JSON.stringify({
            decisionVars: 'slots[(assignment_id, day, period)]',
            domainSize: { classes: 1, days: 1, periods: 1 },
            constraintOrder: [],
            reifiedNeeded: [],
            objective: 'none',
            templatesUsed: [],
            risks: [],
          }),
          usage: { total_tokens: 1 },
        });
      }

      if (systemPrompt === 'coder') {
        coderCalls += 1;
        return Response.json({
          ok: true,
          content: JSON.stringify({
            plan_summary: 'bad runtime code',
            constraint_code: "# c1\nraise RuntimeError('bad')",
            covered_constraint_ids: [],
            assumptions: [],
          }),
          usage: { total_tokens: 1 },
        });
      }

      if (systemPrompt === 'repair') {
        repairPayload = JSON.parse(body.messages?.[1]?.content ?? '{}') as { currentCode?: string; constraintCode?: string; compileOrRunError?: string };
        return Response.json({
          ok: true,
          content: JSON.stringify({
            summary: 'remove runtime failure',
            patches: [
              {
                oldStr: "raise RuntimeError('bad')",
                newStr: 'pass',
                reason: 'replace failing statement with no-op',
              },
            ],
            assumptions: [],
          }),
          usage: { total_tokens: 1 },
        });
      }
    }

    if (url.endsWith('/api/ai/python-syntax-check')) {
      return Response.json({ ok: true, result: { ok: true } });
    }

    if (url.endsWith('/api/ai/python-ast-check')) {
      return Response.json({ ok: true, result: { ok: true } });
    }

    if (url.endsWith('/api/ai/python-execute')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { code?: string };
      if (body.code?.includes("raise RuntimeError('bad')")) {
        return Response.json({
          ok: true,
          result: {
            phase: 'run',
            ok: false,
            status: 'crashed',
            durationMs: 1,
            errorDigest: 'RuntimeError: bad',
          },
        });
      }

      return Response.json({
        ok: true,
        result: {
          phase: 'run',
          ok: true,
          status: 'optimal',
          durationMs: 1,
          resultData: {
            classes: ['6A'],
            days: ['mon'],
            periods: [1],
            schedule: [{ class: '6A', day: 'mon', period: 1, subject: 'Math', teacher: 'Lan' }],
          },
        },
      });
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const result = await runLocalAgent(
      {
        days: [
          { id: 'mon', label: 'Thứ 2' },
          { id: 'tue', label: 'Thứ 3' },
        ],
        sessions: [{ id: 'morning', label: 'Sáng' }],
        periodCounts: { mon: 1, tue: 1 },
        deletedPeriods: {},
        assignments: [
          {
            id: 'a1',
            class: { id: 'c1', label: '6A' },
            subject: { id: 'math', label: 'Math' },
            teacher: { id: 't1', label: 'Lan' },
            weeklyPeriods: 1,
          },
          {
            id: 'a2',
            class: { id: 'c1', label: '6A' },
            subject: { id: 'literature', label: 'Văn' },
            teacher: { id: 't2', label: 'Sơn' },
            weeklyPeriods: 0,
          },
        ],
        constraints: [{ type: 'required', text: 'custom runtime guard' }],
      },
      { baseURL: 'http://example.test', apiKey: 'test', model: 'test' }
    );

    assert.equal(result.success, false);
    assert.match(result.error ?? '', /Coder could not produce an executable schedule/i);
    assert.ok(coderCalls >= 3);
    assert.equal(repairPayload?.currentCode, "# c1\npass");
    assert.equal(repairPayload?.compileOrRunError, "");
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
  }
});

test('runLocalAgent returns a clear repeated-violation error instead of stopped early', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  let repairCalls = 0;

  (globalThis as typeof globalThis & { window?: unknown }).window = {} as unknown as (Window & typeof globalThis);
  globalThis.fetch = (async (input, init) => {
    const url = String(input);

    if (url.endsWith('/prompts/translator.system.md')) return new Response('translator');
    if (url.endsWith('/prompts/planner.system.md')) return new Response('planner');
    if (url.endsWith('/prompts/coder.system.md')) return new Response('coder');
    if (url.endsWith('/prompts/repair.system.md')) return new Response('repair');
    if (url.endsWith('/templates/solver_skeleton.py')) {
      return new Response('def build_custom_constraints(model, slots, data):\n    # <<< AI_FILL_HERE >>>\n');
    }

    if (url.endsWith('/api/ai/chat')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        messages?: Array<{ role: string; content: string }>;
      };
      const systemPrompt = body.messages?.[0]?.content;

      if (systemPrompt === 'translator') {
        return Response.json({
          ok: true,
          content: JSON.stringify({ constraintSpecs: [] }),
          usage: { total_tokens: 1 },
        });
      }

      if (systemPrompt === 'planner') {
        return Response.json({
          ok: true,
          content: JSON.stringify({
            decisionVars: 'slots[(assignment_id, day, period)]',
            domainSize: { classes: 1, days: 1, periods: 1 },
            constraintOrder: [],
            reifiedNeeded: [],
            objective: 'none',
            templatesUsed: [],
            risks: [],
          }),
          usage: { total_tokens: 1 },
        });
      }

      if (systemPrompt === 'coder') {
        return Response.json({
          ok: true,
          content: JSON.stringify({
            plan_summary: 'valid code but invalid schedule',
            constraint_code: 'pass',
            covered_constraint_ids: [],
            assumptions: [],
          }),
          usage: { total_tokens: 1 },
        });
      }

      if (systemPrompt === 'repair') {
        repairCalls += 1;
        return Response.json({
          ok: true,
          content: JSON.stringify({
            summary: 'no effective repair',
            patches: [{ oldStr: 'pass', newStr: 'pass', reason: 'leave unchanged' }],
            assumptions: [],
          }),
          usage: { total_tokens: 1 },
        });
      }
    }

    if (url.endsWith('/api/ai/python-syntax-check')) {
      return Response.json({ ok: true, result: { ok: true } });
    }

    if (url.endsWith('/api/ai/python-ast-check')) {
      return Response.json({ ok: true, result: { ok: true } });
    }

    if (url.endsWith('/api/ai/python-execute')) {
      return Response.json({
        ok: true,
        result: {
          phase: 'run',
          ok: true,
          status: 'optimal',
          durationMs: 1,
          resultData: {
            classes: ['6A'],
            days: ['mon'],
            periods: [1],
            schedule: [],
          },
        },
      });
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const result = await runLocalAgent(
      {
        days: [{ id: 'mon', label: 'Thứ 2' }],
        sessions: [{ id: 'morning', label: 'Sáng' }],
        periodCounts: { mon: 1 },
        deletedPeriods: {},
        assignments: [
          {
            id: 'a1',
            class: { id: 'c1', label: '6A' },
            subject: { id: 'math', label: 'Math' },
            teacher: { id: 't1', label: 'Lan' },
            weeklyPeriods: 1,
          },
        ],
        constraints: [],
      },
      { baseURL: 'http://example.test', apiKey: 'test', model: 'test' }
    );

    assert.equal(result.success, false);
    assert.equal(repairCalls, 3);
    assert.match(result.error ?? '', /^Không tạo được thời khóa biểu/);
    assert.doesNotMatch(result.error ?? '', /Stopped early/i);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
  }
});

test('runLocalAgent dùng deterministic fast path khi có confirmed specs eligible, không gọi LLM', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  let chatCalls = 0;

  (globalThis as typeof globalThis & { window?: unknown }).window = {} as unknown as (Window & typeof globalThis);
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.endsWith('/templates/solver_skeleton.py')) {
      return new Response('def build_custom_constraints(model, slots, data):\n    # <<< AI_FILL_HERE >>>\n');
    }
    if (url.endsWith('/api/ai/chat')) {
      chatCalls += 1;
      return Response.json({ ok: true, content: '{}', usage: { total_tokens: 1 } });
    }
    if (url.endsWith('/api/ai/python-execute')) {
      return Response.json({
        ok: true,
        result: {
          phase: 'run',
          ok: true,
          status: 'optimal',
          durationMs: 1,
          resultData: {
            classes: ['6A'],
            days: ['monday'],
            periods: [2, 3],
            schedule: [
              { assignmentId: 'asg_1', class: '6A', day: 'monday', period: 2, subject: 'Toán', teacher: 'Sơn' },
              { assignmentId: 'asg_1', class: '6A', day: 'monday', period: 3, subject: 'Toán', teacher: 'Sơn' },
            ],
          },
        },
      });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const result = await runLocalAgent(
      {
        days: [{ id: 'monday', label: 'Thứ 2' }],
        sessions: [{ id: 'morning', label: 'Sáng' }],
        periodCounts: { monday: 4 },
        deletedPeriods: {},
        assignments: [
          {
            id: 'asg_1',
            teacher: { id: 't1', label: 'Sơn' },
            subject: { id: 's1', label: 'Toán' },
            class: { id: 'c1', label: '6A' },
            weeklyPeriods: 2,
          },
        ],
        constraints: [],
      },
      { baseURL: 'http://example.test', apiKey: 'test', model: 'test' },
      {
        preTranslatedConstraintSpecs: [
          {
            id: 'c1',
            original: 'Sơn không dạy tiết 1',
            severity: 'hard',
            kind: 'teacher_block_period',
            params: { teacher: 'Sơn', period: 1 },
          },
        ],
      }
    );

    assert.equal(result.success, true);
    assert.equal(chatCalls, 0, 'Không được gọi LLM nào (planner/coder/repair)');
    assert.equal(result.finalResult?.attemptHistorySummary[0]?.stage, 'deterministic_fast_path');
    assert.match(result.finalResult?.diagnostics[0] ?? '', /Deterministic fast-path/);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
  }
});

test('runLocalAgent reject confirmed specs không eligible khi không bật experimental', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  let chatCalls = 0;

  (globalThis as typeof globalThis & { window?: unknown }).window = {} as unknown as (Window & typeof globalThis);
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.endsWith('/api/ai/chat')) {
      chatCalls += 1;
      return Response.json({ ok: true, content: '{}', usage: { total_tokens: 1 } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const result = await runLocalAgent(
      {
        days: [{ id: 'monday', label: 'Thứ 2' }],
        sessions: [{ id: 'morning', label: 'Sáng' }],
        periodCounts: { monday: 4 },
        deletedPeriods: {},
        assignments: [
          {
            id: 'asg_1',
            teacher: { id: 't1', label: 'Sơn' },
            subject: { id: 's1', label: 'Toán' },
            class: { id: 'c1', label: '6A' },
            weeklyPeriods: 2,
          },
        ],
        constraints: [],
      },
      { baseURL: 'http://example.test', apiKey: 'test', model: 'test' },
      {
        preTranslatedConstraintSpecs: [
          {
            id: 'c1',
            original: 'Ràng buộc custom',
            severity: 'hard',
            kind: 'custom_dsl',
            params: {},
          },
        ],
      }
    );

    assert.equal(result.success, false);
    assert.match(result.error ?? '', /custom_dsl hard/);
    assert.equal(chatCalls, 0, 'Không được gọi LLM khi reject');
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
  }
});

test('runLocalAgent dùng AI codegen khi confirmed specs không eligible VÀ allowExperimentalAiCodegen=true', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  let chatCalls = 0;

  (globalThis as typeof globalThis & { window?: unknown }).window = {} as unknown as (Window & typeof globalThis);
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.endsWith('/prompts/translator.system.md')) return new Response('translator');
    if (url.endsWith('/prompts/planner.system.md')) return new Response('planner');
    if (url.endsWith('/prompts/coder.system.md')) return new Response('coder');
    if (url.endsWith('/prompts/repair.system.md')) return new Response('repair');
    if (url.endsWith('/templates/solver_skeleton.py')) {
      return new Response('def build_custom_constraints(model, slots, data):\n    # <<< AI_FILL_HERE >>>\n');
    }
    if (url.endsWith('/api/ai/chat')) {
      chatCalls += 1;
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ role: string; content: string }> };
      const systemPrompt = body.messages?.[0]?.content;
      if (systemPrompt === 'planner') {
        return Response.json({
          ok: true,
          content: JSON.stringify({
            decisionVars: 'slots',
            domainSize: { classes: 1, days: 1, periods: 1 },
            constraintOrder: [],
            reifiedNeeded: [],
            objective: 'none',
            templatesUsed: [],
            risks: [],
          }),
          usage: { total_tokens: 1 },
        });
      }
      if (systemPrompt === 'coder') {
        return Response.json({
          ok: true,
          content: JSON.stringify({
            plan_summary: 'ok',
            constraint_code: 'pass',
            covered_constraint_ids: [],
            assumptions: [],
          }),
          usage: { total_tokens: 1 },
        });
      }
      return Response.json({ ok: true, content: '{}', usage: { total_tokens: 1 } });
    }
    if (url.endsWith('/api/ai/python-syntax-check')) return Response.json({ ok: true, result: { ok: true } });
    if (url.endsWith('/api/ai/python-execute')) {
      return Response.json({
        ok: true,
        result: {
          phase: 'run',
          ok: true,
          status: 'optimal',
          durationMs: 1,
          resultData: {
            classes: ['6A'],
            days: ['monday'],
            periods: [1, 2, 3, 4],
            schedule: [
              { assignmentId: 'asg_1', class: '6A', day: 'monday', period: 1, subject: 'Toán', teacher: 'Sơn' },
              { assignmentId: 'asg_1', class: '6A', day: 'monday', period: 2, subject: 'Toán', teacher: 'Sơn' },
            ],
          },
        },
      });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const result = await runLocalAgent(
      {
        days: [{ id: 'monday', label: 'Thứ 2' }],
        sessions: [{ id: 'morning', label: 'Sáng' }],
        periodCounts: { monday: 4 },
        deletedPeriods: {},
        assignments: [
          {
            id: 'asg_1',
            teacher: { id: 't1', label: 'Sơn' },
            subject: { id: 's1', label: 'Toán' },
            class: { id: 'c1', label: '6A' },
            weeklyPeriods: 2,
          },
        ],
        constraints: [],
      },
      {
        baseURL: 'http://example.test',
        apiKey: 'test',
        model: 'test',
        allowExperimentalAiCodegen: true,
      },
      {
        preTranslatedConstraintSpecs: [
          {
            id: 'c1',
            original: 'Ràng buộc custom',
            severity: 'hard',
            kind: 'custom_dsl',
            params: {},
          },
        ],
      }
    );

    assert.ok(chatCalls > 0, 'Phải gọi AI codegen (planner hoặc coder) khi experimental=true');
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
  }
});
