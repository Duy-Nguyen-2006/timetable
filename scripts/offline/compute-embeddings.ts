#!/usr/bin/env npx tsx
/**
 * Offline utility: warm catalog embedding cache and print diagnostics.
 * Runtime retrieval uses the same computeSemanticEmbedding() path.
 */

import { buildCatalogEmbeddingText, clearCatalogEmbeddingCache, getCatalogEmbedding } from '../../src/features/timetable/ai/catalog-embeddings';
import { computeSemanticEmbedding } from '../../src/features/timetable/ai/text-embedding';
import { BUILT_IN_CONSTRAINT_DEFINITIONS } from '../../src/features/timetable/ai/constraint-registry';

function main(): void {
  clearCatalogEmbeddingCache();
  const sampleText = 'Thầy Sơn phải có ít nhất 1 tiết 4 trong tuần';
  const query = computeSemanticEmbedding(sampleText);

  const ranked = BUILT_IN_CONSTRAINT_DEFINITIONS.map((definition) => {
    const source = {
      kind: definition.kind,
      synonyms: [definition.labelVi, definition.exampleVi],
      fewShots: [{ text: definition.exampleVi }],
      negativeFewShots: [],
    };
    const embedding = getCatalogEmbedding(source);
    let dot = 0;
    for (let index = 0; index < query.length; index += 1) dot += query[index] * embedding[index];
    return { kind: definition.kind, score: dot };
  }).sort((a, b) => b.score - a.score);

  console.log('Sample query:', sampleText);
  console.log('Top-5 kinds by cosine similarity:');
  for (const row of ranked.slice(0, 5)) {
    console.log(`  ${row.kind}: ${row.score.toFixed(4)}`);
  }
  console.log(`Warmed ${ranked.length} catalog embeddings.`);
}

main();