/**
 * Tests for the negative semantic guard (Phase 0.3).
 *
 * The guard is the LAST line of defense against silent misparse:
 *   - "phai co" + *_block_* demotes, forces confirmation
 *   - "khong" + *_required_* demotes, forces confirmation
 *   - Conflicting markers (require + block) forces needs_clarification
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateNegativeGuard, evaluateNegativeGuardForSpecs } from './negative-guard';
import type { ConstraintSpec } from './constraint-spec';

function spec(kind: ConstraintSpec['kind'], params: Record<string, unknown> = {}): ConstraintSpec {
  return {
    id: 's1',
    original: '',
    severity: 'hard',
    kind,
    params,
  };
}

test('REQUIRE marker + block kind triggers demote', () => {
  // The exact bug: "Thủy phải có tiết 4" must NEVER become teacher_block_period.
  const decision = evaluateNegativeGuard(
    spec('teacher_block_period', { teacher: 'Thủy', period: 4 }),
    'Cô Thủy phải có ít nhất 1 tiết 4 trong tuần'
  );
  assert.equal(decision.kind, 'demote_to_medium_with_confirmation');
  if (decision.kind === 'demote_to_medium_with_confirmation') {
    assert.equal(decision.marker, 'require');
    assert.equal(decision.violatedKind, 'teacher_block_period');
  }
});

test('REQUIRE marker + subject_block_period triggers demote', () => {
  const decision = evaluateNegativeGuard(
    spec('subject_block_period', { subject: 'Toán', periods: [4] }),
    'Môn Toán phải có ít nhất 1 tiết 4 trong tuần'
  );
  assert.equal(decision.kind, 'demote_to_medium_with_confirmation');
});

test('BLOCK marker + required kind triggers demote', () => {
  // Inverse bug: "Thủy không dạy tiết 4" must NEVER become teacher_required_period.
  const decision = evaluateNegativeGuard(
    spec('teacher_required_period', { teacher: 'Thủy', period: 4, minCount: 1 }),
    'Cô Thủy không dạy tiết 4'
  );
  assert.equal(decision.kind, 'demote_to_medium_with_confirmation');
  if (decision.kind === 'demote_to_medium_with_confirmation') {
    assert.equal(decision.marker, 'block');
    assert.equal(decision.violatedKind, 'teacher_required_period');
  }
});

test('BLOCK marker + teacher_allowed_periods triggers demote', () => {
  const decision = evaluateNegativeGuard(
    spec('teacher_allowed_periods', { teacher: 'Thủy', periods: [4] }),
    'Cô Thủy không dạy tiết 4'
  );
  assert.equal(decision.kind, 'demote_to_medium_with_confirmation');
});

test('Consistent mapping (require + required kind) returns ok', () => {
  // "Thủy phải có ít nhất 1 tiết 4" -> teacher_required_period is the CORRECT mapping.
  const decision = evaluateNegativeGuard(
    spec('teacher_required_period', { teacher: 'Thủy', period: 4, minCount: 1 }),
    'Cô Thủy phải có ít nhất 1 tiết 4 trong tuần'
  );
  assert.equal(decision.kind, 'ok');
});

test('Consistent mapping (block + block kind) returns ok', () => {
  // "Thủy không dạy tiết 4" -> teacher_block_period is the CORRECT mapping.
  const decision = evaluateNegativeGuard(
    spec('teacher_block_period', { teacher: 'Thủy', period: 4 }),
    'Cô Thủy không dạy tiết 4'
  );
  assert.equal(decision.kind, 'ok');
});

test('Positive ("chỉ dạy") + allowed_periods returns ok', () => {
  const decision = evaluateNegativeGuard(
    spec('teacher_allowed_periods', { teacher: 'Thủy', periods: [4] }),
    'Cô Thủy chỉ dạy tiết 4'
  );
  assert.equal(decision.kind, 'ok');
});

test('evaluateNegativeGuardForSpecs: conflicting markers -> hardReasons AND anyDemote', () => {
  // "Thủy phải có ít nhất 1 tiết 4 trong tuần, nhưng không dạy tiết 5" has BOTH markers.
  // The spec is teacher_required_period (positive set kind). The "không dạy" in the
  // text triggers the block+positive-set demote, so anyDemote is true AND
  // hardReasons is non-empty (the markers contradict each other).
  const { hardReasons, anyDemote } = evaluateNegativeGuardForSpecs(
    [spec('teacher_required_period', { teacher: 'Thủy', period: 4, minCount: 1 })],
    'Cô Thủy phải có ít nhất 1 tiết 4 trong tuần, nhưng không dạy tiết 5'
  );
  assert.equal(hardReasons.length > 0, true, 'expected hardReasons on conflicting markers');
  assert.equal(anyDemote, true, 'expected demote on block marker + positive-set kind');
});

test('evaluateNegativeGuardForSpecs: anyDemote true on a single bad spec', () => {
  const { anyDemote, hardReasons } = evaluateNegativeGuardForSpecs(
    [spec('teacher_block_period', { teacher: 'Thủy', period: 4 })],
    'Cô Thủy phải có ít nhất 1 tiết 4 trong tuần'
  );
  assert.equal(anyDemote, true);
  assert.equal(hardReasons.length, 0);
});

test('Diacritic-insensitive: phai co (no dấu) still triggers require guard', () => {
  const decision = evaluateNegativeGuard(
    spec('teacher_block_period', { teacher: 'Thuy', period: 4 }),
    'co thuy phai co tiet 4 trong tuan'
  );
  assert.equal(decision.kind, 'demote_to_medium_with_confirmation');
});

test('Word boundary: "khong qua 3 tiet" with teacher_max_per_day returns ok (max limits are not at risk of flip)', () => {
  // "không quá 3 tiết" is a max-limit, not a block. The guard conservatively
  // treats any "không" as a block marker for set-restricting kinds. But
  // teacher_max_per_day is NOT a set-restricting kind, so no demote.
  const decision = evaluateNegativeGuard(
    spec('teacher_max_per_day', { teacher: 'Thủy', maxPerDay: 3 }),
    'Cô Thủy không quá 3 tiết mỗi ngày'
  );
  assert.equal(decision.kind, 'ok');
});
