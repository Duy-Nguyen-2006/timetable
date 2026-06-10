'use client';

/**
 * ConstraintInterpretationCard — Tier 4 (VAL-T4-000..006, 011..016)
 *
 * Hiển thị 2-3 cách hiểu khác nhau của một constraint khi parse không chắc chắn
 * (confidence='low' hoặc custom_dsl hard). Pure function of props, không state.
 *
 * Props: draft, candidates, onConfirm, onEdit, onDismiss, className
 * Test IDs: interpretation-card, interpretation-card-edit, interpretation-card-editor, cache-hit-badge
 * A11y: role=radiogroup, keyboard nav (Tab/Arrow/Enter/Space), aria-live=polite
 */

import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';

import { humanizeConstraintSpec } from '../ai/constraint-humanizer';
import { getConstraintCapability } from '../ai/constraint-capabilities';
import type { ConstraintSpec } from '../ai/constraint-spec';
import type { ParsedConstraintDraft } from '../ai/constraint-review-types';

export type InterpretationCandidate = {
  spec: ConstraintSpec;
  /** Mô tả ngắn bằng tiếng Việt về cách hiểu. */
  description: string;
};

export type ConstraintInterpretationCardProps = {
  draft: ParsedConstraintDraft;
  candidates: InterpretationCandidate[];
  onConfirm: (spec: ConstraintSpec) => void;
  onEdit: (spec: ConstraintSpec, editedPredicate?: string) => void;
  onDismiss: () => void;
  className?: string;
};

const MAX_CANDIDATES = 3;

export function ConstraintInterpretationCard({
  draft,
  candidates,
  onConfirm,
  onEdit,
  onDismiss,
  className,
}: ConstraintInterpretationCardProps) {
  // Collapse to ≤3 candidates silently.
  const visibleCandidates = candidates.slice(0, MAX_CANDIDATES);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [predicateDraft, setPredicateDraft] = useState('');

  if (visibleCandidates.length === 0) {
    return null;
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (editingIndex !== null) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      setSelectedIndex((i) => (i + 1) % visibleCandidates.length);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      setSelectedIndex((i) => (i - 1 + visibleCandidates.length) % visibleCandidates.length);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const cand = visibleCandidates[selectedIndex];
      if (cand) onConfirm(cand.spec);
    }
  };

  return (
    <div
      data-testid="interpretation-card"
      role="radiogroup"
      aria-label="Các cách hiểu khác nhau"
      aria-live="polite"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={className ?? 'rounded-md border border-amber-500/30 bg-amber-500/[0.05] p-3'}
    >
      <p className="text-[10px] font-medium uppercase tracking-widest text-amber-300/80">
        Hệ thống hiểu theo {visibleCandidates.length} cách — chọn cách đúng
      </p>
      <p className="mt-1 text-xs text-white/50">«{draft.original}»</p>

      <ul className="mt-3 space-y-2">
        {visibleCandidates.map((cand, index) => {
          const checked = index === selectedIndex;
          const isEditing = editingIndex === index;
          return (
            <li
              key={`${cand.spec.id}-${index}`}
              data-testid={`interpretation-card-option-${index}`}
              className={`rounded border p-2 ${
                checked ? 'border-emerald-500/50 bg-emerald-500/[0.08]' : 'border-white/[0.08] bg-[#0a0a0a]'
              }`}
            >
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name={`interp-${draft.id}`}
                  checked={checked}
                  onChange={() => setSelectedIndex(index)}
                  className="mt-1 h-3 w-3 accent-emerald-500"
                  aria-label={cand.description}
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-white/80">{cand.description}</p>
                    {(() => {
                      if (cand.spec.kind === 'custom_dsl') return null;
                      const cap = getConstraintCapability(cand.spec.kind);
                      if (cap.canEncodeSolver) {
                        return (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400 ring-1 ring-inset ring-emerald-500/20 shrink-0">
                            Solver hỗ trợ đầy đủ
                          </span>
                        );
                      }
                      if (cap.canCheckDeterministically) {
                        return (
                          <span className="inline-flex items-center rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-400 ring-1 ring-inset ring-amber-500/20 shrink-0">
                            Chỉ kiểm tra, không tối ưu
                          </span>
                        );
                      }
                      return (
                        <span className="inline-flex items-center rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-medium text-red-400 ring-1 ring-inset ring-red-500/20 shrink-0">
                          Chưa được hỗ trợ
                        </span>
                      );
                    })()}
                  </div>
                  <p className="mt-0.5 text-[11px] text-white/40">
                    {humanizeConstraintSpec(cand.spec)}
                  </p>
                </div>
              </label>
              {isEditing ? (
                <div data-testid="interpretation-card-editor" className="mt-2 space-y-2">
                  <label className="block text-[10px] uppercase tracking-widest text-white/40">
                    Mẫu tự do (Python) — pythonPredicate
                  </label>
                  <textarea
                    className="w-full rounded border border-white/[0.08] bg-[#0a0a0a] p-2 font-mono text-xs text-white/80"
                    rows={4}
                    value={predicateDraft}
                    onChange={(e) => setPredicateDraft(e.target.value)}
                    placeholder="def check(schedule, assignments):\n    return True"
                    data-testid="interpretation-card-predicate-input"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      data-testid="interpretation-card-save-predicate"
                      onClick={() => {
                        const newSpec: ConstraintSpec = {
                          ...cand.spec,
                          kind: 'custom_dsl',
                          pythonPredicate: predicateDraft,
                        };
                        onEdit(newSpec, predicateDraft);
                        setEditingIndex(null);
                      }}
                      className="rounded bg-emerald-600 px-2 py-1 text-[11px] text-white"
                    >
                      Lưu
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingIndex(null)}
                      className="rounded border border-white/[0.08] px-2 py-1 text-[11px] text-white/60"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-1 flex justify-end">
                  <button
                    type="button"
                    data-testid="interpretation-card-edit"
                    onClick={() => {
                      setPredicateDraft(cand.spec.pythonPredicate ?? '');
                      setEditingIndex(index);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-white/50 hover:text-white/80"
                  >
                    <Pencil size={10} />
                    Câu của tôi khác
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="interpretation-card-confirm"
          onClick={() => {
            const cand = visibleCandidates[selectedIndex];
            if (cand) onConfirm(cand.spec);
          }}
          className="inline-flex items-center gap-1 rounded-md bg-[#4DB848] px-3 py-1.5 text-xs font-medium text-[#0a0a0a] hover:bg-[#40993C]"
        >
          <Check size={12} strokeWidth={2} />
          Đồng ý
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.04]"
        >
          <X size={12} />
          Hủy
        </button>
      </div>
    </div>
  );
}

export default ConstraintInterpretationCard;
