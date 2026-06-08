'use client';

import { useState } from 'react';
import { Circle, ClipboardList, LayoutTemplate, Plus } from 'lucide-react';

import { constraintTypeList, constraintTypes, disabledPrimaryButtonClass, iconShellClass, panelClass, primaryButtonClass } from '../constants';
import type { ParsedConstraintDraft } from '../ai/constraint-review-types';
import type { AgentInputPayload } from '../ai/types';
import type { ConstraintItem } from '../types';
import { ConstraintWizardDialog } from './ConstraintWizardDialog';

export type ConstraintDraftForm = {
  type: keyof typeof constraintTypes;
  text: string;
  weight: number;
};

type ConstraintInputPanelProps = {
  draft: ConstraintDraftForm;
  onDraftChange: (patch: Partial<ConstraintDraftForm>) => void;
  onImport: () => void;
  onCreateBuiltIn: (constraint: ConstraintItem, draft: ParsedConstraintDraft) => void;
  agentInput: AgentInputPayload;
  totalCount: number;
};

export function ConstraintInputPanel({ draft, onDraftChange, onImport, onCreateBuiltIn, agentInput, totalCount }: ConstraintInputPanelProps) {
  const [mode, setMode] = useState<'built_in' | 'custom'>('built_in');
  const [wizardOpen, setWizardOpen] = useState(false);

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
            onClick={() => setWizardOpen(true)}
            className={`${primaryButtonClass} mt-4 w-full`}
          >
            <Plus size={14} strokeWidth={1.5} />
            Mở wizard
          </button>
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
              onImport();
            }}
            placeholder={'Ví dụ:\nNếu cô Thúy dạy thứ 4 tiết 1 thì cô Hạnh không dạy thứ 5 tiết 2\nSơn không dạy thứ 2\n(mỗi dòng là một ràng buộc)'}
            rows={5}
            className="w-full resize-none rounded-md border border-white/[0.08] bg-[#0a0a0a] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
          />
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
        onClick={onImport}
        disabled={mode !== 'custom' || !draft.text.trim()}
        className={`${primaryButtonClass} ${disabledPrimaryButtonClass} mt-4 w-full`}
      >
        <Plus size={14} strokeWidth={1.5} />
        Import Custom
      </button>

      <ConstraintWizardDialog
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        constraintType={draft.type}
        weight={draft.weight}
        agentInput={agentInput}
        onCreate={onCreateBuiltIn}
      />
    </section>
  );
}
