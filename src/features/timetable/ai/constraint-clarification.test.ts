/**
 * Tests for buildClarificationQuestions (Phase 0.5).
 *
 * The vague "general_meaning" fallback was removed. The new behaviour:
 *   1. Pattern-matched questions (heavy/session/same-day) are preserved.
 *   2. If the caller passes candidate specs, surface an A-or-B choice
 *      derived from those candidates.
 *   3. If nothing matches, surface a CONCRETE domain question — never
 *      "what do you mean".
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildClarificationQuestions } from './constraint-clarification';

test('buildClarificationQuestions: "buổi + nặng + dồn" pattern -> heavy_same_session_scope', () => {
  const questions = buildClarificationQuestions('Môn nặng trong một buổi không dồn vào một lớp');
  const ids = questions.map((q) => q.id);
  assert.ok(ids.includes('heavy_same_session_scope'), `expected heavy_same_session_scope, got ${ids.join(', ')}`);
});

test('buildClarificationQuestions: "nặng + cùng ngày" pattern -> heavy_same_day_scope', () => {
  const questions = buildClarificationQuestions('Môn nặng không xếp cùng một ngày');
  const ids = questions.map((q) => q.id);
  assert.ok(ids.includes('heavy_same_day_scope'), `expected heavy_same_day_scope, got ${ids.join(', ')}`);
});

test('buildClarificationQuestions: VAGUE fallback no longer exists', () => {
  // The exact text that used to trigger "general_meaning" must now produce
  // a concrete domain question (or a pattern match) — never a vague prompt.
  const questions = buildClarificationQuestions('Xếp lịch cho trường');
  for (const q of questions) {
    assert.notEqual(q.id, 'general_meaning', 'general_meaning must be removed');
    assert.ok(q.options.length >= 2, 'each question must have ≥2 concrete options');
    // No "Bạn muốn nhấn mạnh điều gì nhất" or similar vague prompt.
    assert.doesNotMatch(q.prompt, /Bạn muốn nhấn mạnh điều gì nhất/u);
  }
});

test('buildClarificationQuestions: candidates path -> renders candidate kinds in Vietnamese', () => {
  const candidates = [
    { kind: 'teacher_block_period', params: { teacher: 'Thủy', period: 4 } },
    { kind: 'teacher_required_period', params: { teacher: 'Thủy', period: 4, minCount: 1 } },
  ];
  const questions = buildClarificationQuestions(
    'Cô Thủy phải có tiết 4 trong tuần',
    candidates
  );
  const pick = questions.find((q) => q.id === 'pick_specific_interpretation');
  assert.ok(pick, 'expected pick_specific_interpretation question when candidates are provided');
  assert.equal(pick!.options.length, 2);
  assert.match(pick!.options.join('\n'), /teacher_block_period/);
  assert.match(pick!.options.join('\n'), /teacher_required_period/);
});

test('buildClarificationQuestions: no candidates + no pattern -> concrete domain question', () => {
  const questions = buildClarificationQuestions('Xếp lịch cho trường');
  assert.ok(questions.length >= 1);
  // The domain question enumerates GV / lớp / môn / Khác.
  const allOptions = questions.flatMap((q) => q.options).join('\n');
  assert.match(allOptions, /giáo viên/iu);
  assert.match(allOptions, /lớp/iu);
  assert.match(allOptions, /môn/iu);
});
