import test from 'node:test';
import assert from 'node:assert/strict';

import { runDeterministicSolver } from './deterministic-solver';
import type { AgentInputPayload, LocalAgentConfig, ExecutionResult } from './types';
import type { ConstraintSpec } from './constraint-spec';

const baseInput: AgentInputPayload = {
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
};

const baseConfig: LocalAgentConfig = {
  baseURL: 'http://example.test',
  apiKey: 'test',
  model: 'test',
  solverProfile: 'fast',
};

function setupFetch(execResult: ExecutionResult, options?: { onExecute?: (code: string, input: unknown) => void }) {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  (globalThis as typeof globalThis & { window?: unknown }).window = {} as unknown as (Window & typeof globalThis);
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.endsWith('/templates/solver_skeleton.py')) {
      return new Response(
        'def build_custom_constraints(model, slots, data):\n    # <<< AI_FILL_HERE >>>\n'
      );
    }
    if (url.endsWith('/api/ai/python-execute')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { code?: string; input?: unknown };
      options?.onExecute?.(body.code ?? '', body.input);
      return Response.json({ ok: true, result: execResult });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
    (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
  };
}

test('runDeterministicSolver chạy skeleton và trả về success', async () => {
  const execResult: ExecutionResult = {
    phase: 'run',
    ok: true,
    status: 'optimal',
    durationMs: 1,
    resultData: {
      classes: ['6A'],
      days: ['monday'],
      periods: [1, 2, 3, 4],
      schedule: [
        { assignmentId: 'asg_1', class: '6A', day: 'monday', period: 2, subject: 'Toán', teacher: 'Sơn' },
        { assignmentId: 'asg_1', class: '6A', day: 'monday', period: 3, subject: 'Toán', teacher: 'Sơn' },
      ],
    },
  };
  let observedInput: { constraints?: Array<{ kind: string; params?: Record<string, unknown> }>; assignments?: unknown } | null = null;
  const restore = setupFetch(execResult, {
    onExecute: (_code, input) => {
      observedInput = input as { constraints?: Array<{ kind: string; params?: Record<string, unknown> }> };
    },
  });

  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'Sơn không dạy tiết 1',
      severity: 'hard',
      kind: 'teacher_block_period',
      params: { teacher: 'Sơn', period: 1 },
    },
  ];

  try {
    const result = await runDeterministicSolver(baseInput, baseConfig, { constraintSpecs: specs });
    assert.equal(result.success, true);
    assert.ok(result.finalResult);
    assert.equal(result.finalResult?.status, 'solved');
    assert.equal(result.finalResult?.solverStatus, 'optimal');
    assert.match(result.finalResult?.message ?? '', /tối ưu/);
    assert.equal(result.finalResult?.schedule.length, 2);
    // Specs phải được gửi sang Python solver như JSON input
    const captured = observedInput as { constraints?: Array<{ kind: string; params?: Record<string, unknown> }> } | null;
    assert.equal(captured?.constraints?.[0]?.kind, 'teacher_block_period');
    assert.equal(captured?.constraints?.[0]?.params?.teacher, 'Sơn');
  } finally {
    restore();
  }
});

test('runDeterministicSolver trả lỗi khi solver execution fail', async () => {
  const execResult: ExecutionResult = {
    phase: 'run',
    ok: false,
    status: 'infeasible',
    durationMs: 1,
    errorDigest: 'No feasible solution',
  };
  const restore = setupFetch(execResult);
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'test',
      severity: 'hard',
      kind: 'teacher_block_period',
      params: { teacher: 'Sơn', period: 1 },
    },
  ];

  try {
    const result = await runDeterministicSolver(baseInput, baseConfig, { constraintSpecs: specs });
    assert.equal(result.success, false);
    assert.match(result.error ?? '', /No feasible solution/);
    assert.equal(result.finalResult, undefined);
  } finally {
    restore();
  }
});

test('runDeterministicSolver trả lỗi khi skeleton marker không tìm thấy', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  (globalThis as typeof globalThis & { window?: unknown }).window = {} as unknown as (Window & typeof globalThis);
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.endsWith('/templates/solver_skeleton.py')) {
      // Trả skeleton không có marker AI_FILL_HERE
      return new Response('def build_custom_constraints(model):\n    pass\n');
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'test',
      severity: 'hard',
      kind: 'teacher_block_period',
      params: { teacher: 'Sơn', period: 1 },
    },
  ];

  try {
    const result = await runDeterministicSolver(baseInput, baseConfig, { constraintSpecs: specs });
    assert.equal(result.success, false);
    assert.match(result.error ?? '', /skeleton marker/);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
  }
});

test('runDeterministicSolver trả lỗi khi validator phát hiện hard violation', async () => {
  // Sơn xuất hiện ở tiết 1 — vi phạm teacher_block_period (Sơn, 1)
  const execResult: ExecutionResult = {
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
  };
  const restore = setupFetch(execResult);
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'Sơn không dạy tiết 1',
      severity: 'hard',
      kind: 'teacher_block_period',
      params: { teacher: 'Sơn', period: 1 },
    },
  ];

  try {
    const result = await runDeterministicSolver(baseInput, baseConfig, { constraintSpecs: specs });
    assert.equal(result.success, false);
    assert.match(result.error ?? '', /Sơn không được dạy tiết 1/);
  } finally {
    restore();
  }
});

test('runDeterministicSolver map timeout_with_solution status', async () => {
  const execResult: ExecutionResult = {
    phase: 'run',
    ok: true,
    status: 'timeout_with_solution',
    durationMs: 1,
    resultData: {
      classes: ['6A'],
      days: ['monday'],
      periods: [1, 2, 3, 4],
      schedule: [
        { assignmentId: 'asg_1', class: '6A', day: 'monday', period: 2, subject: 'Toán', teacher: 'Sơn' },
        { assignmentId: 'asg_1', class: '6A', day: 'monday', period: 3, subject: 'Toán', teacher: 'Sơn' },
      ],
    },
  };
  const restore = setupFetch(execResult);
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'Sơn không dạy tiết 1',
      severity: 'hard',
      kind: 'teacher_block_period',
      params: { teacher: 'Sơn', period: 1 },
    },
  ];

  try {
    const result = await runDeterministicSolver(baseInput, baseConfig, { constraintSpecs: specs });
    assert.equal(result.success, true);
    assert.equal(result.finalResult?.solverStatus, 'timeout_with_solution');
    assert.match(result.finalResult?.message ?? '', /Hết thời gian/);
  } finally {
    restore();
  }
});

test('runDeterministicSolver auto_base weekly_periods_exact bị filter khỏi solver constraints', async () => {
  let observedInput: { constraints?: Array<{ id: string; kind: string }> } | null = null;
  const execResult: ExecutionResult = {
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
  };
  const restore = setupFetch(execResult, {
    onExecute: (_code, input) => {
      observedInput = input as { constraints?: Array<{ id: string; kind: string }> };
    },
  });

  const specs: ConstraintSpec[] = [
    {
      id: 'auto_1',
      original: 'auto base',
      severity: 'hard',
      kind: 'weekly_periods_exact',
      params: { assignmentId: 'asg_1', count: 2 },
      tags: ['auto_base'],
    },
    {
      id: 'c1',
      original: 'Sơn không dạy tiết 1',
      severity: 'hard',
      kind: 'teacher_block_period',
      params: { teacher: 'Sơn', period: 1 },
    },
  ];

  try {
    await runDeterministicSolver(baseInput, baseConfig, { constraintSpecs: specs });
    const sentSpecs = ((observedInput as { constraints?: Array<{ id: string; kind: string }> } | null)?.constraints ?? []) as Array<{ id: string; kind: string }>;
    assert.equal(sentSpecs.length, 1);
    assert.equal(sentSpecs[0].id, 'c1');
  } finally {
    restore();
  }
});

test('runDeterministicSolver giữ empty build_custom_constraints (không gọi AI code)', async () => {
  let observedCode = '';
  const execResult: ExecutionResult = {
    phase: 'run',
    ok: true,
    status: 'feasible',
    durationMs: 1,
    resultData: {
      classes: ['6A'],
      days: ['monday'],
      periods: [1, 2, 3, 4],
      schedule: [
        { assignmentId: 'asg_1', class: '6A', day: 'monday', period: 2, subject: 'Toán', teacher: 'Sơn' },
        { assignmentId: 'asg_1', class: '6A', day: 'monday', period: 3, subject: 'Toán', teacher: 'Sơn' },
      ],
    },
  };
  const restore = setupFetch(execResult, {
    onExecute: (code) => {
      observedCode = code;
    },
  });
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'Sơn không dạy tiết 1',
      severity: 'hard',
      kind: 'teacher_block_period',
      params: { teacher: 'Sơn', period: 1 },
    },
  ];

  try {
    const result = await runDeterministicSolver(baseInput, baseConfig, { constraintSpecs: specs });
    assert.equal(result.success, true);
    // Empty injection sẽ fill marker bằng 'pass' — không phải AI-generated code.
    assert.match(observedCode, /pass/);
    // Diagnostics phải thể hiện là fast-path, không phải AI codegen.
    assert.equal(result.finalResult?.diagnostics[0], 'Deterministic fast-path: no AI planner/coder/repair used.');
  } finally {
    restore();
  }
});

test('runDeterministicSolver truyền warmStartSchedule khi có previousSchedule', async () => {
  let observedInput: { warmStartSchedule?: Array<{ period: number }> } | null = null;
  const execResult: ExecutionResult = {
    phase: 'run',
    ok: true,
    status: 'optimal',
    durationMs: 1,
    resultData: {
      classes: ['6A'],
      days: ['monday'],
      periods: [1, 2, 3, 4],
      schedule: [
        { assignmentId: 'asg_1', class: '6A', day: 'monday', period: 2, subject: 'Toán', teacher: 'Sơn' },
        { assignmentId: 'asg_1', class: '6A', day: 'monday', period: 3, subject: 'Toán', teacher: 'Sơn' },
      ],
    },
  };
  const restore = setupFetch(execResult, {
    onExecute: (_code, input) => {
      observedInput = input as { warmStartSchedule?: Array<{ period: number }> };
    },
  });

  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'Sơn không dạy tiết 1',
      severity: 'hard',
      kind: 'teacher_block_period',
      params: { teacher: 'Sơn', period: 1 },
    },
  ];

  try {
    const inputWithPrev: AgentInputPayload = {
      ...baseInput,
      previousSchedule: [
        { assignmentId: 'asg_1', class: '6A', day: 'monday', period: 4, subject: 'Toán', teacher: 'Sơn' },
      ],
    };
    await runDeterministicSolver(inputWithPrev, baseConfig, { constraintSpecs: specs });
    const captured = observedInput as { warmStartSchedule?: Array<{ period: number }> } | null;
    assert.ok(captured?.warmStartSchedule);
    assert.equal(captured?.warmStartSchedule?.[0]?.period, 4);
  } finally {
    restore();
  }
});

test('runDeterministicSolver final result chứa attemptHistorySummary deterministic_fast_path', async () => {
  const execResult: ExecutionResult = {
    phase: 'run',
    ok: true,
    status: 'optimal',
    durationMs: 1,
    resultData: {
      classes: ['6A'],
      days: ['monday'],
      periods: [1, 2, 3, 4],
      schedule: [
        { assignmentId: 'asg_1', class: '6A', day: 'monday', period: 2, subject: 'Toán', teacher: 'Sơn' },
        { assignmentId: 'asg_1', class: '6A', day: 'monday', period: 3, subject: 'Toán', teacher: 'Sơn' },
      ],
    },
  };
  const restore = setupFetch(execResult);
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'Sơn không dạy tiết 1',
      severity: 'hard',
      kind: 'teacher_block_period',
      params: { teacher: 'Sơn', period: 1 },
    },
  ];

  try {
    const result = await runDeterministicSolver(baseInput, baseConfig, { constraintSpecs: specs });
    assert.equal(result.success, true);
    const finalResult = result.finalResult;
    assert.ok(finalResult);
    assert.equal(finalResult?.attemptHistorySummary[0]?.stage, 'deterministic_fast_path');
  } finally {
    restore();
  }
});
