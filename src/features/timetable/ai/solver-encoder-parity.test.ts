import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SOLVER_ENCODABLE_KIND_LIST } from './constraint-registry';
import { getConstraintCapability } from './constraint-capabilities';

// Mọi kind khai báo "encode được" PHẢI có nhánh thật trong skeleton,
// hoặc đi qua IR compiler path (có canConvertToIR = true hoặc được định nghĩa trong macros.py).
test('parity: mỗi SOLVER_ENCODABLE_KIND có encoder trong solver_skeleton.py hoặc qua IR path', () => {
  const skeleton = readFileSync(
    path.join(__dirname, '../../../../python/templates/solver_skeleton.py'),
    'utf8'
  );
  const macros = readFileSync(
    path.join(__dirname, '../../../../python/macros.py'),
    'utf8'
  );

  const startIdx = skeleton.indexOf('def build_custom_constraints(');
  const buildCustomConstraintsBody = startIdx >= 0 ? skeleton.slice(startIdx) : skeleton;

  const missing = SOLVER_ENCODABLE_KIND_LIST.filter((kind) => {
    const isNative = buildCustomConstraintsBody.includes(`kind == "${kind}"`);
    const isMacro = macros.includes(`kind == "${kind}"`);
    const cap = getConstraintCapability(kind);
    return !isNative && !isMacro && !cap.canConvertToIR;
  });

  assert.deepEqual(missing, [], `Thiếu encoder cho: ${missing.join(', ')}`);
});

