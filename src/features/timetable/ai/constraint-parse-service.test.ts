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
  const rule = inferRuleParseConfidence('Sơn không dạy thứ 2', specs, {
    teachers: ['Sơn'],
    subjects: ['Toán'],
    classes: ['6A'],
  });
  assert.equal(rule.confidence, 'high');
  assert.ok(rule.specs.some((s) => s.kind === 'teacher_block_day'));
});

test('inferRuleParseConfidence low when teacher is unknown in agentInput', () => {
  const specs = __translatorInternal.fallbackFromRuleParser(sampleInput).map((spec) => ({
    ...spec,
    params: { ...spec.params, teacher: 'Lan' },
  }));
  const rule = inferRuleParseConfidence('Lan không dạy thứ 2', specs, {
    teachers: ['Sơn'],
    subjects: ['Toán'],
    classes: ['6A'],
  });
  assert.equal(rule.confidence, 'low');
  assert.ok(rule.issues.some((issue) => issue.code === 'unknown_entity'));
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

test('rule parser: Mỗi giáo viên nghỉ tối thiểu 1 ngày → teacher_max_working_days', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    days: [
      { id: 'monday', label: 'Thứ 2' },
      { id: 'tuesday', label: 'Thứ 3' },
      { id: 'wednesday', label: 'Thứ 4' },
      { id: 'thursday', label: 'Thứ 5' },
      { id: 'friday', label: 'Thứ 6' },
    ],
    constraints: [{ type: 'required', text: 'Mỗi giáo viên nghỉ tối thiểu 1 ngày' }],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);
  const spec = specs.find((s) => s.kind === 'teacher_max_working_days');
  assert.ok(spec, 'should map to teacher_max_working_days');
  assert.equal(spec?.params.maxDays, 4); // 5 days - 1 off = 4 max working
});

test('rule parser: Lớp 10A chỉ học thứ 2, 3, 4 → class_block_day specs', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    days: [
      { id: 'monday', label: 'Thứ 2' },
      { id: 'tuesday', label: 'Thứ 3' },
      { id: 'wednesday', label: 'Thứ 4' },
      { id: 'thursday', label: 'Thứ 5' },
      { id: 'friday', label: 'Thứ 6' },
    ],
    assignments: [
      { id: 'asg_x', teacher: { id: 't9', label: 'An' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c9', label: '10A' }, weeklyPeriods: 4 },
    ],
    constraints: [{ type: 'required', text: 'Lớp 10A chỉ học thứ 2, 3, 4' }],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);
  const blockDays = specs.filter((s) => s.kind === 'class_block_day' && s.params.class === '10A');
  assert.ok(blockDays.length >= 1, 'should produce class_block_day specs for forbidden days');
  const blockedDayIds = blockDays.map((s) => s.params.day as string).sort();
  assert.deepEqual(blockedDayIds, ['friday', 'thursday']);
});

test('rule parser: Lớp 10A chỉ học tiết 1-5 → class_block_period specs', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    periodCounts: { monday: 7 },
    days: [{ id: 'monday', label: 'Thứ 2' }],
    sessions: [{ id: 'morning', label: 'Sáng' }],
    assignments: [
      { id: 'asg_x', teacher: { id: 't9', label: 'An' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c9', label: '10A' }, weeklyPeriods: 4 },
    ],
    constraints: [{ type: 'required', text: 'Lớp 10A chỉ học tiết 1-5' }],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);
  const blockPeriods = specs.filter((s) => s.kind === 'class_block_period' && s.params.class === '10A');
  assert.ok(blockPeriods.length >= 1, 'should produce class_block_period specs for forbidden periods');
  const blockedPeriods = blockPeriods.map((s) => s.params.period as number).sort();
  assert.deepEqual(blockedPeriods, [6, 7]);
});

test('rule parser: Môn Thể dục không học thứ 7 → subject_block_days', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    days: [
      { id: 'monday', label: 'Thứ 2' },
      { id: 'saturday', label: 'Thứ 7' },
    ],
    assignments: [
      { id: 'asg_x', teacher: { id: 't9', label: 'An' }, subject: { id: 's2', label: 'Thể dục' }, class: { id: 'c9', label: '10A' }, weeklyPeriods: 2 },
    ],
    constraints: [{ type: 'required', text: 'Môn Thể dục không học thứ 7' }],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);
  const spec = specs.find((s) => s.kind === 'subject_block_days');
  assert.ok(spec, 'should parse as subject_block_days');
  assert.deepEqual(spec?.params.days, ['saturday']);
});

test('rule parser: Môn Thể dục không 2 tiết liền nhau → subject_not_consecutive', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    assignments: [
      { id: 'asg_x', teacher: { id: 't9', label: 'An' }, subject: { id: 's2', label: 'Thể dục' }, class: { id: 'c9', label: '10A' }, weeklyPeriods: 2 },
    ],
    constraints: [{ type: 'required', text: 'Môn Thể dục không 2 tiết liền nhau' }],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);
  const spec = specs.find((s) => s.kind === 'subject_not_consecutive');
  assert.ok(spec, 'should parse as subject_not_consecutive');
  assert.equal(spec?.params.subject, 'Thể dục');
});

test('rule parser: Lớp 10A không có tiết trống → class_no_gaps', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    assignments: [
      { id: 'asg_x', teacher: { id: 't9', label: 'An' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c9', label: '10A' }, weeklyPeriods: 4 },
    ],
    constraints: [{ type: 'required', text: 'Lớp 10A không có tiết trống' }],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);
  const spec = specs.find((s) => s.kind === 'class_no_gaps' && s.params.class === '10A');
  assert.ok(spec, 'should parse as class_no_gaps');
});

test('rule parser: Lớp 10A học tối đa 6 tiết/ngày → class_max_per_day', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    assignments: [
      { id: 'asg_x', teacher: { id: 't9', label: 'An' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c9', label: '10A' }, weeklyPeriods: 4 },
    ],
    constraints: [{ type: 'required', text: 'Lớp 10A học tối đa 6 tiết/ngày' }],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);
  const spec = specs.find((s) => s.kind === 'class_max_per_day' && s.params.class === '10A');
  assert.ok(spec, 'should parse as class_max_per_day');
  assert.equal(spec?.params.maxPerDay, 6);
});

test('rule parser: Lớp 10A học ít nhất 4 tiết/ngày → class_min_per_day', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    assignments: [
      { id: 'asg_x', teacher: { id: 't9', label: 'An' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c9', label: '10A' }, weeklyPeriods: 4 },
    ],
    constraints: [{ type: 'required', text: 'Lớp 10A học ít nhất 4 tiết/ngày' }],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);
  const spec = specs.find((s) => s.kind === 'class_min_per_day' && s.params.class === '10A');
  assert.ok(spec, 'should parse as class_min_per_day');
  assert.equal(spec?.params.minPerDay, 4);
});

test('rule parser: Mỗi giáo viên dạy tối đa 5 lớp mỗi ngày → teacher_max_classes_per_day', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    assignments: [
      { id: 'asg_x', teacher: { id: 't9', label: 'An' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c9', label: '10A' }, weeklyPeriods: 4 },
    ],
    constraints: [{ type: 'required', text: 'Mỗi giáo viên dạy tối đa 5 lớp mỗi ngày' }],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);
  const spec = specs.find((s) => s.kind === 'teacher_max_classes_per_day');
  assert.ok(spec, 'should parse as teacher_max_classes_per_day');
  assert.equal(spec?.params.maxClasses, 5);
  assert.equal(spec?.params.teacher, undefined);
});

test('rule parser: Giáo viên Sơn dạy ít nhất 2 tiết/ngày → teacher_min_per_day', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    constraints: [{ type: 'required', text: 'Giáo viên Sơn dạy ít nhất 2 tiết/ngày' }],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);
  const spec = specs.find((s) => s.kind === 'teacher_min_per_day');
  assert.ok(spec, 'should parse as teacher_min_per_day');
  assert.equal(spec?.params.teacher, 'Sơn');
  assert.equal(spec?.params.minPerDay, 2);
});

test('rule parser: Giáo viên Sơn tối đa 2 tiết trống/ngày → teacher_max_gaps', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    constraints: [{ type: 'required', text: 'Giáo viên Sơn tối đa 2 tiết trống/ngày' }],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);
  const spec = specs.find((s) => s.kind === 'teacher_max_gaps');
  assert.ok(spec, 'should parse as teacher_max_gaps');
  assert.equal(spec?.params.maxGaps, 2);
});

test('rule parser: Giáo viên Sơn khi dạy thì ít nhất 2 tiết liền → teacher_min_consecutive', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    constraints: [{ type: 'required', text: 'Giáo viên Sơn khi dạy thì ít nhất 2 tiết liền' }],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);
  const spec = specs.find((s) => s.kind === 'teacher_min_consecutive');
  assert.ok(spec, 'should parse as teacher_min_consecutive');
  assert.equal(spec?.params.minConsecutive, 2);
});

test('rule parser: Môn Toán rải ít nhất 3 ngày → subject_min_gap_days', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    assignments: [
      { id: 'asg_x', teacher: { id: 't9', label: 'An' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c9', label: '10A' }, weeklyPeriods: 4 },
    ],
    constraints: [{ type: 'required', text: 'Môn Toán rải ít nhất 3 ngày' }],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);
  const spec = specs.find((s) => s.kind === 'subject_min_gap_days');
  assert.ok(spec, 'should parse as subject_min_gap_days');
  assert.equal(spec?.params.subject, 'Toán');
  assert.equal(spec?.params.minGapDays, 3);
});

test('rule parser: Các môn Toán, Lý, Hóa không cùng tiết → mutual_exclusion', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    assignments: [
      { id: 'asg_a', teacher: { id: 't1', label: 'A' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 3 },
      { id: 'asg_b', teacher: { id: 't2', label: 'B' }, subject: { id: 's2', label: 'Lý' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 2 },
      { id: 'asg_c', teacher: { id: 't3', label: 'C' }, subject: { id: 's3', label: 'Hóa' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 2 },
    ],
    constraints: [{ type: 'required', text: 'Các môn Toán, Lý, Hóa không cùng tiết' }],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);
  const spec = specs.find((s) => s.kind === 'mutual_exclusion');
  assert.ok(spec, 'should parse as mutual_exclusion');
  const ids = spec?.params.assignmentIds as string[];
  assert.ok(Array.isArray(ids) && ids.length >= 2);
});

test('rule parser: Môn Thể dục chỉ học thứ 3 hoặc thứ 5 → subject_allowed_days', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    days: [
      { id: 'monday', label: 'Thứ 2' },
      { id: 'tuesday', label: 'Thứ 3' },
      { id: 'wednesday', label: 'Thứ 4' },
      { id: 'thursday', label: 'Thứ 5' },
      { id: 'friday', label: 'Thứ 6' },
    ],
    assignments: [
      { id: 'asg_x', teacher: { id: 't9', label: 'An' }, subject: { id: 's2', label: 'Thể dục' }, class: { id: 'c9', label: '10A' }, weeklyPeriods: 2 },
    ],
    constraints: [{ type: 'required', text: 'Môn Thể dục chỉ học thứ 3 hoặc thứ 5' }],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);
  const daySpecs = specs.filter((s) => s.kind === 'subject_allowed_days');
  assert.ok(daySpecs.length >= 1, 'should produce subject_allowed_days specs');
  const allowedDays = daySpecs[0].params.days as string[];
  assert.ok(allowedDays.includes('tuesday'), 'should include tuesday (thứ 3)');
  assert.ok(allowedDays.includes('thursday'), 'should include thursday (thứ 5)');
  assert.equal(allowedDays.length, 2, 'should have exactly 2 allowed days');
});

test('rule parser: Hiếu không dạy thứ 4 và thứ 6 → 2 teacher_block_day specs', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    days: [
      { id: 'monday', label: 'Thứ 2' },
      { id: 'tuesday', label: 'Thứ 3' },
      { id: 'wednesday', label: 'Thứ 4' },
      { id: 'thursday', label: 'Thứ 5' },
      { id: 'friday', label: 'Thứ 6' },
    ],
    assignments: [
      { id: 'asg_h', teacher: { id: 'tH', label: 'Hiếu' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 4 },
    ],
    constraints: [{ type: 'required', text: 'Hiếu không dạy thứ 4 và thứ 6' }],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);
  const blockSpecs = specs.filter((s) => s.kind === 'teacher_block_day' && s.params.teacher === 'Hiếu');
  assert.ok(blockSpecs.length >= 2, `should produce >=2 teacher_block_day specs, got ${blockSpecs.length}`);
  const blockedDays = blockSpecs.map((s) => s.params.day as string).sort();
  assert.ok(blockedDays.includes('wednesday'), 'should include wednesday (thứ 4)');
  assert.ok(blockedDays.includes('friday'), 'should include friday (thứ 6)');
});

