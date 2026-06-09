import type {
  ConfirmedConstraint,
  ParsedConstraintDraft,
  PreflightResult,
  RawConstraintInput,
} from './constraint-review-types';
import { SOLVER_ENCODABLE_KINDS } from './constraint-registry';

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

function isExecutableCustomDsl(spec: { kind: string; params: Record<string, unknown>; pythonPredicate?: string }): boolean {
  return spec.kind !== 'custom_dsl' || Boolean(spec.params.expr) || Boolean(spec.pythonPredicate?.trim());
}

function fixHintForReason(reason: PreflightResult['blockReasons'][number]): string {
  switch (reason) {
    case 'hard_raw_unconfirmed':
    case 'constraint_unconfirmed':
      return 'Hướng xử lý: Bấm «Gợi ý» để chọn mẫu có sẵn, hoặc «AI phân tích» rồi «Đồng ý» / «Đúng rồi» trên từng dòng bên phải.';
    case 'hard_draft_unresolved':
    case 'constraint_needs_clarification':
    case 'constraint_unparsed':
      return 'Hướng xử lý: Sửa lại câu cho rõ giáo viên/lớp/môn/ngày/tiết, hoặc chọn lại mẫu, hoặc bấm «AI phân tích» để AI giải thích lại.';
    case 'hard_custom_unexecutable':
      return 'Hướng xử lý: Ràng buộc dạng custom chưa có luật máy hiểu. Hãy sửa câu thành dạng mẫu có sẵn, hoặc bỏ qua ràng buộc này.';
    case 'hard_spec_unchecked':
      return 'Hướng xử lý: Loại ràng buộc này hiện chưa được solver hỗ trợ. Hãy sửa thành mẫu khác hoặc bỏ qua.';
    case 'no_confirmed_specs':
      return 'Hướng xử lý: Xác nhận ít nhất một ràng buộc bằng nút «Đúng rồi» trước khi xếp lịch.';
    default:
      return 'Hướng xử lý: Quay lại bước trước và xử lý từng dòng.';
  }
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

  // Mỗi raw constraint chỉ được block 1 lần, dùng set để tránh duplicate
  const blockedRawIds = new Set<string>();
  const perRawReasons = new Map<string, PreflightResult['blockReasons'][number]>();

  const recordBlock = (
    rawId: string,
    reason: PreflightResult['blockReasons'][number]
  ) => {
    blockedRawIds.add(rawId);
    // Ghi nhận lý do đầu tiên gặp (ưu tiên lý do cụ thể hơn)
    if (!perRawReasons.has(rawId)) {
      perRawReasons.set(rawId, reason);
      blockReasons.push(reason);
    }
  };

  // Đếm theo rawId thay vì push message nhiều lần
  const unconfirmedIds: string[] = [];
  for (const raw of rawConstraints) {
    if (!isConstraintConfirmed(raw.id, drafts, confirmed)) {
      unconfirmedIds.push(raw.id);
    }
  }

  if (unconfirmedIds.length > 0) {
    for (const id of unconfirmedIds) {
      const raw = rawConstraints.find((r) => r.id === id);
      // Xác định lý do cụ thể hơn
      const draft = drafts.find((d) => d.rawConstraintId === id);
      if (raw?.type === 'required' && !confirmed.some((c) => c.rawConstraintId === id)) {
        if (draft && UNRESOLVED_DRAFT.includes(draft.status)) {
          recordBlock(id, 'hard_draft_unresolved');
        } else {
          recordBlock(id, 'hard_raw_unconfirmed');
        }
      } else {
        recordBlock(id, 'constraint_unconfirmed');
      }
    }
  }

  // Kiểm tra confirmed specs có vấn đề gì không
  for (const c of confirmed) {
    for (const spec of c.specs) {
      if (spec.severity === 'hard' && !isExecutableCustomDsl(spec)) {
        blockReasons.push('hard_custom_unexecutable');
        messages.push(
          `Ràng buộc bắt buộc dạng đặc biệt chưa chuyển được thành luật máy hiểu: “${spec.original.slice(0, 80)}${spec.original.length > 80 ? '…' : ''}”. Hãy chọn mẫu có sẵn hoặc sửa lại nội dung.`
        );
      }
      if (spec.severity === 'hard' && spec.kind !== 'custom_dsl' && !SOLVER_ENCODABLE_KINDS.has(spec.kind)) {
        blockReasons.push('hard_spec_unchecked');
        messages.push(`Ràng buộc bắt buộc chưa mã hoá được vào solver: ${spec.kind} (${spec.id}).`);
      }
    }
  }

  // Warnings: soft unsupported và ignored
  for (const draft of drafts) {
    if (draft.status === 'ignored') {
      warnings.push(`Ràng buộc phòng/bỏ qua: ${draft.original}`);
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

  // Build summary message từ blockedRawIds (chỉ 1 message tổng, không per-constraint)
  if (blockedRawIds.size > 0) {
    const preview = [...blockedRawIds]
      .slice(0, 3)
      .map((id) => {
        const r = rawConstraints.find((raw) => raw.id === id);
        return `“${r?.text.slice(0, 60) ?? id}${r && r.text.length > 60 ? '…' : ''}”`;
      })
      .join(', ');
    messages.push(
      `Còn ${blockedRawIds.size} ràng buộc chưa được duyệt (${preview}). Hãy bấm «Đúng rồi» hoặc sửa lại trên từng dòng bên phải.`
    );
  }

  // Hướng xử lý: gom theo reason, không lặp lại
  const uniqueBlocks = [...new Set(blockReasons)];
  const seenHints = new Set<string>();
  for (const reason of uniqueBlocks) {
    const hint = fixHintForReason(reason);
    if (!seenHints.has(hint)) {
      seenHints.add(hint);
      messages.push(hint);
    }
  }

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
