import test from 'node:test';
import assert from 'node:assert/strict';

import type { AgentInputPayload } from './types';
import { parseConstraintDrafts } from './constraint-parse-service';
import { inferRuleParseConfidence } from './rule-parse-confidence';
import { __translatorInternal } from './translator';

const sampleInput: AgentInputPayload = {
  days: [{ id: 'monday', label: 'Thứ 2' }],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { monday: 5 },
  deletedPeriods: {},
  assignments: [
    {
      id: 'asg_1',
      teacher: { id: 't1', label: 'Sơn' },
      subject: { id: 's1', label: 'Toán' },
      class: { id: 'c1', label: '6A' },
      weeklyPeriods: 3,
    },
  ],
  constraints: [{ type: 'required', text: 'Sơn không dạy thứ 2' }],
};

test('inferRuleParseConfidence high for teacher_block_day', () => {
  const specs = __translatorInternal.fallbackFromRuleParser(sampleInput);
  const rule = inferRuleParseConfidence('Sơn không dạy thứ 2', specs);
  assert.equal(rule.confidence, 'high');
  assert.ok(rule.specs.some((s) => s.kind === 'teacher_block_day'));
});

test('parseConstraintDrafts returns one draft per constraint (rule only)', async () => {
  const drafts = await parseConstraintDrafts(sampleInput, {
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: '',
    model: 'test',
  });
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].source, 'rule');
  assert.ok(drafts[0].proposedSpecs.length >= 1);
});

test('parseConstraintDrafts empty constraints', async () => {
  const drafts = await parseConstraintDrafts(
    { ...sampleInput, constraints: [] },
    { baseURL: '', apiKey: '', model: 'x' }
  );
  assert.deepEqual(drafts, []);
});

test('rule parser subject_max_consecutive for 3-in-a-row ban', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    assignments: [
      ...sampleInput.assignments,
      {
        id: 'asg_2',
        teacher: { id: 't2', label: 'B' },
        subject: { id: 's2', label: 'Văn' },
        class: { id: 'c1', label: '6A' },
        weeklyPeriods: 2,
      },
    ],
    constraints: [
      {
        type: 'required',
        text: 'Không xếp 3 tiết liên tiếp cùng 1 môn cho cùng 1 lớp ở 1 thứ bất kì',
      },
    ],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);
  assert.ok(specs.some((s) => s.kind === 'subject_max_consecutive'));
  const maxSpec = specs.find((s) => s.kind === 'subject_max_consecutive');
  assert.equal(maxSpec?.params.maxConsecutive, 2);
});

test('rule parser class_subjects_not_same_day for heavy subjects same day', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    assignments: [
      ...sampleInput.assignments,
      {
        id: 'asg_2',
        teacher: { id: 't2', label: 'Dung' },
        subject: { id: 's2', label: 'Văn' },
        class: { id: 'c1', label: '6A' },
        weeklyPeriods: 2,
      },
    ],
    constraints: [
      {
        type: 'preferred',
        text: 'Các môn nặng như Toán, Văn không nên xếp cùng 1 ngày ở 1 lớp',
        weight: 5,
      },
    ],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);
  const spec = specs.find((s) => s.kind === 'class_subjects_not_same_day');
  assert.ok(spec, 'should produce class_subjects_not_same_day');
  assert.equal(spec.severity, 'soft');
  assert.deepEqual(spec.params.subjects, ['Toán', 'Văn']);
  assert.equal(spec.params.maxSubjectsPerDay, 1);
});

test('rule parser heavy periods same day per class', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    assignments: [
      ...sampleInput.assignments,
      {
        id: 'asg_2',
        teacher: { id: 't2', label: 'Dung' },
        subject: { id: 's2', label: 'Văn' },
        class: { id: 'c1', label: '6A' },
        weeklyPeriods: 2,
      },
    ],
    constraints: [
      {
        type: 'preferred',
        text: 'Các tiết nặng không xếp vào cùng 1 ngày ở cùng 1 lớp',
        weight: 8,
      },
    ],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);
  const spec = specs.find((s) => s.kind === 'class_subjects_not_same_day');
  assert.ok(spec, 'should parse heavy same-day constraint');
  assert.equal(spec.severity, 'soft');
  assert.deepEqual(spec.params.subjects, ['Toán', 'Văn']);
  assert.equal(spec.params.maxSubjectsPerDay, 1);
});

test('rule parser heavy not stacked in one session per class', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    assignments: [
      ...sampleInput.assignments,
      { id: 'asg_2', teacher: { id: 't2', label: 'Dung' }, subject: { id: 's2', label: 'Văn' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 2 },
      { id: 'asg_3', teacher: { id: 't3', label: 'Nam' }, subject: { id: 's3', label: 'Tiếng Anh' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 2 },
    ],
    constraints: [
      {
        type: 'preferred',
        text: 'Các môn nặng trong 1 buổi không dồn vào cho 1 lớp, ví dụ 1 lớp không chỉ học Toán, Văn, Anh trong cùng 1 buổi mà phải có xen kẽ',
        weight: 8,
      },
    ],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);
  const spec = specs.find((s) => s.kind === 'class_max_heavy_subjects_per_session');
  assert.ok(spec, 'should parse session spread constraint');
  assert.equal(spec?.severity, 'soft');
  assert.ok((spec?.params.maxHeavyInSession as number) >= 2);
  assert.ok(Array.isArray(spec?.params.sessionIds));
});
