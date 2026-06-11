/**
 * Calibrate parse confidence from multiple deterministic + verify signals.
 */

export type ParseConfidenceLevel = 'high' | 'medium' | 'low';

export type ParseConfidenceSignals = {
  /** top1 - top2 retriever score; higher = more confident */
  retrieverMargin?: number | null;
  /** 0..1 self-consistency agreement ratio */
  consensusRatio?: number | null;
  /** 0..1 lexical back-translation score */
  backTranslationScore?: number | null;
  /** 0..1 semantic verify score */
  semanticVerifyScore?: number | null;
  /** Whether slot-fill atoms reported high confidence */
  atomConfidenceHigh?: boolean;
  /** Whether semantic direction had unresolved conflict */
  directionNeedsClarification?: boolean;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function marginScore(margin: number | null | undefined): number {
  if (margin == null || !Number.isFinite(margin)) return 0.55;
  if (margin >= 4) return 1;
  if (margin >= 2) return 0.82;
  if (margin >= 1.2) return 0.68;
  if (margin >= 0.5) return 0.5;
  return 0.3;
}

/** Aggregate weighted score then map to high/medium/low. */
export function calibrateParseConfidence(signals: ParseConfidenceSignals): ParseConfidenceLevel {
  if (signals.directionNeedsClarification) return 'low';

  const parts = [
    marginScore(signals.retrieverMargin) * 0.25,
    clamp01(signals.consensusRatio ?? 0.6) * 0.2,
    clamp01(signals.backTranslationScore ?? 0.55) * 0.25,
    clamp01(signals.semanticVerifyScore ?? 0.6) * 0.2,
    (signals.atomConfidenceHigh ? 1 : 0.45) * 0.1,
  ];
  const score = parts.reduce((sum, part) => sum + part, 0);

  if (score >= 0.78) return 'high';
  if (score >= 0.55) return 'medium';
  return 'low';
}

/** Compute retriever margin from ranked candidates. */
export function retrieverMarginFromScores(scores: Array<number | undefined>): number | null {
  if (scores.length < 2) return scores[0] ?? null;
  const top = scores[0];
  const runner = scores[1];
  if (top == null || runner == null) return null;
  return top - runner;
}