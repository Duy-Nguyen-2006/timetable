import assert from 'node:assert/strict';
import test from 'node:test';

import { __localAgentInternal } from './local-agent';

test('buildViolationSignature normalizes roundtrip dynamic assignment ids', () => {
  const signatureA = __localAgentInternal.buildViolationSignature(
    [],
    false,
    'Schedule entry không khớp assignment asg_12345'
  );
  const signatureB = __localAgentInternal.buildViolationSignature(
    [],
    false,
    'Schedule entry không khớp assignment asg_67890'
  );
  assert.equal(signatureA, signatureB);
  assert.match(signatureA, /rt:fail:/);
});

test('buildViolationSignature distinguishes pass/fail roundtrip states', () => {
  const failSignature = __localAgentInternal.buildViolationSignature([], false, 'roundtrip failed');
  const okSignature = __localAgentInternal.buildViolationSignature([], true, 'roundtrip failed');
  assert.notEqual(failSignature, okSignature);
  assert.match(okSignature, /rt:ok$/);
});
