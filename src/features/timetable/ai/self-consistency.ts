import type { SlotFillResponse } from './slot-fill-types';

export type SelfConsistencyResult = {
  accepted: boolean;
  calls: number;
  canonicalVotes: string[];
  winner?: SlotFillResponse;
};

function normalizeForVote(response: SlotFillResponse): SlotFillResponse {
  const condition = response.condition
    ? Object.fromEntries(Object.entries(response.condition).sort(([a], [b]) => a.localeCompare(b))) as typeof response.condition
    : undefined;
  return {
    condition,
    atoms: response.atoms.map((atom) => ({
      kind: atom.kind,
      params: Object.fromEntries(Object.entries(atom.params ?? {}).sort(([a], [b]) => a.localeCompare(b))),
      confidence: atom.confidence,
      missingParams: [...(atom.missingParams ?? [])].sort(),
    })),
  };
}

export function canonicalSlotFillString(response: SlotFillResponse): string {
  return JSON.stringify(normalizeForVote(response));
}

export function voteSlotFillResponses(responses: SlotFillResponse[]): SelfConsistencyResult {
  const canonicalVotes = responses.map(canonicalSlotFillString);
  const counts = new Map<string, number>();
  for (const vote of canonicalVotes) counts.set(vote, (counts.get(vote) ?? 0) + 1);
  const [winnerKey, winnerCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  const winnerIndex = winnerKey ? canonicalVotes.indexOf(winnerKey) : -1;
  const majorityThreshold = Math.ceil(responses.length / 2);
  return {
    accepted: responses.length > 0 && (winnerCount ?? 0) >= majorityThreshold,
    calls: responses.length,
    canonicalVotes,
    winner: winnerIndex >= 0 ? responses[winnerIndex] : undefined,
  };
}
