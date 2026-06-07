import test from 'node:test';
import assert from 'node:assert/strict';

import type { AgentInputPayload } from './types';
import type { ConstraintSpec } from './constraint-spec';
import {
  humanizeConstraintSpec,
  humanizeMaxConsecutiveFromBanText,
  humanizeDraft,
} from './constraint-humanizer';
import { buildDraftFromSpecs, isRoomConstraintText, validateConstraintSpecs } from './constraint-draft-validator';
import { assertSolvableConstraintState } from './constraint-preflight';
import type { ConfirmedConstraint, RawConstraintInput } from './constraint-review-types';

const baseInput: AgentInputPayload = {
  days: [{ id: 'mon', label: 'Thứ 2' }],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { mon: 5 },
  deletedPeriods: {},
  assignments: [
    {
      id: 'asg_1',
      teacher: { id: 't1', label: 'Sơn' },
      subject: { id: 's1', label: 'Toán' },
      class: { id: 'c1', label: '6A' },
      weeklyPeriods: 3,
    },
    {
      id: 'asg_2',
      teacher: { id: 't2', label: 'Lan Anh' },
      subject: { id: 's2', label: 'Văn' },
      class: { id: 'c1', label: '6A' },
      weeklyPeriods: 2,
    },
    {
      id: 'asg_3',
      teacher: { id: 't3', label: 'Lan Hương' },
      subject: { id: 's3', label: 'Anh' },
      class: { id: 'c2', label: '6B' },
      weeklyPeriods: 2,
    },
    {
      id: 'asg_4',
      teacher: { id: 't4', label: 'Hoa' },
      subject: { id: 's4', label: 'KHTN' },
      class: { id: 'c1', label: '6A' },
      weeklyPeriods: 2,
    },
  ],
  constraints: [],
};

test('humanizeMaxConsecutiveFromBanText for 3 consecutive ban', () => {
  const text = 'Không xếp 3 tiết liên tiếp cùng 1 môn cho cùng 1 lớp ở 1 thứ bất kì';
  const summary = humanizeMaxConsecutiveFromBanText(text, 2);
  assert.match(summary, /tối đa 2 tiết liên tiếp/);
  assert.match(summary, /không được có 3 tiết liên tiếp/);
});

test('humanizeConstraintSpec subject_max_consecutive', () => {
  const spec: ConstraintSpec = {
    id: 'c1',
    original: 'test',
    severity: 'hard',
    kind: 'subject_max_consecutive',
    params: { subject: 'Toán', max: 2 },
  };
  const line = humanizeConstraintSpec(spec);
  assert.match(line, /Toán/);
  assert.match(line, /tối đa 2 tiết liên tiếp/);
});

test('humanizeConstraintSpec maps monday to Thứ 2', () => {
  const line = humanizeConstraintSpec({
    id: 'c1',
    original: 'Sơn không dạy thứ 2',
    severity: 'hard',
    kind: 'teacher_block_day',
    params: { teacher: 'Sơn', day: 'monday' },
  });
  assert.match(line, /Thứ 2/);
  assert.doesNotMatch(line, /\bmonday\b/i);
});

test('humanizeConstraintSpec subject_preferred_periods in Vietnamese', () => {
  const line = humanizeConstraintSpec({
    id: 'c1',
    original: 'Toán tiết 1-2',
    severity: 'soft',
    kind: 'subject_preferred_periods',
    params: { subject: 'Toán', periods: [1, 2], weight: 5 },
    weight: 5,
  });
  assert.match(line, /Ưu tiên xếp môn Toán/);
  assert.match(line, /tiết 1, tiết 2/);
  assert.match(line, /trọng số 5/);
  assert.doesNotMatch(line, /subject_preferred/);
});

test('humanizeConstraintSpec subject_consecutive in Vietnamese', () => {
  const line = humanizeConstraintSpec({
    id: 'c1',
    original: 'Văn 2 tiết liên tiếp',
    severity: 'soft',
    kind: 'subject_consecutive',
    params: { subject: 'Văn', length: 2 },
    weight: 5,
  });
  assert.match(line, /Môn Văn/);
  assert.match(line, /2 tiết học liên tiếp/);
  assert.doesNotMatch(line, /Subject consecutive/);
});

test('Sơn teacher_block_day high confidence rule draft', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'Sơn không dạy thứ 2',
      severity: 'hard',
      kind: 'teacher_block_day',
      params: { teacher: 'Sơn', day: 'mon' },
    },
  ];
  const draft = buildDraftFromSpecs(
    'd1',
    { id: 'r1', text: 'Sơn không dạy thứ 2', type: 'required' },
    specs,
    baseInput,
    { source: 'rule', confidence: 'high' }
  );
  assert.equal(draft.status, 'parsed');
  assert.equal(draft.confidence, 'high');
});

test('Lan ambiguous when multiple teachers match', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'Lan không dạy thứ 2',
      severity: 'hard',
      kind: 'teacher_block_day',
      params: { teacher: 'Lan', day: 'mon' },
    },
  ];
  const { status, issues } = validateConstraintSpecs(baseInput, specs, { rawText: 'Lan không dạy thứ 2' });
  assert.equal(status, 'ambiguous');
  assert.ok(issues.some((i) => i.code === 'multiple_entity_matches'));
});

test('Lý unknown subject', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'Lý không học tiết cuối',
      severity: 'hard',
      kind: 'subject_not_last_period',
      params: { subject: 'Lý' },
    },
  ];
  const { status, issues } = validateConstraintSpecs(baseInput, specs);
  assert.equal(status, 'ambiguous');
  assert.ok(issues.some((i) => i.code === 'unknown_entity'));
});

test('room constraint ignored', () => {
  assert.ok(isRoomConstraintText('Phòng A không dùng thứ 2'));
  const { status, issues } = validateConstraintSpecs(baseInput, [], {
    rawText: 'Phòng A không dùng thứ 2',
  });
  assert.equal(status, 'ignored');
  assert.ok(issues.some((i) => i.code === 'room_constraint_ignored'));
});

test('hard custom_dsl unsupported', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'foo',
      severity: 'hard',
      kind: 'custom_dsl',
      params: { pythonPredicate: 'return True' },
    },
  ];
  const { status } = validateConstraintSpecs(baseInput, specs);
  assert.equal(status, 'unsupported');
});

test('preflight blocks unconfirmed hard raw', () => {
  const raw: RawConstraintInput[] = [
    { id: 'r1', text: 'Sơn không dạy thứ 2', type: 'required', createdAt: new Date().toISOString() },
  ];
  const result = assertSolvableConstraintState(raw, [], []);
  assert.equal(result.canSolve, false);
  assert.ok(result.blockReasons.includes('hard_raw_unconfirmed'));
});

test('preflight allows when hard confirmed', () => {
  const raw: RawConstraintInput[] = [
    { id: 'r1', text: 'Sơn không dạy thứ 2', type: 'required', createdAt: new Date().toISOString() },
  ];
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'Sơn không dạy thứ 2',
      severity: 'hard',
      kind: 'teacher_block_day',
      params: { teacher: 'Sơn', day: 'mon' },
    },
  ];
  const confirmed: ConfirmedConstraint[] = [
    {
      id: 'conf1',
      rawConstraintId: 'r1',
      specs,
      confirmedBy: 'user',
      confirmedAt: new Date().toISOString(),
      summary: humanizeConstraintSpec(specs[0]),
      displayText: humanizeConstraintSpec(specs[0]),
    },
  ];
  const draft = buildDraftFromSpecs('d1', { id: 'r1', text: raw[0].text, type: 'required' }, specs, baseInput, {
    source: 'rule',
    confidence: 'high',
  });
  const result = assertSolvableConstraintState(raw, [draft], confirmed);
  assert.equal(result.canSolve, true);
});

test('preflight passes confirmed hard specs that are now solver-encodable', () => {
  // After Phase 4: ALL registry kinds are solver-encodable (skeleton handles
  // them natively or macros.py expands them to IR). The preflight should NOT
  // block a confirmed hard `subject_min_days` spec anymore.
  const raw: RawConstraintInput[] = [
    { id: 'r1', text: 'Toán rải ít nhất 2 ngày', type: 'required', createdAt: new Date().toISOString() },
  ];
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: raw[0].text,
      severity: 'hard',
      kind: 'subject_min_days',
      params: { subject: 'Toán', minDays: 2 },
    },
  ];
  const confirmed: ConfirmedConstraint[] = [
    {
      id: 'conf1',
      rawConstraintId: 'r1',
      specs,
      confirmedBy: 'user',
      confirmedAt: new Date().toISOString(),
      summary: 'unsupported hard',
      displayText: 'unsupported hard',
    },
  ];

  const result = assertSolvableConstraintState(raw, [], confirmed);

  // After Phase 4 expansion, subject_min_days is encodable — no block.
  assert.equal(result.canSolve, true);
  assert.ok(!result.blockReasons.includes('hard_spec_unchecked'));
});

test('humanizeDraft empty specs', () => {
  const draft = buildDraftFromSpecs(
    'd1',
    { id: 'r1', text: 'x', type: 'preferred' },
    [],
    baseInput,
    { source: 'translator', confidence: 'low', explanation: 'mơ hồ' }
  );
  assert.match(humanizeDraft(draft), /Chưa phân tích|mơ hồ/);
});

test('preflight blocks when any constraint unconfirmed', () => {
  const raw: RawConstraintInput[] = [
    { id: 'r1', text: 'Sơn không dạy thứ 2', type: 'required', createdAt: new Date().toISOString() },
    { id: 'r2', text: 'Toán nên tiết 1-2', type: 'preferred', createdAt: new Date().toISOString() },
  ];
  const result = assertSolvableConstraintState(raw, [], []);
  assert.equal(result.canSolve, false);
  assert.ok(result.blockReasons.includes('constraint_unconfirmed'));
});

test('VAL-T1-007: humanizeConstraintSpec renders period for if_then teacher_teaches_at_slot', () => {
  const line = humanizeConstraintSpec({
    id: 'c1',
    original: 'Nếu Sơn dạy thứ 2 tiết 2 thì Dung không dạy thứ 3 tiết 1',
    severity: 'hard',
    kind: 'if_then',
    params: {
      if: { op: 'teacher_teaches_at_slot', teacher: 'Sơn', day: 'mon', period: 2 },
      then: [{ kind: 'teacher_block_slot', params: { teacher: 'Dung', day: 'tue', period: 1 } }],
    },
  });
  assert.match(line, /Thứ 2/);
  assert.match(line, /tiết 2/);
  assert.match(line, /Thứ 3/);
  assert.match(line, /tiết 1/);
  assert.doesNotMatch(line, /\(điều kiện chưa xác định\)/);
});

test('VAL-T1-007b: humanizeConstraintSpec renders period for if_then with AND-of-2-slot', () => {
  const line = humanizeConstraintSpec({
    id: 'c8',
    original: 'Nếu Sơn và Hương dạy thứ 2 tiết 2 thì Dung không dạy thứ 3 tiết 1',
    severity: 'hard',
    kind: 'if_then',
    params: {
      if: {
        op: 'and',
        args: [
          { op: 'teacher_teaches_at_slot', teacher: 'Sơn', day: 'mon', period: 2 },
          { op: 'teacher_teaches_at_slot', teacher: 'Hương', day: 'mon', period: 2 },
        ],
      },
      then: [{ kind: 'teacher_block_slot', params: { teacher: 'Dung', day: 'tue', period: 1 } }],
    },
  });
  assert.match(line, /Sơn/);
  assert.match(line, /Hương/);
  assert.match(line, /Thứ 2/);
  assert.match(line, /tiết 2/);
  assert.match(line, /Dung/);
  assert.match(line, /Thứ 3/);
  assert.match(line, /tiết 1/);
  assert.doesNotMatch(line, /\(điều kiện chưa xác định\)/);
});
