import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateCondition } from './validator-helpers';
import type { ConditionExpr, ScheduleEntry } from './constraint-spec';

const baseSchedule: ScheduleEntry[] = [
  { class: '6A', day: 'mon', period: 1, subject: 'Toán', teacher: 'Sơn' },
  { class: '6A', day: 'mon', period: 2, subject: 'Văn', teacher: 'Hương' },
  { class: '6A', day: 'tue', period: 1, subject: 'Anh', teacher: 'Dung' },
];

test('VAL-T2-013: class_teacher_at_slot evaluates true when schedule matches', () => {
  const cond: ConditionExpr = { op: 'class_teacher_at_slot', class: '6A', subject: 'Toán', day: 'mon', period: 1 };
  assert.equal(evaluateCondition(cond, baseSchedule), true);

  const wrong: ConditionExpr = { op: 'class_teacher_at_slot', class: '6A', subject: 'Toán', day: 'tue', period: 1 };
  assert.equal(evaluateCondition(wrong, baseSchedule), false);
});

test('VAL-T2-014a: teacher_pair_teaches_same_day returns true when both teachers present that day', () => {
  // Sơn + Hương both teach on mon.
  const cond: ConditionExpr = { op: 'teacher_pair_teaches_same_day', teachers: ['Sơn', 'Hương'], day: 'mon' };
  assert.equal(evaluateCondition(cond, baseSchedule), true);
});

test('VAL-T2-014b: teacher_pair_teaches_same_day returns false when only one of the pair teaches that day', () => {
  // Sơn (mon) + Dung (tue) — not same day.
  const cond: ConditionExpr = { op: 'teacher_pair_teaches_same_day', teachers: ['Sơn', 'Dung'], day: 'mon' };
  assert.equal(evaluateCondition(cond, baseSchedule), false);
});

test('VAL-T2-014c: teacher_pair_teaches_same_slot requires exact slot match', () => {
  // Sơn teaches (mon, 1) — pair needs both at same slot.
  const ok: ConditionExpr = { op: 'teacher_pair_teaches_same_slot', teachers: ['Sơn', 'Hương'], day: 'mon', period: 2 };
  // Hương is at (mon, 2) but Sơn is at (mon, 1) → only Hương → false.
  assert.equal(evaluateCondition(ok, baseSchedule), false);

  const perfect: ConditionExpr = { op: 'teacher_pair_teaches_same_slot', teachers: ['Sơn', 'Hương'], day: 'mon', period: 1 };
  // Both must be at (mon, 1) — Hương is not → false.
  assert.equal(evaluateCondition(perfect, baseSchedule), false);
});
