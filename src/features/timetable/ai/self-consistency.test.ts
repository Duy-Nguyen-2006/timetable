import test from 'node:test';
import assert from 'node:assert/strict';

import { canonicalSlotFillString, getConsensusRatio, voteSlotFillResponses } from './self-consistency';

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

test('voteSlotFillResponses accepts unanimous responses', () => {
  const accepted = voteSlotFillResponses([response, response, response]);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.calls, 3);
  assert.equal(accepted.consensusRatio, 1);
});

test('getConsensusRatio returns winner share', () => {
  assert.equal(getConsensusRatio([response, response, { atoms: [{ ...response.atoms[0], params: { teacher: 'Sơn', day: 'monday', period: 5 } }] }]), 2 / 3);
});

test('voteSlotFillResponses accepts 2/3 majority', () => {
  const majority = voteSlotFillResponses([
    response,
    response,
    { atoms: [{ ...response.atoms[0], params: { teacher: 'Sơn', day: 'monday', period: 5 } }] },
  ]);
  assert.equal(majority.accepted, true);
  assert.equal(majority.winner?.atoms[0].params.day, 'tuesday');
});

test('voteSlotFillResponses rejects when no majority', () => {
  const diverged = voteSlotFillResponses([
    response,
    { atoms: [{ ...response.atoms[0], params: { teacher: 'Sơn', day: 'monday', period: 5 } }] },
    { atoms: [{ ...response.atoms[0], params: { teacher: 'Hương', day: 'wednesday', period: 2 } }] },
  ]);
  assert.equal(diverged.accepted, false);
});
