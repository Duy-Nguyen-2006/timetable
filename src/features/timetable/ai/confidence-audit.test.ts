/**
 * Tests for the confidence audit (Phase 0.7).
 *
 * The audit enumerates every place in the parser that assigns a
 * confidence value. The CI gate is: ZERO 'unsafe' entries. If
 * 'unsafeCount' becomes non-zero, the parser would silently skip
 * user confirmation somewhere.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CONFIDENCE_AUDIT, summarizeConfidenceAudit } from './confidence-audit';

test('audit has at least 10 entries', () => {
  assert.ok(CONFIDENCE_AUDIT.length >= 10);
});

test('audit IDs are unique', () => {
  const ids = new Set(CONFIDENCE_AUDIT.map((e) => e.id));
  assert.equal(ids.size, CONFIDENCE_AUDIT.length);
});

test('audit has zero unsafe entries (CI gate)', () => {
  const summary = summarizeConfidenceAudit();
  assert.equal(summary.unsafeCount, 0, `unsafe entries: ${summary.unsafeCount}`);
});

test('summary aggregates by verdict', () => {
  const summary = summarizeConfidenceAudit();
  const total = Object.values(summary.byVerdict).reduce((a, b) => a + b, 0);
  assert.equal(total, summary.total);
});

test('analyze-constraint-service.ts: dangerous high-confidence fallback is removed', () => {
  // The most important audit entries: CA-004 documents that the legacy
  // fallback was capped from 'high' to 'medium' in Phase 0.1.
  const ca004 = CONFIDENCE_AUDIT.find((e) => e.id === 'CA-004');
  assert.ok(ca004, 'CA-004 entry must exist');
  assert.notEqual(ca004!.verdict, 'unsafe', 'CA-004 must NOT be unsafe (means the dangerous fallback is fixed)');
});
