/**
 * Tier 2 schema-decompose tests.
 * Covers: 3 new ConditionExpr ops, dedupeConstraintSpecs semantics,
 * self-decompose retry, humanizer rendering.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { __localAgentInternal } from './local-agent';
import { humanizeConstraintSpec } from './constraint-humanizer';
import { runTranslatorTurn } from './translator';
import type { AgentInputPayload, AIProviderConfig } from './types';
import type { ConstraintSpec } from './constraint-spec';

// ---- 3 new ConditionExpr ops humanized in Vietnamese ----

test('humanize teacher_pair_teaches_same_slot renders Vietnamese', () => {
  const spec: ConstraintSpec = {
    id: 'c1',
    original: 'Nếu Sơn và Hương cùng dạy thứ 2 tiết 2 thì ...',
    severity: 'hard',
    kind: 'if_then',
    params: {
      if: { op: 'teacher_pair_teaches_same_slot', teachers: ['Sơn', 'Hương'], day: 'mon', period: 2 },
      then: [{ kind: 'pair_not_same_slot', params: { teachers: ['Sơn', 'Hương'] } }],
    },
  };
  const text = humanizeConstraintSpec(spec);
  assert.match(text, /Sơn và Hương cùng dạy Thứ 2, tiết 2/);
});

test('humanize teacher_pair_teaches_same_day renders Vietnamese', () => {
  const spec: ConstraintSpec = {
    id: 'c1',
    original: 'Nếu Sơn và Hương cùng dạy thứ 2 thì ...',
    severity: 'hard',
    kind: 'if_then',
    params: {
      if: { op: 'teacher_pair_teaches_same_day', teachers: ['Sơn', 'Hương'], day: 'mon' },
      then: [{ kind: 'pair_not_same_slot', params: { teachers: ['Sơn', 'Hương'] } }],
    },
  };
  const text = humanizeConstraintSpec(spec);
  assert.match(text, /Sơn và Hương cùng dạy vào Thứ 2/);
});

test('humanize class_teacher_at_slot renders Vietnamese', () => {
  const spec: ConstraintSpec = {
    id: 'c1',
    original: 'Nếu lớp 6A học Toán thứ 2 tiết 2 thì ...',
    severity: 'hard',
    kind: 'if_then',
    params: {
      if: { op: 'class_teacher_at_slot', class: '6A', subject: 'Toán', day: 'mon', period: 2 },
      then: [{ kind: 'teacher_block_slot', params: { teacher: 'Sơn', day: 'mon', period: 2 } }],
    },
  };
  const text = humanizeConstraintSpec(spec);
  assert.match(text, /Lớp 6A học môn Toán Thứ 2, tiết 2/);
});

// ---- dedupeConstraintSpecs semantics: same id+original, different params → keep both ----

test('dedupeConstraintSpecs keeps two specs when they share id+original but params differ', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'Sơn không dạy thứ 2',
      severity: 'hard',
      kind: 'teacher_block_day',
      params: { teacher: 'Sơn', day: 'mon' },
    },
    {
      id: 'c1',
      original: 'Sơn không dạy thứ 2',
      severity: 'hard',
      kind: 'teacher_block_period',
      params: { teacher: 'Sơn', period: 2 },
    },
  ];
  const result = __localAgentInternal.dedupeConstraintSpecs(specs);
  assert.equal(result.length, 2, 'Different params → different signatures → kept separately');
});

test('dedupeConstraintSpecs collapses when both id and params are deep-equal', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'Sơn không dạy thứ 2',
      severity: 'hard',
      kind: 'teacher_block_day',
      params: { teacher: 'Sơn', day: 'mon' },
    },
    {
      id: 'c1',
      original: 'Sơn không dạy thứ 2',
      severity: 'hard',
      kind: 'teacher_block_day',
      params: { teacher: 'Sơn', day: 'mon' },
    },
  ];
  const result = __localAgentInternal.dedupeConstraintSpecs(specs);
  assert.equal(result.length, 1);
});

// ---- Self-decompose retry tests (text.length > 30 threshold) ----

const basePayload: AgentInputPayload = {
  days: [
    { id: 'mon', label: 'Thứ 2' },
    { id: 'tue', label: 'Thứ 3' },
  ],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { mon: 5, tue: 5 },
  deletedPeriods: {},
  assignments: [
    {
      id: 'asg_son',
      teacher: { id: 't1', label: 'Sơn' },
      subject: { id: 's1', label: 'Toán' },
      class: { id: 'c1', label: '6A' },
      weeklyPeriods: 3,
    },
    {
      id: 'asg_huong',
      teacher: { id: 't2', label: 'Hương' },
      subject: { id: 's1', label: 'Toán' },
      class: { id: 'c1', label: '6A' },
      weeklyPeriods: 3,
    },
  ],
  constraints: [
    {
      type: 'required',
      // Use a text the deterministic rule parser cannot fully handle (it cannot extract teachers/days/periods cleanly).
      text: 'Mỗi khi hai giáo viên Toán đều dạy cùng một buổi sáng thứ Hai thì họ không được dạy cùng tiết nào trong các ngày còn lại của tuần',
    },
  ],
};

const config: AIProviderConfig = {
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: 'test-key',
  model: 'deepseek/deepseek-v4-flash',
};

test('self-decompose retry fires exactly once when LLM returns custom_dsl hard for text.length > 30', async () => {
  const longText = basePayload.constraints[0].text;
  assert.ok(longText.length > 30, 'precondition: text longer than 30 chars');
  let callCount = 0;
  let secondPromptIncludesDecompose = false;

  const invokeChat = async (payload: { messages: Array<{ role: string; content: string }> }) => {
    callCount += 1;
    if (callCount === 2) {
      const systemContent = payload.messages[0]?.content ?? '';
      secondPromptIncludesDecompose = /decompose|phân rã/i.test(systemContent);
    }
    if (callCount === 1) {
      return {
        content: JSON.stringify({
          constraintSpecs: [
            {
              id: 'c1',
              original: longText,
              severity: 'hard',
              kind: 'custom_dsl',
              params: { naturalLanguage: longText },
            },
          ],
        }),
        usage: { total_tokens: 100 },
      };
    }
    // 2nd call: LLM decomposes into 2 specs (1 if_then, no custom_dsl)
    return {
      content: JSON.stringify({
        constraintSpecs: [
          {
            id: 'c1',
            original: longText,
            severity: 'hard',
            kind: 'if_then',
            params: {
              if: { op: 'teacher_pair_teaches_same_slot', teachers: ['Sơn', 'Hương'], day: 'mon', period: 2 },
              then: [
                { kind: 'pair_not_same_slot', params: { teachers: ['Sơn', 'Hương'] } },
              ],
            },
          },
        ],
      }),
      usage: { total_tokens: 200 },
    };
  };

  await runTranslatorTurn(config, basePayload, invokeChat);
  assert.equal(callCount, 2, 'Should retry exactly once');
  assert.ok(secondPromptIncludesDecompose, '2nd prompt should contain decompose instruction');
});

test('self-decompose retry does NOT fire when text.length <= 30', async () => {
  // Short text that the deterministic parser cannot handle, so LLM is called once.
  const shortText = 'Mỗi sáng thứ Hai thì Sơn dạy';
  assert.ok(shortText.length <= 30, 'precondition: text length <= 30');
  const shortInput: AgentInputPayload = {
    ...basePayload,
    constraints: [{ type: 'required', text: shortText }],
  };
  let callCount = 0;
  const invokeChat = async () => {
    callCount += 1;
    return {
      content: JSON.stringify({
        constraintSpecs: [
          {
            id: 'c1',
            original: shortText,
            severity: 'hard',
            kind: 'custom_dsl',
            params: { naturalLanguage: shortText },
          },
        ],
      }),
      usage: { total_tokens: 50 },
    };
  };
  await runTranslatorTurn(config, shortInput, invokeChat);
  assert.equal(callCount, 1, 'No retry for short text (length <= 30)');
});

test('self-decompose retry is idempotent: total <= 2 LLM calls even when 2nd also returns custom_dsl', async () => {
  let callCount = 0;
  const invokeChat = async () => {
    callCount += 1;
    return {
      content: JSON.stringify({
        constraintSpecs: [
          {
            id: 'c1',
            original: basePayload.constraints[0].text,
            severity: 'hard',
            kind: 'custom_dsl',
            params: { naturalLanguage: 'unparseable' },
          },
        ],
      }),
      usage: { total_tokens: 100 },
    };
  };
  await runTranslatorTurn(config, basePayload, invokeChat);
  assert.ok(callCount <= 2, `Max 2 calls allowed, got ${callCount}`);
});
