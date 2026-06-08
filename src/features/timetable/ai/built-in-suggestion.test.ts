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
