import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeConstraint } from './analyze-constraint-service';
import type { AgentInputPayload, AIProviderConfig } from './types';

const agentInput: AgentInputPayload = {
  days: [
    { id: 'monday', label: 'Thứ 2' },
    { id: 'tuesday', label: 'Thứ 3' },
  ],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { morning: 5 },
  deletedPeriods: {},
  assignments: [
    { id: 'a1', teacher: { id: 't1', label: 'Hiếu' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 2 },
    { id: 'a2', teacher: { id: 't2', label: 'Thúy' }, subject: { id: 's2', label: 'Văn' }, class: { id: 'c2', label: '6B' }, weeklyPeriods: 2 },
    { id: 'a3', teacher: { id: 't3', label: 'Thủy' }, subject: { id: 's3', label: 'Lý' }, class: { id: 'c3', label: '6C' }, weeklyPeriods: 2 },
  ],
  constraints: [],
};

const provider: AIProviderConfig = {
  provider: 'generic-chat-completion-api',
  baseURL: 'https://example.test/v1',
  apiKey: 'test-key',
  model: 'test-model',
};

function mockFetchOk(body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;
}

test('analyzeConstraint converts ambiguous technical if_then response into Vietnamese clarification', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetchOk({
    choices: [
      {
        message: {
          content: JSON.stringify({
            status: 'mapped_builtin',
            normalizedText: 'Nếu (điều kiện chưa xác định) thì (teacher_block_period); (teacher_block_period).',
            specs: [
              {
                kind: 'if_then',
                params: {
                  if: {},
                  then: [
                    { kind: 'teacher_block_period', params: { teacher: 'Hiếu', period: 4 } },
                    { kind: 'teacher_block_period', params: { teacher: 'Thúy', period: 4 } },
                  ],
                },
              },
            ],
            confidence: 'medium',
            clarificationQuestions: [],
            assumptions: [],
            unresolvedQuestions: [],
          }),
        },
      },
    ],
    usage: { total_tokens: 42 },
  });

  try {
    const result = await analyzeConstraint(
      'Nếu Hiếu và Thúy dạy cùng ngày thì 1 người không được dạy tiết 4',
      'required',
      undefined,
      agentInput,
      provider
    );

    assert.equal(result.status, 'needs_clarification');
    assert.deepEqual(result.specs, []);
    assert.ok(result.clarificationQuestions.length >= 1);
    assert.match(result.clarificationQuestions.join('\n'), /một người/u);
    assert.doesNotMatch(result.clarificationQuestions.join('\n'), /Rule parser|diễn đạt lại rõ hơn/u);
    assert.doesNotMatch(result.normalizedText, /teacher_block_period|điều kiện chưa xác định/u);
    assert.equal(result.requiresConfirmation, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ─── Phase 0: silent-flip regression tests (frozen, do not modify) ────────────
// These tests guarantee that the bug "Thủy phải có tiết 4" cannot reappear.
// If any of these tests fail, the pipeline is silently flipping the meaning
// of a positive ("phải có") Vietnamese sentence into a negative kind
// (teacher_block_period or teacher_allowed_periods).

test('Phase 0.3: LLM emits teacher_block_period for "phải có" sentence -> demoted, requiresConfirmation=true', async () => {
  // Simulate the LLM doing the wrong thing: emitting a block kind for a
  // require intent. The guard MUST demote and force confirmation.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetchOk({
    choices: [
      {
        message: {
          content: JSON.stringify({
            status: 'mapped_builtin',
            normalizedText: 'Giáo viên Thủy không dạy tiết 4.',
            specs: [
              { kind: 'teacher_block_period', params: { teacher: 'Thủy', period: 4 } },
            ],
            confidence: 'high',
            clarificationQuestions: [],
            assumptions: [],
            unresolvedQuestions: [],
          }),
        },
      },
    ],
    usage: { total_tokens: 30 },
  });

  try {
    const result = await analyzeConstraint(
      'Cô Thủy phải có ít nhất 1 tiết 4 trong tuần',
      'required',
      undefined,
      agentInput,
      provider
    );

    // The guard MUST have demoted the silent flip. Confidence capped at medium,
    // and requiresConfirmation forced to true so the user must explicitly
    // approve this spec before it can enter the solver.
    assert.equal(result.requiresConfirmation, true, 'must force confirmation on silent flip');
    assert.notEqual(result.confidence, 'high', 'must not retain high confidence after demote');
    assert.ok(result.guardReasons.length > 0, 'must record why the guard demoted');
    assert.match(result.guardReasons.join('\n'), /yêu cầu|require|phải có|ít nhất/iu);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Phase 0.3: LLM emits teacher_allowed_periods for "không" sentence -> demoted', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetchOk({
    choices: [
      {
        message: {
          content: JSON.stringify({
            status: 'mapped_builtin',
            normalizedText: 'Giáo viên Thủy chỉ dạy tiết 4.',
            specs: [
              { kind: 'teacher_allowed_periods', params: { teacher: 'Thủy', periods: [4] } },
            ],
            confidence: 'high',
            clarificationQuestions: [],
            assumptions: [],
            unresolvedQuestions: [],
          }),
        },
      },
    ],
    usage: { total_tokens: 30 },
  });

  try {
    const result = await analyzeConstraint(
      'Cô Thủy không dạy tiết 4',
      'required',
      undefined,
      agentInput,
      provider
    );

    assert.equal(result.requiresConfirmation, true, 'must force confirmation on inverse flip');
    assert.notEqual(result.confidence, 'high');
    assert.ok(result.guardReasons.length > 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Phase 0.3: LLM emits teacher_required_period for "phải có" sentence -> ok (correct mapping)', async () => {
  // The CORRECT mapping for "phải có ít nhất 1 tiết 4" is teacher_required_period.
  // The guard must NOT demote this case.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetchOk({
    choices: [
      {
        message: {
          content: JSON.stringify({
            status: 'mapped_builtin',
            normalizedText: 'Giáo viên Thủy phải có ít nhất 1 tiết 4 trong tuần.',
            specs: [
              { kind: 'teacher_required_period', params: { teacher: 'Thủy', period: 4, minCount: 1 } },
            ],
            confidence: 'high',
            clarificationQuestions: [],
            assumptions: [],
            unresolvedQuestions: [],
          }),
        },
      },
    ],
    usage: { total_tokens: 30 },
  });

  try {
    const result = await analyzeConstraint(
      'Cô Thủy phải có ít nhất 1 tiết 4 trong tuần',
      'required',
      undefined,
      agentInput,
      provider
    );

    // The mapping is semantically correct. No demote. But the LLM's high
    // confidence is preserved — this is one of the cases where 'high' is
    // legitimate (the LLM correctly understood a clear require sentence).
    assert.equal(result.status, 'mapped_builtin');
    assert.equal(result.requiresConfirmation, false);
    assert.equal(result.guardReasons.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Phase 0.1: LLM returns needs_clarification -> NEVER auto-mapped to builtin by fallback', async () => {
  // The previous behavior would, in this case, find a deterministic built-in
  // (e.g. teacher_block_period) and override the LLM's needs_clarification
  // with confidence='high'. Phase 0 disables that override path.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetchOk({
    choices: [
      {
        message: {
          content: JSON.stringify({
            status: 'needs_clarification',
            normalizedText: 'Cô Thủy ?',
            specs: [],
            semantic: null,
            confidence: 'low',
            clarificationQuestions: ['Bạn muốn nói rõ hơn?'],
            assumptions: [],
            unresolvedQuestions: [],
          }),
        },
      },
    ],
    usage: { total_tokens: 10 },
  });

  try {
    const result = await analyzeConstraint(
      'Cô Thủy',
      'required',
      undefined,
      agentInput,
      provider
    );

    // The LLM said "I need clarification". The pipeline MUST respect that.
    // It must NOT silently map to teacher_block_period (or any other kind)
    // based on the rule parser's guess.
    assert.equal(result.status, 'needs_clarification');
    assert.equal(result.specs.length, 0, 'must not produce specs from rule parser on needs_clarification');
    assert.equal(result.requiresConfirmation, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Phase 0.1: LLM HTTP failure + rule parser finds a kind -> fallback ok, but confidence capped at medium and requiresConfirmation=true', async () => {
  // Simulate a network error. The pipeline may use the rule parser as a
  // last-resort fallback so the user is not blocked, but the spec must be
  // hard-capped at medium confidence and require explicit confirmation.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('Network unreachable');
  }) as typeof fetch;

  try {
    const result = await analyzeConstraint(
      'Cô Thủy không dạy tiết 4',
      'required',
      undefined,
      agentInput,
      provider
    );

    // The rule parser will find teacher_block_period. Phase 0.1 says the
    // pipeline MAY return it as a fallback but must NOT auto-confirm.
    assert.notEqual(result.confidence, 'high', 'fallback must cap confidence at medium');
    assert.equal(result.requiresConfirmation, true, 'fallback must require confirmation');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
