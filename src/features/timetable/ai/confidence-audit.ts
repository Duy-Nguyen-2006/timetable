/**
 * confidence-audit.ts — Phase 0.7
 *
 * Frozen audit table for every place in the parser that hardcodes or
 * assigns a confidence value. The audit answers three questions:
 *
 *   1. WHERE is confidence assigned?
 *   2. WHY is it assigned that value?
 *   3. DOES it ever cause a silent skip of user confirmation?
 *
 * Per the B1.4 invariant: confidence is for ROUTING ONLY. It must
 * NEVER cause a code path to skip user confirmation. The audit
 * enforces this by enumerating every assignment and tagging each as
 * one of:
 *
 *   - 'routing-only':   fine; confidence levels route to a tier but
 *                       do not affect whether the user must confirm.
 *   - 'legacy-routing':  legacy code from before Phase 0 that
 *                       incorrectly used 'high' to skip confirmation.
 *                       Phased out by Phase 0.1.
 *   - 'safe-default':    confidence defaults to 'medium' so the
 *                       parser never auto-confirms an uncertain parse.
 *   - 'unsafe':          REMOVE/REFACTOR. The assignment would cause
 *                       a silent skip of confirmation.
 *
 * Any new code that touches confidence MUST add a row to this table.
 * The `confidence-audit.test.ts` test fails if the live source
 * disagrees with the audit (e.g. a new 'unsafe' assignment was added).
 */

export type ConfidenceAuditVerdict = 'routing-only' | 'legacy-routing' | 'safe-default' | 'unsafe';

export type ConfidenceAuditEntry = {
  /** Stable id; do not change. */
  id: string;
  /** File path (relative to repo root). */
  file: string;
  /** Approximate line / function reference. */
  location: string;
  /** Verbatim or paraphrased assignment. */
  assignment: string;
  /** Verdict per the B1.4 invariant. */
  verdict: ConfidenceAuditVerdict;
  /** Why this verdict. */
  rationale: string;
  /** When the entry was added. */
  addedInPhase: string;
};

export const CONFIDENCE_AUDIT: ConfidenceAuditEntry[] = [
  // ─── analyze-constraint-service.ts ──────────────────────────────────────
  {
    id: 'CA-001',
    file: 'src/features/timetable/ai/analyze-constraint-service.ts',
    location: 'analyzeConstraint: empty content branch',
    assignment: "confidence: 'low'",
    verdict: 'safe-default',
    rationale: 'Empty LLM response. Low is the right default; needs_clarification is forced.',
    addedInPhase: '0.1',
  },
  {
    id: 'CA-002',
    file: 'src/features/timetable/ai/analyze-constraint-service.ts',
    location: 'analyzeConstraint: clarifyAmbiguousIfThen',
    assignment: "confidence: 'low'",
    verdict: 'safe-default',
    rationale: 'Forced clarification. Low is correct; user must respond before any auto-confirm.',
    addedInPhase: '0.1',
  },
  {
    id: 'CA-003',
    file: 'src/features/timetable/ai/analyze-constraint-service.ts',
    location: 'analyzeConstraint: post-guard demote',
    assignment: "resolvedConfidence = resolvedConfidence === 'high' ? 'medium' : resolvedConfidence",
    verdict: 'safe-default',
    rationale: 'When the negative-guard detects a silent-flip risk, we cap at medium. Forces confirmation.',
    addedInPhase: '0.3',
  },
  {
    id: 'CA-004',
    file: 'src/features/timetable/ai/analyze-constraint-service.ts',
    location: 'analyzeConstraint: legacy fallback (HTTP failure)',
    assignment: "confidence: 'medium' (capped; was 'high' before Phase 0.1)",
    verdict: 'safe-default',
    rationale: 'The legacy fallback was the root cause of the "Thủy phải có tiết 4" silent flip. Capped at medium in Phase 0.1 and now ALWAYS requires user confirmation.',
    addedInPhase: '0.1',
  },
  // ─── built-in-suggestion.ts ─────────────────────────────────────────────
  {
    id: 'CA-010',
    file: 'src/features/timetable/ai/built-in-suggestion.ts',
    location: 'suggest(): high-confidence scores (0.82-0.94)',
    assignment: 'confidence numbers 0.82-0.94',
    verdict: 'routing-only',
    rationale: 'These are NUMERIC confidences (0..1), used only to gate the suggest_built_in decision. The downstream code does NOT use the numeric confidence to skip confirmation.',
    addedInPhase: '0.7',
  },
  // ─── rule-parse-confidence.ts ───────────────────────────────────────────
  {
    id: 'CA-020',
    file: 'src/features/timetable/ai/rule-parse-confidence.ts',
    location: 'inferRuleParseConfidence(): kind-specific "high" assignments',
    assignment: "confidence: 'high' for simple unambiguous cases",
    verdict: 'routing-only',
    rationale: 'Rule-parse confidence is consulted by the parse pipeline to decide whether to fast-path. It does NOT cause a skip of user confirmation; the user always sees the draft.',
    addedInPhase: '0.7',
  },
  // ─── constraint-parse-service.ts ────────────────────────────────────────
  {
    id: 'CA-030',
    file: 'src/features/timetable/ai/constraint-parse-service.ts',
    location: 'parseConstraintDraftsWithRaws(): rule fast-path',
    assignment: "drafts.push(buildDraft(input, raw, rule.specs, 'rule', 'high', rule.issues))",
    verdict: 'routing-only',
    rationale: 'The draft itself has confidence="high" but the user always sees the draft and must explicitly confirm it. The "high" tag affects telemetry only.',
    addedInPhase: '0.7',
  },
  {
    id: 'CA-031',
    file: 'src/features/timetable/ai/constraint-parse-service.ts',
    location: 'parseConstraintDraftsWithRaws(): LLM path',
    assignment: "drafts.push(buildDraft(input, raw, fromLlm, 'translator', 'medium', []))",
    verdict: 'routing-only',
    rationale: 'LLM path is "medium" by default. User always sees draft, must confirm.',
    addedInPhase: '0.7',
  },
  // ─── constraint-import-from-suggestion.ts ───────────────────────────────
  {
    id: 'CA-040',
    file: 'src/features/timetable/constraints/constraint-import-from-suggestion.ts',
    location: 'multiple "confidence: high" assignments',
    assignment: "confidence: 'high'",
    verdict: 'routing-only',
    rationale: 'These are user-triggered template imports; the user explicitly picked the template, so the "high" tag is consistent with the user-confirmed intent.',
    addedInPhase: '0.7',
  },
  // ─── ConstraintInputPanel.tsx ───────────────────────────────────────────
  {
    id: 'CA-050',
    file: 'src/features/timetable/constraints/ConstraintInputPanel.tsx',
    location: 'form template apply',
    assignment: "confidence: 'high'",
    verdict: 'routing-only',
    rationale: 'User picked a template from the form; the template maps deterministically to a kind. The "high" tag is correct because the user made an explicit choice.',
    addedInPhase: '0.7',
  },
  // ─── constraint-form-schema.ts ──────────────────────────────────────────
  {
    id: 'CA-060',
    file: 'src/features/timetable/constraints/constraint-form-schema.ts',
    location: 'form template defaults',
    assignment: "confidence: 'high'",
    verdict: 'routing-only',
    rationale: 'Same as CA-050: explicit user choice.',
    addedInPhase: '0.7',
  },
  {
    id: 'CA-070',
    file: 'src/features/timetable/ai/parse-pipeline.ts',
    location: 'runParsePipeline: calibrateParseConfidence',
    assignment: 'confidence from retriever margin + verify + back-translation',
    verdict: 'safe-default',
    rationale: 'Multi-signal calibration; low confidence and failed verify force requiresConfirmation.',
    addedInPhase: '0.8',
  },
  {
    id: 'CA-071',
    file: 'src/features/timetable/ai/analyze-constraint-service.ts',
    location: 'analyzeConstraint: calibrateParseConfidence',
    assignment: 'confidence from retriever margin + semantic verify + back-translation',
    verdict: 'safe-default',
    rationale: 'Replaces hardcoded LLM confidence; never auto-confirms when verify fails.',
    addedInPhase: '0.8',
  },
];

/** Summary stats. */
export function summarizeConfidenceAudit(): {
  total: number;
  byVerdict: Record<ConfidenceAuditVerdict, number>;
  unsafeCount: number;
} {
  const byVerdict: Record<ConfidenceAuditVerdict, number> = {
    'routing-only': 0,
    'legacy-routing': 0,
    'safe-default': 0,
    unsafe: 0,
  };
  for (const e of CONFIDENCE_AUDIT) {
    byVerdict[e.verdict] += 1;
  }
  return {
    total: CONFIDENCE_AUDIT.length,
    byVerdict,
    unsafeCount: byVerdict.unsafe,
  };
}
