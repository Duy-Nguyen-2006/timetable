/**
 * Deterministic semantic-ish text embeddings for offline retrieval.
 * Uses character n-grams + word bigrams (no external API, no hash-only buckets).
 */

import { normalizeConstraintText } from './translator-text';

export const EMBEDDING_DIM = 384;

function tokenize(text: string): string[] {
  return normalizeConstraintText(text)
    .split(/[^\p{L}\p{M}\p{N}_]+/u)
    .filter((token) => token.length > 1);
}

function fnv1a(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function addFeatures(vec: number[], feature: string, weight = 1): void {
  const dim = vec.length;
  const grams = new Set<string>();
  grams.add(feature);
  for (let size = 3; size <= 5; size += 1) {
    for (let index = 0; index <= feature.length - size; index += 1) {
      grams.add(feature.slice(index, index + size));
    }
  }
  for (const gram of grams) {
    const hash = fnv1a(gram);
    const slot = hash % dim;
    const sign = (hash & 1) === 0 ? 1 : -1;
    vec[slot] += sign * weight;
  }
}

function normalizeVector(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0));
  if (norm <= 0) return vec;
  return vec.map((value) => value / norm);
}

/** Build a normalized embedding vector for Vietnamese constraint text. */
export function computeSemanticEmbedding(text: string): number[] {
  const vec = new Array<number>(EMBEDDING_DIM).fill(0);
  const tokens = tokenize(text);
  for (const token of tokens) addFeatures(vec, token, 1);
  for (let index = 0; index < tokens.length - 1; index += 1) {
    addFeatures(vec, `${tokens[index]}_${tokens[index + 1]}`, 1.4);
  }
  return normalizeVector(vec);
}

/** Cosine similarity between two normalized vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let index = 0; index < a.length; index += 1) dot += a[index] * b[index];
  return dot;
}