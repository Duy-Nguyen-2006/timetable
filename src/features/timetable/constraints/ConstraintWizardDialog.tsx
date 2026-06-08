'use client';

import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { BUILT_IN_CONSTRAINT_DEFINITIONS } from '../ai/constraint-registry';
import { humanizeDraft } from '../ai/constraint-humanizer';
import type { ParsedConstraintDraft } from '../ai/constraint-review-types';
import type { AgentInputPayload } from '../ai/types';
import { inputClass, primaryButtonClass } from '../constants';
import type { ConstraintItem } from '../types';
import { TemplateFields } from './ConstraintEditDialog';
import {
  applyFormToDraft,
  buildContextFromAgentInput,
  CONSTRAINT_GROUP_LABELS,
  CONSTRAINT_GROUPS,
  CONSTRAINT_TEMPLATES,
  defaultFormValues,
  type ConstraintFormTemplateId,
  type ConstraintFormValues,
} from './constraint-form-schema';

type ConstraintWizardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  constraintType: 'required' | 'preferred';
  weight: number;
  agentInput: AgentInputPayload;
  onCreate: (constraint: ConstraintItem, draft: ParsedConstraintDraft) => void;
};

function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

function makeId(templateId: ConstraintFormTemplateId): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `wizard-${templateId}-${suffix}`;
}

function definitionExample(templateId: ConstraintFormTemplateId): string {
  return BUILT_IN_CONSTRAINT_DEFINITIONS.find((definition) => definition.kind === templateId)?.exampleVi ?? '';
}

export function ConstraintWizardDialog({
  open,
  onOpenChange,
  constraintType,
  weight,
  agentInput,
  onCreate,
}: ConstraintWizardDialogProps) {
  const ctx = useMemo(() => buildContextFromAgentInput(agentInput), [agentInput]);
  const [group, setGroup] = useState<typeof CONSTRAINT_GROUPS[number]>('teacher');
  const [templateId, setTemplateId] = useState<ConstraintFormTemplateId>('teacher_block_day');
  const [search, setSearch] = useState('');
  const [values, setValues] = useState<ConstraintFormValues>(() => defaultFormValues('teacher_block_day', constraintType));

  const templates = useMemo(() => {
    const searchKey = normalizeSearch(search);
    return CONSTRAINT_TEMPLATES.filter((template) => {
      if (template.group !== group) return false;
      if (!searchKey) return true;
      const haystack = normalizeSearch([
        template.label,
        template.description ?? '',
        definitionExample(template.id),
      ].join(' '));
      return haystack.includes(searchKey);
    });
  }, [group, search]);

  const currentMeta = CONSTRAINT_TEMPLATES.find((template) => template.id === templateId);
  const baseOriginal = currentMeta
    ? definitionExample(currentMeta.id) || currentMeta.label
    : 'Ràng buộc tạo bằng wizard';
  const baseDraft = useMemo<ParsedConstraintDraft>(() => ({
    id: 'wizard-preview',
    rawConstraintId: 'wizard-preview',
    original: baseOriginal,
    proposedSpecs: [],
    status: 'unparsed',
    confidence: 'low',
    explanation: '',
    issues: [],
    source: 'manual',
  }), [baseOriginal]);

  const previewDraft = useMemo(() => {
    const weightedValues = constraintType === 'preferred' ? { ...values, weight } : values;
    return applyFormToDraft(agentInput, baseDraft, constraintType, weightedValues, ctx);
  }, [agentInput, baseDraft, constraintType, ctx, values, weight]);

  const patch = (patchValues: Partial<ConstraintFormValues>) => {
    setValues((current) => ({ ...current, ...patchValues }));
  };

  const chooseGroup = (nextGroup: typeof CONSTRAINT_GROUPS[number]) => {
    const firstTemplate = CONSTRAINT_TEMPLATES.find((template) => template.group === nextGroup);
    if (!firstTemplate) return;
    setGroup(nextGroup);
    setTemplateId(firstTemplate.id);
    setValues(defaultFormValues(firstTemplate.id, constraintType));
    setSearch('');
  };

  const chooseTemplate = (nextTemplateId: ConstraintFormTemplateId) => {
    setTemplateId(nextTemplateId);
    setValues(defaultFormValues(nextTemplateId, constraintType));
  };

  const handleCreate = () => {
    const id = makeId(templateId);
    const original = humanizeDraft(previewDraft);
    const draft = applyFormToDraft(
      agentInput,
      {
        ...baseDraft,
        id: `draft_${id}`,
        rawConstraintId: id,
        original,
      },
      constraintType,
      constraintType === 'preferred' ? { ...values, weight } : values,
      ctx
    );
    onCreate(
      {
        id,
        type: constraintType,
        text: humanizeDraft(draft),
        weight: constraintType === 'preferred' ? weight : undefined,
      },
      draft
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-white/10 bg-[#141414] text-white sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">Tạo ràng buộc built-in</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs text-white/45">Đối tượng</p>
              <div className="grid gap-1.5">
                {CONSTRAINT_GROUPS.filter((item) => item !== 'global').map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => chooseGroup(item)}
                    className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                      group === item
                        ? 'border-[#4DB848]/50 bg-[#4DB848]/10 text-[#A6E3A1]'
                        : 'border-white/[0.08] bg-white/[0.03] text-white/60 hover:border-white/15'
                    }`}
                  >
                    {CONSTRAINT_GROUP_LABELS[item]}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs text-white/45">Tìm loại ràng buộc</span>
              <span className="flex items-center gap-2 rounded-md border border-white/[0.08] bg-[#0a0a0a] px-2.5">
                <Search size={14} className="text-white/30" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tìm theo tên hoặc ví dụ"
                  className="h-9 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/25"
                />
              </span>
            </label>

            <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {templates.length ? templates.map((template) => {
                const selected = template.id === templateId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => chooseTemplate(template.id)}
                    className={`w-full rounded-md border p-2.5 text-left transition ${
                      selected
                        ? 'border-[#4DB848]/50 bg-[#4DB848]/10'
                        : 'border-white/[0.08] bg-white/[0.03] hover:border-white/15'
                    }`}
                  >
                    <p className="text-xs font-medium text-white">{template.label}</p>
                    <p className="mt-1 text-[11px] leading-4 text-white/40">{definitionExample(template.id) || template.description}</p>
                  </button>
                );
              }) : (
                <p className="rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white/40">
                  Không tìm thấy mẫu phù hợp.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <TemplateFields values={values} ctx={ctx} patch={patch} meta={currentMeta} />

            <div className="rounded-md border border-white/[0.08] bg-[#0a0a0a] p-3 text-sm">
              <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Xem trước</p>
              <p className="mt-1 whitespace-pre-line text-white/75">{humanizeDraft(previewDraft)}</p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-red-400/35 bg-red-500/[0.08] px-4 py-2 text-sm text-red-200 hover:bg-red-500/[0.14]"
          >
            Cancel
          </button>
          <button type="button" onClick={handleCreate} className={primaryButtonClass}>
            <Check size={14} strokeWidth={2} />
            Đồng ý
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
