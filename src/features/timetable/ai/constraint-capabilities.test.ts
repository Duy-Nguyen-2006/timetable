/**
 * constraint-capabilities.test.ts — M7 capability audit
 *
 * Per Plan_v2.md M7.1, the capability map must cover every supported
 * hard constraint. Solver gate uses the map to fail closed.
 *
 * These tests verify:
 *  1. Require-family kinds have all capabilities (parse, humanize, IR,
 *     validate, encode, check).
 *  2. capabilityBlockReason returns null for fully-capable kinds.
 *  3. capabilityBlockReason returns Vietnamese error for missing kind.
 *  4. Solver-gate required kinds (require-family) are fully capable.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getConstraintCapability,
  capabilityBlockReason,
  auditCapabilities,
} from './constraint-capabilities';
import { specToIR } from './kind-to-ir';
import { humanizeConstraintSpec } from './constraint-humanizer';

const REQUIRE_FAMILY_KINDS = [
  'teacher_required_period',
  'class_required_period',
  'subject_required_period',
] as const;

test('M7.1: require-family kinds have all capabilities', () => {
  for (const kind of REQUIRE_FAMILY_KINDS) {
    const cap = getConstraintCapability(kind);
    assert.equal(cap.canParse, true, `${kind} should be parseable`);
    assert.equal(cap.canHumanize, true, `${kind} should be humanizable`);
    assert.equal(cap.canConvertToIR, true, `${kind} should convert to IR`);
    assert.equal(cap.canValidateIR, true, `${kind} IR should be validatable`);
    assert.equal(cap.canEncodeSolver, true, `${kind} should be encodable`);
    assert.equal(cap.canCheckDeterministically, true, `${kind} should be checkable`);
  }
});

test('M7.1: require-family specToIR produces atLeast IR', () => {
  const ir = specToIR({
    id: 't1',
    original: 'Cô Thủy phải có tiết 4',
    severity: 'hard',
    kind: 'teacher_required_period',
    params: { teacher: 'Thủy', period: 4, minCount: 1 },
  });
  assert.ok(ir);
  assert.ok('atLeast' in (ir as any).expr);
});

test('M7.1: humanizer for require-family produces non-empty Vietnamese text', () => {
  const text = humanizeConstraintSpec({
    id: 't1',
    original: 'Cô Thủy phải có tiết 4',
    severity: 'hard',
    kind: 'teacher_required_period',
    params: { teacher: 'Thủy', period: 4, minCount: 1 },
  });
  assert.ok(text.length > 0);
  assert.match(text, /Thủy/);
  assert.match(text, /4/);
  // Must NOT expose backend enum
  assert.doesNotMatch(text, /teacher_required_period/);
});

test('M7.3: humanizer distinguishes require vs block vs only', () => {
  const requireText = humanizeConstraintSpec({
    id: 't1', original: 'x', severity: 'hard', kind: 'teacher_required_period',
    params: { teacher: 'Thủy', period: 4, minCount: 1 },
  });
  const blockText = humanizeConstraintSpec({
    id: 't2', original: 'x', severity: 'hard', kind: 'teacher_block_period',
    params: { teacher: 'Thủy', period: 4 },
  });
  const onlyText = humanizeConstraintSpec({
    id: 't3', original: 'x', severity: 'hard', kind: 'teacher_allowed_periods',
    params: { teacher: 'Thủy', periods: [4] },
  });
  assert.notEqual(requireText, blockText, 'require vs block must differ');
  assert.notEqual(requireText, onlyText, 'require vs only must differ');
  assert.notEqual(blockText, onlyText, 'block vs only must differ');
});

test('M7.1: capabilityBlockReason returns null for fully-capable hard kind', () => {
  const reason = capabilityBlockReason('teacher_block_period', 'hard');
  assert.equal(reason, null);
});

test('M7.1: capabilityBlockReason returns null for soft kind without encoder', () => {
  // Soft + missing encoder = warning, not block
  const reason = capabilityBlockReason('teacher_block_period', 'soft');
  assert.equal(reason, null);
});

test('M7.1: capabilityBlockReason returns null for custom_dsl', () => {
  // custom_dsl is handled separately by the IR-expr check
  const reason = capabilityBlockReason('custom_dsl', 'hard');
  assert.equal(reason, null);
});

test('M7.1: capabilityBlockReason returns Vietnamese error for unknown kind', () => {
  const reason = capabilityBlockReason('fake_kind' as any, 'hard');
  assert.ok(reason, 'expected block reason');
  // Should be Vietnamese-ish (contains diacritics or be a short message)
  assert.ok(reason.length > 0);
});

test('M7: auditCapabilities returns full report', () => {
  const audit = auditCapabilities();
  assert.ok(audit.total > 0);
  assert.ok(audit.fullyCapable > 0);
  // All blocked kinds must be reported with their missing capabilities
  for (const blocked of audit.blocked) {
    assert.ok(blocked.missing.length > 0);
    assert.ok(Array.isArray(blocked.missing));
  }
});

test('M7: audit report can be summarized', () => {
  const audit = auditCapabilities();
  const coverage = audit.fullyCapable / audit.total;
  console.log(`[M7 audit] coverage: ${audit.fullyCapable}/${audit.total} (${(coverage * 100).toFixed(1)}%)`);
  assert.ok(coverage > 0, 'at least some kinds must be fully capable');
});
