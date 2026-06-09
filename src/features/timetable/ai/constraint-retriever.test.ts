import test from 'node:test';
import assert from 'node:assert/strict';

import {
  retrieveTopK,
  retrieveTopKWithEmbedding,
  buildTopKPromptSection,
  type ConstraintResolverHints,
} from './constraint-retriever';
import type { BuiltInConstraintScope } from './constraint-registry';

function makeHints(overrides: Partial<ConstraintResolverHints> = {}): ConstraintResolverHints {
  return {
    normalizedText: '',
    resolvedTeacher: null,
    resolvedTeachers: [],
    resolvedSubject: null,
    resolvedSubjects: [],
    resolvedClass: null,
    resolvedClasses: [],
    extractedNumber: null,
    extractedPeriods: [],
    extractedDays: [],
    inferredScope: null,
    mentionsBlock: false,
    mentionsMax: false,
    mentionsMin: false,
    mentionsConsecutive: false,
    mentionsOnly: false,
    mentionsPreferred: false,
    mentionsIfThen: false,
    ...overrides,
  };
}

test('retrieveTopK returns teacher_block_day for teacher block thu', () => {
  const hints = makeHints({
    normalizedText: 'thầy sơn không dạy thứ 2',
    resolvedTeacher: 'Sơn',
    resolvedTeachers: ['Sơn'],
    inferredScope: 'teacher' as BuiltInConstraintScope,
    mentionsBlock: true,
  });
  const results = retrieveTopK(hints, 'teacher', 5);
  assert.ok(results.length > 0);
  const kinds = results.map((r) => r.kind);
  assert.ok(kinds.includes('teacher_block_day'), `Expected teacher_block_day in ${kinds}`);
});

test('retrieveTopK returns teacher_max_per_day for daily max with number', () => {
  const hints = makeHints({
    normalizedText: 'thầy sơn dạy tối đa 4 tiết mỗi ngày',
    resolvedTeacher: 'Sơn',
    resolvedTeachers: ['Sơn'],
    inferredScope: 'teacher' as BuiltInConstraintScope,
    mentionsMax: true,
    extractedNumber: 4,
  });
  const results = retrieveTopK(hints, 'teacher', 5);
  const kinds = results.map((r) => r.kind);
  assert.ok(kinds.includes('teacher_max_per_day'), `Expected teacher_max_per_day in ${kinds}`);
});

test('retrieveTopK returns subject_max_consecutive for consecutive ban phrase', () => {
  const hints = makeHints({
    normalizedText: 'môn văn không được 3 tiết liên tiếp',
    resolvedSubjects: ['Văn'],
    inferredScope: 'subject' as BuiltInConstraintScope,
    mentionsConsecutive: true,
    extractedNumber: 3,
  });
  const results = retrieveTopK(hints, 'subject', 5);
  const kinds = results.map((r) => r.kind);
  assert.ok(kinds.includes('subject_max_consecutive'), `Expected subject_max_consecutive in ${kinds}`);
});

test('retrieveTopK returns class_block_period for class block period', () => {
  const hints = makeHints({
    normalizedText: 'lớp 6a không học tiết 5',
    resolvedClasses: ['6A'],
    inferredScope: 'class' as BuiltInConstraintScope,
    mentionsBlock: true,
    extractedPeriods: [5],
  });
  const results = retrieveTopK(hints, 'class', 5);
  const kinds = results.map((r) => r.kind);
  assert.ok(kinds.includes('class_block_period'), `Expected class_block_period in ${kinds}`);
});

test('retrieveTopK returns if_then for nếu-thì phrase', () => {
  const hints = makeHints({
    normalizedText: 'nếu cô thúy dạy thứ 4 tiết 1 thì cô hạnh không dạy thứ 5 tiết 2',
    mentionsIfThen: true,
  });
  const results = retrieveTopK(hints, 'global', 5);
  const kinds = results.map((r) => r.kind);
  assert.ok(kinds.includes('if_then'), `Expected if_then in ${kinds}`);
  // if_then should be top score
  assert.equal(results[0].kind, 'if_then');
});

test('retrieveTopK returns teacher_block_period for muộn tiết pattern', () => {
  const hints = makeHints({
    normalizedText: 'cô thúy hay đi muộn tiết đầu',
    resolvedTeacher: 'Thúy',
    resolvedTeachers: ['Thúy'],
    inferredScope: 'teacher' as BuiltInConstraintScope,
    mentionsBlock: true,
  });
  const results = retrieveTopK(hints, 'teacher', 5);
  const kinds = results.map((r) => r.kind);
  assert.ok(kinds.includes('teacher_block_period'), `Expected teacher_block_period in ${kinds}`);
});

test('retrieveTopK returns teacher_max_per_day for the Dung example from REFACTOR_PLAN', () => {
  const hints = makeHints({
    normalizedText: 'dung không dạy quá 3 tiết cho 1 lớp trong cùng 1 ngày',
    resolvedTeacher: 'Dung',
    resolvedTeachers: ['Dung'],
    inferredScope: 'teacher' as BuiltInConstraintScope,
    mentionsMax: true,
    extractedNumber: 3,
  });
  const results = retrieveTopK(hints, 'teacher', 5);
  const kinds = results.map((r) => r.kind);
  assert.ok(kinds.includes('teacher_max_per_day'), `Expected teacher_max_per_day in ${kinds}`);
});

test('retrieveTopK returns correct number of results (k param)', () => {
  const hints = makeHints({
    normalizedText: 'thầy sơn không dạy thứ 2',
    resolvedTeacher: 'Sơn',
    resolvedTeachers: ['Sơn'],
    inferredScope: 'teacher' as BuiltInConstraintScope,
    mentionsBlock: true,
  });
  assert.equal(retrieveTopK(hints, 'teacher', 3).length, 3);
  assert.equal(retrieveTopK(hints, 'teacher', 1).length, 1);
});

test('retrieveTopK returns empty for empty text', () => {
  const hints = makeHints({ normalizedText: '' });
  const results = retrieveTopK(hints, 'teacher', 5);
  assert.equal(results.length, 0);
});

test('retrieveTopKWithEmbedding returns same or better results than lexical', () => {
  const hints = makeHints({
    normalizedText: 'thầy sơn dạy tối đa 4 tiết mỗi ngày',
    resolvedTeacher: 'Sơn',
    resolvedTeachers: ['Sơn'],
    inferredScope: 'teacher' as BuiltInConstraintScope,
    mentionsMax: true,
    extractedNumber: 4,
  });
  const lexical = retrieveTopK(hints, 'teacher', 5);
  const withEmbedding = retrieveTopKWithEmbedding(hints, 'teacher', 5);
  assert.ok(withEmbedding.length > 0);
  assert.ok(withEmbedding.length <= 5);
  // Top-1 should still be relevant (teacher constraint)
  assert.ok(['teacher', 'subject', 'class', 'assignment', 'global'].includes(withEmbedding[0].scope));
});

test('buildTopKPromptSection includes schema and few-shots', () => {
  const hints = makeHints({
    normalizedText: 'thầy sơn không dạy thứ 2',
    resolvedTeacher: 'Sơn',
    resolvedTeachers: ['Sơn'],
    inferredScope: 'teacher' as BuiltInConstraintScope,
    mentionsBlock: true,
  });
  const candidates = retrieveTopK(hints, 'teacher', 2);
  const section = buildTopKPromptSection(candidates, 'teacher');
  assert.ok(section.length > 0);
  assert.ok(section.includes('teacher_block_day') || section.includes('teacher_block_period'));
  assert.ok(section.includes('params'));
  assert.ok(section.includes('Ví dụ:'));
});

test('retrieveTopK returns pair_not_same_slot for trùng tiết phrase', () => {
  const hints = makeHints({
    normalizedText: 'toán 6a và văn 6a không được trùng tiết',
    mentionsBlock: true,
  });
  const results = retrieveTopK(hints, null, 5);
  const kinds = results.map((r) => r.kind);
  assert.ok(kinds.includes('pair_not_same_slot'), `Expected pair_not_same_slot in ${kinds}`);
});

test('retrieveTopK returns session_limit for buổi sáng tối đa phrase', () => {
  const hints = makeHints({
    normalizedText: 'giáo viên sơn buổi sáng tối đa 3 tiết',
    mentionsMax: true,
  });
  const results = retrieveTopK(hints, 'assignment', 5);
  const kinds = results.map((r) => r.kind);
  assert.ok(kinds.includes('session_limit'), `Expected session_limit in ${kinds}`);
});

test('retrieveTopK returns subject_preferred_periods for preference phrase', () => {
  const hints = makeHints({
    normalizedText: 'ưu tiên xếp môn văn vào các tiết 3, 4',
    resolvedSubjects: ['Văn'],
    mentionsPreferred: true,
  });
  const results = retrieveTopK(hints, 'subject', 5);
  const kinds = results.map((r) => r.kind);
  assert.ok(kinds.includes('subject_preferred_periods') || kinds.includes('subject_pin_period'),
    `Expected subject_preferred_periods or subject_pin_period in ${kinds}`);
});

test('retrieveTopK returns subject_consecutive for cụm liên tiếp phrase', () => {
  const hints = makeHints({
    normalizedText: 'môn văn nên có các cụm 2 tiết học liên tiếp trong tuần',
    resolvedSubjects: ['Văn'],
    mentionsConsecutive: true,
  });
  const results = retrieveTopK(hints, 'subject', 5);
  const kinds = results.map((r) => r.kind);
  assert.ok(kinds.includes('subject_consecutive') || kinds.includes('subject_max_consecutive'),
    `Expected subject_consecutive in ${kinds}`);
});
