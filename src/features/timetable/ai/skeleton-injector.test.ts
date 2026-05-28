import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { injectConstraintCode } from './skeleton-injector';

describe('injectConstraintCode', () => {
  it('preserves marker indentation while trimming trailing whitespace', () => {
    const skeleton = [
      'def build_custom_constraints():',
      '    # <<< AI_FILL_HERE >>>',
      '',
    ].join('\n');

    const result = injectConstraintCode(skeleton, 'model.Add(x == 1)  \n\nmodel.Add(y == 0)\t');

    assert.equal(result.injected, true);
    assert.equal(
      result.solverCode,
      ['def build_custom_constraints():', '    model.Add(x == 1)', '', '    model.Add(y == 0)'].join(
        '\n'
      )
    );
  });

  it('returns original skeleton when marker is missing', () => {
    const skeleton = 'def build_custom_constraints():\n    pass\n';
    const result = injectConstraintCode(skeleton, 'model.Add(x == 1)');

    assert.deepEqual(result, { solverCode: skeleton, injected: false });
  });
});
