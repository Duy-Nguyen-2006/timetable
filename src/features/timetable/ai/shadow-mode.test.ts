/**
 * Tests for shadow mode (Phase 2.3).
 *
 * Shadow mode runs the new IR-first parser in parallel with the legacy
 * built-in parser and logs divergence. The critical test is that
 * `classifyDivergence` flags `silent_flip` when the legacy maps a
 * require-marker sentence to a block kind — that is the exact bug
 * Phase 0 prevents in the new pipeline.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ShadowLogger,
  classifyDivergence,
  getDefaultShadowLogger,
  resetDefaultShadowLogger,
} from './shadow-mode';
import type { ConstraintSpec } from './constraint-spec';

function spec(kind: ConstraintSpec['kind'], params: Record<string, unknown> = {}): ConstraintSpec {
  return { id: 's1', original: 'test', severity: 'hard', kind, params };
}

test('classifyDivergence: legacy maps require-marker to block kind -> silent_flip', () => {
  // This is the exact bug from Phase 0.
  const result = classifyDivergence(
    'Cô Thủy phải có ít nhất 1 tiết 4 trong tuần',
    { specs: [spec('teacher_block_period', { teacher: 'Thủy', period: 4 })], status: 'mapped_builtin' },
    { specs: [spec('teacher_required_period', { teacher: 'Thủy', period: 4, minCount: 1 })], status: 'mapped_builtin' }
  );
  assert.equal(result.divergence, 'silent_flip');
});

test('classifyDivergence: both produce the same correct mapping -> match', () => {
  const result = classifyDivergence(
    'Cô Thủy phải có ít nhất 1 tiết 4 trong tuần',
    { specs: [spec('teacher_required_period', { teacher: 'Thủy', period: 4, minCount: 1 })], status: 'mapped_builtin' },
    { specs: [spec('teacher_required_period', { teacher: 'Thủy', period: 4, minCount: 1 })], status: 'mapped_builtin' }
  );
  assert.equal(result.divergence, 'match');
});

test('classifyDivergence: different kinds, no require marker -> kind_mismatch', () => {
  const result = classifyDivergence(
    'Cô Hương không dạy thứ 2',
    { specs: [spec('teacher_block_day', { teacher: 'Hương', day: 'monday' })], status: 'mapped_builtin' },
    { specs: [spec('teacher_allowed_periods', { teacher: 'Hương', periods: [1, 2, 3, 4, 5] })], status: 'mapped_builtin' }
  );
  // Note: this is also a silent_flip in semantic terms (block vs allowed),
  // but the test sentence does NOT contain a require marker, so the
  // divergence classifier returns kind_mismatch. The negative-guard handles
  // semantic flips more precisely in the new pipeline.
  assert.equal(result.divergence, 'kind_mismatch');
});

test('classifyDivergence: same kind, different params -> param_mismatch', () => {
  const result = classifyDivergence(
    'Cô Sơn dạy tối đa 4 tiết mỗi ngày',
    { specs: [spec('teacher_max_per_day', { teacher: 'Sơn', maxPerDay: 4 })], status: 'mapped_builtin' },
    { specs: [spec('teacher_max_per_day', { teacher: 'Sơn', maxPerDay: 5 })], status: 'mapped_builtin' }
  );
  assert.equal(result.divergence, 'param_mismatch');
});

test('classifyDivergence: legacy asks for clarification, new produces specs -> clarification_diff', () => {
  const result = classifyDivergence(
    'Cô Thủy',
    { specs: [], status: 'needs_clarification' },
    { specs: [spec('teacher_block_period', { teacher: 'Thủy', period: 4 })], status: 'mapped_builtin' }
  );
  assert.equal(result.divergence, 'clarification_diff');
});

test('ShadowLogger: records entries, summarizes divergence counts', () => {
  const logger = new ShadowLogger({ maxEntries: 100, deduplicate: false });
  logger.log({
    rawText: 'Cô Thủy phải có tiết 4',
    legacy: { specs: [spec('teacher_block_period', { teacher: 'Thủy', period: 4 })], status: 'mapped_builtin' },
    new: { specs: [spec('teacher_required_period', { teacher: 'Thủy', period: 4, minCount: 1 })], status: 'mapped_builtin' },
    divergence: 'silent_flip',
    explanation: 'block instead of require',
  });
  logger.log({
    rawText: 'Cô Sơn dạy tối đa 4 tiết mỗi ngày',
    legacy: { specs: [spec('teacher_max_per_day', { teacher: 'Sơn', maxPerDay: 4 })], status: 'mapped_builtin' },
    new: { specs: [spec('teacher_max_per_day', { teacher: 'Sơn', maxPerDay: 4 })], status: 'mapped_builtin' },
    divergence: 'match',
    explanation: 'agree',
  });
  const summary = logger.summarize();
  assert.equal(summary.total, 2);
  assert.equal(summary.silentFlipCount, 1);
  assert.equal(summary.matchCount, 1);
  assert.equal(summary.silentFlipRate, 0.5);
});

test('ShadowLogger: deduplicates identical raw+divergence pairs', () => {
  const logger = new ShadowLogger({ deduplicate: true });
  for (let i = 0; i < 3; i += 1) {
    logger.log({
      rawText: 'Cô Thủy phải có tiết 4',
      legacy: { specs: [spec('teacher_block_period', { teacher: 'Thủy', period: 4 })], status: 'mapped_builtin' },
      new: { specs: [spec('teacher_required_period', { teacher: 'Thủy', period: 4, minCount: 1 })], status: 'mapped_builtin' },
      divergence: 'silent_flip',
      explanation: 'block instead of require',
    });
  }
  assert.equal(logger.summarize().total, 1, 'should dedupe to 1 entry');
});

test('getDefaultShadowLogger: returns a stable singleton', () => {
  resetDefaultShadowLogger();
  const a = getDefaultShadowLogger();
  const b = getDefaultShadowLogger();
  assert.equal(a, b);
  resetDefaultShadowLogger();
});
