import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUILT_IN_SUGGESTION_THRESHOLD,
  suggestBuiltInConstraint,
  type BuiltInSuggestionInput,
} from './built-in-suggestion';

const baseInput: Omit<BuiltInSuggestionInput, 'userText' | 'teachers'> = {
  subjects: ['Toán', 'Văn'],
  classes: ['6A'],
  assignments: [],
  days: [
    { id: 'monday', label: 'Thứ 2' },
    { id: 'tuesday', label: 'Thứ 3' },
    { id: 'wednesday', label: 'Thứ 4' },
    { id: 'thursday', label: 'Thứ 5' },
    { id: 'friday', label: 'Thứ 6' },
  ],
};

test('suggestBuiltInConstraint maps simple teacher day block with high confidence', () => {
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: 'Thầy Sơn không dạy thứ 2',
    teachers: ['Sơn', 'Hạnh'],
  });

  assert.equal(suggestion.decision, 'suggest_built_in');
  assert.equal(suggestion.kind, 'teacher_block_day');
  assert.equal(suggestion.scope, 'teacher');
  assert.ok(suggestion.confidence >= BUILT_IN_SUGGESTION_THRESHOLD);
  assert.deepEqual(suggestion.paramsDraft, { teacher: 'Sơn', day: 'monday' });
});

test('suggestBuiltInConstraint supports diacritic-insensitive teacher matching', () => {
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: 'Co Thuy khong day tiet 1',
    teachers: ['Thúy', 'Hạnh'],
  });

  assert.equal(suggestion.decision, 'suggest_built_in');
  assert.equal(suggestion.kind, 'teacher_block_period');
  assert.deepEqual(suggestion.paramsDraft, { teacher: 'Thúy', period: 1 });
});

test('suggestBuiltInConstraint returns custom for ambiguous teacher mentions', () => {
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: 'Lan không dạy thứ 2',
    teachers: ['Lan Anh', 'Lan An'],
  });

  assert.equal(suggestion.decision, 'use_custom');
  assert.match(suggestion.reason, /mơ hồ/u);
});

test('suggestBuiltInConstraint never forces complex if-then into a built-in', () => {
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: 'Nếu cô Thúy dạy thứ 4 tiết 1 thì cô Hạnh không dạy thứ 5 tiết 2',
    teachers: ['Thúy', 'Hạnh'],
  });

  assert.equal(suggestion.decision, 'use_custom');
  assert.match(suggestion.reason, /Custom/u);
});

test('suggestBuiltInConstraint returns custom when confidence is below gate', () => {
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: 'Sơn nên có lịch đẹp hơn',
    teachers: ['Sơn'],
  });

  assert.equal(suggestion.decision, 'use_custom');
  assert.ok(suggestion.confidence < BUILT_IN_SUGGESTION_THRESHOLD);
});

test('suggestBuiltInConstraint maps teacher daily max periods', () => {
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: 'Sơn dạy tối đa 4 tiết mỗi ngày',
    teachers: ['Sơn'],
  });

  assert.equal(suggestion.decision, 'suggest_built_in');
  assert.equal(suggestion.kind, 'teacher_max_per_day');
  assert.deepEqual(suggestion.paramsDraft, { teacher: 'Sơn', maxPerDay: 4 });
});

test('suggestBuiltInConstraint maps subject banned exact consecutive run to max consecutive', () => {
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: 'Môn Văn không được 3 tiết liên tiếp',
    teachers: ['Sơn'],
  });

  assert.equal(suggestion.decision, 'suggest_built_in');
  assert.equal(suggestion.kind, 'subject_max_consecutive');
  assert.equal(suggestion.scope, 'subject');
  assert.deepEqual(suggestion.paramsDraft, { subject: 'Văn', max: 2, maxConsecutive: 2 });
});

test('suggestBuiltInConstraint maps heavy subject limit phrase to max consecutive without decrement', () => {
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: 'Các môn nặng như Toán không xếp vào 2 tiết liên tiếp trong cùng 1 buổi cho 1 lớp.',
    teachers: ['Sơn'],
  });

  assert.equal(suggestion.decision, 'suggest_built_in');
  assert.equal(suggestion.kind, 'subject_max_consecutive');
  assert.equal(suggestion.scope, 'subject');
  assert.deepEqual(suggestion.paramsDraft, { subject: 'Toán', max: 2, maxConsecutive: 2 });
});

test('suggestBuiltInConstraint maps multiple heavy subjects to multiple specs', () => {
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: 'Các môn nặng như Toán, Văn không xếp vào 2 tiết liên tiếp trong cùng 1 buổi cho 1 lớp.',
    teachers: ['Sơn'],
  });

  assert.equal(suggestion.decision, 'suggest_built_in');
  assert.equal(suggestion.kind, 'subject_max_consecutive');
  assert.deepEqual(suggestion.paramsDraft, { subject: 'Toán', max: 2, maxConsecutive: 2 });
  assert.deepEqual(suggestion.specsDraft, [
    { kind: 'subject_max_consecutive', paramsDraft: { subject: 'Toán', max: 2, maxConsecutive: 2 } },
    { kind: 'subject_max_consecutive', paramsDraft: { subject: 'Văn', max: 2, maxConsecutive: 2 } },
  ]);
});

test('suggestBuiltInConstraint maps class period block', () => {
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: 'Lớp 6A không học tiết 5',
    teachers: ['Sơn'],
  });

  assert.equal(suggestion.decision, 'suggest_built_in');
  assert.equal(suggestion.kind, 'class_block_period');
  assert.deepEqual(suggestion.paramsDraft, { class: '6A', period: 5 });
});

// ==================== M2: REQUIRE-FAMILY TESTS ====================
// These tests prove "phải có" → require, NOT block
// and "không dạy" → block, NOT require

test('M2: teacher require period - "phải có" maps to teacher_required_period', () => {
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: 'Cô Thúy phải có tiết 4',
    teachers: ['Thúy', 'Hạnh'],
  });

  assert.equal(suggestion.decision, 'suggest_built_in');
  assert.equal(suggestion.kind, 'teacher_required_period');
  assert.equal(suggestion.scope, 'teacher');
  assert.ok(suggestion.confidence >= 0.95, `Expected confidence >= 0.95, got ${suggestion.confidence}`);
  assert.deepEqual(suggestion.paramsDraft, { teacher: 'Thúy', period: 4, minCount: 1 });
  assert.equal(suggestion.missingParams.length, 0);
});

test('M2: teacher require period - "cần có" maps to teacher_required_period', () => {
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: 'Cô Thúy cần có tiết 4',
    teachers: ['Thúy'],
  });

  assert.equal(suggestion.decision, 'suggest_built_in');
  assert.equal(suggestion.kind, 'teacher_required_period');
  assert.deepEqual(suggestion.paramsDraft, { teacher: 'Thúy', period: 4, minCount: 1 });
});

test('M2: teacher require period - "ít nhất" extracts minCount', () => {
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: 'Thúy phải có ít nhất 2 tiết 4 trong tuần',
    teachers: ['Thúy'],
  });

  assert.equal(suggestion.decision, 'suggest_built_in');
  assert.equal(suggestion.kind, 'teacher_required_period');
  assert.deepEqual(suggestion.paramsDraft, { teacher: 'Thúy', period: 4, minCount: 2 });
});

test('M2: teacher require period - "bắt buộc" maps to teacher_required_period', () => {
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: 'Bắt buộc cô Thúy có tiết 4',
    teachers: ['Thúy'],
  });

  assert.equal(suggestion.decision, 'suggest_built_in');
  assert.equal(suggestion.kind, 'teacher_required_period');
  assert.deepEqual(suggestion.paramsDraft, { teacher: 'Thúy', period: 4, minCount: 1 });
});

test('M2: teacher require period - "phải được xếp" maps to teacher_required_period', () => {
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: 'Cô Thúy phải được xếp ít nhất một tiết 4',
    teachers: ['Thúy'],
  });

  assert.equal(suggestion.decision, 'suggest_built_in');
  assert.equal(suggestion.kind, 'teacher_required_period');
  assert.deepEqual(suggestion.paramsDraft, { teacher: 'Thúy', period: 4, minCount: 1 });
});

test('M2: class require period - "phải có" maps to class_required_period', () => {
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: 'Lớp 6A phải có tiết 1',
    teachers: ['Sơn'],
  });

  assert.equal(suggestion.decision, 'suggest_built_in');
  assert.equal(suggestion.kind, 'class_required_period');
  assert.equal(suggestion.scope, 'class');
  assert.ok(suggestion.confidence >= 0.95);
  assert.deepEqual(suggestion.paramsDraft, { class: '6A', period: 1, minCount: 1 });
});

test('M2: class require period - "cần có ít nhất" extracts minCount', () => {
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: '6A cần có ít nhất 2 tiết 5 trong tuần',
    teachers: ['Sơn'],
  });

  assert.equal(suggestion.decision, 'suggest_built_in');
  assert.equal(suggestion.kind, 'class_required_period');
  assert.deepEqual(suggestion.paramsDraft, { class: '6A', period: 5, minCount: 2 });
});

test('M2: NO SEMANTIC FLIP - "không dạy" still maps to teacher_block_period', () => {
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: 'Cô Thúy không dạy tiết 4',
    teachers: ['Thúy'],
  });

  assert.equal(suggestion.decision, 'suggest_built_in');
  assert.equal(suggestion.kind, 'teacher_block_period');
  assert.notEqual(suggestion.kind, 'teacher_required_period', 'SEMANTIC FLIP: "không dạy" incorrectly mapped to require');
  assert.deepEqual(suggestion.paramsDraft, { teacher: 'Thúy', period: 4 });
});

test('M2: NO SEMANTIC FLIP - "chỉ dạy" still maps to teacher_allowed_periods, not require', () => {
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: 'Cô Thúy chỉ dạy tiết 1 tiết 2 tiết 3',
    teachers: ['Thúy'],
  });

  assert.equal(suggestion.decision, 'suggest_built_in');
  assert.equal(suggestion.kind, 'teacher_allowed_periods');
  assert.notEqual(suggestion.kind, 'teacher_required_period', 'SEMANTIC FLIP: "chỉ dạy" incorrectly mapped to require');
  assert.deepEqual(suggestion.paramsDraft, { teacher: 'Thúy', periods: [1, 2, 3] });
});

test('M2: subject require period - needs class context or clarification', () => {
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: 'Môn Toán phải có tiết 4',
    teachers: ['Sơn'],
  });

  // Per M2 spec: subject-only requires clarification (global vs per-class semantics)
  assert.equal(suggestion.decision, 'use_custom');
  assert.match(suggestion.reason, /làm rõ/u);
});

test('M2: require branch runs BEFORE block - no "phải có" → block leak', () => {
  // This is a regression test for the original bug
  // Before M2: "phải có" could leak to block detection
  // After M2: require branch catches it first
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: 'Cô Thúy phải có tiết 4',
    teachers: ['Thúy'],
  });

  assert.equal(suggestion.kind, 'teacher_required_period');
  assert.notEqual(suggestion.kind, 'teacher_block_period', 'BUG: require statement leaked to block branch');
});

test('M2: require defaults minCount to 1 when not specified', () => {
  const suggestion = suggestBuiltInConstraint({
    ...baseInput,
    userText: 'Cô Thúy phải có tiết 4',
    teachers: ['Thúy'],
  });

  assert.equal(suggestion.decision, 'suggest_built_in');
  assert.equal(suggestion.paramsDraft.minCount, 1);
});
// ==================== END M2 TESTS ====================
