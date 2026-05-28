import test from 'node:test';
import assert from 'node:assert/strict';

import { __translatorInternal } from './translator';
import type { AgentInputPayload } from './types';
import type { ConstraintSpec } from './constraint-spec';

const sampleInput: AgentInputPayload = {
  days: [
    { id: 'mon', label: 'Thứ 2' },
    { id: 'tue', label: 'Thứ 3' },
  ],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { mon: 5, tue: 5 },
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

test('sanitize converts unknown teacher to custom_dsl', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'ABC không dạy thứ 2',
      severity: 'hard',
      kind: 'teacher_block_day',
      params: { teacher: 'ABC', day: 'mon' },
    },
  ];
  const result = __translatorInternal.sanitizeSpecs(sampleInput, specs);
  assert.equal(result[0].kind, 'custom_dsl');
});

test('sanitize converts unknown day to custom_dsl', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'Sơn không dạy chủ nhật',
      severity: 'hard',
      kind: 'teacher_block_day',
      params: { teacher: 'Sơn', day: 'sun' },
    },
  ];
  const result = __translatorInternal.sanitizeSpecs(sampleInput, specs);
  assert.equal(result[0].kind, 'custom_dsl');
});

test('translator periods expands session counts instead of sending count values only', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    sessions: [
      { id: 'morning', label: 'Sáng' },
      { id: 'afternoon', label: 'Chiều' },
    ],
    periodCounts: { morning: 5, afternoon: 4 },
  };

  assert.deepEqual(__translatorInternal.buildTranslatorPeriods(input), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('translator periods uses active union from periodsByDay', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    days: [
      { id: 'mon', label: 'Thứ 2' },
      { id: 'tue', label: 'Thứ 3' },
    ],
    sessions: [
      { id: 'morning', label: 'Sáng' },
      { id: 'afternoon', label: 'Chiều' },
    ],
    periodCounts: { morning: 2, afternoon: 1 },
    deletedPeriods: { 'mon-morning-2': true, 'tue-afternoon-1': true },
  };

  assert.deepEqual(__translatorInternal.buildTranslatorPeriods(input), [1, 2, 3]);
});

test('translator periodsByDay reflects session offsets and deleted periods', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    days: [
      { id: 'mon', label: 'Thứ 2' },
      { id: 'tue', label: 'Thứ 3' },
    ],
    sessions: [
      { id: 'morning', label: 'Sáng' },
      { id: 'afternoon', label: 'Chiều' },
    ],
    periodCounts: { morning: 2, afternoon: 1 },
    deletedPeriods: { 'mon-morning-2': true },
  };

  assert.deepEqual(__translatorInternal.buildTranslatorPeriodsByDay(input), {
    mon: [1, 3],
    tue: [1, 2, 3],
  });
});

test('fallback parser splits independent clauses', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    assignments: [
      ...sampleInput.assignments,
      {
        id: 'asg_2',
        teacher: { id: 't2', label: 'Hương' },
        subject: { id: 's2', label: 'Văn' },
        class: { id: 'c2', label: '6B' },
        weeklyPeriods: 2,
      },
    ],
    constraints: [{ type: 'required', text: 'Sơn không dạy thứ 2 và Hương không dạy tiết 1' }],
  };

  const specs = __translatorInternal.fallbackFromRuleParser(input);
  assert.equal(specs.length, 2);
  assert.deepEqual(specs.map((spec) => spec.id), ['c1', 'c2']);
  assert.equal(specs[0].kind, 'teacher_block_day');
  assert.equal(specs[1].kind, 'teacher_block_period');
});

test('fallback parser does not split if_then clauses', () => {
  const clauses = __translatorInternal.splitFallbackConstraintText(
    'Nếu Sơn và Hương dạy thứ 2 thì Hương không dạy thứ 3'
  );

  assert.equal(clauses.length, 1);
});

test('fallback parser returns at least one spec per constraint', () => {
  const result = __translatorInternal.fallbackFromRuleParser(sampleInput);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'c1');
});

test('fallback parser covers remaining constraint kinds', () => {
  const input: AgentInputPayload = {
    days: [
      { id: 'mon', label: 'Thứ 2' },
      { id: 'tue', label: 'Thứ 3' },
      { id: 'wed', label: 'Thứ 4' },
    ],
    sessions: [{ id: 'morning', label: 'Sáng' }],
    periodCounts: { morning: 5 },
    deletedPeriods: {},
    assignments: [
      {
        id: 'asg_1',
        teacher: { id: 't1', label: 'Sơn' },
        subject: { id: 's1', label: 'Toán' },
        class: { id: 'c1', label: '6A' },
        weeklyPeriods: 2,
      },
      {
        id: 'asg_2',
        teacher: { id: 't2', label: 'Thúy' },
        subject: { id: 's2', label: 'Văn' },
        class: { id: 'c2', label: '6B' },
        weeklyPeriods: 2,
      },
      {
        id: 'asg_3',
        teacher: { id: 't3', label: 'Hòa' },
        subject: { id: 's3', label: 'Anh' },
        class: { id: 'c1', label: '6A' },
        weeklyPeriods: 2,
      },
    ],
    constraints: [
      { type: 'required', text: 'Sơn tối đa 4 tiết/ngày' },
      { type: 'required', text: 'Toán phải liên tiếp 2 tiết' },
      { type: 'required', text: 'Toán chỉ xếp tiết 1 2' },
      { type: 'required', text: 'Lớp 6A không học Toán 2 lần/ngày' },
      { type: 'required', text: 'Sơn và Thúy không cùng tiết thứ 2' },
      { type: 'required', text: 'Sơn Toán 6A đúng 2 tiết' },
      { type: 'required', text: 'Nếu Sơn dạy thứ 2 thì Thúy không dạy thứ 3' },
    ],
  };

  const specs = __translatorInternal.fallbackFromRuleParser(input);
  assert.equal(specs.length, input.constraints.length);
  assert.equal(specs[0].kind, 'teacher_max_per_day');
  assert.equal(specs[1].kind, 'subject_consecutive');
  assert.equal(specs[2].kind, 'subject_pin_period');
  assert.equal(specs[3].kind, 'class_no_double_subject_day');
  assert.equal(specs[4].kind, 'pair_not_same_slot');
  assert.equal(specs[5].kind, 'weekly_periods_exact');
  assert.equal(specs[6].kind, 'if_then');
});

test('sanitize marks weekly_periods_exact as auto_base when assignmentId matches weeklyPeriods', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'asg_1 đúng 3 tiết',
      severity: 'hard',
      kind: 'weekly_periods_exact',
      params: { assignmentId: 'asg_1', weeklyPeriods: 3 },
    },
  ];
  const result = __translatorInternal.sanitizeSpecs(sampleInput, specs);
  assert.equal(result[0].severity, 'info');
  assert.equal(result[0].tags?.includes('auto_base'), true);
});

test('sanitize does not mark auto_base when weeklyPeriods mismatch', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'asg_1 đúng 2 tiết',
      severity: 'hard',
      kind: 'weekly_periods_exact',
      params: { assignmentId: 'asg_1', weeklyPeriods: 2 },
    },
  ];
  const result = __translatorInternal.sanitizeSpecs(sampleInput, specs);
  assert.equal(result[0].severity, 'hard');
  assert.equal(result[0].tags?.includes('auto_base'), false);
});

test('sanitize infers assignmentId and marks auto_base when weekly spec is uniquely matched', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'Son Toan 6A dung 3 tiet',
      severity: 'hard',
      kind: 'weekly_periods_exact',
      params: { teacher: 'Sơn', subject: 'Toán', class: '6A', weeklyPeriods: 3 },
    },
  ];
  const result = __translatorInternal.sanitizeSpecs(sampleInput, specs);
  assert.equal(result[0].params.assignmentId, 'asg_1');
  assert.equal(result[0].severity, 'info');
  assert.equal(result[0].tags?.includes('auto_base'), true);
});
