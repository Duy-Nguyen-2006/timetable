import test from 'node:test';
import assert from 'node:assert/strict';

import { extractDayId } from './translator-text';
import { buildTranslatorPeriods, buildTranslatorPeriodsByDay } from './translator-periods';
import { days as dayDefs } from '../constants';
import type { AgentInputPayload } from './types';

const days = dayDefs.map((day) => ({ id: day.id, label: day.label }));

test('extractDayId maps Vietnamese ordinal days to full ids', () => {
  assert.equal(extractDayId('Sơn không dạy thứ 2', days), 'monday');
  assert.equal(extractDayId('Hương không dạy thứ 3 tiết 1', days), 'tuesday');
  assert.equal(extractDayId('Toán chỉ học thứ 4', days), 'wednesday');
  assert.equal(extractDayId('không dạy thứ 5', days), 'thursday');
  assert.equal(extractDayId('nghỉ thứ 6', days), 'friday');
  assert.equal(extractDayId('họp thứ 7', days), 'saturday');
  assert.equal(extractDayId('CN không xếp GDTC', days), 'sunday');
});

test('extractDayId never returns short aliases like mon/tue', () => {
  const shortAliases = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  for (const text of ['thứ 2', 'thứ 3', 'thứ 4', 'thứ 5', 'thứ 6', 'thứ 7', 'chủ nhật']) {
    const id = extractDayId(text, days);
    assert.equal(shortAliases.has(id ?? ''), false, `unexpected short alias for "${text}": ${id}`);
  }
});

test('extractDayId returns null when no day mentioned', () => {
  assert.equal(extractDayId('Sơn không dạy tiết 1', days), null);
});

const baseInput: AgentInputPayload = {
  days: [
    { id: 'monday', label: 'Thứ 2' },
    { id: 'tuesday', label: 'Thứ 3' },
  ],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { morning: 4 },
  deletedPeriods: {},
  assignments: [],
  constraints: [],
};

test('buildTranslatorPeriodsByDay excludes session-level deleted periods', () => {
  const input: AgentInputPayload = {
    ...baseInput,
    sessions: [
      { id: 'morning', label: 'Sáng' },
      { id: 'afternoon', label: 'Chiều' },
    ],
    periodCounts: { morning: 2, afternoon: 1 },
    deletedPeriods: { 'monday-morning-2': true },
  };

  assert.deepEqual(buildTranslatorPeriodsByDay(input), {
    monday: [1, 3],
    tuesday: [1, 2, 3],
  });
  assert.deepEqual(buildTranslatorPeriods(input), [1, 2, 3]);
});

test('buildTranslatorPeriodsByDay excludes day-level deleted periods', () => {
  const input: AgentInputPayload = {
    ...baseInput,
    periodCounts: { monday: 4, tuesday: 4 },
    deletedPeriods: { 'monday--3': true },
  };

  assert.deepEqual(buildTranslatorPeriodsByDay(input), {
    monday: [1, 2, 4],
    tuesday: [1, 2, 3, 4],
  });
});
