import test from 'node:test';
import assert from 'node:assert/strict';

import { POST } from './route';

test('POST normalize-custom-constraint returns 400 without request', async () => {
  const res = await POST(
    new Request('http://localhost/api/ai/normalize-custom-constraint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
  );

  assert.equal(res.status, 400);
});

test('POST normalize-custom-constraint returns 400 without apiKey', async () => {
  const res = await POST(
    new Request('http://localhost/api/ai/normalize-custom-constraint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: { severity: 'hard', originalText: 'Nếu cô Thúy dạy thứ 4 thì cô Hạnh nghỉ' },
        providerConfig: { baseURL: 'https://x', apiKey: '', model: 'm' },
        agentInput: {
          days: [],
          sessions: [],
          periodCounts: {},
          deletedPeriods: {},
          assignments: [],
          constraints: [],
        },
      }),
    })
  );

  assert.equal(res.status, 400);
});
