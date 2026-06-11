import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stripUnknownKindParams, type StripResult } from './ir-type-checker';

describe('stripUnknownKindParams', () => {
  it('strips period from teacher_pair_not_same_slot (illustration trap)', () => {
    const result = stripUnknownKindParams('teacher_pair_not_same_slot', {
      teachers: ['Thúy', 'Yên'],
      scope: { day: 'thu6' },
      period: 2, // This should be stripped — it's from illustration
    });
    assert.ok(result.hadStrippedFields);
    assert.ok(result.strippedFields.includes('period'));
    assert.ok(!('period' in result.stripped));
    assert.deepEqual(result.stripped.teachers, ['Thúy', 'Yên']);
    assert.deepEqual(result.stripped.scope, { day: 'thu6' });
  });

  it('keeps all valid params for teacher_block_slot', () => {
    const result = stripUnknownKindParams('teacher_block_slot', {
      teacher: 'Sơn',
      day: 'thu3',
      period: 5,
    });
    assert.ok(!result.hadStrippedFields);
    assert.equal(result.strippedFields.length, 0);
    assert.equal(result.stripped.teacher, 'Sơn');
    assert.equal(result.stripped.day, 'thu3');
    assert.equal(result.stripped.period, 5);
  });

  it('keeps scope in teacher_pair_not_same_slot', () => {
    const result = stripUnknownKindParams('teacher_pair_not_same_slot', {
      teachers: ['A', 'B'],
      scope: { day: 'thu6' },
    });
    assert.ok(!result.hadStrippedFields);
    assert.ok('scope' in result.stripped);
  });

  it('does not strip unknown kinds', () => {
    const result = stripUnknownKindParams('custom_dsl', {
      expr: { teaches: { teacher: 'A', day: 'thu3', period: 1 } },
      explain: 'A teaches on thu3 period 1',
    });
    assert.ok(!result.hadStrippedFields);
    assert.ok('expr' in result.stripped);
    assert.ok('explain' in result.stripped);
  });

  it('strips extra field from teacher_required_day', () => {
    const result = stripUnknownKindParams('teacher_required_day', {
      teacher: 'C',
      day: 'thu2',
      period: 3, // Not valid for teacher_required_day
    });
    assert.ok(result.hadStrippedFields);
    assert.ok(result.strippedFields.includes('period'));
    assert.ok(!('period' in result.stripped));
    assert.equal(result.stripped.teacher, 'C');
    assert.equal(result.stripped.day, 'thu2');
  });

  it('handles if_then with if and then params', () => {
    const result = stripUnknownKindParams('if_then', {
      if: { op: 'teacher_teaches_at_slot', teacher: 'A', day: 'thu3', period: 4 },
      then: [
        { kind: 'teacher_block_slot', params: { teacher: 'B', day: 'thu5', period: 2 } },
      ],
    });
    assert.ok(!result.hadStrippedFields);
    assert.ok('if' in result.stripped);
    assert.ok('then' in result.stripped);
  });

  it('strips unknown field from if_then', () => {
    const result = stripUnknownKindParams('if_then', {
      if: { op: 'teacher_teaches_at_slot', teacher: 'A', day: 'thu3', period: 4 },
      then: [],
      extraField: 'should be removed',
    });
    assert.ok(result.hadStrippedFields);
    assert.ok(result.strippedFields.includes('extraField'));
    assert.ok(!('extraField' in result.stripped));
  });
});
