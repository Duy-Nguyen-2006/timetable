import test from 'node:test';
import assert from 'node:assert/strict';

import { verifyCpSatRoundTrip } from './cp-sat-roundtrip';

test('roundtrip detects unknown assignment tuple', () => {
  const result = verifyCpSatRoundTrip(
    [
      { class: '6A', day: 'mon', period: 1, subject: 'Toan', teacher: 'Son' },
      { class: '6A', day: 'mon', period: 2, subject: 'Ly', teacher: 'Lan' },
    ],
    [
      { id: 'a1', class: '6A', subject: 'Toan', teacher: 'Son', weeklyPeriods: 1 },
      { id: 'a2', class: '6A', subject: 'Van', teacher: 'Lan', weeklyPeriods: 1 },
    ],
    { days: ['mon'], periods: [1, 2] }
  );
  assert.equal(result.ok, false);
});

test('roundtrip detects invalid period from solver output', () => {
  const result = verifyCpSatRoundTrip(
    [{ class: '6A', day: 'mon', period: 9, subject: 'Toan', teacher: 'Son' }],
    [{ id: 'a1', class: '6A', subject: 'Toan', teacher: 'Son', weeklyPeriods: 1 }],
    { days: ['mon'], periods: [1, 2, 3, 4, 5] }
  );
  assert.equal(result.ok, false);
});

test('roundtrip detects invalid period for specific day', () => {
  const result = verifyCpSatRoundTrip(
    [{ class: '6A', day: 'tue', period: 5, subject: 'Toan', teacher: 'Son' }],
    [{ id: 'a1', class: '6A', subject: 'Toan', teacher: 'Son', weeklyPeriods: 1 }],
    { days: ['mon', 'tue'], periods: [1, 2, 3, 4, 5], periodsByDay: { mon: [1, 2, 3, 4, 5], tue: [1, 2, 3] } }
  );
  assert.equal(result.ok, false);
});

test('roundtrip passes valid schedule', () => {
  const result = verifyCpSatRoundTrip(
    [
      { class: '6A', day: 'mon', period: 1, subject: 'Toan', teacher: 'Son' },
      { class: '6A', day: 'mon', period: 2, subject: 'Van', teacher: 'Lan' },
    ],
    [
      { id: 'a1', class: '6A', subject: 'Toan', teacher: 'Son', weeklyPeriods: 1 },
      { id: 'a2', class: '6A', subject: 'Van', teacher: 'Lan', weeklyPeriods: 1 },
    ],
    { days: ['mon'], periods: [1, 2] }
  );
  assert.equal(result.ok, true);
});
