import test from 'node:test';
import assert from 'node:assert/strict';

import { parseSlotFillJson } from './slot-fill-parser';

test('parseSlotFillJson strips fields outside known kind schema', () => {
  const parsed = parseSlotFillJson(JSON.stringify({
    atoms: [{
      kind: 'teacher_pair_not_same_slot',
      params: { teachers: ['Thúy', 'Yên'], scope: { day: 'friday' }, period: 2 },
      confidence: 'high',
      missingParams: [],
    }],
  }));
  assert.deepEqual(parsed.atoms[0].params, { teachers: ['Thúy', 'Yên'], scope: { day: 'friday' } });
});

test('parseSlotFillJson strips unknown params for registry kinds', () => {
  const parsed = parseSlotFillJson(JSON.stringify({
    atoms: [{
      kind: 'teacher_block_day',
      params: { teacher: 'Sơn', day: 'monday', scope: { day: 'monday' }, bogus: true },
      confidence: 'high',
      missingParams: [],
    }],
  }));
  assert.deepEqual(parsed.atoms[0].params, { teacher: 'Sơn', day: 'monday', scope: { day: 'monday' } });
  assert.equal('bogus' in parsed.atoms[0].params, false);
});

test('parseSlotFillJson converts unknown/custom kind to custom', () => {
  const parsed = parseSlotFillJson(JSON.stringify({
    atoms: [{ kind: 'custom', params: { expr: {} }, confidence: 'high', missingParams: [] }],
  }));
  assert.equal(parsed.atoms[0].kind, 'custom');
});
