import type { ParsedConstraintDraft } from '../ai/constraint-review-types';
import type { ConstraintItem } from '../types';

export function constraintItemFromPending(
  rawId: string,
  text: string,
  type: 'required' | 'preferred',
  weight?: number
): ConstraintItem {
  return {
    id: rawId,
    type,
    text,
    weight: type === 'preferred' ? weight : undefined,
  };
}

export function mergePendingImport(
  constraintList: ConstraintItem[],
  constraintDrafts: ParsedConstraintDraft[],
  item: ConstraintItem,
  draft: ParsedConstraintDraft
): { constraintList: ConstraintItem[]; constraintDrafts: ParsedConstraintDraft[] } {
  const withoutItem = constraintList.filter((c) => c.id !== item.id);
  const withoutDraft = constraintDrafts.filter((d) => d.rawConstraintId !== item.id);
  return {
    constraintList: [...withoutItem, item],
    constraintDrafts: [...withoutDraft, { ...draft, rawConstraintId: item.id, id: `draft_${item.id}` }],
  };
}
