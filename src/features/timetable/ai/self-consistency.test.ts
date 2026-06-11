import test from 'node:test';
import assert from 'node:assert/strict';

import { canonicalSlotFillString, voteSlotFillResponses } from './self-consistency';

const response = {
  atoms: [{
    kind: 'teacher_block_slot',
    params: { teacher: 'Sơn', day: 'tuesday', period: 5 },
    confidence: 'high' as const,
    missingParams: [],
  }],
};

test('canonicalSlotFillString uses exact canonical JSON vote', () => {
  assert.equal(canonicalSlotFillString(response), canonicalSlotFillString({
    atoms: [{ ...response.atoms[0], params: { period: 5, day: 'tuesday', teacher: 'Sơn' } }],
  }));
});

test('voteSlotFillResponses accepts only identical canonical responses', () => {
  const accepted = voteSlotFillResponses([response, response, response]);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.calls, 3);

  const diverged = voteSlotFillResponses([
    response,
    response,
    { atoms: [{ ...response.atoms[0], params: { teacher: 'Sơn', day: 'monday', period: 5 } }] },
  ]);
  assert.equal(diverged.accepted, false);
});
