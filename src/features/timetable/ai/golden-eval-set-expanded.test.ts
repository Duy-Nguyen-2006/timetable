/**
 * golden-eval-set-expanded.test.ts — M6.5 expanded golden set coverage
 *
 * Tests:
 *  1. Set has at least 100 cases (M6.5 acceptance criterion)
 *  2. All canonical categories are covered
 *  3. Each case has expectedKind that exists in registry (or is clarify/unsupported)
 *  4. No case has silentFlipForbiden=false (safety property)
 *  5. Categories distribute reasonably
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPANDED_GOLDEN_SET,
  summarizeExpandedSet,
} from './golden-eval-set-expanded';
import { BUILT_IN_CONSTRAINT_KINDS } from './constraint-registry';
import type { ConstraintKind } from './constraint-spec';

test('M6.5: expanded golden set has ≥100 cases', () => {
  const summary = summarizeExpandedSet();
  assert.ok(
    summary.total >= 100,
    `Expanded set must have ≥100 cases, has ${summary.total}`
  );
});

test('M6.5: all canonical categories are present', () => {
  const summary = summarizeExpandedSet();
  const required = [
    'teacher_block_day',
    'teacher_block_period',
    'teacher_block_slot',
    'teacher_require_period',
    'teacher_only_allowed_periods',
    'teacher_preferred_periods',
    'class_block_period',
    'class_require_period',
    'subject_require_period',
    'consecutive',
    'max_min_per_day',
    'if_then',
    'ambiguous',
    'unsupported',
  ];
  for (const cat of required) {
    assert.ok(
      summary.byCategory[cat] && summary.byCategory[cat] > 0,
      `Category ${cat} must have at least 1 case, has ${summary.byCategory[cat] ?? 0}`
    );
  }
});

test('M6.5: every expectedKind exists in registry or is clarify/unsupported/ambiguous', () => {
  const ALLOWED_NON_KINDS = new Set(['clarify', 'unsupported', 'ambiguous', 'custom_dsl']);
  for (const c of EXPANDED_GOLDEN_SET) {
    if (ALLOWED_NON_KINDS.has(c.expectedKind)) continue;
    const kind = c.expectedKind as ConstraintKind;
    assert.ok(
      BUILT_IN_CONSTRAINT_KINDS.has(kind),
      `Case ${c.id}: kind ${kind} not in registry`
    );
  }
});

test('M6.5: silentFlipForbiden is always true (safety property)', () => {
  for (const c of EXPANDED_GOLDEN_SET) {
    assert.equal(c.silentFlipForbiden, true, `Case ${c.id} must forbid silent flips`);
  }
});

test('M6.5: case IDs are unique', () => {
  const ids = new Set<string>();
  for (const c of EXPANDED_GOLDEN_SET) {
    assert.ok(!ids.has(c.id), `Duplicate case ID: ${c.id}`);
    ids.add(c.id);
  }
});

test('M6.5: text fields are non-empty', () => {
  for (const c of EXPANDED_GOLDEN_SET) {
    assert.ok(c.text && c.text.length > 0, `Case ${c.id} has empty text`);
  }
});

test('M6.5: category counts are reasonable (≥3 per category)', () => {
  const summary = summarizeExpandedSet();
  for (const [cat, count] of Object.entries(summary.byCategory)) {
    assert.ok(
      count >= 3,
      `Category ${cat} has only ${count} cases; want ≥3 for meaningful coverage`
    );
  }
});

test('M6.5: ambiguity cases include contradictory examples', () => {
  const contradictory = EXPANDED_GOLDEN_SET.filter((c) => c.direction === 'contradictory');
  assert.ok(contradictory.length >= 2, `Need ≥2 contradictory cases, have ${contradictory.length}`);
});

test('M6.5: direction distribution covers all 5 directions', () => {
  const summary = summarizeExpandedSet();
  for (const d of ['require', 'block', 'only', 'prefer', 'ambiguous', 'contradictory']) {
    assert.ok(
      summary.byDirection[d] && summary.byDirection[d] > 0,
      `Direction ${d} must have at least 1 case`
    );
  }
});
