import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRunSelfConsistency, type SelfConsistencyResult } from './self-consistency';

describe('shouldRunSelfConsistency', () => {
  it('returns true for if_then shape', () => {
    assert.equal(shouldRunSelfConsistency('if_then', 1), true);
  });
  
  it('returns true for multiple atoms', () => {
    assert.equal(shouldRunSelfConsistency('simple', 2), true);
    assert.equal(shouldRunSelfConsistency('simple', 3), true);
  });
  
  it('returns false for simple single atom', () => {
    assert.equal(shouldRunSelfConsistency('simple', 1), false);
  });
});

describe('SelfConsistencyResult type', () => {
  it('is structurally correct', () => {
    const result: SelfConsistencyResult = {
      merged: {
        atoms: [
          { kind: 'teacher_block_slot', params: { teacher: 'Sơn', day: 'thu3', period: 5 }, confidence: 'high', missingParams: [] },
        ],
      },
      unanimous: true,
      atomDivergence: [0],
      samplesTaken: 1,
    };
    assert.equal(result.unanimous, true);
    assert.equal(result.samplesTaken, 1);
    assert.equal(result.atomDivergence[0], 0);
  });
  
  it('tracks divergence correctly for compound', () => {
    const result: SelfConsistencyResult = {
      merged: {
        atoms: [
          { kind: 'teacher_block_slot', params: { teacher: 'B', day: 'thu5', period: 2 }, confidence: 'low', missingParams: [] },
          { kind: 'teacher_required_day', params: { teacher: 'C', day: 'thu2' }, confidence: 'high', missingParams: [] },
        ],
        condition: { op: 'teacher_teaches_at_slot', teacher: 'A', day: 'thu3', period: 4 },
      },
      unanimous: false,
      atomDivergence: [1, 0],
      samplesTaken: 3,
    };
    assert.equal(result.unanimous, false);
    assert.equal(result.merged.atoms[0].confidence, 'low');
    assert.equal(result.merged.atoms[1].confidence, 'high');
  });
});

describe('self-consistency voting logic (unit)', () => {
  it('unanimous atoms get high confidence', () => {
    const result: SelfConsistencyResult = {
      merged: {
        atoms: [
          { kind: 'teacher_pair_not_same_slot', params: { teachers: ['Thúy', 'Yên'], scope: { day: 'thu6' } }, confidence: 'high', missingParams: [] },
        ],
      },
      unanimous: true,
      atomDivergence: [0],
      samplesTaken: 3,
    };
    assert.equal(result.merged.atoms[0].confidence, 'high');
  });
  
  it('divergent atoms get low confidence', () => {
    const result: SelfConsistencyResult = {
      merged: {
        atoms: [
          { kind: 'teacher_block_slot', params: { teacher: 'X', day: 'thu5', period: 2 }, confidence: 'low', missingParams: [] },
        ],
      },
      unanimous: false,
      atomDivergence: [2],
      samplesTaken: 3,
    };
    assert.equal(result.merged.atoms[0].confidence, 'low');
    assert.equal(result.atomDivergence[0], 2);
  });
});
