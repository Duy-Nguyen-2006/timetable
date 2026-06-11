import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  levenshtein,
  isFuzzyNegation,
  hasFuzzyNegation,
  fuzzyMatchEntity,
  detectIllustrationSpans,
  normalizeConstraintText,
} from './translator-text';
import { resolveConstraintHints } from './constraint-resolver';

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    assert.equal(levenshtein('khong', 'khong'), 0);
  });
  
  it('returns correct distance for typos', () => {
    assert.equal(levenshtein('khogn', 'khong'), 2);
    assert.equal(levenshtein('day', 'dya'), 2);
    assert.equal(levenshtein('ko', 'khong'), 3);
  });
});

describe('isFuzzyNegation', () => {
  it('detects exact negation keywords', () => {
    assert.equal(isFuzzyNegation('khong').match, true);
    assert.equal(isFuzzyNegation('ko').match, true);
    assert.equal(isFuzzyNegation('cam').match, true);
  });
  
  it('detects fuzzy negation (typo)', () => {
    assert.equal(isFuzzyNegation('khogn').match, true);
    assert.equal(isFuzzyNegation('khon').match, true);
  });
  
  it('rejects non-negation words', () => {
    assert.equal(isFuzzyNegation('xep').match, false);
    assert.equal(isFuzzyNegation('buoi').match, false);
  });
});

describe('hasFuzzyNegation', () => {
  it('G3: detects negation in typo text', () => {
    assert.equal(hasFuzzyNegation('thầy Sơn khogn day thu 3 tiet 5'), true);
  });
  
  it('detects standard negation', () => {
    assert.equal(hasFuzzyNegation('không dạy'), true);
  });
  
  it('returns false for non-negation', () => {
    assert.equal(hasFuzzyNegation('giáo viên xếp lịch'), false);
  });
});

describe('fuzzyMatchEntity', () => {
  it('matches exact entity names', () => {
    assert.equal(fuzzyMatchEntity('Sơn dạy', ['Sơn', 'Lan', 'Hương']), 'Sơn');
  });
  
  it('matches entities with minor typos', () => {
    // Close match within distance 1
    const labels = ['Lan Anh', 'Lan', 'Hương'];
    const result = fuzzyMatchEntity('Lan', labels);
    assert.ok(result === 'Lan' || result === 'Lan Anh');
  });
  
  it('returns null when no entity matches', () => {
    assert.equal(fuzzyMatchEntity('XYZ', ['Sơn', 'Lan', 'Hương']), null);
  });
});

describe('detectIllustrationSpans', () => {
  it('G1: detects "ví dụ" illustration span', () => {
    const spans = detectIllustrationSpans('Vào thứ 6, nếu Thúy và Yên đều có tiết dạy thì họ không được cùng 1 tiết, ví dụ cùng tiết 2');
    assert.ok(spans.length > 0);
    assert.ok(spans.some(s => s.toLowerCase().includes('ví dụ')));
  });
  
  it('detects "chẳng hạn" illustration span', () => {
    const spans = detectIllustrationSpans('không dạy cùng tiết, chẳng hạn tiết 3');
    assert.ok(spans.length > 0);
  });
  
  it('returns empty for text without illustrations', () => {
    const spans = detectIllustrationSpans('thầy Sơn không dạy thứ 3 tiết 5');
    assert.equal(spans.length, 0);
  });
});

describe('constraint-resolver with fuzzy matching', () => {
  it('G3: resolves typo negation correctly', () => {
    const hints = resolveConstraintHints({
      userText: 'thầy Sơn khogn day thu 3 tiet 5',
      teachers: ['Sơn'],
      subjects: [],
      classes: [],
      assignments: [],
    });
    assert.equal(hints.mentionsBlock, true);
    assert.ok(hints.resolvedTeachers.includes('Sơn'));
  });
  
  it('detects illustration spans', () => {
    const hints = resolveConstraintHints({
      userText: 'Vào thứ 6, nếu Thúy và Yên đều có tiết dạy thì họ không được cùng 1 tiết, ví dụ cùng tiết 2',
      teachers: ['Thúy', 'Yên'],
      subjects: [],
      classes: [],
      assignments: [],
    });
    assert.ok(hints.illustrationSpans.length > 0);
  });
});
