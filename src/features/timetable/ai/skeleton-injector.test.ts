import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { injectConstraintCode, normalizeConstraintCodeBody } from './skeleton-injector';

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

  it('normalizes fenced Python before injection', () => {
    const skeleton = [
      'def build_custom_constraints():',
      '    # <<< AI_FILL_HERE >>>',
      '    pass',
    ].join('\n');

    const result = injectConstraintCode(
      skeleton,
      '```python\nfor spec in custom_specs:\n    # c1\n    pass\n```'
    );

    assert.equal(result.injected, true);
    assert.equal(
      result.solverCode,
      [
        'def build_custom_constraints():',
        '    for spec in custom_specs:',
        '        # c1',
        '        pass',
        '    pass',
      ].join('\n')
    );
  });

  it('extracts body when coder returns the whole build_custom_constraints function', () => {
    const code = [
      'def build_custom_constraints(model, slots, data):',
      '    assignments = data["assignments"]',
      '    custom_specs = [s for s in data["constraints"] if s.get("kind") == "custom_dsl"]',
      '    for spec in custom_specs:',
      '        # c1',
      '        pass',
      '    return soft_terms, unsupported_soft_kinds',
    ].join('\n');

    assert.equal(normalizeConstraintCodeBody(code), 'for spec in custom_specs:\n    # c1\n    pass');
  });

  it('extracts only the marker region when coder returns the whole skeleton', () => {
    const code = [
      'def build_custom_constraints(model, slots, data):',
      '    unsupported_soft_kinds = []',
      '    for spec in constraints:',
      '        pass',
      '    custom_specs = [s for s in constraints if s.get("kind") == "custom_dsl"]',
      '    # <<< AI_FILL_HERE >>>',
      '    for spec in custom_specs:',
      '        # c1',
      '        pass',
      '    return soft_terms, unsupported_soft_kinds',
      '',
      'soft_terms, unsupported_soft_kinds = build_custom_constraints(model, slots, data)',
    ].join('\n');

    assert.equal(normalizeConstraintCodeBody(code), 'for spec in custom_specs:\n    # c1\n    pass');
  });

  it('drops prose before a Python body', () => {
    assert.equal(
      normalizeConstraintCodeBody('Here is the code:\nfor spec in custom_specs:\n    # c1\n    pass'),
      'for spec in custom_specs:\n    # c1\n    pass'
    );
  });
});
