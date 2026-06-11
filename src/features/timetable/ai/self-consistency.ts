/**
 * self-consistency.ts — Conditional Self-Consistency (N=3 for compound, N=1 for simple)
 *
 * Per spec §[3]:
 * - Only activate when segment.shape==='if_then' OR atoms.length > 1
 * - Sample LLM Lượt-2 N=3 times (temp ~0.4)
 * - Normalize IR then vote:
 *   - Unanimous → confidence high
 *   - Divergent → mark mismatched atoms as 'low' → push to [5] clarify
 * - Simple (1 atom, simple shape) → N=1
 */

import type { SlotFillResponse, SlotFillAtom } from './slot-fill-prompt';
import { invokeAnalyzeChat } from './analyze-constraint-service';
import type { AIProviderConfig } from './types';
import { buildSlotFillPrompt } from './slot-fill-prompt';
import type { ConstraintRetrieverCandidate, ConstraintResolverHints } from './constraint-retriever';
import { parseModelJson } from './parse-model-json';

export type SelfConsistencyResult = {
  /** Best merged response after voting */
  merged: SlotFillResponse;
  /** Whether all samples were unanimous */
  unanimous: boolean;
  /** Per-atom divergence count (how many of N samples disagreed) */
  atomDivergence: number[];
  /** Number of LLM calls made */
  samplesTaken: number;
};

/** Normalize an atom for comparison (sort params keys, stringify values) */
function normalizeAtomKey(atom: SlotFillAtom): string {
  const sortedParams = Object.entries(atom.params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join('|');
  return `${atom.kind}::${sortedParams}`;
}

/** Parse LLM response as SlotFillResponse */
function parseSlotFillResponse(content: string): SlotFillResponse | null {
  if (!content?.trim()) return null;
  try {
    const parsed = parseModelJson(content);
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).atoms)) {
      return parsed as SlotFillResponse;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Run self-consistency check for compound constraints.
 * Returns the best merged response and divergence information.
 */
export async function runSelfConsistency(
  rawText: string,
  hints: ConstraintResolverHints,
  candidates: ConstraintRetrieverCandidate[],
  config: AIProviderConfig,
  options: {
    /** Whether this is a compound constraint (if_then or multi-atom) */
    isCompound: boolean;
    /** Number of samples for compound (default 3) */
    nSamples?: number;
    /** Previous attempts for prompt context */
    previousAttempts?: Array<{ displayText: string; source: string; confidence: string }>;
  }
): Promise<SelfConsistencyResult> {
  const { isCompound, nSamples = 3, previousAttempts } = options;
  const numSamples = isCompound ? nSamples : 1;

  if (numSamples === 1) {
    // Simple case: single LLM call
    const prompt = buildSlotFillPrompt(rawText, hints, candidates, { previousAttempts });
    const response = await invokeAnalyzeChat(config, [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ], { jsonSchema: undefined });

    const parsed = parseSlotFillResponse(response.content ?? '');
    if (!parsed || !parsed.atoms?.length) {
      return {
        merged: { atoms: [] },
        unanimous: true,
        atomDivergence: [],
        samplesTaken: 1,
      };
    }

    return {
      merged: parsed,
      unanimous: true,
      atomDivergence: parsed.atoms.map(() => 0),
      samplesTaken: 1,
    };
  }

  // Compound case: N samples
  const samples: SlotFillResponse[] = [];
  const prompt = buildSlotFillPrompt(rawText, hints, candidates, { previousAttempts });

  for (let i = 0; i < numSamples; i++) {
    try {
      const response = await invokeAnalyzeChat(config, [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ]);
      const parsed = parseSlotFillResponse(response.content ?? '');
      if (parsed && parsed.atoms?.length) {
        samples.push(parsed);
      }
    } catch {
      // Skip failed samples
    }
  }

  if (samples.length === 0) {
    return {
      merged: { atoms: [] },
      unanimous: true,
      atomDivergence: [],
      samplesTaken: numSamples,
    };
  }

  // Vote: use the first sample as the base, compare with others
  const base = samples[0];
  const atomDivergence = base.atoms.map(() => 0);

  for (let atomIdx = 0; atomIdx < base.atoms.length; atomIdx++) {
    const baseKey = normalizeAtomKey(base.atoms[atomIdx]);
    for (let sampleIdx = 1; sampleIdx < samples.length; sampleIdx++) {
      const sampleAtom = samples[sampleIdx].atoms[atomIdx];
      if (!sampleAtom || normalizeAtomKey(sampleAtom) !== baseKey) {
        atomDivergence[atomIdx]++;
      }
    }
  }

  const unanimous = atomDivergence.every(d => d === 0);

  // Merge: for divergent atoms, lower confidence to 'low'
  const merged: SlotFillResponse = {
    atoms: base.atoms.map((atom, idx) => {
      if (atomDivergence[idx] > 0) {
        return { ...atom, confidence: 'low' };
      }
      return atom;
    }),
    condition: base.condition,
  };

  return {
    merged,
    unanimous,
    atomDivergence,
    samplesTaken: numSamples,
  };
}

/**
 * Determine if self-consistency should be activated.
 * Only for compound: shape==='if_then' or atoms.length > 1
 */
export function shouldRunSelfConsistency(
  shape: 'simple' | 'if_then',
  atomCount: number
): boolean {
  return shape === 'if_then' || atomCount > 1;
}
