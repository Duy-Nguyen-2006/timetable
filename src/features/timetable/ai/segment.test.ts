import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSegmentPrompt, SEGMENT_SYSTEM_PROMPT } from './segment-prompt';
import type { ConstraintSegment } from './segment-types';

describe('segment-types', () => {
  it('ConstraintSegment type is structurally correct', () => {
    const seg: ConstraintSegment = {
      normalizedVi: 'Vào thứ 6, Thúy và Yên không được cùng 1 tiết',
      scope: { day: 'thu6' },
      shape: 'simple',
      atoms: ['Thúy và Yên không được cùng 1 tiết'],
      droppedIllustrations: ['cùng tiết 2'],
    };
    assert.equal(seg.shape, 'simple');
    assert.equal(seg.droppedIllustrations.length, 1);
  });
});

describe('segment-prompt', () => {
  it('SEGMENT_SYSTEM_PROMPT contains key instructions', () => {
    assert.ok(SEGMENT_SYSTEM_PROMPT.includes('minh hoạ'));
    assert.ok(SEGMENT_SYSTEM_PROMPT.includes('droppedIllustrations'));
    assert.ok(SEGMENT_SYSTEM_PROMPT.includes('if_then'));
  });
  
  it('buildSegmentPrompt returns system + user', () => {
    const result = buildSegmentPrompt('thầy Sơn khogn day thu 3 tiet 5');
    assert.ok(result.system);
    assert.ok(result.user.includes('thầy Sơn'));
  });
  
  it('buildSegmentPrompt includes illustration note when spans provided', () => {
    const result = buildSegmentPrompt('test', ['ví dụ tiết 2']);
    assert.ok(result.user.includes('ví dụ tiết 2'));
    assert.ok(result.user.includes('minh hoạ'));
  });
  
  it('buildSegmentPrompt omits illustration note when no spans', () => {
    const result = buildSegmentPrompt('test');
    assert.ok(!result.user.includes('minh hoạ'));
  });
});

describe('segment-prompt golden cases (prompt quality)', () => {
  it('G1: illustration prompt guidance is correct', () => {
    const result = buildSegmentPrompt(
      'Vào thứ 6, nếu Thúy và Yên đều có tiết dạy thì họ không được cùng 1 tiết, ví dụ cùng tiết 2',
      ['ví dụ cùng tiết 2']
    );
    assert.ok(result.user.includes('ví dụ cùng tiết 2'));
  });
  
  it('G2: if_then prompt correctly structured', () => {
    const result = buildSegmentPrompt(
      'Nếu cô A dạy thứ 3 tiết 4 thì thứ 5 thầy B không dạy tiết 2 và thầy C phải dạy thứ 2'
    );
    assert.ok(result.system.includes('if_then'));
  });
  
  it('G3: typo handling prompt includes normalization instruction', () => {
    const result = buildSegmentPrompt('thầy Sơn khogn day thu 3 tiet 5');
    assert.ok(result.system.includes('chính tả'));
  });
});
