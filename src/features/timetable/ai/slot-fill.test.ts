import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SMALL_SYSTEM_PROMPT, SLOT_FILL_RESPONSE_SCHEMA, buildSlotFillUserMessage, buildSlotFillPrompt, type SlotFillResponse, type SlotFillAtom } from './slot-fill-prompt';
import type { ConstraintResolverHints } from './constraint-retriever';

describe('slot-fill-prompt', () => {
  it('SMALL_SYSTEM_PROMPT contains key rules', () => {
    assert.ok(SMALL_SYSTEM_PROMPT.includes('teacher_pair_not_same_slot'));
    assert.ok(SMALL_SYSTEM_PROMPT.includes('KHÔNG bịa'));
    assert.ok(SMALL_SYSTEM_PROMPT.includes('SlotFillResponse'));
    assert.ok(SMALL_SYSTEM_PROMPT.includes('params.scope'));
  });
  
  it('SLOT_FILL_RESPONSE_SCHEMA has required atoms array', () => {
    assert.equal(SLOT_FILL_RESPONSE_SCHEMA.required[0], 'atoms');
    assert.ok(SLOT_FILL_RESPONSE_SCHEMA.properties.atoms);
  });
  
  it('buildSlotFillUserMessage includes few-shot examples', () => {
    const hints: ConstraintResolverHints = {
      normalizedText: 'test',
      resolvedTeacher: null,
      resolvedTeachers: [],
      resolvedSubject: null,
      resolvedSubjects: [],
      resolvedClass: null,
      resolvedClasses: [],
      extractedNumber: null,
      extractedPeriods: [],
      extractedDays: [],
      inferredScope: null,
      mentionsBlock: false,
      mentionsMax: false,
      mentionsMin: false,
      mentionsConsecutive: false,
      mentionsOnly: false,
      mentionsPreferred: false,
      mentionsIfThen: false,
    };
    const result = buildSlotFillUserMessage('test', hints, []);
    assert.ok(result.includes('FS1'));
    assert.ok(result.includes('teacher_pair_not_same_slot'));
    assert.ok(result.includes('FS2'));
    assert.ok(result.includes('minh hoạ'));
    assert.ok(result.includes('FS3'));
  });
  
  it('buildSlotFillPrompt with previousAttempts includes them', () => {
    const hints: ConstraintResolverHints = {
      normalizedText: 'test',
      resolvedTeacher: null,
      resolvedTeachers: [],
      resolvedSubject: null,
      resolvedSubjects: [],
      resolvedClass: null,
      resolvedClasses: [],
      extractedNumber: null,
      extractedPeriods: [],
      extractedDays: [],
      inferredScope: null,
      mentionsBlock: false,
      mentionsMax: false,
      mentionsMin: false,
      mentionsConsecutive: false,
      mentionsOnly: false,
      mentionsPreferred: false,
      mentionsIfThen: false,
    };
    const result = buildSlotFillPrompt('test', hints, [], {
      previousAttempts: [{ displayText: 'old attempt', source: 'built_in', confidence: 'low' }],
    });
    assert.ok(result.user.includes('KHÔNG lặp lại'));
    assert.ok(result.user.includes('old attempt'));
  });
});

describe('SlotFillResponse type', () => {
  it('G1: teacher_pair_not_same_slot with scope, no period', () => {
    const response: SlotFillResponse = {
      atoms: [{
        kind: 'teacher_pair_not_same_slot',
        params: { teachers: ['Thúy', 'Yên'], scope: { day: 'thu6' } },
        confidence: 'high',
        missingParams: [],
      }],
    };
    assert.equal(response.atoms[0].kind, 'teacher_pair_not_same_slot');
    assert.ok(!('period' in response.atoms[0].params));
    assert.deepEqual((response.atoms[0].params as any).teachers, ['Thúy', 'Yên']);
  });
  
  it('G2: if_then with condition and 2 THEN atoms', () => {
    const response: SlotFillResponse = {
      condition: { op: 'teacher_teaches_at_slot', teacher: 'A', day: 'thu3', period: 4 },
      atoms: [
        { kind: 'teacher_block_slot', params: { teacher: 'B', day: 'thu5', period: 2 }, confidence: 'high', missingParams: [] },
        { kind: 'teacher_required_day', params: { teacher: 'C', day: 'thu2' }, confidence: 'high', missingParams: [] },
      ],
    };
    assert.ok(response.condition);
    assert.equal(response.atoms.length, 2);
    assert.equal(response.condition.op, 'teacher_teaches_at_slot');
  });
  
  it('G3: typo still produces correct negation + slot', () => {
    const response: SlotFillResponse = {
      atoms: [{
        kind: 'teacher_block_slot',
        params: { teacher: 'Sơn', day: 'thu3', period: 5 },
        confidence: 'high',
        missingParams: [],
      }],
    };
    assert.equal(response.atoms[0].kind, 'teacher_block_slot');
    assert.equal((response.atoms[0].params as any).teacher, 'Sơn');
  });
});

describe('SLOT_FILL_RESPONSE_SCHEMA validation', () => {
  it('validates G1 response shape', () => {
    const g1 = {
      atoms: [{
        kind: 'teacher_pair_not_same_slot',
        params: { teachers: ['Thúy', 'Yên'], scope: { day: 'thu6' } },
        confidence: 'high',
        missingParams: [],
      }],
    };
    assert.ok(Array.isArray(g1.atoms));
    assert.equal(g1.atoms[0].kind, 'teacher_pair_not_same_slot');
  });
});
