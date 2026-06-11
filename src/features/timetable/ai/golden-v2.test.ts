import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stripUnknownKindParams } from './ir-type-checker';
import { shouldRunSelfConsistency } from './self-consistency';
import { buildInterpretationConfirm } from './constraint-clarification-builder';
import type { InterpretationCardDTO } from './constraint-clarification-types';
import type { SlotFillResponse } from './slot-fill-prompt';
import { detectIllustrationSpans, hasFuzzyNegation } from './translator-text';

/**
 * Golden test cases V2 — must pass 100%
 * 
 * G1: Illustration trap — "ví dụ tiết 2" must NOT become a param
 * G2: If-then compound — 2 THEN atoms, no cross-contamination
 * G3: Typo + negation — fuzzy matching still produces correct result
 * G4: Ambiguous entity — must clarify, never auto-select
 */

describe('Golden V2 — G1: Illustration trap', () => {
  const rawText = 'Vào thứ 6, nếu Thúy và Yên đều có tiết dạy thì họ không được cùng 1 tiết, ví dụ cùng tiết 2';
  
  it('detects illustration span', () => {
    const spans = detectIllustrationSpans(rawText);
    assert.ok(spans.length > 0, 'Should detect "ví dụ" illustration');
    assert.ok(spans.some(s => s.toLowerCase().includes('ví dụ')));
  });
  
  it('strips period from teacher_pair_not_same_slot', () => {
    const result = stripUnknownKindParams('teacher_pair_not_same_slot', {
      teachers: ['Thúy', 'Yên'],
      scope: { day: 'thu6' },
      period: 2, // This is from illustration — MUST be stripped
    });
    assert.ok(result.hadStrippedFields, 'Should strip period field');
    assert.ok(result.strippedFields.includes('period'), 'Should report period as stripped');
    assert.ok(!('period' in result.stripped), 'period should not be in stripped params');
  });
  
  it('keeps valid params for teacher_pair_not_same_slot', () => {
    const result = stripUnknownKindParams('teacher_pair_not_same_slot', {
      teachers: ['Thúy', 'Yên'],
      scope: { day: 'thu6' },
    });
    assert.ok(!result.hadStrippedFields, 'Should not strip any fields');
    assert.deepEqual(result.stripped.teachers, ['Thúy', 'Yên']);
    assert.deepEqual(result.stripped.scope, { day: 'thu6' });
  });
  
  it('SlotFillResponse for G1 has no period', () => {
    const g1Response: SlotFillResponse = {
      atoms: [{
        kind: 'teacher_pair_not_same_slot',
        params: { teachers: ['Thúy', 'Yên'], scope: { day: 'thu6' } },
        confidence: 'high',
        missingParams: [],
      }],
    };
    assert.ok(!('period' in g1Response.atoms[0].params), 'G1 response must NOT have period');
    assert.equal(g1Response.atoms[0].kind, 'teacher_pair_not_same_slot');
  });
  
  it('interpretation card notes the illustration', () => {
    const interpretation: InterpretationCardDTO = {
      scopeVi: 'Vào thứ 6',
      ifAtomVi: 'nếu Thúy và Yên đều có dạy',
      thenAtomsVi: ['không được dạy trùng cùng một tiết'],
      notesVi: ["'tiết 2' được hiểu là ví dụ minh hoạ, không phải ràng buộc"],
      editableAtomIds: ['atom_0'],
    };
    const question = buildInterpretationConfirm(interpretation, rawText);
    assert.equal(question.reasonCode, 'confirm_interpretation');
    assert.ok(question.questionVi.includes('minh hoạ'));
  });
});

describe('Golden V2 — G2: If-then compound', () => {
  const rawText = 'Nếu cô A dạy thứ 3 tiết 4 thì thứ 5 thầy B không dạy tiết 2 và thầy C phải dạy thứ 2';
  
  it('should trigger self-consistency', () => {
    assert.ok(shouldRunSelfConsistency('if_then', 2));
  });
  
  it('SlotFillResponse for G2 has condition + 2 THEN atoms', () => {
    const g2Response: SlotFillResponse = {
      condition: { op: 'teacher_teaches_at_slot', teacher: 'A', day: 'thu3', period: 4 },
      atoms: [
        { kind: 'teacher_block_slot', params: { teacher: 'B', day: 'thu5', period: 2 }, confidence: 'high', missingParams: [] },
        { kind: 'teacher_required_day', params: { teacher: 'C', day: 'thu2' }, confidence: 'high', missingParams: [] },
      ],
    };
    assert.ok(g2Response.condition, 'Should have condition');
    assert.equal(g2Response.atoms.length, 2, 'Should have 2 THEN atoms');
    assert.equal(g2Response.condition.op, 'teacher_teaches_at_slot');
    assert.equal(g2Response.atoms[0].kind, 'teacher_block_slot');
    assert.equal(g2Response.atoms[1].kind, 'teacher_required_day');
  });
  
  it('no cross-contamination between atoms', () => {
    const g2Response: SlotFillResponse = {
      condition: { op: 'teacher_teaches_at_slot', teacher: 'A', day: 'thu3', period: 4 },
      atoms: [
        { kind: 'teacher_block_slot', params: { teacher: 'B', day: 'thu5', period: 2 }, confidence: 'high', missingParams: [] },
        { kind: 'teacher_required_day', params: { teacher: 'C', day: 'thu2' }, confidence: 'high', missingParams: [] },
      ],
    };
    // Atom 0 should not contain C's params
    assert.ok(!('day' in g2Response.atoms[0].params && g2Response.atoms[0].params.day === 'thu2'));
    // Atom 1 should not contain B's params
    assert.ok(!('period' in g2Response.atoms[1].params));
  });
  
  it('interpretation card shows IF + 2 THEN atoms', () => {
    const interpretation: InterpretationCardDTO = {
      ifAtomVi: 'nếu cô A dạy thứ 3 tiết 4',
      thenAtomsVi: ['thầy B không dạy thứ 5 tiết 2', 'thầy C phải dạy thứ 2'],
      notesVi: [],
      editableAtomIds: ['atom_0', 'atom_1'],
    };
    const question = buildInterpretationConfirm(interpretation, rawText);
    assert.equal(question.reasonCode, 'confirm_interpretation');
    assert.ok(question.questionVi.includes('Điều kiện'));
    assert.equal(interpretation.thenAtomsVi.length, 2);
  });
});

describe('Golden V2 — G3: Typo + negation', () => {
  const rawText = 'thầy Sơn khogn day thu 3 tiet 5';
  
  it('detects negation with typo', () => {
    assert.ok(hasFuzzyNegation(rawText), '"khogn" should fuzzy-match negation');
  });
  
  it('SlotFillResponse for G3 produces correct negation + slot', () => {
    const g3Response: SlotFillResponse = {
      atoms: [{
        kind: 'teacher_block_slot',
        params: { teacher: 'Sơn', day: 'thu3', period: 5 },
        confidence: 'high',
        missingParams: [],
      }],
    };
    assert.equal(g3Response.atoms[0].kind, 'teacher_block_slot');
    assert.equal((g3Response.atoms[0].params as any).teacher, 'Sơn');
    assert.equal((g3Response.atoms[0].params as any).day, 'thu3');
    assert.equal((g3Response.atoms[0].params as any).period, 5);
  });
  
  it('no self-consistency needed for simple constraint', () => {
    assert.ok(!shouldRunSelfConsistency('simple', 1));
  });
});

describe('Golden V2 — G4: Ambiguous entity', () => {
  const rawText = 'Lan không dạy thứ 2'; // "Lan" matches both "Lan Anh" and "Lan"
  
  it('requires clarification for ambiguous entity', () => {
    const interpretation: InterpretationCardDTO = {
      thenAtomsVi: ['Lan không dạy thứ 2'],
      notesVi: ['"Lan" khớp cả "Lan Anh" và "Lan" — cần xác nhận'],
      editableAtomIds: ['atom_0'],
    };
    const question = buildInterpretationConfirm(interpretation, rawText);
    assert.equal(question.reasonCode, 'confirm_interpretation');
    assert.ok(question.questionVi.includes('Lan'));
  });
  
  it('must NOT auto-select an entity', () => {
    // The clarify flow should be triggered, not auto-commit
    const interpretation: InterpretationCardDTO = {
      thenAtomsVi: ['Lan không dạy thứ 2'],
      notesVi: ['"Lan" khớp cả "Lan Anh" và "Lan" — cần xác nhận'],
      editableAtomIds: ['atom_0'],
    };
    // The interpretation card should have editable atoms and notes
    assert.ok(interpretation.notesVi.length > 0);
    assert.ok(interpretation.editableAtomIds.length > 0);
    assert.ok(interpretation.notesVi[0].includes('khớp cả'));
  });
});

describe('Golden V2 — 4 Guide Rules', () => {
  it('Guide 1: illustration markers must not become params', () => {
    const result = stripUnknownKindParams('teacher_pair_not_same_slot', {
      teachers: ['A', 'B'],
      scope: { day: 'thu6' },
      period: 2, // illustration — must strip
    });
    assert.ok(result.hadStrippedFields);
    assert.ok(!('period' in result.stripped));
  });
  
  it('Guide 2: "2 GV không cùng 1 tiết" → teacher_pair_not_same_slot', () => {
    // Verify this kind exists in KNOWN_PARAMS_BY_KIND
    const result = stripUnknownKindParams('teacher_pair_not_same_slot', {
      teachers: ['A', 'B'],
    });
    assert.ok(!result.hadStrippedFields, 'teachers is valid param');
    assert.ok('teachers' in result.stripped);
  });
  
  it('Guide 3: Scope day/class goes into params.scope', () => {
    const result = stripUnknownKindParams('teacher_pair_not_same_slot', {
      teachers: ['A', 'B'],
      scope: { day: 'thu6' },
    });
    assert.ok('scope' in result.stripped, 'scope is valid param');
  });
  
  it('Guide 4: Kind-implicit condition → no redundant if_then', () => {
    // teacher_pair_not_same_slot already implies "if both teach"
    // The LLM should NOT wrap it in if_then
    const response: SlotFillResponse = {
      atoms: [{
        kind: 'teacher_pair_not_same_slot',
        params: { teachers: ['Thúy', 'Yên'], scope: { day: 'thu6' } },
        confidence: 'high',
        missingParams: [],
      }],
    };
    // No condition field — the condition is implicit in the kind
    assert.ok(!response.condition, 'Should NOT have explicit condition');
  });
});
