import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { __astCheckInternal } from './route';

function runChecker(code: string): { ok: boolean; error?: string } {
  const result = spawnSync('python3', ['-c', __astCheckInternal.CHECKER_SCRIPT], {
    input: code,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim()) as { ok: boolean; error?: string };
}

test('python ast checker rejects generated code using undefined skeleton variables', () => {
  const result = runChecker('for d in range(num_days):\n    pass');

  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /Unknown name 'num_days'/);
});

test('python ast checker allows documented custom constraint variables', () => {
  const result = runChecker('for spec in custom_specs:\n    params = spec.get("params", {})\n    _ = len(days) + len(periods)');

  assert.equal(result.ok, true);
});
