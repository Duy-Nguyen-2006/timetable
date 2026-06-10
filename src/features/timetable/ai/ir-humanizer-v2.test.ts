/**
 * Tests for IR Humanizer V2 (Phase 1.3).
 *
 * The humanizer is deterministic: same IR -> same Vietnamese.
 * It must NOT call the LLM and must NOT mutate the input.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { humanizeIR, humanizeIRExpr } from './ir-humanizer-v2';
import type { ConstraintIR, BoolExpr } from './constraint-ir';

test('humanizeIRExpr: atLeast(1, days, teaches(Thủy, d, 4)) -> require', () => {
  const expr: BoolExpr = {
    atLeast: {
      k: 1,
      var: 'd',
      in: 'days',
      body: { teaches: { teacher: 'Thủy', day: '$$d$$', period: 4 } },
    },
  };
  const { text, unmatched } = humanizeIRExpr(expr);
  assert.equal(unmatched, false);
  assert.match(text, /Giáo viên Thủy/);
  assert.match(text, /ít nhất 1/);
  assert.match(text, /tiết 4/);
});

test('humanizeIRExpr: atLeast(2, days, classBusy(6A, d, 1)) -> class require', () => {
  const expr: BoolExpr = {
    atLeast: {
      k: 2,
      var: 'd',
      in: 'days',
      body: { classBusy: { class: '6A', day: '$$D$$', period: 1 } },
    },
  };
  const { text } = humanizeIRExpr(expr);
  assert.match(text, /Lớp 6A/);
  assert.match(text, /ít nhất 2/);
  assert.match(text, /tiết 1/);
});

test('humanizeIRExpr: forall(days, compare(count, <=, 3)) -> tối đa 3 tiết/ngày', () => {
  const expr: BoolExpr = {
    forall: {
      var: 'd',
      in: 'days',
      body: {
        compare: {
          op: '<=',
          lhs: {
            count: {
              var: 'p',
              in: 'periods',
              body: { teaches: { teacher: 'Thủy', day: '$$d$$', period: '$$p$$' } },
            },
          },
          rhs: 3,
        },
      },
    },
  };
  const { text } = humanizeIRExpr(expr);
  assert.match(text, /tối đa 3/);
  assert.match(text, /giáo viên Thủy/);
});

test('humanizeIRExpr: not(forall(days, teaches)) -> Không (Với mỗi d ...)', () => {
  const expr: BoolExpr = {
    not: {
      forall: {
        var: 'd',
        in: 'days',
        body: { teaches: { teacher: 'Thủy', day: '$$d$$', period: 1 } },
      },
    },
  };
  const { text } = humanizeIRExpr(expr);
  assert.match(text, /Không/);
  assert.match(text, /mỗi d/);
});

test('humanizeIRExpr: implies -> Nếu ... thì ...', () => {
  const expr: BoolExpr = {
    implies: [
      { teachesOnDay: { teacher: 'A', day: 'monday' } },
      { teaches: { teacher: 'B', day: 'tuesday', period: 1 } },
    ],
  };
  const { text } = humanizeIRExpr(expr);
  assert.match(text, /Nếu/);
  assert.match(text, /thì/);
});

test('humanizeIRExpr: session atom -> buổi sáng', () => {
  const expr: BoolExpr = { session: { session: 'morning', teacher: 'Thủy' } };
  const { text } = humanizeIRExpr(expr);
  assert.match(text, /giáo viên Thủy/);
  assert.match(text, /buổi sáng/);
});

test('humanizeIRExpr: gap -> khoảng cách', () => {
  const expr: BoolExpr = {
    gap: {
      var: 'd',
      in: 'days',
      min: 2,
      body: { const: true },
    },
  };
  const { text } = humanizeIRExpr(expr);
  assert.match(text, /khoảng cách/);
  assert.match(text, /2/);
});

test('humanizeIR: prefer explain over walked expression', () => {
  const ir: ConstraintIR = {
    id: 't1',
    severity: 'hard',
    original: 'test',
    explain: 'Ràng buộc đã được diễn giải sẵn',
    expr: { const: true },
  };
  const { text, unmatched } = humanizeIR(ir);
  assert.equal(text, 'Ràng buộc đã được diễn giải sẵn');
  assert.equal(unmatched, false);
});

test('humanizeIRExpr: determinism — same IR produces same text', () => {
  const expr: BoolExpr = {
    atLeast: {
      k: 1,
      var: 'd',
      in: 'days',
      body: { teaches: { teacher: 'Thủy', day: '$$d$$', period: 4 } },
    },
  };
  const a = humanizeIRExpr(expr);
  const b = humanizeIRExpr(expr);
  assert.equal(a.text, b.text);
});

test('humanizeIRExpr: and / or composition', () => {
  const andExpr: BoolExpr = {
    and: [
      { teaches: { teacher: 'A', day: 'monday', period: 1 } },
      { teaches: { teacher: 'B', day: 'tuesday', period: 2 } },
    ],
  };
  const { text } = humanizeIRExpr(andExpr);
  assert.match(text, /và/);

  const orExpr: BoolExpr = {
    or: [
      { teaches: { teacher: 'A', day: 'monday', period: 1 } },
      { teaches: { teacher: 'B', day: 'tuesday', period: 2 } },
    ],
  };
  const orText = humanizeIRExpr(orExpr).text;
  assert.match(orText, /hoặc/);
});

test('humanizeIRExpr: before renders both sides instead of generic placeholder', () => {
  const expr: BoolExpr = {
    before: {
      var: 'd',
      in: 'days',
      first: { classSubjectAt: { class: '6A', subject: 'Toán', day: '$$D$$', period: 1 } },
      second: { classSubjectAt: { class: '6A', subject: 'Văn', day: '$$D$$', period: 2 } },
    },
  };
  const { text, unmatched } = humanizeIRExpr(expr);
  assert.equal(unmatched, false);
  assert.match(text, /trước/);
  assert.match(text, /môn Toán/);
  assert.match(text, /môn Văn/);
});

test('humanizeIRExpr: after renders both sides instead of generic placeholder', () => {
  const expr: BoolExpr = {
    after: {
      var: 'd',
      in: 'days',
      first: { teaches: { teacher: 'Thủy', day: '$$D$$', period: 4 } },
      second: { classBusy: { class: '6A', day: '$$D$$', period: 1 } },
    },
  };
  const { text, unmatched } = humanizeIRExpr(expr);
  assert.equal(unmatched, false);
  assert.match(text, /sau/);
  assert.match(text, /giáo viên Thủy/);
  assert.match(text, /lớp 6A/);
});
