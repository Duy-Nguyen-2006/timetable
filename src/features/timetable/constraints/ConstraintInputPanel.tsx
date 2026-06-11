'use client';

import { useState } from 'react';
import { Circle, Loader2, Plus, Sparkles, Send } from 'lucide-react';

import {
  constraintTypeList,
  constraintTypes,
  disabledPrimaryButtonClass,
  iconShellClass,
  panelClass,
  primaryButtonClass,
} from '../constants';
import { suggestBuiltInConstraint, type BuiltInSuggestion } from '../ai/built-in-suggestion';
import type { ConstraintSpec } from '../ai/constraint-spec';
import type { ClarificationOption } from '../ai/constraint-clarification-types';
import type { ParsedConstraintDraft } from '../ai/constraint-review-types';
import type { AgentInputPayload } from '../ai/types';
import type { ConstraintItem } from '../types';
import { ClarificationSuggestionsBlock } from './ClarificationSuggestionsBlock';
import { hasRealInterpretation, isDraftCommittable } from './constraint-review-ui';
import {
  CONSTRAINT_GROUP_LABELS,
  CONSTRAINT_TEMPLATES,
} from './constraint-form-schema';

export type ConstraintDraftForm = {
  type: keyof typeof constraintTypes;
  text: string;
  weight: number;
};

export type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type PendingAiPreview = {
  rawText: string;
  item: ConstraintItem;
  draft: ParsedConstraintDraft;
  reparseCount: number;
  conversation?: ConversationMessage[];
};

type ConstraintInputPanelProps = {
  draft: ConstraintDraftForm;
  onDraftChange: (patch: Partial<ConstraintDraftForm>) => void;
  agentInput: AgentInputPayload;
  totalCount: number;
  onImportSuggestion: (item: ConstraintItem, draft: ParsedConstraintDraft) => void;
  onAiAnalyzeRaw: (rawText: string, constraintType: 'required' | 'preferred', weight?: number) => void;
  aiLoading?: boolean;
  aiError?: string | null;
  pendingAiPreview: PendingAiPreview | null;
  onAcceptAiPreview: () => void;
  onReanalyzeAiPreview: () => void;
  onDismissAiPreview: () => void;
  onSendChatMessage?: (message: string) => void;
  chatLoading?: boolean;
  onApplyPreviewSpecDraft?: (spec: ConstraintSpec) => void;
  onApplyPreviewClarificationChoice?: (option: ClarificationOption) => void;
  onReparsePreviewWithFeedback?: (feedback: string) => void;
  onOpenTemplatePicker?: () => void;
  onOpenManualEdit?: () => void;
  onDemotePreviewToPreferred?: () => void;
};

function uniqueLabels(labels: string[]): string[] {
  return Array.from(new Set(labels)).filter(Boolean);
}

function dayDisplay(agentInput: AgentInputPayload, value: unknown): string {
  if (typeof value !== 'string') return String(value ?? '');
  return agentInput.days.find((day) => day.id === value)?.label ?? value;
}

function paramDisplay(agentInput: AgentInputPayload, key: string, value: unknown): string {
  const labelByKey: Record<string, string> = {
    teacher: 'Giáo viên',
    subject: 'Môn học',
    class: 'Lớp',
    day: 'Ngày',
    days: 'Ngày',
    period: 'Tiết',
    periods: 'Tiết',
    maxPerDay: 'Số tiết tối đa',
    max: 'Số tiết liên tiếp tối đa',
    maxConsecutive: 'Số tiết liên tiếp tối đa',
    length: 'Số tiết trong cụm',
  };
  const label = labelByKey[key] ?? key;
  const displayValue = Array.isArray(value)
    ? value.map((item) => (key === 'days' ? dayDisplay(agentInput, item) : String(item))).join(', ')
    : key === 'day'
      ? dayDisplay(agentInput, value)
      : String(value ?? '');
  return `${label}: ${displayValue}`;
}

export function ConstraintInputPanel({
  draft,
  onDraftChange,
  agentInput,
  totalCount,
  onImportSuggestion,
  onAiAnalyzeRaw,
  aiLoading,
  aiError,
  pendingAiPreview,
  onAcceptAiPreview,
  onReanalyzeAiPreview,
  onDismissAiPreview,
  onSendChatMessage,
  chatLoading,
  onApplyPreviewSpecDraft,
  onApplyPreviewClarificationChoice,
  onReparsePreviewWithFeedback,
  onOpenTemplatePicker,
  onOpenManualEdit,
  onDemotePreviewToPreferred,
}: ConstraintInputPanelProps) {
  const [suggestion, setSuggestion] = useState<BuiltInSuggestion | null>(null);
  const [chatInput, setChatInput] = useState('');

  const runSuggestion = () => {
    if (!draft.text.trim()) return;
    const result = suggestBuiltInConstraint({
      userText: draft.text,
      teachers: uniqueLabels(agentInput.assignments.map((a) => a.teacher.label)),
      subjects: uniqueLabels(agentInput.assignments.map((a) => a.subject.label)),
      classes: uniqueLabels(agentInput.assignments.map((a) => a.class.label)),
      assignments: agentInput.assignments,
      days: agentInput.days,
    });
    setSuggestion(result);
  };

  const importBuiltInSuggestion = () => {
    if (!suggestion || suggestion.decision !== 'suggest_built_in') return;
    const now = Date.now();
    const id = `${now}-suggest-${draft.text.slice(0, 20)}`;
    const item: ConstraintItem = {
      id,
      type: draft.type,
      text: draft.text,
      weight: draft.type === 'preferred' ? draft.weight : undefined,
    };
    // Tạo spec thật từ suggestion để solver có thể dùng luôn
    const severity = draft.type === 'required' ? 'hard' : 'soft';
    const specsDraft = suggestion.specsDraft?.length
      ? suggestion.specsDraft
      : [{ kind: suggestion.kind, paramsDraft: suggestion.paramsDraft }];
    const proposedSpecs: ConstraintSpec[] = specsDraft.map((specDraft, index) => ({
      id: `spec_${id}_${index}`,
      original: draft.text,
      severity,
      kind: specDraft.kind,
      params: { ...specDraft.paramsDraft },
      ...(draft.type === 'preferred' ? { weight: draft.weight } : {}),
    }));
    onImportSuggestion(item, {
      id: `draft_${id}`,
      rawConstraintId: id,
      original: draft.text,
      proposedSpecs,
      status: 'parsed',
      confidence: 'high',
      explanation: suggestion.explanation,
      issues: [],
      source: 'rule',
    });
    onDraftChange({ text: '' });
    setSuggestion(null);
  };

  const handleAiClick = () => {
    const text = draft.text.trim();
    if (!text) return;
    onAiAnalyzeRaw(text, draft.type, draft.type === 'preferred' ? draft.weight : undefined);
  };

  const isBuiltIn = suggestion?.decision === 'suggest_built_in';
  const isCustom = suggestion?.decision === 'use_custom';
  const hasPreview = Boolean(pendingAiPreview);
  const previewShowInterpretation = pendingAiPreview
    ? hasRealInterpretation(pendingAiPreview.draft, undefined, pendingAiPreview.rawText)
    : false;
  const previewInterpretation =
    pendingAiPreview?.draft.displayText?.trim() ||
    pendingAiPreview?.draft.explanation?.trim() ||
    '';
  const suggestionSpecs = isBuiltIn && suggestion?.specsDraft?.length
    ? suggestion.specsDraft
    : isBuiltIn && suggestion
      ? [{ kind: suggestion.kind, paramsDraft: suggestion.paramsDraft }]
      : [];
  const subjectList = suggestionSpecs
    .map((spec) => spec.paramsDraft.subject)
    .filter((value): value is string => typeof value === 'string');
  const displayedParams = isBuiltIn && suggestion
    ? {
        ...suggestion.paramsDraft,
        ...(subjectList.length > 1 ? { subject: subjectList.join(', ') } : {}),
      }
    : {};

  return (
    <section className={`${panelClass} p-4`}>
      <div className="mb-4 flex items-center gap-2.5">
        <span className={iconShellClass}>
          <Plus size={16} strokeWidth={1.5} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-white">Nhập ràng buộc</h2>
          <p className="text-xs text-white/40">Nhập câu tự nhiên, bấm Gợi ý · Tổng: {totalCount}</p>
        </div>
      </div>

      {/* Type */}
      <div className="grid gap-2 sm:grid-cols-2">
        {constraintTypeList.map((ct) => {
          const sel = draft.type === ct.id;
          return (
            <button key={ct.id} type="button" onClick={() => onDraftChange({ type: ct.id })} className={`rounded-md border p-3 text-left transition ${sel ? ct.boxClass : 'border-white/[0.06] bg-[#141414] text-white hover:border-white/[0.12] hover:bg-white/[0.04]'}`}>
              <div className="flex items-center gap-2.5">
                <Circle className={sel ? ct.iconClass : 'text-white/30'} size={16} strokeWidth={1.5} />
                <span className="text-sm font-medium">{ct.label}</span>
              </div>
              <p className={`mt-2 text-xs leading-4 ${sel ? 'text-white/70' : 'text-white/30'}`}>{ct.description}</p>
            </button>
          );
        })}
      </div>

      {/* Input */}
      <input
        value={draft.text}
        onChange={(e) => { onDraftChange({ text: e.target.value }); setSuggestion(null); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSuggestion(); } }}
        placeholder="Ví dụ: Sơn không dạy thứ 2 · Nếu Hiếu và Hương dạy thứ 2 thì Thủy không dạy thứ 3"
        className="mt-4 h-10 w-full rounded-md border border-white/[0.08] bg-[#0a0a0a] px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/20"
      />

      {/* Weight */}
      {draft.type === 'preferred' && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-white/40">Độ ưu tiên:</span>
          {([{ l: 'Thấp', v: 3 }, { l: 'TB', v: 5 }, { l: 'Cao', v: 8 }] as const).map(({ l, v }) => (
            <button key={v} type="button" onClick={() => onDraftChange({ weight: v })} className={`rounded px-2.5 py-1 text-xs font-medium transition ${draft.weight === v ? 'bg-amber-500/20 text-amber-200 border border-amber-500/50' : 'text-amber-400/60 hover:text-amber-300 hover:bg-amber-500/10'}`}>
              {l}
            </button>
          ))}
          <span className="ml-1 text-xs text-white/25">{draft.weight}/10</span>
        </div>
      )}

      {/* Gợi ý */}
      <button type="button" onClick={runSuggestion} disabled={!draft.text.trim()} className={`${primaryButtonClass} ${disabledPrimaryButtonClass} mt-3 w-full`}>
        <Sparkles size={14} strokeWidth={1.5} />
        Gợi ý
      </button>

      {/* Built-in suggestion result */}
      {isBuiltIn && suggestion ? (
        <div className="mt-3 rounded-md border border-white/[0.08] bg-[#0a0a0a] p-3 text-xs">
          <p className="font-medium text-[#A6E3A1]">Gợi ý: mẫu có sẵn</p>
          <div className="mt-2 space-y-1 text-white/55">
            <p>Loại: {draft.type === 'required' ? 'Bắt buộc' : 'Nên có'}</p>
            <p>Đối tượng: {CONSTRAINT_GROUP_LABELS[suggestion.scope]}</p>
            <p>Ràng buộc: {CONSTRAINT_TEMPLATES.find((t) => t.id === suggestion.kind)?.label ?? suggestion.explanation}</p>
            {Object.entries(displayedParams).map(([k, v]) => (<p key={k}>{paramDisplay(agentInput, k, v)}</p>))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button type="button" onClick={importBuiltInSuggestion} className={`${primaryButtonClass} w-full`}>Dùng và xác nhận</button>
            <button type="button" onClick={handleAiClick} disabled={aiLoading} className="w-full rounded-md border border-violet-500/40 bg-violet-500/15 px-3 py-2 text-xs font-medium text-violet-200 hover:bg-violet-500/25 disabled:opacity-50">
              {aiLoading ? <span className="flex items-center justify-center gap-1"><Loader2 size={12} className="animate-spin" /> Đang phân tích...</span> : <span className="flex items-center justify-center gap-1"><Sparkles size={12} /> AI phân tích</span>}
            </button>
            <button type="button" onClick={() => setSuggestion(null)} className="w-full rounded-md border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-500/25">
              Bỏ
            </button>
          </div>
        </div>
      ) : null}

      {/* No built-in */}
      {isCustom && suggestion ? (
        <div className="mt-3 rounded-md border border-white/[0.08] bg-[#0a0a0a] p-3 text-xs">
          <p className="font-medium text-amber-200">Không khớp mẫu có sẵn</p>
          <p className="mt-1 text-white/45">{suggestion.reason}</p>
          <button type="button" onClick={handleAiClick} disabled={aiLoading} className="mt-3 w-full rounded-md border border-violet-500/40 bg-violet-500/15 px-3 py-2 text-xs font-medium text-violet-200 hover:bg-violet-500/25 disabled:opacity-50">
            {aiLoading ? <span className="flex items-center justify-center gap-1"><Loader2 size={12} className="animate-spin" /> Đang phân tích...</span> : <span className="flex items-center justify-center gap-1"><Sparkles size={12} /> AI phân tích</span>}
          </button>
        </div>
      ) : null}

      {/* AI error */}
      {aiError ? <p className="mt-2 rounded border border-red-500/30 bg-red-500/[0.08] px-3 py-2 text-xs text-red-200">{aiError}</p> : null}

      {/* AI preview */}
      {hasPreview && pendingAiPreview ? (
        <div className="mt-3 rounded-md border border-violet-500/30 bg-violet-500/[0.06] p-3 text-xs">
          <p className="text-[10px] font-medium uppercase tracking-widest text-violet-300/70">AI phân tích</p>
          <div className="mt-2 space-y-2">
            <div className="rounded border border-white/[0.06] bg-[#0a0a0a] px-2.5 py-2">
              <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Bạn viết</p>
              <p className="mt-1 leading-relaxed text-white/55">{pendingAiPreview.rawText}</p>
            </div>
            {previewShowInterpretation ? (
              <div className="rounded border border-white/[0.06] bg-[#0a0a0a] px-2.5 py-2">
                <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Hiểu là</p>
                <p className="mt-1 whitespace-pre-line leading-relaxed text-white">{previewInterpretation}</p>
              </div>
            ) : null}
            {pendingAiPreview.draft.clarificationQuestions?.length ? (
              <div className="rounded border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-2">
                <p className="text-[10px] font-medium uppercase tracking-widest text-amber-300/70">Gợi ý cách hiểu</p>
                <div className="mt-2">
                  <ClarificationSuggestionsBlock
                    questions={pendingAiPreview.draft.clarificationQuestions}
                    reparseCount={pendingAiPreview.reparseCount}
                    constraintType={pendingAiPreview.item.type}
                    onSelectOption={(_questionId, option: ClarificationOption) => {
                      if (option.id === 'none_fit') {
                        // Free-text fallback — let the user rephrase below.
                        return
                      }
                      if (onApplyPreviewClarificationChoice) {
                        // Deterministic commit: no LLM call, just build the spec.
                        onApplyPreviewClarificationChoice(option)
                        return
                      }
                      // Last-resort: no orchestrator wired, fall back to LLM reparse.
                      onReparsePreviewWithFeedback?.(option.labelVi)
                    }}
                    onApplySpecDraft={onApplyPreviewSpecDraft}
                    onReparseWithFeedback={onReparsePreviewWithFeedback}
                    onOpenManualEdit={onOpenManualEdit}
                    onOpenTemplatePicker={onOpenTemplatePicker}
                    onDemoteToPreferred={onDemotePreviewToPreferred}
                    showAiRetry={Boolean(onReanalyzeAiPreview)}
                    onAiRetry={onReanalyzeAiPreview}
                  />
                </div>
              </div>
            ) : null}
            {pendingAiPreview.conversation?.length ? (
              <div className="space-y-1.5 rounded border border-white/[0.06] bg-[#0a0a0a] px-2.5 py-2">
                {pendingAiPreview.conversation.map((msg, i) => (
                  <div key={i} className={msg.role === 'user' ? 'text-right' : 'text-left'}>
                    <span className={`inline-block max-w-[85%] rounded px-2 py-1 ${msg.role === 'user' ? 'bg-violet-500/20 text-violet-100' : 'bg-white/[0.06] text-white/70'}`}>
                      {msg.content}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="mt-2 flex gap-1.5">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (chatInput.trim() && onSendChatMessage) { onSendChatMessage(chatInput.trim()); setChatInput(''); } } }}
              placeholder="Nhập phản hồi cho AI..."
              className="h-8 flex-1 rounded border border-white/[0.08] bg-[#0a0a0a] px-2 text-xs text-white outline-none placeholder:text-white/25 focus:border-white/20"
            />
            <button type="button" disabled={!chatInput.trim() || chatLoading || !onSendChatMessage} onClick={() => { if (chatInput.trim() && onSendChatMessage) { onSendChatMessage(chatInput.trim()); setChatInput(''); } }} className="flex h-8 w-8 items-center justify-center rounded border border-violet-500/40 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25 disabled:opacity-40">
              {chatLoading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onAcceptAiPreview}
              disabled={!isDraftCommittable(pendingAiPreview.draft)}
              className="w-full rounded-md bg-[#4DB848] px-3 py-2 text-xs font-medium text-[#0a0a0a] hover:bg-[#40993C] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Đồng ý
            </button>
            <button type="button" onClick={onDismissAiPreview} className="w-full rounded-md border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-500/25">
              Bỏ
            </button>
          </div>
          {pendingAiPreview.reparseCount >= 3 ? (
            <p className="mt-2 text-[10px] text-white/30">
              Đã phân tích 3 lần — bấm «Đồng ý» hoặc sửa câu nhập.
            </p>
          ) : pendingAiPreview.reparseCount >= 2 ? (
            <p className="mt-2 text-[10px] text-white/30">
              Đã thử AI nhiều lần — ưu tiên «Tự đặt luật» hoặc «Dùng mẫu có sẵn».
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
