import type {
  ConfirmedConstraint,
  ParsedConstraintDraft,
  PreflightResult,
  RawConstraintInput,
} from './constraint-review-types';
import { CHECKED_KINDS } from './constraint-registry';

const UNRESOLVED_DRAFT: ParsedConstraintDraft['status'][] = [
  'unparsed',
  'unsupported',
  'ambiguous',
  'needs_review',
];

const NEEDS_CLARIFICATION = new Set<ParsedConstraintDraft['status']>([
  'unparsed',
  'unsupported',
  'ambiguous',
  'needs_review',
]);

function isConstraintConfirmed(
  rawId: string,
  drafts: ParsedConstraintDraft[],
  confirmed: ConfirmedConstraint[]
): boolean {
  const draft = drafts.find((d) => d.rawConstraintId === rawId);
  if (draft?.status === 'ignored') return true;
  if (confirmed.some((c) => c.rawConstraintId === rawId)) return true;
  if (!draft) return false;
  return !NEEDS_CLARIFICATION.has(draft.status);
}

export function assertSolvableConstraintState(
  rawConstraints: RawConstraintInput[],
  drafts: ParsedConstraintDraft[],
  confirmed: ConfirmedConstraint[]
): PreflightResult {
  const messages: string[] = [];
  const warnings: string[] = [];
  const blockReasons: PreflightResult['blockReasons'] = [];

  if (rawConstraints.length === 0) {
    return { ok: true, canSolve: true, blockReasons: [], messages, warnings };
  }

  const unconfirmed = rawConstraints.filter((raw) => !isConstraintConfirmed(raw.id, drafts, confirmed));
  if (unconfirmed.length > 0) {
    blockReasons.push('constraint_unconfirmed');
    const preview = unconfirmed
      .slice(0, 3)
      .map((r) => `“${r.text.slice(0, 72)}${r.text.length > 72 ? '…' : ''}”`)
      .join(', ');
    messages.push(
      `Còn ${unconfirmed.length} ràng buộc chưa được duyệt (${preview}). Phân tích và bấm «Đúng rồi» trên từng dòng trước khi xếp lịch.`
    );
  }

  const needsClarification = drafts.filter(
    (d) =>
      rawConstraints.some((r) => r.id === d.rawConstraintId) &&
      NEEDS_CLARIFICATION.has(d.status) &&
      !confirmed.some((c) => c.rawConstraintId === d.rawConstraintId)
  );
  if (needsClarification.length > 0) {
    blockReasons.push('constraint_needs_clarification');
    messages.push(
      `Còn ${needsClarification.length} ràng buộc cần làm rõ ý nghĩa (chọn đáp án hoặc «Sửa cách hiểu»).`
    );
  }

  const unparsedOnly = drafts.filter(
    (d) =>
      d.status === 'unparsed' &&
      rawConstraints.some((r) => r.id === d.rawConstraintId) &&
      !confirmed.some((c) => c.rawConstraintId === d.rawConstraintId)
  );
  if (unparsedOnly.length > 0) {
    blockReasons.push('constraint_unparsed');
    messages.push(
      `Còn ${unparsedOnly.length} ràng buộc chưa phân tích được. Bấm «Phân tích ràng buộc».`
    );
  }

  const hardRaw = rawConstraints.filter((r) => r.type === 'required');
  for (const raw of hardRaw) {
    if (!isConstraintConfirmed(raw.id, drafts, confirmed)) {
      blockReasons.push('hard_raw_unconfirmed');
      messages.push(`Ràng buộc bắt buộc chưa xác nhận: “${raw.text.slice(0, 80)}…”`);
    }
  }

  for (const raw of hardRaw) {
    const draft = drafts.find((d) => d.rawConstraintId === raw.id);
    if (!draft) continue;
    if (UNRESOLVED_DRAFT.includes(draft.status) && !confirmed.some((c) => c.rawConstraintId === raw.id)) {
      blockReasons.push('hard_draft_unresolved');
      messages.push(`Ràng buộc bắt buộc chưa xử lý xong (trạng thái ${draft.status}).`);
    }
    if (draft.status === 'ignored') {
      warnings.push(`Ràng buộc phòng/bỏ qua: ${draft.original}`);
    }
  }

  for (const c of confirmed) {
    for (const spec of c.specs) {
      if (spec.severity === 'hard' && !CHECKED_KINDS.has(spec.kind)) {
        blockReasons.push('hard_spec_unchecked');
        messages.push(`Ràng buộc bắt buộc không kiểm tra được: ${spec.kind} (${spec.id}).`);
      }
    }
  }

  const softUnsupported = drafts.filter(
    (d) =>
      rawConstraints.find((r) => r.id === d.rawConstraintId)?.type === 'preferred' &&
      (d.status === 'unsupported' || d.status === 'unparsed')
  );
  for (const d of softUnsupported) {
    warnings.push(`Ràng buộc nên có sẽ không áp dụng: ${d.original}`);
  }

  const uniqueBlocks = [...new Set(blockReasons)];
  const ok = uniqueBlocks.length === 0;
  return {
    ok,
    canSolve: ok,
    blockReasons: uniqueBlocks,
    messages,
    warnings,
  };
}

export function flattenConfirmedSpecs(confirmed: ConfirmedConstraint[]) {
  return confirmed.flatMap((c) => c.specs);
}
