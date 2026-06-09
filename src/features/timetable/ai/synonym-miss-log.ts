/**
 * Synonym Miss Logger (Section 12 — risk mitigation)
 *
 * Logs constraint texts that the retriever scored LOW or that the LLM
 * had to fall back from, so we can audit the catalog and add missing
 * synonyms / triggers.
 *
 * Pure code: a ring buffer + getter. In production this would forward
 * to telemetry; in tests it just stores in-memory.
 */

import type { ConstraintRetrieverCandidate } from './constraint-retriever';

const MAX_ENTRIES = 200;

export type MissLogEntry = {
  /** User text. */
  text: string;
  /** Top score (0 if no candidates). */
  topScore: number;
  /** Top kind or null. */
  topKind: string | null;
  /** Number of candidates with non-zero score. */
  candidateCount: number;
  /** Inferred scope (if any). */
  scope: string | null;
  /** When the miss was logged. */
  timestamp: string;
  /** Normalized text for deduplication. */
  normalizedText: string;
};

class SynonymMissLog {
  private entries: MissLogEntry[] = [];
  private seenNormalized = new Set<string>();

  log(entry: Omit<MissLogEntry, 'timestamp'>): void {
    if (this.seenNormalized.has(entry.normalizedText)) return;
    this.seenNormalized.add(entry.normalizedText);
    this.entries.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    if (this.entries.length > MAX_ENTRIES) {
      const dropped = this.entries.shift();
      if (dropped) this.seenNormalized.delete(dropped.normalizedText);
    }
  }

  getAll(): MissLogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
    this.seenNormalized.clear();
  }

  size(): number {
    return this.entries.length;
  }
}

export const synonymMissLog = new SynonymMissLog();

/** Helper: log a miss from a retrieval attempt. */
export function logRetrievalMiss(
  userText: string,
  normalizedText: string,
  candidates: ConstraintRetrieverCandidate[],
  topScore: number,
  scope: string | null
): void {
  if (topScore < 3 || candidates.length === 0) {
    synonymMissLog.log({
      text: userText,
      normalizedText,
      topScore,
      topKind: candidates[0]?.kind ?? null,
      candidateCount: candidates.length,
      scope,
    });
  }
}
