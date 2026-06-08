import test from 'node:test';
import assert from 'node:assert/strict';

import type { ParsedConstraintDraft } from '../ai/constraint-review-types';
import { unconfirmedRequiredConstraintIds, userFriendlyReviewStatus } from './constraint-review-ui';
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

test('unconfirmedRequiredConstraintIds lists required without confirm', () => {
  const constraints: ConstraintItem[] = [
    { id: 'a', type: 'required', text: 't1' },
    { id: 'b', type: 'preferred', text: 't2' },
  ];
  assert.deepEqual(unconfirmedRequiredConstraintIds(constraints, [], []), ['a']);
});
