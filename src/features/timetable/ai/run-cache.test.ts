import test from 'node:test';
import assert from 'node:assert/strict';

import type { AgentInputPayload, AIProviderConfig } from './types';
import { buildRunCacheDigest } from './run-cache';
import type { ConfirmedConstraint } from './constraint-review-types';

const provider: AIProviderConfig = {
  baseURL: 'https://api.example.com/v1',
  apiKey: 'k',
  model: 'm',
};

const input: AgentInputPayload = {
  days: [{ id: 'monday', label: 'Thứ 2' }],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { monday: 5 },
  deletedPeriods: {},
  assignments: [
    {
      id: 'asg_1',
      teacher: { id: 't1', label: 'Sơn' },
      subject: { id: 's1', label: 'Toán' },
      class: { id: 'c1', label: '6A' },
      weeklyPeriods: 3,
    },
  ],
  constraints: [{ type: 'required', text: 'Sơn không dạy thứ 2' }],
};

test('buildRunCacheDigest changes when confirmedConstraints added', () => {
  const without = buildRunCacheDigest(input, provider);
  const confirmed: ConfirmedConstraint[] = [
    {
      id: 'c1',
      rawConstraintId: 'r1',
      specs: [
        {
          id: 's1',
          original: 'Sơn không dạy thứ 2',
          severity: 'hard',
          kind: 'teacher_block_day',
          params: { teacher: 'Sơn', day: 'monday' },
        },
      ],
      confirmedBy: 'user',
      confirmedAt: '',
      summary: '',
      displayText: 'Sơn không dạy thứ 2',
    },
  ];
  const withConfirmed = buildRunCacheDigest(input, provider, confirmed);
  assert.notEqual(without, withConfirmed);
});

test('buildRunCacheDigest stable for same confirmed set', () => {
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
      displayText: 'Sơn không dạy thứ 2',
    },
  ];
  assert.equal(
    buildRunCacheDigest(input, provider, confirmed),
    buildRunCacheDigest(input, provider, confirmed)
  );
});
