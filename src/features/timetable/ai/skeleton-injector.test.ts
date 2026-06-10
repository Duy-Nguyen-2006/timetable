import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { injectConstraintCode, injectEmptyCustomConstraintBlock } from './skeleton-injector';

describe('injectEmptyCustomConstraintBlock', () => {
  it('replaces the legacy AI_FILL_HERE marker with pass', () => {
    const skeleton = [
      'def build_custom_constraints():',
      '    # <<< AI_FILL_HERE >>>',
      '',
    ].join('\n');

    const result = injectEmptyCustomConstraintBlock(skeleton);

    assert.equal(result.injected, true);
    assert.equal(
      result.solverCode,
      ['def build_custom_constraints():', '    pass', ''].join('\n').slice(0, -1)
    );
  });

  it('replaces the new CUSTOM_CONSTRAINTS_DISABLED marker with pass', () => {
    const skeleton = [
      'def build_custom_constraints():',
      '    # <<< CUSTOM_CONSTRAINTS_DISABLED >>>',
      '',
    ].join('\n');

    const result = injectEmptyCustomConstraintBlock(skeleton);

    assert.equal(result.injected, true);
    assert.equal(
      result.solverCode,
      ['def build_custom_constraints():', '    pass', ''].join('\n').slice(0, -1)
    );
  });

  it('returns original skeleton when marker is missing', () => {
    const skeleton = 'def build_custom_constraints():\n    pass\n';
    const result = injectEmptyCustomConstraintBlock(skeleton);

    assert.deepEqual(result, { solverCode: skeleton, injected: false });
  });

  it('injectConstraintCode is a backward-compatible alias that ignores the code argument', () => {
    const skeleton = [
      'def build_custom_constraints():',
      '    # <<< AI_FILL_HERE >>>',
      '',
    ].join('\n');

    const result = injectConstraintCode(skeleton, 'should-be-ignored');

    assert.equal(result.injected, true);
    assert.equal(
      result.solverCode,
      ['def build_custom_constraints():', '    pass', ''].join('\n').slice(0, -1)
    );
  });
});
