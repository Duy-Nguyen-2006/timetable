import test from 'node:test';
import assert from 'node:assert/strict';

import { POST } from './route';

const minimalInput = {
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
};

test('POST solve returns 400 when body incomplete', async () => {
  const res = await POST(
    new Request('http://localhost/api/ai/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: minimalInput }),
    })
  );
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error?: string };
  assert.match(json.error ?? '', /confirmedConstraints/i);
});

test('POST solve returns 400 for hard custom_dsl in confirmed specs', async () => {
  const res = await POST(
    new Request('http://localhost/api/ai/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: minimalInput,
        providerConfig: { baseURL: 'https://x', apiKey: 'k', model: 'm' },
        confirmedConstraints: [
          {
            id: 'c1',
            rawConstraintId: 'r1',
            specs: [
              {
                id: 's1',
                original: 'foo',
                severity: 'hard',
                kind: 'custom_dsl',
                params: { pythonPredicate: 'return True' },
              },
            ],
            confirmedBy: 'user',
            confirmedAt: new Date().toISOString(),
            summary: '',
          },
        ],
      }),
    })
  );
  assert.equal(res.status, 400);
});
