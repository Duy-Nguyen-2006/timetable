'use client';

import { useState } from 'react';
import { Circle, Loader2, Plus, Sparkles } from 'lucide-react';

import {
  constraintTypeList,
  constraintTypes,
  disabledPrimaryButtonClass,
  iconShellClass,
  panelClass,
  primaryButtonClass,
} from '../constants';
import { suggestBuiltInConstraint, type BuiltInSuggestion } from '../ai/built-in-suggestion';
import type { ParsedConstraintDraft } from '../ai/constraint-review-types';
import type { AgentInputPayload } from '../ai/types';
import type { ConstraintItem } from '../types';
import {
  CONSTRAINT_GROUP_LABELS,
  CONSTRAINT_TEMPLATES,
} from './constraint-form-schema';

export type ConstraintDraftForm = {
  type: keyof typeof constraintTypes;
  text: string;
  weight: number;
};

export type PendingAiPreview = {
  rawText: string;
  item: ConstraintItem;
  draft: ParsedConstraintDraft;
  reparseCount: number;
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
}: ConstraintInputPanelProps) {
  const [suggestion, setSuggestion] = useState<BuiltInSuggestion | null>(null);

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
    onImportSuggestion(item, {
      id: `draft_${id}`,
      rawConstraintId: id,
      original: draft.text,
      proposedSpecs: [],
      status: 'unparsed',
      confidence: 'low',
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
    setSuggestion(null);
    onAiAnalyzeRaw(text, draft.type, draft.type === 'preferred' ? draft.weight : undefined);
  };

  const isBuiltIn = suggestion?.decision === 'suggest_built_in';
  const isCustom = suggestion?.decision === 'use_custom';
  const hasPreview = Boolean(pendingAiPreview);

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
            {Object.entries(suggestion.paramsDraft).map(([k, v]) => (<p key={k}>{paramDisplay(agentInput, k, v)}</p>))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={importBuiltInSuggestion} className={`${primaryButtonClass} w-full`}>Dùng gợi ý</button>
            <button type="button" onClick={handleAiClick} disabled={aiLoading} className="w-full rounded-md border border-violet-500/40 bg-violet-500/15 px-3 py-2 text-xs font-medium text-violet-200 hover:bg-violet-500/25 disabled:opacity-50">
              {aiLoading ? <span className="flex items-center justify-center gap-1"><Loader2 size={12} className="animate-spin" /></span> : <span className="flex items-center justify-center gap-1"><Sparkles size={12} /> AI phân tích</span>}
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
            {aiLoading ? <span className="flex items-center justify-center gap-1"><Loader2 size={12} className="animate-spin" /></span> : <span className="flex items-center justify-center gap-1"><Sparkles size={12} /> AI phân tích</span>}
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
            <div className="rounded border border-white/[0.06] bg-[#0a0a0a] px-2.5 py-2">
              <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Hiểu là</p>
              <p className="mt-1 whitespace-pre-line leading-relaxed text-white">{pendingAiPreview.draft.displayText || pendingAiPreview.draft.explanation || pendingAiPreview.rawText}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={onAcceptAiPreview} className="w-full rounded-md bg-[#4DB848] px-3 py-2 text-xs font-medium text-[#0a0a0a] hover:bg-[#40993C]">Đồng ý</button>
            <button type="button" onClick={onReanalyzeAiPreview} disabled={aiLoading || pendingAiPreview.reparseCount >= 3} className="w-full rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-50">
              {aiLoading ? <span className="flex items-center justify-center gap-1"><Loader2 size={12} className="animate-spin" /></span> : 'Phân tích lại'}
            </button>
          </div>
          {pendingAiPreview.reparseCount >= 3 ? <p className="mt-2 text-[10px] text-white/30">Đã phân tích 3 lần — bấm «Đồng ý» hoặc sửa câu nhập.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
