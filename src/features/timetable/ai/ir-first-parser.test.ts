import test from 'node:test';
import assert from 'node:assert/strict';

import { parseIRFirst, parseIRFirstWithGuard, validateIRFirstResult } from './ir-first-parser';
import type { ConstraintResolverHints } from './constraint-retriever';

function hints(overrides: Partial<ConstraintResolverHints>): ConstraintResolverHints {
  return {
    normalizedText: '',
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
    ...overrides,
  };
}

test('parseIRFirst: "Thủy phải có tiết 4" returns required-period IR and spec', () => {
  const result = parseIRFirst(
    'Thủy phải có tiết 4',
    hints({ resolvedTeacher: 'Thủy', resolvedTeachers: ['Thủy'], inferredScope: 'teacher' })
  );

  assert.equal(result.kind, 'ir');
  if (result.kind !== 'ir') return;
  assert.equal(result.spec.kind, 'teacher_required_period');
  assert.equal(result.spec.params.teacher, 'Thủy');
  assert.equal(result.spec.params.period, 4);
  assert.equal(result.spec.params.minCount, 1);
  assert.deepEqual(validateIRFirstResult(result), []);
  assert.ok('atLeast' in result.ir.expr);
});

test('parseIRFirst: "phải có ít nhất hai tiết 4" uses written count', () => {
  const result = parseIRFirst(
    'Thủy phải có ít nhất hai tiết 4',
    hints({
      resolvedTeacher: 'Thủy',
      resolvedTeachers: ['Thủy'],
      inferredScope: 'teacher',
      extractedNumber: 2,
      mentionsMin: true,
    })
  );
  assert.equal(result.kind, 'ir');
  if (result.kind !== 'ir') return;
  assert.equal(result.spec.params.minCount, 2);
  assert.equal(result.spec.params.period, 4);
});

test('parseIRFirst: "chỉ dạy tiết 4" blocks periods beyond schedule max', () => {
  const result = parseIRFirst(
    'Thủy chỉ dạy tiết 4',
    hints({ resolvedTeacher: 'Thủy', resolvedTeachers: ['Thủy'], inferredScope: 'teacher', mentionsOnly: true }),
    { maxPeriods: 8 }
  );
  assert.equal(result.kind, 'ir');
  if (result.kind !== 'ir') return;
  assert.equal(result.spec.kind, 'teacher_allowed_periods');
  assert.match(result.ir.explain ?? '', /4/);
});

test('parseIRFirst: "Thủy chỉ dạy tiết 2 tiết 4" preserves allowed periods in legacy spec', () => {
  const result = parseIRFirst(
    'Thủy chỉ dạy tiết 2 tiết 4',
    hints({ resolvedTeacher: 'Thủy', resolvedTeachers: ['Thủy'], inferredScope: 'teacher', mentionsOnly: true })
  );

  assert.equal(result.kind, 'ir');
  if (result.kind !== 'ir') return;
  assert.equal(result.spec.kind, 'teacher_allowed_periods');
  assert.deepEqual(result.spec.params.periods, [2, 4]);
  assert.match(result.ir.explain ?? '', /2, 4/);
});

test('parseIRFirstWithGuard: valid require parse has no guard reason', () => {
  const result = parseIRFirstWithGuard(
    'Thủy phải có tiết 4',
    hints({ resolvedTeacher: 'Thủy', resolvedTeachers: ['Thủy'], inferredScope: 'teacher' })
  );

  assert.equal(result.kind, 'ir');
  assert.equal(result.guardReason, undefined);
});

test('parseIRFirst: disambiguation match without period asks clarification instead of guessing', () => {
  const result = parseIRFirst(
    'Thủy phải có',
    hints({ resolvedTeacher: 'Thủy', resolvedTeachers: ['Thủy'], inferredScope: 'teacher' })
  );

  assert.equal(result.kind, 'needs_clarification');
  if (result.kind !== 'needs_clarification') return;
  assert.match(result.reason, /cần thêm thông tin/);
});

test('parseIRFirst: unrelated text escalates to tier 2', () => {
  const result = parseIRFirst('xếp lịch thật đẹp', hints({}));
  assert.equal(result.kind, 'escalate_to_tier2');
});
