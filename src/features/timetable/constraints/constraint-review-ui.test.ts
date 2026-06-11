import test from 'node:test';
import assert from 'node:assert/strict';

import type { ParsedConstraintDraft } from '../ai/constraint-review-types';
import {
  hasRealInterpretation,
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
