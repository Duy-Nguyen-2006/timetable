import assert from 'node:assert/strict';
import test from 'node:test';

import { __localAgentInternal, runLocalAgent } from './local-agent';
import { constraintSignature } from './local-agent-utils';

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
    constraintSignature({ ...base, weight: 3 }),
    constraintSignature({ ...base, weight: 8 })
  );
});

test('resolveSolverRuntime maps profiles to bounded timeouts and workers', () => {
  assert.deepEqual(__localAgentInternal.resolveSolverRuntime({ baseURL: 'x', apiKey: 'k', model: 'm', solverProfile: 'fast', solverWorkers: 99 }), { timeoutMs: 20_000, workers: 8, seed: 42 });
  assert.equal(__localAgentInternal.resolveSolverRuntime({ baseURL: 'x', apiKey: 'k', model: 'm', solverProfile: 'deep', timeoutMs: 1234 }).timeoutMs, 1234);
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

test('runLocalAgent reject confirmed specs không eligible, fail-closed không gọi LLM', async () => {
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

test('runLocalAgent fail-closed khi thiếu preTranslatedConstraintSpecs', async () => {
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
      { baseURL: 'http://example.test', apiKey: 'test', model: 'test' }
    );

    assert.equal(result.success, false);
    assert.match(result.error ?? '', /Cần xác nhận/);
    assert.equal(chatCalls, 0, 'Không được gọi LLM khi fail-closed');
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
  }
});
