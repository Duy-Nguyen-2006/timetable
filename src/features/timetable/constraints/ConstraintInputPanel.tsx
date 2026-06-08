'use client';

import { useState } from 'react';
import { Circle, ClipboardList, LayoutTemplate, Plus, Sparkles } from 'lucide-react';

import { constraintTypeList, constraintTypes, disabledPrimaryButtonClass, iconShellClass, panelClass, primaryButtonClass } from '../constants';
import { suggestBuiltInConstraint, type BuiltInSuggestion } from '../ai/built-in-suggestion';
import type { ParsedConstraintDraft } from '../ai/constraint-review-types';
import type { AgentInputPayload } from '../ai/types';
import type { ConstraintItem } from '../types';
import { ConstraintWizardDialog } from './ConstraintWizardDialog';
import {
  CONSTRAINT_GROUP_LABELS,
  CONSTRAINT_TEMPLATES,
  type ConstraintFormTemplateId,
} from './constraint-form-schema';
import type { ConstraintWizardPrefill } from './constraint-wizard-prefill';

export type ConstraintDraftForm = {
  type: keyof typeof constraintTypes;
  text: string;
  weight: number;
};

type ConstraintInputPanelProps = {
  draft: ConstraintDraftForm;
  onDraftChange: (patch: Partial<ConstraintDraftForm>) => void;
  onNormalizeCustom: () => void;
  onCreateBuiltIn: (constraint: ConstraintItem, draft: ParsedConstraintDraft) => void;
  agentInput: AgentInputPayload;
  totalCount: number;
  customNormalizeLoading?: boolean;
  customNormalizeError?: string | null;
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
    teacher: 'Tên giáo viên',
    day: 'Ngày',
    days: 'Ngày',
    period: 'Tiết',
    maxPerDay: 'Số tiết tối đa',
  };
  const label = labelByKey[key] ?? key;
  const displayValue = Array.isArray(value)
    ? value.map((item) => key === 'days' ? dayDisplay(agentInput, item) : String(item)).join(', ')
    : key === 'day'
      ? dayDisplay(agentInput, value)
      : String(value ?? '');
  return `${label}: ${displayValue}`;
}

export function ConstraintInputPanel({
  draft,
  onDraftChange,
  onNormalizeCustom,
  onCreateBuiltIn,
  agentInput,
  totalCount,
  customNormalizeLoading,
  customNormalizeError,
}: ConstraintInputPanelProps) {
  const [mode, setMode] = useState<'built_in' | 'custom'>('built_in');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardInstance, setWizardInstance] = useState(0);
  const [wizardPrefill, setWizardPrefill] = useState<ConstraintWizardPrefill | null>(null);
  const [suggestionText, setSuggestionText] = useState('');
  const [suggestion, setSuggestion] = useState<BuiltInSuggestion | null>(null);

  const runSuggestion = () => {
    const result = suggestBuiltInConstraint({
      userText: suggestionText,
      teachers: uniqueLabels(agentInput.assignments.map((assignment) => assignment.teacher.label)),
      subjects: uniqueLabels(agentInput.assignments.map((assignment) => assignment.subject.label)),
      classes: uniqueLabels(agentInput.assignments.map((assignment) => assignment.class.label)),
      assignments: agentInput.assignments,
      days: agentInput.days,
    });
    setSuggestion(result);
  };

  const applySuggestion = () => {
    if (!suggestion || suggestion.decision !== 'suggest_built_in') return;
    const template = CONSTRAINT_TEMPLATES.find((item) => item.id === suggestion.kind);
    if (!template) return;
    setWizardPrefill({
      templateId: template.id as ConstraintFormTemplateId,
      paramsDraft: suggestion.paramsDraft,
    });
    setWizardInstance((current) => current + 1);
    setWizardOpen(true);
  };

  const switchSuggestionToCustom = () => {
    setMode('custom');
    onDraftChange({ text: suggestionText });
  };

  return (
    <section className={`${panelClass} p-4`}>
      <div className="mb-4 flex items-center gap-2.5">
        <span className={iconShellClass}>
          <Plus size={16} strokeWidth={1.5} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-white">Tạo ràng buộc</h2>
          <p className="text-xs text-white/40">Vàng là bắt buộc, xám là nên có · Tổng: {totalCount}</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {constraintTypeList.map((constraintType) => {
          const selected = draft.type === constraintType.id;
          return (
            <button
              key={constraintType.id}
              type="button"
              onClick={() => onDraftChange({ type: constraintType.id })}
              className={`rounded-md border p-3 text-left transition ${
                selected
                  ? constraintType.boxClass
                  : 'border-white/[0.06] bg-[#141414] text-white hover:border-white/[0.12] hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Circle className={selected ? constraintType.iconClass : 'text-white/30'} size={16} strokeWidth={1.5} />
                <span className="text-sm font-medium">{constraintType.label}</span>
              </div>
              <p className={`mt-2 text-xs leading-4 ${selected ? 'text-white/70' : 'text-white/30'}`}>{constraintType.description}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode('built_in')}
          className={`rounded-md border px-3 py-2 text-sm transition ${
            mode === 'built_in'
              ? 'border-[#4DB848]/45 bg-[#4DB848]/10 text-[#A6E3A1]'
              : 'border-white/[0.08] bg-white/[0.03] text-white/50 hover:border-white/15'
          }`}
        >
          Built-in
        </button>
        <button
          type="button"
          onClick={() => setMode('custom')}
          className={`rounded-md border px-3 py-2 text-sm transition ${
            mode === 'custom'
              ? 'border-[#4DB848]/45 bg-[#4DB848]/10 text-[#A6E3A1]'
              : 'border-white/[0.08] bg-white/[0.03] text-white/50 hover:border-white/15'
          }`}
        >
          Custom
        </button>
      </div>

      {mode === 'built_in' ? (
        <div className={`${panelClass} mt-4 p-4`}>
          <div className="mb-3 flex items-center gap-2.5">
            <span className={iconShellClass}>
              <LayoutTemplate size={16} strokeWidth={1.5} />
            </span>
            <span className="text-sm font-medium text-white">Wizard ràng buộc built-in</span>
          </div>
          <p className="text-xs leading-5 text-white/45">
            Chọn đối tượng, loại ràng buộc và điền trường cụ thể. Hệ thống tạo bản diễn giải deterministic để bạn duyệt ở cột phải.
          </p>
          <button
            type="button"
            onClick={() => {
              setWizardPrefill(null);
              setWizardInstance((current) => current + 1);
              setWizardOpen(true);
            }}
            className={`${primaryButtonClass} mt-4 w-full`}
          >
            <Plus size={14} strokeWidth={1.5} />
            Mở wizard
          </button>

          <div className="mt-4 border-t border-white/[0.08] pt-4">
            <label className="block">
              <span className="mb-1 block text-xs text-white/45">Gợi ý built-in từ câu nhập</span>
              <input
                value={suggestionText}
                onChange={(event) => {
                  setSuggestionText(event.target.value);
                  setSuggestion(null);
                }}
                placeholder="Ví dụ: Thầy Sơn không dạy thứ 2"
                className="h-9 w-full rounded-md border border-white/[0.08] bg-[#0a0a0a] px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/20"
              />
            </label>
            <button
              type="button"
              onClick={runSuggestion}
              disabled={!suggestionText.trim()}
              className={`${primaryButtonClass} ${disabledPrimaryButtonClass} mt-2 w-full`}
            >
              <Sparkles size={14} strokeWidth={1.5} />
              Gợi ý
            </button>
            {suggestion ? (
              <div className="mt-3 rounded-md border border-white/[0.08] bg-[#0a0a0a] p-3 text-xs">
                {suggestion.decision === 'suggest_built_in' ? (() => {
                  const template = CONSTRAINT_TEMPLATES.find((item) => item.id === suggestion.kind);
                  return (
                    <>
                      <p className="font-medium text-[#A6E3A1]">Nên chọn</p>
                      <div className="mt-2 space-y-1 text-white/55">
                        <p>Loại: {draft.type === 'required' ? 'Bắt buộc' : 'Nên có'}</p>
                        <p>Đối tượng: {CONSTRAINT_GROUP_LABELS[suggestion.scope]}</p>
                        <p>Ràng buộc: {template?.label ?? suggestion.explanation}</p>
                        {Object.entries(suggestion.paramsDraft).map(([key, value]) => (
                          <p key={key}>{paramDisplay(agentInput, key, value)}</p>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={applySuggestion}
                        className={`${primaryButtonClass} mt-3 w-full`}
                      >
                        Dùng gợi ý
                      </button>
                    </>
                  );
                })() : (
                  <>
                    <p className="font-medium text-amber-200">Nên dùng Custom</p>
                    <p className="mt-1 text-white/45">{suggestion.reason}</p>
                    <button
                      type="button"
                      onClick={switchSuggestionToCustom}
                      className="mt-3 w-full rounded-md border border-white/[0.08] px-3 py-2 text-xs text-white/70 hover:bg-white/[0.04]"
                    >
                      Chuyển sang Custom
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <label className={`${panelClass} mt-4 block p-4`}>
          <div className="mb-3 flex items-center gap-2.5">
            <span className={iconShellClass}>
              <ClipboardList size={16} strokeWidth={1.5} />
            </span>
            <span className="text-sm font-medium text-white">Custom / nhập bằng câu tự nhiên</span>
          </div>
          <textarea
            value={draft.text}
            onChange={(event) => onDraftChange({ text: event.target.value })}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey) return;
              event.preventDefault();
              onNormalizeCustom();
            }}
            placeholder={'Ví dụ:\nNếu cô Thúy dạy thứ 4 tiết 1 thì cô Hạnh không dạy thứ 5 tiết 2\nSơn không dạy thứ 2\n(mỗi dòng là một ràng buộc)'}
            rows={5}
            className="w-full resize-none rounded-md border border-white/[0.08] bg-[#0a0a0a] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
          />
          {customNormalizeError ? (
            <p className="mt-2 rounded border border-red-500/30 bg-red-500/[0.08] px-3 py-2 text-xs text-red-200">
              {customNormalizeError}
            </p>
          ) : null}
        </label>
      )}

      {draft.type === 'preferred' && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-white/40">Độ ưu tiên:</span>
          {(
            [
              { label: 'Thấp', val: 3, unselected: 'text-emerald-400/60 hover:text-emerald-300 hover:bg-emerald-500/10', selected: 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/50' },
              { label: 'TB', val: 5, unselected: 'text-amber-400/60 hover:text-amber-300 hover:bg-amber-500/10', selected: 'bg-amber-500/20 text-amber-200 border border-amber-500/50' },
              { label: 'Cao', val: 8, unselected: 'text-rose-400/60 hover:text-rose-300 hover:bg-rose-500/10', selected: 'bg-rose-500/20 text-rose-200 border border-rose-500/50' },
            ] as const
          ).map(({ label, val, unselected, selected }) => {
            const isActive = draft.weight === val
            return (
              <button
                key={val}
                type="button"
                onClick={() => onDraftChange({ weight: val })}
                className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                  isActive ? selected : unselected
                }`}
              >
                {label}
              </button>
            )
          })}
          <span className="ml-1 text-xs text-white/25">{draft.weight}/10</span>
        </div>
      )}

      <button
        type="button"
        onClick={onNormalizeCustom}
        disabled={mode !== 'custom' || !draft.text.trim() || customNormalizeLoading}
        className={`${primaryButtonClass} ${disabledPrimaryButtonClass} mt-4 w-full`}
      >
        <Plus size={14} strokeWidth={1.5} />
        {customNormalizeLoading ? 'Đang chuẩn hóa...' : 'Chuẩn hóa Custom'}
      </button>

      <ConstraintWizardDialog
        key={wizardInstance}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        constraintType={draft.type}
        weight={draft.weight}
        agentInput={agentInput}
        prefill={wizardPrefill}
        onCreate={onCreateBuiltIn}
      />
    </section>
  );
}
