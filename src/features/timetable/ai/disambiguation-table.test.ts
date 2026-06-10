/**
 * Tests for the disambiguation table (Phase 1.5).
 *
 * The table is the SINGLE source of truth for resolving Vietnamese
 * phrase ambiguity. Every row in the table is matched by an exact
 * assertion; if a row is removed/changed, the corresponding golden
 * case or Phase 0 regression test will fail.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DISAMBIGUATION_TABLE,
  DISAMBIGUATION_TABLE_VERSION,
  findDisambiguationMatch,
  summarizeDisambiguationTable,
} from './disambiguation-table';

test('table version is exported and stable', () => {
  assert.equal(typeof DISAMBIGUATION_TABLE_VERSION, 'string');
  assert.match(DISAMBIGUATION_TABLE_VERSION, /^\d+\.\d+\.\d+$/);
});

test('table has ≥10 rows', () => {
  assert.ok(DISAMBIGUATION_TABLE.length >= 10, `expected ≥10 rows, got ${DISAMBIGUATION_TABLE.length}`);
});

test('all row ids are unique', () => {
  const ids = new Set(DISAMBIGUATION_TABLE.map((r) => r.id));
  assert.equal(ids.size, DISAMBIGUATION_TABLE.length);
});

test('summary aggregates direction counts', () => {
  const summary = summarizeDisambiguationTable();
  assert.equal(summary.version, DISAMBIGUATION_TABLE_VERSION);
  assert.equal(summary.total, DISAMBIGUATION_TABLE.length);
  const total = Object.values(summary.byDirection).reduce((a, b) => a + b, 0);
  // Each row contributes at least 1 to byDirection, often 2.
  assert.ok(total >= summary.total, 'byDirection should aggregate ≥ total');
});

test('D001: "Thủy phải có tiết 4" -> require direction (NOT block)', () => {
  const matches = findDisambiguationMatch('Cô Thủy phải có tiết 4 trong tuần');
  const d001 = matches.find((m) => m.row.id === 'D001');
  assert.ok(d001, 'D001 should match');
  assert.equal(d001!.direction, 'positive');
  assert.equal(d001!.recommendedKind, 'teacher_required_period');
  assert.equal(d001!.contradictory, false);
});

test('D001: "Thủy không dạy tiết 4" -> block direction', () => {
  const matches = findDisambiguationMatch('Cô Thủy không dạy tiết 4');
  const d001 = matches.find((m) => m.row.id === 'D001');
  assert.ok(d001, 'D001 should match');
  assert.equal(d001!.direction, 'negative');
  assert.equal(d001!.recommendedKind, 'teacher_block_period');
});

test('D001: "Thủy nên dạy tiết 4" -> soft direction', () => {
  const matches = findDisambiguationMatch('Cô Thủy nên dạy tiết 4');
  const d001 = matches.find((m) => m.row.id === 'D001');
  assert.ok(d001, 'D001 should match (soft assertion)');
  assert.equal(d001!.direction, 'soft');
  assert.equal(d001!.recommendedKind, 'teacher_preferred_periods');
});

test('D001: contradictory sentence -> contradictory=true', () => {
  // Both phải có and không dạy in the same sentence = contradictory.
  const matches = findDisambiguationMatch('Cô Thủy phải có tiết 4 nhưng không dạy tiết 5');
  const d001 = matches.find((m) => m.row.id === 'D001');
  assert.ok(d001, 'D001 should match (positive wins)');
  assert.equal(d001!.contradictory, true);
});

test('D004: "Thủy chỉ dạy tiết 4" -> only direction', () => {
  const matches = findDisambiguationMatch('Cô Thủy chỉ dạy tiết 4');
  const d004 = matches.find((m) => m.row.id === 'D004');
  assert.ok(d004, 'D004 should match');
  assert.equal(d004!.direction, 'positive');
  assert.equal(d004!.recommendedKind, 'teacher_allowed_periods');
});

test('D010/D020: class/subject require direction resolves correctly', () => {
  const classMatch = findDisambiguationMatch('Lớp 6A phải có ít nhất 1 tiết 4 trong tuần');
  const d010 = classMatch.find((m) => m.row.id === 'D010');
  assert.ok(d010, 'D010 should match');
  assert.equal(d010!.direction, 'positive');
  assert.equal(d010!.recommendedKind, 'class_required_period');

  const subjectMatch = findDisambiguationMatch('Môn Toán phải có ít nhất 2 tiết 4 trong tuần');
  const d020 = subjectMatch.find((m) => m.row.id === 'D020');
  assert.ok(d020, 'D020 should match');
  assert.equal(d020!.direction, 'positive');
  assert.equal(d020!.recommendedKind, 'subject_required_period');
});

test('Unrelated sentence returns no matches (table is conservative)', () => {
  const matches = findDisambiguationMatch('Xếp lịch cho trường');
  // The table should not match arbitrary sentences.
  // It is NOT a keyword matcher; each row has a specific phrase.
  assert.equal(matches.length, 0);
});
