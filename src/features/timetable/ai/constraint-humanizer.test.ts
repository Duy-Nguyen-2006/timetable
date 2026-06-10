import test from 'node:test';
import assert from 'node:assert/strict';

import type { ConstraintSpec } from './constraint-spec';
import { CONSTRAINT_KINDS } from './constraint-registry';
import { humanizeConstraintSpec, humanizeDraft } from './constraint-humanizer';
import { buildClarificationQuestions } from './constraint-clarification';
import type { ParsedConstraintDraft } from './constraint-review-types';

const DEBUG_STRING_FRAGMENT = 'chưa có mô tả tiếng Việt chi tiết';
const DEBUG_STRING_REGEX = new RegExp(DEBUG_STRING_FRAGMENT);

function minimalSpec(kind: ConstraintSpec['kind'], original = `test ${kind}`): ConstraintSpec {
  return {
    id: `test-${kind}`,
    original,
    severity: 'hard',
    kind,
    params: {},
  };
}

// =============================================================================
// Task 1: TDD red — capture the debug-string bug
// =============================================================================

test('humanizeConstraintSpec does NOT render debug string for class_block_day (missing switch case)', () => {
  const spec: ConstraintSpec = {
    id: 't1',
    original: 'Lớp 6A không học thứ 2',
    severity: 'hard',
    kind: 'class_block_day',
    params: { class: '6A', day: 'mon' },
  };
  const out = humanizeConstraintSpec(spec);
  assert.doesNotMatch(out, DEBUG_STRING_REGEX, `Expected no debug string, got: ${out}`);
});

test('humanizeConstraintSpec for user-reported input raises a clarification question, not debug string', () => {
  // Use a synthetic kind that doesn't exist in the registry to force the
  // default branch. (After Task 4, all registered kinds have their own case.)
  const spec = {
    id: 't2',
    original: 'Không lớp nào học quá 3 tiết 1 môn trong 1 buổi',
    severity: 'hard' as const,
    kind: 'unknown_kind_synthetic' as ConstraintSpec['kind'],
    params: {},
  };
  const out = humanizeConstraintSpec(spec);
  assert.doesNotMatch(out, DEBUG_STRING_REGEX, `Expected no debug string, got: ${out}`);
  assert.match(out, /[Bb]ạn muốn|[Bb]ạn có thể|[Hh]ệ thống|buổi|sáng|chiều|tối đa/);
});

test('humanizeConstraintSpec for custom_dsl without expr raises clarification, not debug string', () => {
  const spec: ConstraintSpec = {
    id: 't3',
    original: 'Ràng buộc đặc biệt tùy trường',
    severity: 'hard',
    kind: 'custom_dsl',
    params: { pythonPredicate: 'return True' },
  };
  const out = humanizeConstraintSpec(spec);
  assert.doesNotMatch(out, DEBUG_STRING_REGEX, `Expected no debug string, got: ${out}`);
});

test('all registered ConstraintKinds have humanizer coverage (no default-case leak)', () => {
  const debugLeaks: string[] = [];
  for (const kind of CONSTRAINT_KINDS) {
    if (kind === 'custom_dsl') continue;
    const out = humanizeConstraintSpec(minimalSpec(kind));
    if (DEBUG_STRING_REGEX.test(out)) {
      debugLeaks.push(kind);
    }
  }
  assert.deepEqual(
    debugLeaks,
    [],
    `Kinds fell into default case (debug string leaked): ${debugLeaks.join(', ')}`,
  );
});

// =============================================================================
// Task 6: clarification pattern detection
// =============================================================================

test('buildClarificationQuestions detects "buổi + tiết + số" pattern', () => {
  const questions = buildClarificationQuestions(
    'Không lớp nào học quá 3 tiết 1 môn trong 1 buổi',
  );
  assert.ok(questions.length > 0, 'Expected at least one question');
  const ids = questions.map((q) => q.id);
  assert.ok(
    ids.includes('session_subject_period_limit') || ids.includes('general_meaning'),
    `Expected session_subject_period_limit or general_meaning question, got: ${ids.join(', ')}`,
  );
});

// =============================================================================
// Sanity: existing humanizer cases still work (no regression)
// =============================================================================

test('humanizeConstraintSpec subject_max_consecutive still works (regression)', () => {
  const spec: ConstraintSpec = {
    id: 'reg1',
    original: 'test',
    severity: 'hard',
    kind: 'subject_max_consecutive',
    params: { subject: 'Toán', max: 2, maxConsecutive: 2 },
  };
  const line = humanizeConstraintSpec(spec);
  assert.match(line, /Toán/);
  assert.match(line, /tối đa 2 tiết liên tiếp/);
});

test('humanizeConstraintSpec teacher_block_day still works (regression)', () => {
  const spec: ConstraintSpec = {
    id: 'reg2',
    original: 'Sơn không dạy thứ 2',
    severity: 'hard',
    kind: 'teacher_block_day',
    params: { teacher: 'Sơn', day: 'mon' },
  };
  const line = humanizeConstraintSpec(spec);
  assert.match(line, /Sơn/);
  assert.doesNotMatch(line, DEBUG_STRING_REGEX);
});

test('humanizeDraft for empty proposedSpecs returns explanation (no debug string)', () => {
  const draft: ParsedConstraintDraft = {
    id: 'd1',
    rawConstraintId: 'r1',
    original: 'test',
    proposedSpecs: [],
    status: 'unparsed',
    confidence: 'low',
    explanation: 'Test explanation',
    issues: [],
    source: 'rule',
  };
  const out = humanizeDraft(draft);
  assert.doesNotMatch(out, DEBUG_STRING_REGEX);
});
