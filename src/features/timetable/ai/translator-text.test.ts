import test from 'node:test';
import assert from 'node:assert/strict';
import { extractAllDayIds } from './translator-text';

test('extractAllDayIds extracts multiple days from "hoặc" pattern', () => {
  const days = [
    { id: 'monday', label: 'Thứ 2' },
    { id: 'tuesday', label: 'Thứ 3' },
    { id: 'wednesday', label: 'Thứ 4' },
    { id: 'thursday', label: 'Thứ 5' },
    { id: 'friday', label: 'Thứ 6' },
  ];

  const text = 'Môn Thể dục chỉ học thứ 3 hoặc thứ 5';
  const result = extractAllDayIds(text, days);
  
  assert.ok(result.includes('tuesday'), 'should include tuesday');
  assert.ok(result.includes('thursday'), 'should include thursday');
  assert.equal(result.length, 2, 'should have exactly 2 days');
});

test('extractAllDayIds extracts single day', () => {
  const days = [
    { id: 'monday', label: 'Thứ 2' },
    { id: 'tuesday', label: 'Thứ 3' },
  ];

  const text = 'Hương chỉ dạy thứ 3';
  const result = extractAllDayIds(text, days);
  
  assert.ok(result.includes('tuesday'), 'should include tuesday');
  assert.equal(result.length, 1, 'should have exactly 1 day');
});

