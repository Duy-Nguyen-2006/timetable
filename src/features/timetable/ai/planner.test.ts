import test from 'node:test';
import assert from 'node:assert/strict';

import { fallbackPlan, runPlannerTurn, shouldUseDeterministicPlan } from './planner';
import type { ConstraintSpec } from './constraint-spec';

const baseDigest = { classes: 1, days: 5, periods: 6, estimated: 30 };

const specs: ConstraintSpec[] = [
  {
    id: 'c1',
    original: 'Sơn không dạy thứ 2',
    severity: 'hard',
    kind: 'teacher_block_day',
    params: { teacher: 'Sơn', day: 'mon' },
  },
  {
    id: 'c2',
    original: 'Ưu tiên Toán tiết 1',
    severity: 'soft',
    kind: 'subject_preferred_periods',
    params: { subject: 'Toán', periods: [1] },
  },
];

test('fallbackPlan covers hard order and soft reification without LLM', () => {
  const plan = fallbackPlan(baseDigest, specs);

  assert.deepEqual(plan.constraintOrder, ['c1', 'c2']);
  assert.deepEqual(plan.reifiedNeeded, ['c2']);
  assert.equal(plan.objective, 'none');
});

test('runPlannerTurn uses deterministic fast lane for normal built-in constraints', async () => {
  let invoked = false;
  const result = await runPlannerTurn(
    { baseURL: 'http://example.test', apiKey: 'k', model: 'm' },
    { datasetDigest: baseDigest, constraintSpecs: specs },
    async () => {
      invoked = true;
      return { content: '{}' };
    }
  );

  assert.equal(invoked, false);
  assert.equal(result.usageTokens, 0);
  assert.deepEqual(result.plan.constraintOrder, ['c1', 'c2']);
});

test('shouldUseDeterministicPlan disables fast lane for hard custom constraints and huge domains', () => {
  assert.equal(shouldUseDeterministicPlan({ datasetDigest: baseDigest, constraintSpecs: specs }), true);
  assert.equal(
    shouldUseDeterministicPlan({
      datasetDigest: baseDigest,
      constraintSpecs: [{ ...specs[0], kind: 'custom_dsl', params: { pythonPredicate: 'def check(schedule): return True' } }],
    }),
    false
  );
  assert.equal(
    shouldUseDeterministicPlan({
      datasetDigest: { ...baseDigest, estimatedVars: 300_000 },
      constraintSpecs: specs,
    }),
    false
  );
});
