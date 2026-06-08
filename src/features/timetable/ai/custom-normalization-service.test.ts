import test from 'node:test';
import assert from 'node:assert/strict';

import {
  __customNormalizationInternal,
  buildCustomNormalizationInput,
  normalizeCustomConstraint,
} from './custom-normalization-service';
import type { AgentInputPayload } from './types';

const sampleInput: AgentInputPayload = {
  days: [
    { id: 'monday', label: 'Thứ 2' },
    { id: 'tuesday', label: 'Thứ 3' },
    { id: 'wednesday', label: 'Thứ 4' },
    { id: 'thursday', label: 'Thứ 5' },
  ],
  sessions: [],
  periodCounts: {},
  deletedPeriods: {},
  assignments: [
    {
      id: 'a1',
      teacher: { id: 't1', label: 'Thúy' },
      subject: { id: 's1', label: 'Toán' },
      class: { id: 'c1', label: '6A' },
      weeklyPeriods: 4,
    },
    {
      id: 'a2',
      teacher: { id: 't2', label: 'Hạnh' },
      subject: { id: 's2', label: 'Văn' },
      class: { id: 'c2', label: '6B' },
      weeklyPeriods: 3,
    },
  ],
  constraints: [],
};

test('deterministic custom normalizer detects known entities without built-in specs', () => {
  const input = buildCustomNormalizationInput(
    'hard',
    'Nếu cô Thúy dạy thứ 4 tiết 1 thì cô Hạnh không dạy thứ 5 tiết 2',
    sampleInput
  );

  const result = __customNormalizationInternal.deterministicNormalize(input);

  assert.equal(result.status, 'normalized');
  assert.match(result.normalizedText, /Giáo viên Thúy dạy Thứ 4, tiết 1/);
  assert.match(result.normalizedText, /Giáo viên Hạnh không dạy Thứ 5, tiết 2/);
  assert.deepEqual(result.detectedEntities.teachers, ['Thúy', 'Hạnh']);
  assert.deepEqual(result.detectedEntities.days, ['wednesday', 'thursday']);
  assert.deepEqual(result.detectedEntities.periods, [1, 2]);
  assert.equal('proposedSpecs' in result, false);
});

test('normalizeCustomConstraint filters invented model entities', async () => {
  const input = buildCustomNormalizationInput(
    'hard',
    'Cô Thúy ưu tiên dạy Toán 6A vào thứ 4 tiết 1',
    sampleInput
  );

  const result = await normalizeCustomConstraint(
    input,
    { baseURL: 'https://example.test', apiKey: 'k', model: 'm' },
    async () => ({
      content: JSON.stringify({
        status: 'normalized',
        normalizedText: 'Ưu tiên xếp cô Thúy dạy Toán lớp 6A vào Thứ 4 tiết 1',
        detectedEntities: {
          teachers: ['Thúy', 'Không có'],
          subjects: ['Toán'],
          classes: ['6A'],
          assignments: ['a1', 'missing'],
          days: ['wednesday', 'sunday'],
          periods: [1],
        },
        confidence: 0.91,
        needsClarification: false,
        clarificationQuestions: [],
      }),
      usage: { total_tokens: 42 },
    })
  );

  assert.equal(result.status, 'normalized');
  assert.deepEqual(result.detectedEntities.teachers, ['Thúy']);
  assert.deepEqual(result.detectedEntities.assignments, ['a1']);
  assert.deepEqual(result.detectedEntities.days, ['wednesday']);
  assert.equal(result.confidence, 0.91);
  assert.equal(result.usageTokens, 42);
});

test('custom normalizer asks clarification for vague text', () => {
  const input = buildCustomNormalizationInput('soft', 'Xếp lịch hợp lý và cân đối', sampleInput);
  const result = __customNormalizationInternal.deterministicNormalize(input);

  assert.equal(result.status, 'needs_clarification');
  assert.equal(result.needsClarification, true);
  assert.match(result.clarificationQuestions[0], /áp dụng cho/u);
});
