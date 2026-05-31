import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const template = readFileSync(new URL('../../../../python/templates/solver_skeleton.py', import.meta.url), 'utf8');

test('solver template caps SOLVER_WORKERS and defaults from cpu count', () => {
  assert.match(template, /SOLVER_WORKERS/);
  assert.match(template, /_os\.cpu_count\(\)/);
  assert.match(template, /num_search_workers = min\(max\(1, _workers\), 8\)/);
});

test('solver template prunes domains before creating slot variables', () => {
  assert.match(template, /def is_slot_allowed/);
  assert.match(template, /if is_slot_allowed\(a, d, p, constraints\):/);
  assert.match(template, /slots\[\(a\["id"\], d, p\)\] = model\.NewBoolVar/);
});

test('solver template supports warm start hints', () => {
  assert.match(template, /warmStartSchedule/);
  assert.match(template, /model\.AddHint\(_var, 1 if _key in _warm_set else 0\)/);
});

test('solver template independently checks custom_dsl predicates', () => {
  assert.match(template, /def _verify_custom_predicates/);
  assert.match(template, /spec\.get\("pythonPredicate"\)/);
  assert.match(template, /"Thiếu pythonPredicate"/);
});
