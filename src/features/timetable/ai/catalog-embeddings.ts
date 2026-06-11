/**
 * Precomputed catalog embeddings for constraint-kind retrieval.
 * Built from kind label + synonyms + few-shots + negative few-shots.
 */

import type { ConstraintKind } from './constraint-spec';
import { computeSemanticEmbedding } from './text-embedding';

export type CatalogEmbeddingSource = {
  kind: ConstraintKind;
  synonyms: string[];
  fewShots: Array<{ text: string }>;
  negativeFewShots: Array<{ text: string; actuallyMapsTo: ConstraintKind; reason: string }>;
};

export function buildCatalogEmbeddingText(source: CatalogEmbeddingSource): string {
  return [
    source.kind.replace(/_/g, ' '),
    ...source.synonyms,
    ...source.fewShots.map((shot) => shot.text),
    ...source.negativeFewShots.map(
      (shot) => `khong phai ${shot.actuallyMapsTo.replace(/_/g, ' ')}: ${shot.text} (${shot.reason})`
    ),
  ].join(' ');
}

const embeddingCache = new Map<ConstraintKind, number[]>();

export function getCatalogEmbedding(source: CatalogEmbeddingSource): number[] {
  const cached = embeddingCache.get(source.kind);
  if (cached) return cached;
  const embedding = computeSemanticEmbedding(buildCatalogEmbeddingText(source));
  embeddingCache.set(source.kind, embedding);
  return embedding;
}

export function clearCatalogEmbeddingCache(): void {
  embeddingCache.clear();
}