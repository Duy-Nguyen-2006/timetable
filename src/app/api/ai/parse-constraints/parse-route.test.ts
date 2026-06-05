import test from 'node:test';
import assert from 'node:assert/strict';

import { POST } from './route';

test('POST parse-constraints returns 400 without providerConfig', async () => {
  const res = await POST(
    new Request('http://localhost/api/ai/parse-constraints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { constraints: [] } }),
    })
  );
  assert.equal(res.status, 400);
});

test('POST parse-constraints returns 400 without apiKey', async () => {
  const res = await POST(
    new Request('http://localhost/api/ai/parse-constraints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: {
          days: [],
          sessions: [],
          periodCounts: {},
          deletedPeriods: {},
          assignments: [],
          constraints: [],
        },
        providerConfig: { baseURL: 'https://x', apiKey: '', model: 'm' },
      }),
    })
  );
  assert.equal(res.status, 400);
});
