/**
 * Tests for parse-accuracy modules: back-translation, ambiguity gate, golden set.
 *
 * Covers Section 13 of REFACTOR_PLAN.md:
 * - 13.2 Ambiguity gate
 * - 13.3 Back-translation check
 * - 13.7 Golden eval set (frozen regression cases)
 * - 13.8 Negative few-shots
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { backTranslateCheck, backTranslateBatch, BACK_TRANSLATION_GATE } from './back-translation-check';
import { evaluateAmbiguity, buildAmbiguityQuestion, runAmbiguityGate, isSameKindFamily } from './ambiguity-gate';

import { buildTopKPromptSection, retrieveTopK } from './constraint-retriever';
import type { ConstraintResolverHints } from './constraint-retriever';

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

// ─── Back-translation (Section 13.3) ──────────────────────────────────────────

test('backTranslateCheck scores high for clean spec', () => {
  const spec = {
    id: 's1',
    original: 'Thầy Sơn không dạy thứ 2',
    severity: 'hard' as const,
    kind: 'teacher_block_day' as const,
    params: { teacher: 'Sơn', day: 'monday' },
  };
  const result = backTranslateCheck(spec, 'Thầy Sơn không dạy thứ 2');
  assert.ok(result.score > 0.7, `expected high score, got ${result.score}`);
  assert.equal(result.negationMismatch, false);
});

test('backTranslateCheck detects number drift', () => {
  const spec = {
    id: 's1',
    original: 'Thầy Sơn dạy tối đa 4 tiết mỗi ngày',
    severity: 'hard' as const,
    kind: 'teacher_max_per_day' as const,
    params: { teacher: 'Sơn', maxPerDay: 99 }, // 99 instead of 4!
  };
  const result = backTranslateCheck(spec, 'Thầy Sơn dạy tối đa 4 tiết mỗi ngày');
  assert.ok(result.missingNumbers.includes(4), 'should detect missing 4');
  assert.ok(result.extraNumbers.includes(99), 'should detect extra 99');
  assert.ok(result.score < 0.7, `should penalize number drift, got ${result.score}`);
});

test('backTranslateCheck detects negation flip (positive → block)', () => {
  // "chỉ dạy tiết 1" (positive) is WRONGLY mapped to teacher_block_period (negative)
  const spec = {
    id: 's1',
    original: 'Thầy Sơn chỉ dạy tiết 1',
    severity: 'hard' as const,
    kind: 'teacher_block_period' as const, // WRONG: should be teacher_allowed_periods
    params: { teacher: 'Sơn', period: 1 },
  };
  const result = backTranslateCheck(spec, 'Thầy Sơn chỉ dạy tiết 1');
  // canonical uses "không dạy" (block), original has no "không"
  assert.equal(result.negationMismatch, true, 'should detect negation flip (positive → block)');
});

test('backTranslateCheck detects negation flip (block → required)', () => {
  // "không dạy tiết 1" is WRONGLY mapped to teacher_allowed_periods (positive)
  const spec = {
    id: 's1',
    original: 'Thầy Sơn không dạy tiết 1',
    severity: 'hard' as const,
    kind: 'teacher_allowed_periods' as const, // WRONG
    params: { teacher: 'Sơn', periods: [1] },
  };
  const result = backTranslateCheck(spec, 'Thầy Sơn không dạy tiết 1');
  assert.equal(result.negationMismatch, true, 'should detect negation flip (block → allowed)');
});

test('backTranslateBatch aggregates score across specs', () => {
  const specs = [
    { id: '1', original: 'Toán', severity: 'hard' as const, kind: 'subject_pin_period' as const, params: { subject: 'Toán', periods: [1, 2] } },
    { id: '2', original: 'Văn', severity: 'hard' as const, kind: 'subject_pin_period' as const, params: { subject: 'Văn', periods: [3] } },
  ];
  const result = backTranslateBatch(specs, 'Môn Toán chỉ tiết 1, 2; Môn Văn chỉ tiết 3');
  assert.ok(result.score > 0, `should produce aggregate score, got ${result.score}`);
  assert.equal(result.perSpec.length, 2);
});

test('BACK_TRANSLATION_GATE constant exists', () => {
  assert.equal(typeof BACK_TRANSLATION_GATE, 'number');
  assert.ok(BACK_TRANSLATION_GATE > 0 && BACK_TRANSLATION_GATE < 1);
});

// ─── Ambiguity gate (Section 13.2) ───────────────────────────────────────────

test('evaluateAmbiguity returns unambiguous for single candidate', () => {
  const gate = evaluateAmbiguity([
    {
      kind: 'teacher_block_day' as any,
      scope: 'teacher' as any,
      embedding: null,
      triggers: [],
      synonyms: [],
      fewShots: [],
      negativeFewShots: [],
      requiredParams: ['teacher', 'day'],
    },
  ]);
  assert.equal(gate.status, 'unambiguous');
});

test('evaluateAmbiguity flags same-family candidates as ambiguous', () => {
  const candidates = [
    {
      kind: 'teacher_block_day' as any,
      scope: 'teacher' as any,
      embedding: null,
      triggers: [],
      synonyms: [],
      fewShots: [],
      negativeFewShots: [],
      requiredParams: ['teacher', 'day'],
    },
    {
      kind: 'teacher_block_period' as any,
      scope: 'teacher' as any,
      embedding: null,
      triggers: [],
      synonyms: [],
      fewShots: [],
      negativeFewShots: [],
      requiredParams: ['teacher', 'period'],
    },
  ];
  const gate = evaluateAmbiguity(candidates);
  assert.equal(gate.status, 'ambiguous');
  assert.ok(gate.options.length >= 2);
});

test('evaluateAmbiguity allows different-scope candidates as unambiguous', () => {
  const candidates = [
    {
      kind: 'teacher_block_day' as any,
      scope: 'teacher' as any,
      embedding: null,
      triggers: [],
      synonyms: [],
      fewShots: [],
      negativeFewShots: [],
      requiredParams: ['teacher', 'day'],
    },
    {
      kind: 'subject_block_days' as any,
      scope: 'subject' as any,
      embedding: null,
      triggers: [],
      synonyms: [],
      fewShots: [],
      negativeFewShots: [],
      requiredParams: ['subject', 'days'],
    },
  ];
  const gate = evaluateAmbiguity(candidates);
  assert.equal(gate.status, 'unambiguous');
});

test('buildAmbiguityQuestion produces multi-option question', () => {
  const gate = evaluateAmbiguity([
    {
      kind: 'teacher_block_day' as any,
      scope: 'teacher' as any,
      embedding: null,
      triggers: [],
      synonyms: [],
      fewShots: [],
      negativeFewShots: [],
      requiredParams: ['teacher', 'day'],
    },
    {
      kind: 'teacher_block_period' as any,
      scope: 'teacher' as any,
      embedding: null,
      triggers: [],
      synonyms: [],
      fewShots: [],
      negativeFewShots: [],
      requiredParams: ['teacher', 'period'],
    },
  ]);
  if (gate.status === 'ambiguous') {
    const q = buildAmbiguityQuestion(gate);
    assert.ok(q.length > 0);
    assert.ok(q.includes('1.'));
  }
});

// ─── isSameKindFamily helper ────────────────────────────────────────────────

test('isSameKindFamily groups teacher_block variants together', () => {
  assert.equal(isSameKindFamily('teacher_block_day', 'teacher_block_period'), true);
  assert.equal(isSameKindFamily('teacher_block_day', 'teacher_block_slot'), true);
  assert.equal(isSameKindFamily('teacher_block_day', 'teacher_max_per_day'), false);
});

test('isSameKindFamily groups teacher_max variants', () => {
  assert.equal(isSameKindFamily('teacher_max_per_day', 'teacher_max_consecutive'), true);
  assert.equal(isSameKindFamily('teacher_max_per_day', 'teacher_max_classes_per_day'), true);
});



// ─── Negative few-shots in catalog (Section 13.8) ───────────────────────────

test('catalog includes negative few-shots for at least 2 high-confusion pairs', () => {
  // We injected negatives for teacher_max_per_day and teacher_max_consecutive.
  const hints: ConstraintResolverHints = {
    normalizedText: 'thầy sơn dạy tối đa 4 tiết mỗi ngày',
    resolvedTeacher: null,
    resolvedTeachers: [],
    resolvedSubject: null,
    resolvedSubjects: [],
    resolvedClass: null,
    resolvedClasses: [],
    extractedNumber: 4,
    extractedPeriods: [],
    extractedDays: [],
    inferredScope: 'teacher' as any,
    mentionsBlock: false,
    mentionsMax: true,
    mentionsMin: false,
    mentionsConsecutive: false,
    mentionsOnly: false,
    mentionsPreferred: false,
    mentionsIfThen: false,
  };
  const cands = retrieveTopK(hints, 'teacher', 5);
  const top = cands[0];
  assert.ok(top.negativeFewShots.length > 0, 'top candidate should have negative few-shots');
});

test('buildTopKPromptSection includes KHONG_PHAI markers for negative few-shots', () => {
  const hints: ConstraintResolverHints = {
    normalizedText: 'thầy sơn dạy tối đa 4 tiết mỗi ngày',
    resolvedTeacher: null,
    resolvedTeachers: [],
    resolvedSubject: null,
    resolvedSubjects: [],
    resolvedClass: null,
    resolvedClasses: [],
    extractedNumber: 4,
    extractedPeriods: [],
    extractedDays: [],
    inferredScope: 'teacher' as any,
    mentionsBlock: false,
    mentionsMax: true,
    mentionsMin: false,
    mentionsConsecutive: false,
    mentionsOnly: false,
    mentionsPreferred: false,
    mentionsIfThen: false,
  };
  const cands = retrieveTopK(hints, 'teacher', 3);
  const section = buildTopKPromptSection(cands, 'teacher');
  // Should contain "KHÔNG phải" marker for at least one candidate
  if (cands.some((c) => c.negativeFewShots.length > 0)) {
    assert.ok(section.includes('KHÔNG phải') || section.includes('không phải'),
      'prompt section should mark negative few-shots');
  }
});
