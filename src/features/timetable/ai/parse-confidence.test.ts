import test from 'node:test';
import assert from 'node:assert/strict';

import { calibrateParseConfidence, retrieverMarginFromScores } from './parse-confidence';

test('retrieverMarginFromScores computes top1 minus top2', () => {
  assert.equal(retrieverMarginFromScores([12, 8, 3]), 4);
  assert.equal(retrieverMarginFromScores([5]), 5);
});

test('calibrateParseConfidence returns low when direction needs clarification', () => {
  const level = calibrateParseConfidence({
    retrieverMargin: 5,
    consensusRatio: 1,
    backTranslationScore: 0.9,
    semanticVerifyScore: 0.9,
    atomConfidenceHigh: true,
    directionNeedsClarification: true,
  });
  assert.equal(level, 'low');
});

test('calibrateParseConfidence returns high for strong signals', () => {
  const level = calibrateParseConfidence({
    retrieverMargin: 5,
    consensusRatio: 1,
    backTranslationScore: 0.9,
    semanticVerifyScore: 0.85,
    atomConfidenceHigh: true,
    directionNeedsClarification: false,
  });
  assert.equal(level, 'high');
});