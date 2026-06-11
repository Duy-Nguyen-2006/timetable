'use client';

import type { InterpretationCardDTO } from '../ai/constraint-clarification-types';

export type ConstraintInterpretationCardProps = {
  interpretation: InterpretationCardDTO;
  /** Raw user text for display */
  rawText: string;
  /** Callback when user confirms */
  onConfirm: () => void;
  /** Callback when user wants to edit an atom */
  onEditAtom: (atomId: string) => void;
  /** Callback when user wants to edit everything */
  onEditAll: () => void;
};

export function ConstraintInterpretationCard({
  interpretation,
  rawText,
  onConfirm,
  onEditAtom,
  onEditAll,
}: ConstraintInterpretationCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="text-sm font-medium text-muted-foreground">
        Cách hiểu của hệ thống:
      </div>
      
      {/* Scope */}
      {interpretation.scopeVi && (
        <div className="flex items-start gap-2">
          <span className="text-xs font-semibold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
            Phạm vi
          </span>
          <span className="text-sm">{interpretation.scopeVi}</span>
        </div>
      )}
      
      {/* IF clause */}
      {interpretation.ifAtomVi && (
        <div className="flex items-start gap-2">
          <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
            Điều kiện
          </span>
          <span className="text-sm">{interpretation.ifAtomVi}</span>
        </div>
      )}
      
      {/* THEN atoms */}
      <div className="space-y-2">
        {interpretation.thenAtomsVi.map((atom, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <span className="text-xs font-semibold bg-green-100 text-green-800 px-1.5 py-0.5 rounded">
              Ràng buộc {idx + 1}
            </span>
            <span className="text-sm flex-1">{atom}</span>
            {interpretation.editableAtomIds[idx] && (
              <button
                onClick={() => onEditAtom(interpretation.editableAtomIds[idx])}
                className="text-xs text-primary hover:underline"
              >
                Sửa
              </button>
            )}
          </div>
        ))}
      </div>
      
      {/* Notes */}
      {interpretation.notesVi.length > 0 && (
        <div className="bg-muted/50 rounded p-2 space-y-1">
          <div className="text-xs font-semibold text-muted-foreground">Ghi chú:</div>
          {interpretation.notesVi.map((note, idx) => (
            <div key={idx} className="text-xs text-muted-foreground flex items-start gap-1">
              <span>•</span>
              <span>{note}</span>
            </div>
          ))}
        </div>
      )}
      
      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onConfirm}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Xác nhận
        </button>
        <button
          onClick={onEditAll}
          className="px-4 py-2 text-sm font-medium border rounded-md hover:bg-accent"
        >
          Sửa lại
        </button>
      </div>
    </div>
  );
}

export default ConstraintInterpretationCard;

// ─── Legacy backward-compatible exports (used by TimetableApp.tsx) ─────

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

const MAX_CANDIDATES = 3;

/**
 * Legacy multi-candidate interpretation card (used by TimetableApp's
 * AmbiguousConstraintsSection). Kept for backward compatibility.
 */
export function ConstraintInterpretationCardLegacy({
  draft,
  candidates,
  onConfirm,
  onEdit,
  onDismiss,
  className,
}: {
  draft: ParsedConstraintDraft;
  candidates: InterpretationCandidate[];
  onConfirm: (spec: ConstraintSpec) => void;
  onEdit: (spec: ConstraintSpec, editedPredicate?: string) => void;
  onDismiss: () => void;
  className?: string;
}) {
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
