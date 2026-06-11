import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildInterpretationConfirm } from './constraint-clarification-builder';
import type { InterpretationCardDTO } from './constraint-clarification-types';
import { REASON_CODE_LABEL_VI } from './constraint-clarification-types';

describe('constraint-clarification-types', () => {
  it('confirm_interpretation is in reasonCode labels', () => {
    assert.ok('confirm_interpretation' in REASON_CODE_LABEL_VI);
    assert.equal(REASON_CODE_LABEL_VI.confirm_interpretation, 'Xác nhận cách hiểu');
  });
  
  it('InterpretationCardDTO type is structurally correct', () => {
    const dto: InterpretationCardDTO = {
      scopeVi: 'Vào thứ 6',
      ifAtomVi: 'nếu Thúy và Yên đều có dạy',
      thenAtomsVi: ['không được dạy trùng cùng một tiết'],
      notesVi: ["'tiết 2' được hiểu là ví dụ minh hoạ"],
      editableAtomIds: ['atom_0'],
    };
    assert.equal(dto.scopeVi, 'Vào thứ 6');
    assert.equal(dto.thenAtomsVi.length, 1);
    assert.equal(dto.notesVi.length, 1);
  });
});

describe('buildInterpretationConfirm', () => {
  it('G4: builds confirmation for ambiguous entity', () => {
    const interpretation: InterpretationCardDTO = {
      ifAtomVi: undefined,
      thenAtomsVi: ['Lan không dạy thứ 2'],
      notesVi: ['"Lan" khớp cả "Lan Anh" và "Lan" — cần xác nhận'],
      editableAtomIds: ['atom_0'],
    };
    const question = buildInterpretationConfirm(interpretation, 'Lan không dạy thứ 2');
    assert.equal(question.reasonCode, 'confirm_interpretation');
    assert.ok(question.questionVi.includes('Lan'));
    assert.ok(question.questionVi.includes('khớp cả'));
    assert.equal(question.options.length, 2);
    assert.ok(question.allowFreeText);
  });
  
  it('builds confirmation for if-then with illustration note', () => {
    const interpretation: InterpretationCardDTO = {
      scopeVi: 'Vào thứ 6',
      ifAtomVi: 'nếu Thúy và Yên đều có tiết dạy',
      thenAtomsVi: ['không được dạy trùng cùng một tiết'],
      notesVi: ["'tiết 2' được hiểu là ví dụ minh hoạ, không phải ràng buộc"],
      editableAtomIds: ['atom_0'],
    };
    const question = buildInterpretationConfirm(interpretation, 'Vào thứ 6, nếu Thúy và Yên đều có tiết dạy thì họ không được cùng 1 tiết, ví dụ cùng tiết 2');
    assert.equal(question.reasonCode, 'confirm_interpretation');
    assert.ok(question.questionVi.includes('Phạm vi: Vào thứ 6'));
    assert.ok(question.questionVi.includes('Điều kiện: nếu Thúy'));
    assert.ok(question.questionVi.includes('minh hoạ'));
    assert.ok(question.options[0].labelVi.includes('Đúng, lưu'));
    assert.ok(question.options[1].labelVi.includes('Sửa lại'));
  });
  
  it('builds confirmation for simple constraint without notes', () => {
    const interpretation: InterpretationCardDTO = {
      thenAtomsVi: ['thầy Sơn không dạy thứ 3 tiết 5'],
      notesVi: [],
      editableAtomIds: ['atom_0'],
    };
    const question = buildInterpretationConfirm(interpretation, 'thầy Sơn khogn day thu 3 tiet 5');
    assert.equal(question.reasonCode, 'confirm_interpretation');
    assert.ok(!question.questionVi.includes('Ghi chú'));
  });
});
