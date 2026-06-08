'use client';

import { AlertCircle, Check, Circle, Info, Pencil, Trash2, Loader2 } from 'lucide-react';

import { humanizeDraft } from '../ai/constraint-humanizer';
import type { ConfirmedConstraint, ParsedConstraintDraft } from '../ai/constraint-review-types';
import { constraintTypes } from '../constants';
import type { ConstraintItem } from '../types';
import { STATUS_BADGE_CLASS, STATUS_LABELS } from './constraint-status-ui';

type ConstraintDraftCardProps = {
  constraint: ConstraintItem;
  draft: ParsedConstraintDraft | undefined;
  confirmed: ConfirmedConstraint | undefined;
  onConfirm: () => void;
  onIgnore: () => void;
  onEdit: () => void;
  onPickTemplate: () => void;
  onEditThen?: () => void;
  onDelete: () => void;
  onRejectAndReparse?: () => void;
  isNew?: boolean;
  isReparsing?: boolean;
};

const MAX_REPARSE_ATTEMPTS = 3;

export function ConstraintDraftCard({
  constraint,
  draft,
  confirmed,
  isNew,
  onConfirm,
  onIgnore,
  onEdit,
  onPickTemplate,
  onEditThen,
  onDelete,
  onRejectAndReparse,
  isReparsing,
}: ConstraintDraftCardProps) {
  const constraintType = constraintTypes[constraint.type] ?? constraintTypes.required;
  const summary = confirmed?.displayText ?? confirmed?.summary ?? (draft ? humanizeDraft(draft) : constraint.text);
  const status = draft?.status ?? 'unparsed';
  const needsClarification = Boolean(
    draft?.clarificationQuestions?.length ||
      draft?.issues.some((i) => i.code === 'needs_user_clarification')
  );
  const entityLossIssue = draft?.issues.find((i) => i.code === 'possible_entity_loss');
  const canConfirm =
    Boolean(draft?.proposedSpecs.length) &&
    status !== 'unsupported' &&
    !confirmed &&
    !needsClarification;

  const hasReparsed = Boolean(draft?.reparseCount && draft.reparseCount > 0);
  const canReparse = Boolean(onRejectAndReparse && !confirmed && !isReparsing && (draft?.reparseCount ?? 0) < MAX_REPARSE_ATTEMPTS);
  const maxReparseReached = Boolean(draft?.reparseCount && draft.reparseCount >= MAX_REPARSE_ATTEMPTS);
  const isUnsupported = status === 'unsupported' || maxReparseReached;

  return (
    <div className={`rounded-md border p-3 ${constraintType.boxClass}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${constraintType.badgeClass}`}>
          <Circle className={constraintType.iconClass} size={10} fill="currentColor" strokeWidth={0} />
          {constraintType.label}
        </span>
        {draft ? (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE_CLASS[status]}`}>
            {confirmed ? 'Đã duyệt' : needsClarification ? 'Cần làm rõ' : STATUS_LABELS[status]}
          </span>
        ) : null}
      </div>

      <p className="text-xs text-white/45">{constraint.text}</p>

      {entityLossIssue ? (
        <div
          data-testid="entity-loss-warning"
          className="mt-2 flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/[0.08] px-3 py-2 text-xs text-amber-200"
        >
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Có thể hệ thống đang hiểu thiếu giáo viên</p>
            <p className="mt-0.5 text-[11px] text-amber-200/80">{entityLossIssue.message}</p>
          </div>
        </div>
      ) : null}

      {isNew && !draft ? (
        <div className="mt-2 flex items-center gap-2 rounded border border-sky-500/25 bg-sky-500/[0.06] px-3 py-2 text-xs text-sky-300/90">
          <AlertCircle size={14} className="shrink-0" />
          <span>Ràng buộc mới thêm vào — dùng wizard hoặc chuẩn hóa Custom để có bản duyệt.</span>
        </div>
      ) : null}

      {draft ? (
        <div
          className={`mt-2 rounded border p-2.5 text-sm ${
            hasReparsed || isReparsing
              ? 'border-sky-500/40 bg-sky-500/[0.08]'
              : 'border-white/[0.06] bg-[#0a0a0a]'
          }`}
        >
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">
            {hasReparsed ? 'AI hiểu lại là' : 'Hệ thống hiểu là'}
          </p>
          <p className="mt-1 whitespace-pre-line leading-relaxed">
            {isReparsing ? (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-sky-400" />
                <span className="text-white/50">Đang diễn giải lại...</span>
              </span>
            ) : (
              <span className={draft.displayText ? 'text-white' : 'text-white/50'}>
                {draft.displayText || summary}
              </span>
            )}
          </p>
          {!isReparsing && draft.issues.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-amber-300/80">
              {draft.issues
                .filter((issue) => issue.code !== 'possible_entity_loss' || !entityLossIssue)
                .map((issue, i) => (
                  <li key={`${issue.code}-${i}`}>• {issue.message}</li>
                ))}
            </ul>
          )}
        </div>
      ) : !isNew ? (
        <p className="mt-2 text-xs text-white/35">Chưa có bản duyệt — chọn mẫu hoặc tạo lại bằng Custom.</p>
      ) : null}

      {confirmed && !isNew ? (
        <div className="mt-2 flex items-center gap-2 rounded border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2 text-xs text-emerald-300/90">
          <Info size={14} className="shrink-0" />
          <span>Đã duyệt ở bước trước.</span>
        </div>
      ) : null}

      {isUnsupported && !confirmed ? (
        <div className="mt-2 flex items-start gap-2 rounded border border-red-500/40 bg-red-500/[0.08] px-3 py-2 text-xs text-red-200">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Hệ thống chưa hiểu chính xác ràng buộc này.</p>
            <p className="mt-0.5 text-[11px] text-red-200/80">
              Bạn có thể sửa lại câu theo cách cụ thể hơn, hoặc tạm thời bỏ ràng buộc này.
            </p>
            {constraint.type === 'required' && (
              <p className="mt-1 text-[11px] font-medium text-red-200/80">
                Ràng buộc bắt buộc chưa được xác nhận sẽ không được dùng để xếp lịch.
              </p>
            )}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canConfirm ? (
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center gap-1 rounded-md bg-[#4DB848] px-3 py-1.5 text-xs font-medium text-[#0a0a0a] hover:bg-[#40993C]"
          >
            <Check size={12} strokeWidth={2} />
            Đúng rồi
          </button>
        ) : null}
        {canReparse ? (
          <button
            type="button"
            onClick={onRejectAndReparse}
            disabled={isReparsing}
            className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.04] disabled:opacity-50"
          >
            {isReparsing ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Đang diễn giải...
              </>
            ) : hasReparsed ? (
              'Vẫn không đúng'
            ) : (
              'Không đúng'
            )}
          </button>
        ) : null}
        {draft && !confirmed && !isUnsupported ? (
          <>
            <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.04]">
              <Pencil size={12} />
              Sửa cách hiểu
            </button>
            {entityLossIssue && onEditThen ? (
              <button
                type="button"
                data-testid="entity-loss-edit-then"
                onClick={onEditThen}
                className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/[0.08] px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/[0.15]"
              >
                <Pencil size={12} />
                Sửa THEN
              </button>
            ) : null}
            <button type="button" onClick={onPickTemplate} className="rounded-md border border-white/[0.08] px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.04]">
              Chọn mẫu
            </button>
          </>
        ) : null}
        {confirmed ? (
          <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.04]">
            <Pencil size={12} />
            Chỉnh sửa
          </button>
        ) : null}
        {draft && !confirmed && (constraint.type === 'preferred' || isUnsupported) ? (
          <button type="button" onClick={onIgnore} className="rounded-md border border-white/[0.08] px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.04]">
            Bỏ qua
          </button>
        ) : null}
        <button type="button" onClick={onDelete} className="ml-auto p-1 transition hover:bg-white/[0.04]">
          <Trash2 size={20} className="text-red-400/60 hover:text-red-400" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
