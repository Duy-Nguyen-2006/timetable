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
  ],
  constraints: [],
};

const provider: AIProviderConfig = {
  provider: 'generic-chat-completion-api',
  baseURL: 'https://example.test/v1',
  apiKey: 'test-key',
  model: 'test-model',
};

test('analyzeConstraint converts ambiguous technical if_then response into Vietnamese clarification', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
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
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

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
    assert.ok(result.clarificationQuestions.length >= 2);
    assert.match(result.clarificationQuestions.join('\n'), /cùng bất kỳ ngày nào|ngày cụ thể/u);
    assert.doesNotMatch(result.normalizedText, /teacher_block_period|điều kiện chưa xác định/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
