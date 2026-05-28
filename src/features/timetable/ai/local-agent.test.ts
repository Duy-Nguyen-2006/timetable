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

test('buildCoderExhaustedMessage includes the last actionable failure', () => {
  assert.equal(
    __localAgentInternal.buildCoderExhaustedMessage('RuntimeError: bad generated code'),
    'Coder could not produce an executable schedule. Last failure: RuntimeError: bad generated code'
  );
});

test('runLocalAgent repairs runtime failures before returning coder exhausted', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  let coderCalls = 0;
  let repairPayload: {
    currentCode?: string;
    constraintCode?: string;
    compileOrRunError?: string;
  } | null = null;

  (globalThis as typeof globalThis & { window?: unknown }).window = {};
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
        coderCalls += 1;
        return Response.json({
          ok: true,
          content: JSON.stringify({
            plan_summary: 'bad runtime code',
            constraint_code: "raise RuntimeError('bad')",
            covered_constraint_ids: [],
            assumptions: [],
          }),
          usage: { total_tokens: 1 },
        });
      }

      if (systemPrompt === 'repair') {
        repairPayload = JSON.parse(body.messages?.[1]?.content ?? '{}');
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

    assert.equal(result.success, true);
    assert.equal(coderCalls, 3);
    assert.equal(repairPayload?.currentCode, "raise RuntimeError('bad')");
    assert.equal(repairPayload?.constraintCode, "raise RuntimeError('bad')");
    assert.equal(repairPayload?.compileOrRunError, 'RuntimeError: bad');
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
  }
});

test('runLocalAgent returns a clear repeated-violation error instead of stopped early', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  let repairCalls = 0;

  (globalThis as typeof globalThis & { window?: unknown }).window = {};
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
    assert.equal(repairCalls, 1);
    assert.match(result.error ?? '', /^Không tạo được thời khóa biểu/);
    assert.doesNotMatch(result.error ?? '', /Stopped early/i);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
  }
});
