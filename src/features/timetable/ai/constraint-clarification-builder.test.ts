/**
 * constraint-clarification-builder.test.ts — M5 UI Clarification Contract
 *
 * Per Plan_v2.md M5 acceptance criteria:
 * - All clarification text is Vietnamese
 * - No backend enum appears in UI text (labelVi)
 * - Every clarification question has concrete options
 * - Selecting an option produces a deterministic ConstraintSpec/IR
 * - Tests cover copy for ambiguous direction, entity, period, subject scope
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRequireVsOnlyQuestion,
  buildMissingEntityQuestion,
  buildAmbiguousEntityQuestion,
  buildSubjectScopeQuestion,
} from './constraint-clarification-builder';
import { REASON_CODE_LABEL_VI } from './constraint-clarification-types';

// ─── buildRequireVsOnlyQuestion ────────────────────────────────────────
test('M5: require-vs-only question is in Vietnamese and has 2 options', () => {
  const q = buildRequireVsOnlyQuestion('Thủy', 4);
  assert.ok(q.questionVi.includes('Thủy'), 'questionVi must mention teacher');
  assert.ok(q.questionVi.includes('tiết 4'), 'questionVi must mention period');
  assert.equal(q.options.length, 2);
  assert.equal(q.allowFreeText, true);
  assert.equal(q.reasonCode, 'ambiguous_direction');
});

test('M5: require-vs-only option labelVi never leaks backend enum', () => {
  const q = buildRequireVsOnlyQuestion('Thủy', 4);
  for (const opt of q.options) {
    assert.doesNotMatch(opt.labelVi, /teacher_required_period/);
    assert.doesNotMatch(opt.labelVi, /teacher_allowed_periods/);
    assert.doesNotMatch(opt.labelVi, /ConstraintIR/);
    assert.doesNotMatch(opt.labelVi, /\bexpr\b/);
  }
});

test('M5: require-vs-only option carries specDraft (deterministic commit)', () => {
  const q = buildRequireVsOnlyQuestion('Thủy', 4);
  const requireOpt = q.options.find((o) => o.id === 'require_at_least');
  const onlyOpt = q.options.find((o) => o.id === 'only_allowed');
  assert.ok(requireOpt?.specDraft, 'require option must carry specDraft');
  assert.ok(onlyOpt?.specDraft, 'only option must carry specDraft');
  assert.equal(requireOpt!.specDraft!.kind, 'teacher_required_period');
  assert.equal(onlyOpt!.specDraft!.kind, 'teacher_allowed_periods');
});

test('M5: require-vs-only question with class label includes class', () => {
  const q = buildRequireVsOnlyQuestion('Thủy', 4, '6A');
  assert.ok(q.questionVi.includes('6A'));
});

// ─── buildMissingEntityQuestion ────────────────────────────────────────
test('M5: missing teacher question lists known teachers as options', () => {
  const q = buildMissingEntityQuestion('teacher', ['Sơn', 'Thủy', 'Hương']);
  assert.equal(q.options.length, 3);
  assert.equal(q.reasonCode, 'missing_entity');
  assert.ok(q.questionVi.includes('giáo viên'));
});

test('M5: missing teacher question with empty list still has placeholder', () => {
  const q = buildMissingEntityQuestion('teacher', []);
  assert.ok(q.options.length >= 1);
  assert.match(q.options[0].labelVi, /chưa có giáo viên/iu);
});

test('M5: missing class question uses correct label', () => {
  const q = buildMissingEntityQuestion('class', ['6A', '6B']);
  assert.ok(q.questionVi.includes('lớp'));
});

test('M5: missing subject question uses correct label', () => {
  const q = buildMissingEntityQuestion('subject', ['Toán', 'Văn']);
  assert.ok(q.questionVi.includes('môn học'));
});

// ─── buildAmbiguousEntityQuestion ──────────────────────────────────────
test('M5: ambiguous teacher question lists candidates', () => {
  const q = buildAmbiguousEntityQuestion('teacher', 'Thủy', ['Nguyễn Thị Thủy', 'Trần Thị Thủy']);
  assert.equal(q.options.length, 2);
  assert.equal(q.reasonCode, 'ambiguous_entity');
  assert.ok(q.questionVi.includes('Thủy'));
  assert.ok(q.questionVi.includes('nhiều'));
});

test('M5: ambiguous teacher question caps candidates at 6', () => {
  const many = Array.from({ length: 20 }, (_, i) => `Teacher ${i}`);
  const q = buildAmbiguousEntityQuestion('teacher', 'X', many);
  assert.ok(q.options.length <= 6);
});

// ─── buildSubjectScopeQuestion ─────────────────────────────────────────
test('M5: subject scope question enumerates 3 options', () => {
  const q = buildSubjectScopeQuestion('Toán', 4);
  assert.equal(q.options.length, 3);
  assert.equal(q.reasonCode, 'missing_scope');
  assert.ok(q.questionVi.includes('Toán'));
  assert.ok(q.questionVi.includes('phạm vi'));
});

test('M5: subject scope option labels never leak backend enum', () => {
  const q = buildSubjectScopeQuestion('Toán', 4);
  for (const opt of q.options) {
    assert.doesNotMatch(opt.labelVi, /subject_required_period/);
    assert.doesNotMatch(opt.labelVi, /subject_preferred_periods/);
  }
});

test('M5: subject scope per_class option carries specDraft', () => {
  const q = buildSubjectScopeQuestion('Toán', 4);
  const perClass = q.options.find((o) => o.id === 'per_class');
  assert.ok(perClass?.specDraft);
  assert.equal(perClass!.specDraft!.kind, 'subject_required_period');
});

test('M5: subject scope preference option is soft severity', () => {
  const q = buildSubjectScopeQuestion('Toán', 4);
  const pref = q.options.find((o) => o.id === 'just_preference');
  assert.ok(pref?.specDraft);
  assert.equal(pref!.specDraft!.severity, 'soft');
});

// ─── REASON_CODE_LABEL_VI ──────────────────────────────────────────────
test('M5: REASON_CODE_LABEL_VI is all Vietnamese', () => {
  for (const [_key, label] of Object.entries(REASON_CODE_LABEL_VI)) {
    assert.ok(label.length > 0);
    // Sanity: should contain Vietnamese letters (đ, ư, ơ, etc. or accents)
    assert.ok(/[a-zA-ZÀ-ỹ\s]+/u.test(label), `${label} should contain letters`);
  }
});

// ─── Backend enum leakage audit ────────────────────────────────────────
test('M5: NO backend enum leaks in any M5 question or option label', () => {
  const questions = [
    buildRequireVsOnlyQuestion('Thủy', 4),
    buildRequireVsOnlyQuestion('Thủy', 4, '6A'),
    buildMissingEntityQuestion('teacher', ['Sơn']),
    buildMissingEntityQuestion('class', ['6A']),
    buildMissingEntityQuestion('subject', ['Toán']),
    buildAmbiguousEntityQuestion('teacher', 'Thủy', ['A', 'B']),
    buildSubjectScopeQuestion('Toán', 4),
  ];
  for (const q of questions) {
    // questionVi must not contain kind names
    assert.doesNotMatch(q.questionVi, /teacher_block_period|teacher_required_period|teacher_allowed_periods|class_required_period|class_block_period|subject_required_period|subject_preferred_periods/);
    // option labelVi must not contain kind names
    for (const opt of q.options) {
      assert.doesNotMatch(opt.labelVi, /teacher_block_period|teacher_required_period|teacher_allowed_periods|class_required_period|class_block_period|subject_required_period|subject_preferred_periods/);
      assert.doesNotMatch(opt.labelVi, /\bIR\b|ConstraintIR|constraint_ir/);
      assert.doesNotMatch(opt.labelVi, /\bDSL\b|custom_dsl/);
    }
  }
});
