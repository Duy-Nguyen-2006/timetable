import test from 'node:test';
import assert from 'node:assert/strict';

import type { ParsedConstraintDraft } from '../ai/constraint-review-types';
import {
  hasRealInterpretation,
  isDraftCommittable,
  unconfirmedRequiredConstraintIds,
  userFriendlyReviewStatus,
} from './constraint-review-ui';
import type { ConstraintItem } from '../types';

test('userFriendlyReviewStatus marks medium confidence as needs_confirm', () => {
  const draft: ParsedConstraintDraft = {
    id: 'd1',
    rawConstraintId: 'r1',
    original: 'x',
    proposedSpecs: [{ id: 'c1', original: 'x', severity: 'hard', kind: 'if_then', params: { if: {}, then: [] } }],
    status: 'parsed',
    confidence: 'medium',
    explanation: '',
    issues: [],
    source: 'rule',
    displayText: 'test',
  };
  assert.equal(userFriendlyReviewStatus(draft, undefined), 'needs_confirm');
});

test('hasRealInterpretation returns false when displayText echoes original', () => {
  const original = 'Nếu Hiếu và Thúy dạy cùng ngày thì một người không được dạy tiết 4';
  const draft: ParsedConstraintDraft = {
    id: 'd1',
    rawConstraintId: 'r1',
    original,
    proposedSpecs: [],
    status: 'needs_review',
    confidence: 'low',
    explanation: '',
    issues: [],
    source: 'rule',
    displayText: original,
  };
  assert.equal(hasRealInterpretation(draft, undefined, original), false);
});

test('hasRealInterpretation returns true when displayText differs from original', () => {
  const original = 'Sơn không dạy thứ 2';
  const draft: ParsedConstraintDraft = {
    id: 'd1',
    rawConstraintId: 'r1',
    original,
    proposedSpecs: [{ id: 'c1', original, severity: 'hard', kind: 'teacher_block_day', params: { teacher: 'Sơn', day: 'monday' } }],
    status: 'parsed',
    confidence: 'high',
    explanation: '',
    issues: [],
    source: 'rule',
    displayText: 'Giáo viên Sơn không dạy vào thứ 2.',
  };
  assert.equal(hasRealInterpretation(draft, undefined, original), true);
});

test('hasRealInterpretation returns false for unparsed status', () => {
  const original = 'một câu mơ hồ';
  const draft: ParsedConstraintDraft = {
    id: 'd1',
    rawConstraintId: 'r1',
    original,
    proposedSpecs: [],
    status: 'unparsed',
    confidence: 'low',
    explanation: '',
    issues: [],
    source: 'rule',
    displayText: 'Có thể là gì đó',
  };
  assert.equal(hasRealInterpretation(draft, undefined, original), false);
});

test('unconfirmedRequiredConstraintIds lists required without confirm', () => {
  const constraints: ConstraintItem[] = [
    { id: 'a', type: 'required', text: 't1' },
    { id: 'b', type: 'preferred', text: 't2' },
  ];
  assert.deepEqual(unconfirmedRequiredConstraintIds(constraints, [], []), ['a']);
});

// ─── isDraftCommittable ──────────────────────────────────────────────
test('isDraftCommittable is true for parsed high-confidence drafts with specs', () => {
  const draft: ParsedConstraintDraft = {
    id: 'd1',
    rawConstraintId: 'r1',
    original: 'x',
    proposedSpecs: [{ id: 's1', original: 'x', severity: 'hard', kind: 'teacher_block_day', params: {} }],
    status: 'parsed',
    confidence: 'high',
    explanation: '',
    issues: [],
    source: 'rule',
  };
  assert.equal(isDraftCommittable(draft), true);
});

test('isDraftCommittable is false for unsupported drafts', () => {
  const draft: ParsedConstraintDraft = {
    id: 'd1',
    rawConstraintId: 'r1',
    original: 'x',
    proposedSpecs: [],
    status: 'unsupported',
    confidence: 'low',
    explanation: '',
    issues: [],
    source: 'rule',
  };
  assert.equal(isDraftCommittable(draft), false);
});

test('isDraftCommittable is false when no specs are proposed (e.g. clarification pending)', () => {
  const draft: ParsedConstraintDraft = {
    id: 'd1',
    rawConstraintId: 'r1',
    original: 'nếu Hương và Sơn dạy cùng 1 ngày thì ko dạy cùng 1 tiết',
    proposedSpecs: [],
    status: 'needs_review',
    confidence: 'low',
    explanation: '',
    issues: [{ code: 'needs_user_clarification', message: 'Cần làm rõ phạm vi' }],
    source: 'ai_reparse',
  };
  assert.equal(isDraftCommittable(draft), false);
});

test('isDraftCommittable becomes true once a clarification choice builds a spec', () => {
  // Simulates the state after the user picks the `per_class` clarification
  // option: proposedSpecs is now non-empty, the clarification issue is gone.
  const draft: ParsedConstraintDraft = {
    id: 'd1',
    rawConstraintId: 'r1',
    original: 'nếu Hương và Sơn dạy cùng 1 ngày thì ko dạy cùng 1 tiết',
    proposedSpecs: [
      {
        id: 'custom_r1_per_class',
        original: 'nếu Hương và Sơn dạy cùng 1 ngày thì ko dạy cùng 1 tiết',
        severity: 'hard',
        kind: 'custom_dsl',
        params: { scope: 'per_class', source: 'clarification_choice' },
      },
    ],
    status: 'parsed',
    confidence: 'high',
    explanation: '',
    issues: [],
    source: 'ai_reparse',
  };
  assert.equal(isDraftCommittable(draft), true);
});

test('isDraftCommittable returns false for undefined draft', () => {
  assert.equal(isDraftCommittable(undefined), false);
});
