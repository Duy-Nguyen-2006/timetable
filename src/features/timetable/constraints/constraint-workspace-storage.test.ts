import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateLegacyConstraintList } from './constraint-workspace-storage';
import { digestConfirmedConstraintSpecs } from './confirmed-constraint-signature';
import type { ConfirmedConstraint } from '../ai/constraint-review-types';

test('migrateLegacyConstraintList clears drafts and confirmed', () => {
  const legacy = [{ id: '1', type: 'required' as const, text: 'Sơn không dạy thứ 2' }];
  const m = migrateLegacyConstraintList(legacy);
  assert.deepEqual(m.constraintList, legacy);
  assert.equal(m.constraintDrafts.length, 0);
  assert.equal(m.confirmedConstraints.length, 0);
});

test('digestConfirmedConstraintSpecs stable for same specs', () => {
  const confirmed: ConfirmedConstraint[] = [
    {
      id: 'c1',
      rawConstraintId: 'r1',
      specs: [
        {
          id: 's1',
          original: 'x',
          severity: 'hard',
          kind: 'teacher_block_day',
          params: { teacher: 'Sơn', day: 'monday' },
        },
      ],
      confirmedBy: 'user',
      confirmedAt: '',
      summary: '',
    },
  ];
  const a = digestConfirmedConstraintSpecs(confirmed);
  const b = digestConfirmedConstraintSpecs(confirmed);
  assert.equal(a, b);
});
