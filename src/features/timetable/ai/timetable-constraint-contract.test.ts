import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUILT_IN_CONSTRAINT_DEFINITIONS,
  CONSTRAINT_REGISTRY,
} from './constraint-registry';
import {
  constraintSpecToTimetableConstraint,
  deserializeTimetableConstraints,
  parseTimetableConstraint,
  serializeTimetableConstraints,
  timetableConstraintToConstraintSpecs,
  validateBuiltInParams,
  type TimetableConstraint,
} from './timetable-constraint-contract';

const timestamp = '2026-06-08T00:00:00.000Z';

test('built-in registry exposes complete user-facing definitions', () => {
  const builtInRegistryCount = CONSTRAINT_REGISTRY.filter((item) => item.kind !== 'custom_dsl').length;
  assert.equal(BUILT_IN_CONSTRAINT_DEFINITIONS.length, builtInRegistryCount);

  for (const definition of BUILT_IN_CONSTRAINT_DEFINITIONS) {
    assert.ok(definition.labelVi.trim(), definition.kind);
    assert.ok(definition.descriptionVi.trim(), definition.kind);
    assert.ok(definition.exampleVi.trim(), definition.kind);
    assert.ok(definition.paramsSchema.required);
    assert.ok(definition.severityAllowed.includes('hard'));
    assert.equal(typeof definition.hasSolverEncoder, 'boolean');
    assert.equal(typeof definition.hasValidator, 'boolean');
  }
});

test('assignment relation kinds are grouped under assignment for the wizard', () => {
  for (const kind of ['pair_not_same_slot', 'pair_same_slot', 'mutual_exclusion', 'session_limit'] as const) {
    const definition = BUILT_IN_CONSTRAINT_DEFINITIONS.find((item) => item.kind === kind);
    assert.equal(definition?.scope, 'assignment');
  }
});

test('built-in constraint schema accepts a valid teacher block day', () => {
  const parsed = parseTimetableConstraint({
    id: 'c1',
    mode: 'built_in',
    severity: 'hard',
    scope: 'teacher',
    kind: 'teacher_block_day',
    params: { teacher: 'Sơn', day: 'monday' },
    displayText: 'Giáo viên Sơn không dạy Thứ 2.',
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  assert.equal(parsed.mode, 'built_in');
  assert.equal(parsed.kind, 'teacher_block_day');
});

test('built-in constraint schema rejects missing required params', () => {
  const messages = validateBuiltInParams('teacher_block_day', { teacher: 'Sơn' });
  assert.deepEqual(messages, ['Missing required param: day']);

  assert.throws(() => parseTimetableConstraint({
    id: 'c1',
    mode: 'built_in',
    severity: 'hard',
    scope: 'teacher',
    kind: 'teacher_block_day',
    params: { teacher: 'Sơn' },
    displayText: 'Giáo viên Sơn không dạy Thứ 2.',
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
});

test('hard constraints reject weight and soft constraints get solver default weight', () => {
  assert.throws(() => parseTimetableConstraint({
    id: 'c1',
    mode: 'built_in',
    severity: 'hard',
    scope: 'teacher',
    kind: 'teacher_block_day',
    params: { teacher: 'Sơn', day: 'monday' },
    weight: 8,
    displayText: 'Giáo viên Sơn không dạy Thứ 2.',
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  const specs = timetableConstraintToConstraintSpecs({
    id: 'c2',
    mode: 'built_in',
    severity: 'soft',
    scope: 'teacher',
    kind: 'teacher_block_day',
    params: { teacher: 'Sơn', day: 'monday' },
    displayText: 'Ưu tiên giáo viên Sơn không dạy Thứ 2.',
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  assert.equal(specs[0].weight, 5);
  assert.deepEqual(specs[0].tags, ['user_preferred']);
});

test('legacy specs migrate to TimetableConstraint and serialize safely', () => {
  const constraint = constraintSpecToTimetableConstraint({
    id: 'legacy_1',
    original: 'Giáo viên Sơn không dạy Thứ 2.',
    severity: 'hard',
    kind: 'teacher_block_day',
    params: { teacher: 'Sơn', day: 'monday' },
  }, timestamp);

  const serialized = serializeTimetableConstraints([constraint]);
  const deserialized = deserializeTimetableConstraints(serialized);

  assert.equal(deserialized.length, 1);
  assert.equal(deserialized[0].mode, 'built_in');
});

test('custom constraints convert only to custom_dsl specs', () => {
  const constraint: TimetableConstraint = {
    id: 'custom_1',
    mode: 'custom',
    severity: 'hard',
    originalText: 'Nếu cô Thúy dạy thứ 4 tiết 1 thì cô Hạnh không dạy thứ 5 tiết 2.',
    normalizedText: 'Nếu giáo viên Thúy dạy Thứ 4 tiết 1 thì giáo viên Hạnh không dạy Thứ 5 tiết 2.',
    status: 'needs_user_confirmation',
    aiConfidence: 0.74,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const specs = timetableConstraintToConstraintSpecs(constraint);
  assert.equal(specs.length, 1);
  assert.equal(specs[0].kind, 'custom_dsl');
  assert.equal(specs[0].params.status, 'needs_user_confirmation');
});
