import type { ConfirmedConstraint, ParsedConstraintDraft } from '../ai/constraint-review-types';
import type { ConstraintItem } from '../types';

export type UserReviewStatus = 'ok' | 'needs_confirm' | 'cannot_understand';

export function userFriendlyReviewStatus(
  draft: ParsedConstraintDraft | undefined,
  confirmed: ConfirmedConstraint | undefined
): UserReviewStatus {
  if (confirmed) return 'ok';
  if (!draft) return 'cannot_understand';
  if (draft.status === 'unsupported' || draft.status === 'unparsed') return 'cannot_understand';
  if (
    draft.status === 'needs_review' ||
    draft.status === 'ambiguous' ||
    draft.confidence === 'low' ||
    draft.confidence === 'medium' ||
    draft.issues.some((i) => i.code === 'possible_entity_loss' || i.code === 'needs_user_clarification')
  ) {
    return 'needs_confirm';
  }
  if (draft.status === 'parsed' && draft.confidence === 'high') return 'ok';
  return 'needs_confirm';
}

export const USER_REVIEW_STATUS_COPY: Record<
  UserReviewStatus,
  { icon: string; label: string; hint?: string }
> = {
  ok: { icon: '✅', label: 'Đã hiểu' },
  needs_confirm: {
    icon: '⚠️',
    label: 'Cần bạn xác nhận',
    hint: 'Đọc phần «Hiểu là» bên dưới. Đúng thì bấm «Đúng rồi», sai thì bấm «AI phân tích».',
  },
  cannot_understand: {
    icon: '❌',
    label: 'Hệ thống chưa hiểu',
    hint: 'Bấm «AI phân tích» để hệ thống diễn giải lại bằng AI.',
  },
};

export function interpretationLine(
  draft: ParsedConstraintDraft | undefined,
  confirmed: ConfirmedConstraint | undefined,
  fallbackSummary: string
): string {
  if (confirmed?.displayText) return confirmed.displayText;
  if (confirmed?.summary) return confirmed.summary;
  if (draft?.displayText?.trim()) return draft.displayText;
  return fallbackSummary;
}

/** Raw constraint ids that block solve (required, not confirmed, not ignored). */
export function unconfirmedRequiredConstraintIds(
  constraints: ConstraintItem[],
  confirmed: ConfirmedConstraint[],
  drafts: ParsedConstraintDraft[]
): string[] {
  const confirmedIds = new Set(confirmed.map((c) => c.rawConstraintId));
  const ignoredIds = new Set(
    drafts.filter((d) => d.status === 'ignored').map((d) => d.rawConstraintId)
  );
  return constraints
    .filter((c) => c.type === 'required' && !confirmedIds.has(c.id) && !ignoredIds.has(c.id))
    .map((c) => c.id);
}

export const MAX_AI_ANALYSIS_ATTEMPTS = 2;
