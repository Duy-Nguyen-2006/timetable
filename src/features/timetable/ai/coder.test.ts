import assert from 'node:assert/strict';
import test from 'node:test';

import { runCoderTurn } from './coder';
import type { ConstraintSpec, Plan } from './constraint-spec';

// Helper: mock invokeChat
const fakeChat = (content: string) => async () => ({ content, usage: { total_tokens: 100 } });

const emptyPlan: Plan = {
  decisionVars: '',
  domainSize: { classes: 0, days: 0, periods: 0 },
  constraintOrder: [],
  reifiedNeeded: [],
  objective: 'none',
  templatesUsed: [],
  risks: [],
};

function constraint(kind: ConstraintSpec['kind'], severity: ConstraintSpec['severity']): ConstraintSpec {
  return { id: 'c1', original: '', severity, kind, params: {} };
}

test('runCoderTurn skips model when all constraints are built-in', async () => {
  let called = false;
  const result = await runCoderTurn(
    { baseURL: '', apiKey: 'x', model: 'm' },
    {
      dataset: {
        classes: [], days: [], periods: [], assignments: [],
        constraints: [
          constraint('subject_consecutive', 'hard'),
          { ...constraint('if_then', 'hard'), id: 'c2' },
        ],
        datasetDigest: { classCount: 0, teacherCount: 0, dayCount: 0, periodCount: 0, totalAssignments: 0 },
      },
      plan: emptyPlan,
    },
    async () => {
      called = true;
      return { content: '{}', usage: { total_tokens: 0 } };
    }
  );

  assert.equal(called, false);
  assert.equal(result.constraint_code, 'pass');
});

test('runCoderTurn skips model when custom_dsl constraints are not hard', async () => {
  let called = false;
  const result = await runCoderTurn(
    { baseURL: '', apiKey: 'x', model: 'm' },
    {
      dataset: {
        classes: [], days: [], periods: [], assignments: [],
        constraints: [constraint('custom_dsl', 'soft')],
        datasetDigest: { classCount: 0, teacherCount: 0, dayCount: 0, periodCount: 0, totalAssignments: 0 },
      },
      plan: emptyPlan,
    },
    async () => {
      called = true;
      return { content: '{}', usage: { total_tokens: 0 } };
    }
  );

  assert.equal(called, false);
  assert.equal(result.constraint_code, 'pass');
});

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
        constraints: [constraint('custom_dsl', 'hard')],
        datasetDigest: { classCount: 0, teacherCount: 0, dayCount: 0, periodCount: 0, totalAssignments: 0 },
      },
      plan: emptyPlan,
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
          constraints: [constraint('custom_dsl', 'hard')],
          datasetDigest: { classCount: 0, teacherCount: 0, dayCount: 0, periodCount: 0, totalAssignments: 0 },
        },
        plan: emptyPlan,
      },
      fakeChat(response)
    ),
    /no code reference/
  );
});

test('runCoderTurn normalizes fenced constraint code before coverage and injection', async () => {
  const response = JSON.stringify({
    plan_summary: 'ok',
    constraint_code: '```python\nfor spec in custom_specs:\n    # c1\n    pass\n```',
    covered_constraint_ids: [],
    assumptions: [],
  });
  const result = await runCoderTurn(
    { baseURL: '', apiKey: 'x', model: 'm' },
    {
      dataset: {
        classes: [], days: [], periods: [], assignments: [],
        constraints: [constraint('custom_dsl', 'hard')],
        datasetDigest: { classCount: 0, teacherCount: 0, dayCount: 0, periodCount: 0, totalAssignments: 0 },
      },
      plan: emptyPlan,
    },
    fakeChat(response)
  );

  assert.equal(result.constraint_code, 'for spec in custom_specs:\n    # c1\n    pass');
  assert.deepEqual(result.covered_constraint_ids, ['c1']);
});
