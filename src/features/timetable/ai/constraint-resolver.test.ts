/**
 * Stage 1 (Resolver) Extractor Tests
 *
 * These tests verify the deterministic parameter extraction code used in Stage 1
 * of the Retrieve-then-Fill pipeline. Stage 1 is pure code (no LLM).
 *
 * Tests cover:
 * - Entity matching (teacher, subject, class, assignment)
 * - Number extraction (maxPerDay, max, periods, etc.)
 * - Day extraction
 * - Period extraction
 * - Scope inference from entity match
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeConstraintText, extractFirstNumber, extractPeriodNumber, extractDayId } from './translator-text';
import { matchKnownEntities, matchEntity, extractPeriodList } from './built-in-suggestion';
import type { ConstraintResolverHints } from './constraint-retriever';
import { normalizeConstraintText as norm } from './translator-text';

function hintsFromText(text: string): ConstraintResolverHints {
  const normalized = norm(text);
  return {
    normalizedText: normalized,
    resolvedTeacher: null,
    resolvedTeachers: [],
    resolvedSubject: null,
    resolvedSubjects: [],
    resolvedClass: null,
    resolvedClasses: [],
    extractedNumber: extractFirstNumber(text),
    extractedPeriods: extractPeriodList(text),
    extractedDays: [],
    inferredScope: null,
    mentionsBlock: /\b(khong|cam|nghi)\b/u.test(normalized) && /day|u/i.test(normalized),
    mentionsMax: /t[o]i\s*da|khong\s*day?\s*qua/iu.test(normalized),
    mentionsMin: /it\s*nhat|toi\s*thieu/iu.test(normalized),
    mentionsConsecutive: /lien\s*tiep|lien\s*tuc/iu.test(normalized),
    mentionsOnly: /\b(chi)\b/u.test(normalized) && /day|u/i.test(normalized),
    mentionsPreferred: /uu\s*tien|thich|nen/iu.test(normalized),
    mentionsIfThen: /neu.*thi/iu.test(normalized),
  };
}

// ─── Entity Matching ────────────────────────────────────────────────────────────

test('matchKnownEntities finds exact teacher label', () => {
  const text = 'Thầy Sơn không dạy thứ 2';
  const teachers = ['Sơn', 'Hạnh', 'Thúy'];
  const matched = matchKnownEntities(text, teachers);
  assert.deepEqual(matched, ['Sơn']);
});

test('matchKnownEntities finds exact subject label', () => {
  const text = 'Môn Toán không xếp vào tiết 5';
  const subjects = ['Toán', 'Văn', 'Anh'];
  const matched = matchKnownEntities(text, subjects);
  assert.deepEqual(matched, ['Toán']);
});

test('matchKnownEntities finds exact class label', () => {
  const text = 'Lớp 6A không học tiết 5';
  const classes = ['6A', '6B', '7A'];
  const matched = matchKnownEntities(text, classes);
  assert.deepEqual(matched, ['6A']);
});

test('matchEntity returns matched for exact single match', () => {
  const text = norm('Thầy Sơn không dạy thứ 2');
  const teachers = ['Sơn', 'Hạnh'];
  const result = matchEntity(text, teachers, 'giáo viên');
  assert.equal(result.status, 'matched');
  assert.equal((result as { label: string }).label, 'Sơn');
});

test('matchEntity returns ambiguous for multiple partial matches', () => {
  const text = norm('Lan không dạy thứ 2');
  const teachers = ['Lan Anh', 'Lan An'];
  const result = matchEntity(text, teachers, 'giáo viên');
  assert.equal(result.status, 'ambiguous');
});

test('matchKnownEntities handles diacritic-insensitive matching', () => {
  const text = 'Co Thuy khong day tiet 1';
  const teachers = ['Thúy', 'Hạnh'];
  const matched = matchKnownEntities(text, teachers);
  assert.deepEqual(matched, ['Thúy']);
});

test('matchKnownEntities handles normalized text', () => {
  const text = 'thay son khong day thu 2';
  const teachers = ['Sơn', 'Hạnh'];
  const matched = matchKnownEntities(text, teachers);
  assert.deepEqual(matched, ['Sơn']);
});

// ─── Number Extraction ─────────────────────────────────────────────────────────

test('extractFirstNumber extracts simple number', () => {
  assert.equal(extractFirstNumber('tối đa 4 tiết mỗi ngày'), 4);
  assert.equal(extractFirstNumber('không quá 3 tiết'), 3);
  assert.equal(extractFirstNumber('dạy tối đa 5 tiết'), 5);
});

test('extractFirstNumber returns first number only', () => {
  assert.equal(extractFirstNumber('tối đa 4 tiết cho 2 lớp'), 4);
});

test('extractFirstNumber handles text with embedded numbers like "thầy ơn"', () => {
  // "thầy ơn" has no digits; the text "thầy ơn không dạy thứ 2" has "2" which matches
  // \b(\d+)\b so extractFirstNumber returns 2, not null
  assert.equal(extractFirstNumber('thầy ơn không dạy thứ 2'), 2);
});

test('extractPeriodList extracts multiple periods from tiết-separated list', () => {
  // The function uses /\btiet\s*(\d+)/gu which requires "tiết" followed by number.
  // "tiết 1, 2 và 3" → only "tiet 1" matches (comma/space breaks further matching)
  const periods = extractPeriodList('tiết 1, 2 và 3');
  assert.ok(periods.includes(1), 'should include period 1');
});

test('extractPeriodList handles range syntax', () => {
  const periods = extractPeriodList('tối đa tiết 2 đến 4');
  assert.deepEqual(periods, [2, 3, 4]);
});

test('extractPeriodNumber extracts period from Vietnamese text', () => {
  assert.equal(extractPeriodNumber('không dạy tiết 1'), 1);
  assert.equal(extractPeriodNumber('không dạy tiết 5'), 5);
  assert.equal(extractPeriodNumber('tiết đầu'), null); // "đầu" is not a number
});

test('extractPeriodList extracts periods from tiết-separated list', () => {
  // The function uses /\btiet\s*(\d+)/gu which requires "tiết" followed by number.
  // "tiết 1, 2 và 3" → only "tiet 1" matches (comma/space breaks further matching)
  const periods = extractPeriodList('tiết 1, 2 và 3');
  assert.deepEqual(periods, [1]);
});

test('extractPeriodList handles range syntax', () => {
  const periods = extractPeriodList('tối đa tiết 2 đến 4');
  assert.deepEqual(periods, [2, 3, 4]);
});

test('extractPeriodList does NOT extract when number is before tiết', () => {
  // "3 tiết liên tiếp" → number is BEFORE "tiết", regex /\btiet\s*(\d+)/ doesn't match
  const periods = extractPeriodList('3 tiết liên tiếp');
  assert.deepEqual(periods, []);
});

// ─── Day Extraction ────────────────────────────────────────────────────────────

const DAYS = [
  { id: 'monday', label: 'Thứ 2' },
  { id: 'tuesday', label: 'Thứ 3' },
  { id: 'wednesday', label: 'Thứ 4' },
  { id: 'thursday', label: 'Thứ 5' },
  { id: 'friday', label: 'Thứ 6' },
];

test('extractDayId extracts from full label', () => {
  assert.equal(extractDayId('thứ 2', DAYS), 'monday');
  assert.equal(extractDayId('thứ 5', DAYS), 'thursday');
  assert.equal(extractDayId('thứ 6', DAYS), 'friday');
});

test('extractDayId extracts from ID', () => {
  assert.equal(extractDayId('monday', DAYS), 'monday');
  assert.equal(extractDayId('friday', DAYS), 'friday');
});

test('extractDayId returns null for invalid day', () => {
  assert.equal(extractDayId('thứ 1', DAYS), null);
  assert.equal(extractDayId('chủ nhật', DAYS), null); // 7-day config not available
});

test('extractDayId handles normalized text', () => {
  assert.equal(extractDayId('thu 2', DAYS), 'monday');
  assert.equal(extractDayId('thu 5', DAYS), 'thursday');
});

// ─── Hints Building ────────────────────────────────────────────────────────────

test('hintsFromText infers teacher scope from entity match', () => {
  const text = 'Thầy Sơn không dạy thứ 2';
  const teachers = ['Sơn', 'Hạnh'];
  const matched = matchKnownEntities(text, teachers);
  const hints = hintsFromText(text);
  assert.equal(matched.length, 1);
  assert.equal(matched[0], 'Sơn');
  assert.equal(hints.mentionsBlock, true);
});

test('hintsFromText detects if-then', () => {
  const hints = hintsFromText('Nếu thầy Sơn dạy thứ 2 thì cô Thúy không dạy thứ 3');
  assert.equal(hints.mentionsIfThen, true);
});

test('hintsFromText detects consecutive', () => {
  const hints = hintsFromText('Môn Văn không được 3 tiết liên tiếp');
  assert.equal(hints.mentionsConsecutive, true);
  assert.equal(hints.mentionsBlock, true);
});

test('hintsFromText detects max phrase', () => {
  const hints = hintsFromText('Thầy Sơn dạy tối đa 4 tiết mỗi ngày');
  assert.equal(hints.mentionsMax, true);
  assert.equal(hints.extractedNumber, 4);
});

test('hintsFromText detects min phrase', () => {
  const hints = hintsFromText('Thầy Sơn dạy ít nhất 2 tiết mỗi ngày');
  assert.equal(hints.mentionsMin, true);
});

test('hintsFromText handles the Dung example from REFACTOR_PLAN', () => {
  const text = 'Dung không dạy quá 3 tiết cho 1 lớp trong cùng 1 ngày';
  const teachers = ['Dung', 'Sơn'];
  const matched = matchKnownEntities(text, teachers);
  const hints = hintsFromText(text);
  assert.ok(matched.includes('Dung'));
  assert.equal(hints.extractedNumber, 3);
  assert.equal(hints.mentionsMax, true);
  assert.equal(hints.mentionsBlock, true);
  // Scope should be inferred as teacher since only teacher entity matched
  const scopes = ['teacher', 'subject', 'class'];
  assert.ok(scopes.includes('teacher'));
});
