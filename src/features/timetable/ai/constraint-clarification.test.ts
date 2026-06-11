/**
 * Tests for buildClarificationQuestions (suggest-first clarification).
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
  const questions = buildClarificationQuestions('Xếp lịch cho trường');
  for (const q of questions) {
    assert.notEqual(q.id, 'general_meaning', 'general_meaning must be removed');
    assert.ok(q.options.length >= 2, 'each question must have ≥2 concrete options');
    assert.doesNotMatch(q.prompt, /Bạn muốn nhấn mạnh điều gì nhất/u);
  }
});

test('buildClarificationQuestions: candidates path -> humanized labels without jargon', () => {
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
  assert.equal(pick!.options.filter((o) => o.id !== 'none_fit').length, 2);
  const labels = pick!.options.map((o) => o.labelVi).join('\n');
  assert.doesNotMatch(labels, /teacher_block_period|teacher_required_period|kind/u);
  assert.match(labels, /Thủy/u);
});

test('buildClarificationQuestions: if_then + một người -> at_least_one_vs_both with recommended option', () => {
  const questions = buildClarificationQuestions(
    'Nếu Hiếu và Thúy dạy cùng ngày thì một người không được dạy tiết 4'
  );
  const pick = questions.find((q) => q.id === 'at_least_one_vs_both');
  assert.ok(pick, 'expected at_least_one_vs_both question');
  assert.equal(pick!.options.filter((o) => o.id !== 'none_fit').length, 3);
  assert.match(pick!.prompt, /một người/u);
  assert.doesNotMatch(pick!.prompt, /Nếu Hiếu và Thúy/u);
  const recommended = pick!.options.find((o) => o.recommended);
  assert.ok(recommended, 'expected one recommended option');
  assert.ok(recommended!.exampleVi, 'recommended option should include exampleVi');
});

test('buildClarificationQuestions: near-match teacher name -> suggestion question', () => {
  const questions = buildClarificationQuestions(
    'Nếu Hiếu và Thúy dạy cùng ngày thì một người không được dạy tiết 4',
    undefined,
    { teachers: ['Hiếu', 'Thủy'] }
  );
  const nameQuestion = questions.find((q) => q.id.startsWith('near_match_teacher_'));
  assert.ok(nameQuestion, 'expected near-match teacher suggestion');
  assert.match(nameQuestion!.prompt, /Thúy/u);
  assert.match(nameQuestion!.prompt, /Thủy/u);
  const recommended = nameQuestion!.options.find((o) => o.recommended);
  assert.ok(recommended, 'near-match should recommend the closest name');
});

test('buildClarificationQuestions: no candidates + no pattern -> concrete domain question', () => {
  const questions = buildClarificationQuestions('Xếp lịch cho trường');
  assert.ok(questions.length >= 1);
  const allOptions = questions.flatMap((q) => q.options).map((o) => o.labelVi).join('\n');
  assert.match(allOptions, /giáo viên/iu);
  assert.match(allOptions, /lớp/iu);
  assert.match(allOptions, /môn/iu);
});

test('buildClarificationQuestions: every question has escape option and allowFreeText', () => {
  const questions = buildClarificationQuestions(
    'Nếu Hiếu và Thúy dạy cùng ngày thì một người không được dạy tiết 4',
    undefined,
    { teachers: ['Hiếu', 'Thủy'] }
  );
  for (const question of questions) {
    assert.equal(question.allowFreeText, true);
    assert.ok(question.options.some((o) => o.id === 'none_fit'));
  }
});