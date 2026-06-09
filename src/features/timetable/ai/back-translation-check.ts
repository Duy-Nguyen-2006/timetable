/**
 * Back-translation Check (Parse Accuracy — Layer 3)
 *
 * After slot-fill, we have a candidate spec. To verify the LLM didn't drift
 * from the user's intent, we "back-translate" by:
 *   1. Humanize the spec into canonical Vietnamese (deterministic)
 *   2. Tokenize both original and canonical text
 *   3. Compare via a cheap lexical+syntactic score (token overlap, key-entity
 *      presence, negation flip, key-number presence)
 *   4. If the score is below the gate, mark the spec as "needs confirmation"
 *      so the UI can prompt the user to verify rather than auto-confirming.
 *
 * This is a cheap pre-LLM gate, not a full semantic model. It catches:
 *   - Hallucinated entities (teacher/subject/class the user never mentioned)
 *   - Lost key numbers (e.g., LLM maps 3 tiết to 4 tiết)
 *   - Lost key keywords (e.g., "không" disappeared)
 *   - Day drift (e.g., "thứ 2" became "thứ 3")
 *
 * NOTE: This module is pure code — no LLM, no embeddings. Fast and deterministic.
 */

import { humanizeConstraintSpec } from './constraint-humanizer';
import { normalizeConstraintText } from './translator-text';
import type { ConstraintSpec } from './constraint-spec';

/** Score threshold below which we require user confirmation. */
export const BACK_TRANSLATION_GATE = 0.62;

export type BackTranslationCheck = {
  /** 0..1; higher = closer match to original user text */
  score: number;
  /** Human-readable diagnosis for UI tooltip / debug. */
  diagnosis: string;
  /** Entities/numbers that appear in original but not in canonical. */
  missingTokens: string[];
  /** Entities/numbers that appear in canonical but not in original. */
  extraTokens: string[];
  /** Negation flipped? (e.g., "không" disappeared or "có" appeared unexpectedly) */
  negationMismatch: boolean;
  /** Numbers present in original but absent in canonical. */
  missingNumbers: number[];
  /** Numbers present in canonical but absent in original. */
  extraNumbers: number[];
};

const VI_STOPWORDS = new Set([
  'la', 'va', 'cua', 'cac', 'cho', 'trong', 'voi', 'nhu', 'thi', 'neu',
  'la', 'thi', 'toi', 'da', 'khong', 'qua', 'cung', 'muc', 'deu', 'duoc',
  'phai', 'nen', 'theo', 'moi', 'tung', 'them', 'nua', 'rat', 'hon',
  'thay', 'co', 'to', 'ky', 'hoc', 'khi', 'den', 'tren', 'duoi', 'cach',
  'tai', 'vi', 'sao', 'the', 'mot', 'hai', 'ba', 'nhung', 'giua', 'luc',
  'dau', 'cuoi', 'cung', 'het', 'tiet', 'ngay', 'thu', 'tuan', 'lop',
  'mon', 'gv', 'giao', 'vien', 'cac', 'nhom',
]);

const VI_NEGATIONS = ['khong', 'ko', 'kh', 'cam', 'tranh', 'khong duoc', 'chang'];

function tokenizeVi(text: string): string[] {
  return normalizeConstraintText(text)
    .split(/[^\p{L}\p{M}\p{N}_]+/u)
    .filter(Boolean)
    .map((t) => t.toLocaleLowerCase('vi'));
}

function contentTokens(text: string): string[] {
  return tokenizeVi(text).filter((t) => t.length > 1 && !VI_STOPWORDS.has(t));
}

function extractNumbers(text: string): number[] {
  const normalized = normalizeConstraintText(text);
  const found: number[] = [];
  for (const match of normalized.matchAll(/\b(\d+)\b/g)) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > 0 && n < 1000) found.push(n);
  }
  return found;
}

function hasNegation(text: string): boolean {
  const tokens = tokenizeVi(text);
  return tokens.some((t) => VI_NEGATIONS.includes(t));
}

/** Compute a 0..1 overlap score between two sets of content tokens. */
function tokenOverlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  // Jaccard-like with a slight bonus for high recall of `a` (the original).
  const recall = intersection / a.size;
  const precision = intersection / b.size;
  return Math.min(recall, precision) * 2 * 0.5 + (recall * 0.6 + precision * 0.4) * 0.5;
}

/** Number-presence score: penalize losing or adding numbers. */
function numberScore(originalNumbers: number[], canonicalNumbers: number[]): number {
  if (originalNumbers.length === 0 && canonicalNumbers.length === 0) return 1;
  const a = new Set(originalNumbers);
  const b = new Set(canonicalNumbers);
  let common = 0;
  for (const n of a) if (b.has(n)) common += 1;
  const recall = a.size === 0 ? 1 : common / a.size;
  const precision = b.size === 0 ? 1 : common / b.size;
  return Math.min(1, (recall + precision) / 2);
}

/** Compute a back-translation check score for a single spec vs the original text. */
export function backTranslateCheck(spec: ConstraintSpec, originalText: string): BackTranslationCheck {
  const canonical = humanizeConstraintSpec(spec);
  const originalTokens = new Set(contentTokens(originalText));
  const canonicalTokens = new Set(contentTokens(canonical));
  const originalNumbers = extractNumbers(originalText);
  const canonicalNumbers = extractNumbers(canonical);

  const missingTokens = [...originalTokens].filter((t) => !canonicalTokens.has(t));
  const extraTokens = [...canonicalTokens].filter((t) => !originalTokens.has(t));
  const originalHasNeg = hasNegation(originalText);
  const canonicalHasNeg = hasNegation(canonical);
  const negationMismatch = originalHasNeg !== canonicalHasNeg;

  const missingNumbers = originalNumbers.filter((n) => !canonicalNumbers.includes(n));
  const extraNumbers = canonicalNumbers.filter((n) => !originalNumbers.includes(n));

  const tokenScore = tokenOverlapScore(originalTokens, canonicalTokens);
  const numScore = numberScore(originalNumbers, canonicalNumbers);
  // Penalize negation flips hard.
  const negationPenalty = negationMismatch ? 0.25 : 0;
  const finalScore = Math.max(0, Math.min(1, tokenScore * 0.55 + numScore * 0.45 - negationPenalty));

  let diagnosis = `token_score=${tokenScore.toFixed(2)} number_score=${numScore.toFixed(2)}`;
  if (negationMismatch) diagnosis += ' | NEGATION FLIP';
  if (missingNumbers.length > 0) diagnosis += ` | missing numbers: ${missingNumbers.join(',')}`;
  if (extraNumbers.length > 0) diagnosis += ` | extra numbers: ${extraNumbers.join(',')}`;
  if (missingTokens.length > 0) diagnosis += ` | missing: ${missingTokens.slice(0, 3).join(',')}`;
  if (extraTokens.length > 0) diagnosis += ` | extra: ${extraTokens.slice(0, 3).join(',')}`;

  return {
    score: finalScore,
    diagnosis,
    missingTokens,
    extraTokens,
    negationMismatch,
    missingNumbers,
    extraNumbers,
  };
}

/** Compute an aggregate back-translation score for a batch of specs. */
export function backTranslateBatch(
  specs: ConstraintSpec[],
  originalText: string
): { score: number; needsConfirmation: boolean; perSpec: BackTranslationCheck[] } {
  if (specs.length === 0) {
    return { score: 1, needsConfirmation: false, perSpec: [] };
  }
  const perSpec = specs.map((s) => backTranslateCheck(s, originalText));
  const avg = perSpec.reduce((s, c) => s + c.score, 0) / perSpec.length;
  return {
    score: avg,
    needsConfirmation: avg < BACK_TRANSLATION_GATE,
    perSpec,
  };
}
