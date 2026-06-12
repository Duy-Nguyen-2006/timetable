'use client';

import { AlertCircle, Check, Circle, Info, Sparkles, Loader2 } from 'lucide-react';

import { humanizeDraft } from '../ai/constraint-humanizer';
import { getConstraintCapability } from '../ai/constraint-capabilities';
import { checkHardConstraintMechanism } from '../ai/constraint-ir';
import type { ConfirmedConstraint, ParsedConstraintDraft } from '../ai/constraint-review-types';
import { constraintTypes } from '../constants';
import type { ConstraintItem } from '../types';
import type { ClarificationOption } from '../ai/constraint-clarification-types';
import type { ConstraintSpec } from '../ai/constraint-spec';
import { ClarificationSuggestionsBlock } from './ClarificationSuggestionsBlock';
import {
  hasRealInterpretation,
  interpretationLine,
  MAX_AI_ANALYSIS_ATTEMPTS,
  USER_REVIEW_STATUS_COPY,
  userFriendlyReviewStatus,
} from './constraint-review-ui';

type ConstraintDraftCardProps = {
  constraint: ConstraintItem;
  draft: ParsedConstraintDraft | undefined;
  confirmed: ConfirmedConstraint | undefined;
  onConfirm: () => void;
  onIgnore: () => void;
  onDelete: () => void;
  onAiAnalyze?: () => void;
  onApplySpecDraft?: (spec: ConstraintSpec) => void;
  onOpenTemplatePicker?: () => void;
  onOpenManualEdit?: () => void;
  onDemoteToPreferred?: () => void;
  isNew?: boolean;
  isReparsing?: boolean;
  highlight?: boolean;
};

const JARGON_ISSUE_PATTERN = /\b(rule\s*parser|parser|custom_dsl|spec|kind|IR|LLM)\b/iu;

function isUserFacingIssue(message: string): boolean {
  return !JARGON_ISSUE_PATTERN.test(message);
}

function ConfirmInterpretationPreview({ draft }: { draft: ParsedConstraintDraft }) {
  const card = draft.interpretationCard;
  if (!card) return null;

  return (
    <div
      data-testid="confirm-interpretation-card"
      data-editable-atom-ids={card.editableAtomIds.join(',')}
      className="mt-2 rounded border border-sky-500/25 bg-sky-500/[0.06] p-2 text-xs"
    >
      <div className="grid gap-2 sm:grid-cols-[72px_1fr]">
        {card.scopeVi ? (
          <>
            <span className="text-[10px] font-medium uppercase tracking-widest text-sky-200/50">Phạm vi</span>
            <span className="text-sky-100/85">{card.scopeVi}</span>
          </>
        ) : null}
        {card.ifAtomVi ? (
          <>
            <span className="text-[10px] font-medium uppercase tracking-widest text-sky-200/50">Nếu</span>
            <span className="text-sky-100/85">{card.ifAtomVi}</span>
          </>
        ) : null}
        <span className="text-[10px] font-medium uppercase tracking-widest text-sky-200/50">Thì</span>
        <ul data-testid="confirm-interpretation-then" className="space-y-1 text-sky-50/90">
          {card.thenAtomsVi.map((atom, index) => (
            <li key={`${card.editableAtomIds[index] ?? 'atom'}-${index}`} className="leading-relaxed">
              {atom}
            </li>
          ))}
        </ul>
      </div>
      {card.notesVi.length > 0 ? (
        <ul data-testid="confirm-interpretation-notes" className="mt-2 space-y-1 border-t border-white/[0.06] pt-2 text-[11px] text-white/45">
          {card.notesVi.map((note, index) => (
            <li key={`${note}-${index}`}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ConstraintDraftCard({
  constraint,
  draft,
  confirmed,
  isNew,
  onConfirm,
  onIgnore,
  onDelete,
  onAiAnalyze,
  onApplySpecDraft,
  onOpenTemplatePicker,
  onOpenManualEdit,
  onDemoteToPreferred,
  isReparsing,
  highlight,
}: ConstraintDraftCardProps) {
  const constraintType = constraintTypes[constraint.type] ?? constraintTypes.required;
  const fallbackSummary = draft ? humanizeDraft(draft) : constraint.text;
  const understood = interpretationLine(draft, confirmed, fallbackSummary);
  const showInterpretation = hasRealInterpretation(draft, confirmed, constraint.text);
  const userStatus = userFriendlyReviewStatus(draft, confirmed);
  const statusCopy = USER_REVIEW_STATUS_COPY[userStatus];
  const needsClarification = Boolean(
    draft?.clarificationQuestions?.length ||
      draft?.issues.some((i) => i.code === 'needs_user_clarification')
  );
  const entityLossIssue = draft?.issues.find((i) => i.code === 'possible_entity_loss');
  const visibleIssues =
    draft?.issues.filter(
      (issue) =>
        isUserFacingIssue(issue.message) &&
        (issue.code !== 'possible_entity_loss' || !entityLossIssue) &&
        (issue.code !== 'needs_user_clarification' || !draft.clarificationQuestions?.length)
    ) ?? [];
  const status = draft?.status ?? 'unparsed';
  const hardSpecsExecutable =
    constraint.type !== 'required' ||
    !draft?.proposedSpecs.length ||
    draft.proposedSpecs.every((spec) => checkHardConstraintMechanism(spec).ok);
  const hasNonExecutableHard = Boolean(draft?.proposedSpecs.length) && !hardSpecsExecutable;
  const canConfirm =
    Boolean(draft?.proposedSpecs.length) &&
    status !== 'unsupported' &&
    !confirmed &&
    !needsClarification &&
    hardSpecsExecutable;

  const hasAiAnalyzed = Boolean(draft?.reparseCount && draft.reparseCount > 0);
  const aiAttempts = draft?.reparseCount ?? 0;
  const canAiAnalyze = Boolean(
    onAiAnalyze && !confirmed && !isReparsing && aiAttempts < MAX_AI_ANALYSIS_ATTEMPTS
  );
  const maxAiReached = aiAttempts >= MAX_AI_ANALYSIS_ATTEMPTS;
  const isUnsupported = status === 'unsupported' || (maxAiReached && !confirmed);
  const showCompare = Boolean(draft && !confirmed && understood.trim() !== constraint.text.trim());

  const primarySpec = draft?.proposedSpecs?.[0] || confirmed?.specs?.[0];
  const capBadge = (() => {
    if (!primarySpec) return null;
    if (primarySpec.kind === 'custom_dsl') return null;
    const cap = getConstraintCapability(primarySpec.kind);
    if (cap.canEncodeSolver) {
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
          Solver hỗ trợ đầy đủ
        </span>
      );
    }
    if (cap.canCheckDeterministically) {
      return (
        <span className="inline-flex items-center rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-400 ring-1 ring-inset ring-amber-500/20">
          Chỉ kiểm tra, không tối ưu
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-medium text-red-400 ring-1 ring-inset ring-red-500/20">
        Chưa được hỗ trợ
      </span>
    );
  })();

  return (
    <div
      data-constraint-id={constraint.id}
      className={`rounded-md border p-3 ${constraintType.boxClass} ${
        highlight ? 'animate-pulse ring-2 ring-amber-400/70 ring-offset-2 ring-offset-[#0a0a0a]' : ''
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${constraintType.badgeClass}`}>
          <Circle className={constraintType.iconClass} size={10} fill="currentColor" strokeWidth={0} />
          {constraintType.label}
        </span>
        {draft || confirmed ? (
          <div className="flex items-center gap-2">
            {capBadge}
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                confirmed
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : userStatus === 'cannot_understand'
                    ? 'border-red-500/30 bg-red-500/10 text-red-300'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
              }`}
              title={statusCopy.hint}
            >
              {confirmed ? '✅ Đã duyệt' : `${statusCopy.icon} ${statusCopy.label}`}
            </span>
          </div>
        ) : null}
      </div>

      {showCompare ? (
        <div className="space-y-2 text-xs">
          <div className="rounded border border-white/[0.06] bg-[#0a0a0a] px-2.5 py-2">
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Bạn viết</p>
            <p className="mt-1 leading-relaxed text-white/55">{constraint.text}</p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-white/45">{constraint.text}</p>
      )}

      {hasNonExecutableHard && !confirmed ? (
        <div
          data-testid="non-executable-warning"
          className="mt-2 flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/[0.08] px-3 py-2 text-xs text-amber-200"
        >
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Máy chưa chuyển được thành luật thực thi</p>
            <p className="mt-0.5 text-[11px] text-amber-200/80">
              Ràng buộc bắt buộc này sẽ bị chặn khi xếp lịch. Hãy chọn mẫu có sẵn hoặc sửa lại câu cho rõ hơn.
            </p>
          </div>
        </div>
      ) : null}

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
          <span>Ràng buộc mới — đợi hệ thống phân tích hoặc bấm «AI phân tích» nếu chưa có bản «Hiểu là».</span>
        </div>
      ) : null}

      {draft && showInterpretation ? (
        <div
          className={`mt-2 rounded border p-2.5 text-sm ${
            hasAiAnalyzed || isReparsing
              ? 'border-sky-500/40 bg-sky-500/[0.08]'
              : 'border-white/[0.06] bg-[#0a0a0a]'
          }`}
        >
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">
            {hasAiAnalyzed ? 'AI phân tích là' : 'Hiểu là'}
          </p>
          <p className="mt-1 whitespace-pre-line leading-relaxed">
            {isReparsing ? (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-violet-400" />
                <span className="text-white/50">Đang AI phân tích...</span>
              </span>
            ) : (
              <span className={understood ? 'text-white' : 'text-white/50'}>{understood}</span>
            )}
          </p>
          {!isReparsing ? <ConfirmInterpretationPreview draft={draft} /> : null}
          {!isReparsing && visibleIssues.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-xs text-amber-300/80">
              {visibleIssues.map((issue, i) => (
                <li key={`${issue.code}-${i}`}>• {issue.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {draft && !showInterpretation && (needsClarification || isReparsing) ? (
        <div
          data-testid="needs-clarification-block"
          className="mt-2 rounded border border-amber-500/30 bg-amber-500/[0.06] p-2.5 text-sm"
        >
          <p className="text-[10px] font-medium uppercase tracking-widest text-amber-300/70">
            Gợi ý cách hiểu
          </p>
          {isReparsing ? (
            <p className="mt-1 flex items-center gap-2 leading-relaxed">
              <Loader2 size={14} className="animate-spin text-violet-400" />
              <span className="text-white/50">Đang AI phân tích...</span>
            </p>
          ) : (
            <div className="mt-2">
              {draft.clarificationQuestions?.length ? (
                <ClarificationSuggestionsBlock
                  questions={draft.clarificationQuestions}
                  reparseCount={draft.reparseCount}
                  constraintType={constraint.type}
                  onSelectOption={(_questionId, _option: ClarificationOption) => {
                    onAiAnalyze?.();
                  }}
                  onApplySpecDraft={onApplySpecDraft}
                  onReparseWithFeedback={() => onAiAnalyze?.()}
                  onOpenManualEdit={onOpenManualEdit}
                  onOpenTemplatePicker={onOpenTemplatePicker}
                  onDemoteToPreferred={onDemoteToPreferred}
                  showAiRetry={Boolean(onAiAnalyze)}
                  onAiRetry={() => onAiAnalyze?.()}
                />
              ) : visibleIssues.length > 0 ? (
                <ul className="space-y-0.5 text-xs text-amber-300/80">
                  {visibleIssues.map((issue, i) => (
                    <li key={`${issue.code}-${i}`}>• {issue.message}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-amber-200/80">
                  Mình chưa chắc cách hiểu câu này. Chọn giúp cách đúng ý bạn bên dưới, hoặc dùng mẫu có sẵn.
                </p>
              )}
            </div>
          )}
        </div>
      ) : null}

      {!draft && !isNew ? (
        <p className="mt-2 text-xs text-white/35">Chưa có bản phân tích — bấm «AI phân tích» nếu cần.</p>
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
              Thử «AI phân tích», hoặc sửa lại câu rõ hơn, hoặc bỏ qua ràng buộc này.
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
        {canAiAnalyze ? (
          <button
            type="button"
            data-testid="ai-analyze-button"
            onClick={onAiAnalyze}
            disabled={isReparsing}
            className="inline-flex items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-500/25 disabled:opacity-50"
          >
            {isReparsing ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Đang phân tích...
              </>
            ) : (
              <>
                <Sparkles size={12} />
                AI phân tích
              </>
            )}
          </button>
        ) : null}
        {!confirmed ? (
          <button type="button" onClick={onIgnore} className="rounded-md border border-white/[0.08] px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.04]">
            Bỏ qua
          </button>
        ) : null}
        <button type="button" onClick={onDelete} className="ml-auto rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20">
          Loại bỏ
        </button>
      </div>
    </div>
  );
}
