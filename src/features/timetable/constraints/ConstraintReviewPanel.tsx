'use client';

import { useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';

import type { ConfirmedConstraint, ParsedConstraintDraft } from '../ai/constraint-review-types';
import type { AgentInputPayload } from '../ai/types';
import { iconShellClass, panelClass } from '../constants';
import type { ConstraintItem } from '../types';
import { ConstraintDraftCard } from './ConstraintDraftCard';
import { ConstraintEditDialog } from './ConstraintEditDialog';
import { ConstraintTemplatePicker } from './ConstraintTemplatePicker';
import { ConstraintThenEditor } from './ConstraintThenEditor';
import type { ConstraintFormTemplateId } from './constraint-form-schema';

type ConstraintReviewPanelProps = {
  constraints: ConstraintItem[];
  drafts: ParsedConstraintDraft[];
  confirmed: ConfirmedConstraint[];
  newConstraintIds: Set<string>;
  agentInput: AgentInputPayload;
  reparseLoading?: string | null;
  parseError: string | null;
  canSolve: boolean;
  solveBlockHint: string | null;
  onConfirmDraft: (rawConstraintId: string) => void;
  onIgnoreDraft: (rawConstraintId: string) => void;
  onDeleteConstraint: (id: string) => void;
  onSaveDraft: (updated: ParsedConstraintDraft) => void;
  onApplyTemplate: (constraint: ConstraintItem, templateId: ConstraintFormTemplateId) => void;
  onAiAnalyze?: (constraint: ConstraintItem, draft: ParsedConstraintDraft) => void;
  highlightConstraintIds?: Set<string>;
};

export function ConstraintReviewPanel({
  constraints,
  drafts,
  confirmed,
  newConstraintIds,
  reparseLoading,
  parseError,
  canSolve,
  solveBlockHint,
  agentInput,
  onConfirmDraft,
  onIgnoreDraft,
  onDeleteConstraint,
  onSaveDraft,
  onApplyTemplate,
  onAiAnalyze,
  highlightConstraintIds,
}: ConstraintReviewPanelProps) {
  const [editConstraintId, setEditConstraintId] = useState<string | null>(null);
  const [templateForId, setTemplateForId] = useState<string | null>(null);
  const [thenEditForId, setThenEditForId] = useState<string | null>(null);

  const draftByRaw = new Map(drafts.map((d) => [d.rawConstraintId, d]));
  const confirmedByRaw = new Map(confirmed.map((c) => [c.rawConstraintId, c]));
  const hardCount = constraints.filter((c) => c.type === 'required').length;
  const confirmedHard = constraints.filter(
    (c) => c.type === 'required' && confirmedByRaw.has(c.id)
  ).length;

  return (
    <aside className={`${panelClass} flex flex-col p-4`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={iconShellClass}>
            <Check size={16} strokeWidth={1.5} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-white">Kiểm tra ràng buộc</h2>
            <p className="text-xs text-white/40">
              Bắt buộc đã xác nhận: {confirmedHard}/{hardCount}
            </p>
          </div>
        </div>
      </div>

      {parseError ? (
        <p className="mb-3 rounded border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-xs text-red-300">{parseError}</p>
      ) : null}

      {!canSolve && solveBlockHint ? (
        <div className="mb-3 flex gap-2 rounded border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200/90">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{solveBlockHint}</span>
        </div>
      ) : null}

      {templateForId ? (
        <ConstraintTemplatePicker
          onSelect={(templateId) => {
            const c = constraints.find((x) => x.id === templateForId);
            if (c) onApplyTemplate(c, templateId);
            setTemplateForId(null);
          }}
        />
      ) : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {constraints.length ? (
          constraints.map((constraint) => (
            <ConstraintDraftCard
              key={constraint.id}
              constraint={constraint}
              draft={draftByRaw.get(constraint.id)}
              confirmed={confirmedByRaw.get(constraint.id)}
              isNew={newConstraintIds.has(constraint.id) && !confirmedByRaw.has(constraint.id)}
              onConfirm={() => onConfirmDraft(constraint.id)}
              onIgnore={() => onIgnoreDraft(constraint.id)}
              onDelete={() => onDeleteConstraint(constraint.id)}
              onAiAnalyze={
                onAiAnalyze && draftByRaw.get(constraint.id)
                  ? () => onAiAnalyze(constraint, draftByRaw.get(constraint.id)!)
                  : undefined
              }
              isReparsing={reparseLoading === constraint.id}
              highlight={highlightConstraintIds?.has(constraint.id)}
            />
          ))
        ) : (
          <p className="text-sm text-white/30">Chưa có ràng buộc. Thêm ở cột trái rồi phân tích.</p>
        )}
      </div>

      {editConstraintId ? (
        <ConstraintEditDialog
          open={Boolean(editConstraintId)}
          onOpenChange={(open) => !open && setEditConstraintId(null)}
          constraint={constraints.find((c) => c.id === editConstraintId) ?? null}
          draft={draftByRaw.get(editConstraintId) ?? null}
          agentInput={agentInput}
          onSave={(updated) => {
            onSaveDraft(updated);
            setEditConstraintId(null);
          }}
        />
      ) : null}

      {thenEditForId ? (
        <ConstraintThenEditor
          open={Boolean(thenEditForId)}
          onOpenChange={(open) => !open && setThenEditForId(null)}
          spec={
            draftByRaw.get(thenEditForId)?.proposedSpecs.find((s) => s.kind === 'if_then') ?? {
              id: 'tmp',
              original: '',
              severity: 'hard',
              kind: 'if_then',
              params: { if: { op: 'teacher_teaches_on_day', teacher: '', day: 'monday' }, then: [] },
            }
          }
          agentInput={agentInput}
          suggestedTeachers={
            draftByRaw
              .get(thenEditForId)
              ?.issues.find((i) => i.code === 'possible_entity_loss')
              ?.candidates ?? []
          }
          onSave={(updatedSpec) => {
            const existing = draftByRaw.get(thenEditForId);
            if (existing) {
              onSaveDraft({ ...existing, proposedSpecs: [updatedSpec] });
            }
            setThenEditForId(null);
          }}
        />
      ) : null}
    </aside>
  );
}
