import assert from 'node:assert/strict';
import test from 'node:test';

import { runCoderTurn } from './coder';

// Helper: mock invokeChat
const fakeChat = (content: string) => async () => ({ content, usage: { total_tokens: 100 } });

test('ensureCoverage - auto-patches when code mentions id but list is empty', async () => {
  const response = JSON.stringify({
    plan_summary: 'ok',
    constraint_code: 'for spec in data["constraints"]:\n\tif spec["id"] == "c1": pass',
    covered_constraint_ids: [],
    assumptions: [],
  });
  const result = await runCoderTurn(
    { baseURL: '', apiKey: 'x', model: 'm' },
    {
      dataset: {
        classes: [], days: [], periods: [], assignments: [],
        constraints: [{ id: 'c1', original: '', severity: 'hard', kind: 'custom_dsl', params: {} } as any],
        datasetDigest: { classCount: 0, teacherCount: 0, dayCount: 0, periodCount: 0, totalAssignments: 0 },
      },
      plan: {} as any,
    },
    fakeChat(response)
  );
  assert.ok(result.covered_constraint_ids.includes('c1'));
  assert.ok(result.assumptions.some(a => a.startsWith('auto_added_coverage:')));
});

test('ensureCoverage - throws when code has no evidence of handling id', async () => {
  const response = JSON.stringify({
    plan_summary: 'ok',
    constraint_code: '# nothing relevant',
    covered_constraint_ids: [],
    assumptions: [],
  });
  await assert.rejects(
    runCoderTurn(
      { baseURL: '', apiKey: 'x', model: 'm' },
      {
        dataset: {
          classes: [], days: [], periods: [], assignments: [],
          constraints: [{ id: 'c1', original: '', severity: 'hard', kind: 'custom_dsl', params: {} } as any],
          datasetDigest: { classCount: 0, teacherCount: 0, dayCount: 0, periodCount: 0, totalAssignments: 0 },
        },
        plan: {} as any,
      },
      fakeChat(response)
    ),
    /no code reference/
  );
});
