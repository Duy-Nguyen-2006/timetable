'use client';

import { useMemo, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { humanizeDraft } from '../ai/constraint-humanizer';
import type { ParsedConstraintDraft } from '../ai/constraint-review-types';
import type { AgentInputPayload } from '../ai/types';
import { inputClass, primaryButtonClass } from '../constants';
import type { ConstraintItem } from '../types';
import {
  applyFormToDraft,
  buildContextFromAgentInput,
  CONSTRAINT_GROUP_LABELS,
  CONSTRAINT_GROUPS,
  CONSTRAINT_TEMPLATES,
  defaultFormValues,
  specToFormValues,
  type ConstraintFormTemplateId,
  type ConstraintFormValues,
  type ConstraintTemplateMeta,
  type FormEntityContext,
} from './constraint-form-schema';

type ConstraintEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  constraint: ConstraintItem | null;
  draft: ParsedConstraintDraft | null;
  agentInput: AgentInputPayload;
  initialTemplateId?: ConstraintFormTemplateId;
  onSave: (updated: ParsedConstraintDraft) => void;
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs text-white/45">{children}</label>;
}

export function ConstraintEditDialog({
  open,
  onOpenChange,
  constraint,
  draft,
  agentInput,
  initialTemplateId,
  onSave,
}: ConstraintEditDialogProps) {
  const ctx = useMemo(() => buildContextFromAgentInput(agentInput), [agentInput]);

  const formKey = `${constraint?.id ?? ''}:${draft?.id ?? ''}:${initialTemplateId ?? ''}:${open}`;
  const [draftValues, setDraftValues] = useState<{
    key: string;
    values: ConstraintFormValues;
  } | null>(() => null);

  const resolvedValues = useMemo(() => {
    if (!open || !constraint) return null;
    const fromSpec = draft?.proposedSpecs[0] ? specToFormValues(draft.proposedSpecs[0]) : null;
    if (fromSpec) return fromSpec;
    const tid = initialTemplateId ?? 'teacher_block_day';
    return defaultFormValues(tid, constraint.type);
  }, [open, constraint, draft, initialTemplateId]);

  const activeValues = draftValues?.key === formKey ? draftValues.values : resolvedValues;

  const baseDraft = useMemo<ParsedConstraintDraft | null>(() => {
    if (!constraint) return null;
    return draft ?? {
      id: `draft_${constraint.id}`,
      rawConstraintId: constraint.id,
      original: constraint.text,
      proposedSpecs: [],
      status: 'unparsed',
      confidence: 'low',
      explanation: '',
      issues: [],
      source: 'manual',
    };
  }, [constraint, draft]);

  const previewDraft = useMemo(() => {
    if (!constraint || !activeValues || !baseDraft) return null;
    return applyFormToDraft(agentInput, baseDraft, constraint.type, activeValues, ctx);
  }, [activeValues, agentInput, baseDraft, constraint, ctx]);

  if (!constraint || !activeValues || !baseDraft) return null;

  const patch = (p: Partial<ConstraintFormValues>) =>
    setDraftValues((current) => ({
      key: formKey,
      values: { ...((current?.key === formKey ? current.values : activeValues)), ...p },
    }));

  const handleSave = () => {
    const updated = applyFormToDraft(agentInput, baseDraft, constraint.type, activeValues, ctx);
    onSave(updated);
    onOpenChange(false);
  };

  const currentMeta = CONSTRAINT_TEMPLATES.find((t) => t.id === activeValues.templateId);
  const currentGroup = currentMeta?.group ?? 'teacher';
  const groupTemplates = CONSTRAINT_TEMPLATES.filter((t) => t.group === currentGroup);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent key={formKey} className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#141414] text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">Sửa cách hiểu</DialogTitle>
          <p className="text-xs text-white/40 truncate">{constraint.text}</p>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Bước 1: Nhóm ràng buộc */}
          <div>
            <FieldLabel>Nhóm ràng buộc</FieldLabel>
            <select
              className={inputClass}
              value={currentGroup}
              onChange={(e) => {
                const group = e.target.value as typeof CONSTRAINT_GROUPS[number];
                const first = CONSTRAINT_TEMPLATES.find((t) => t.group === group);
                if (first) {
                  setDraftValues({ key: formKey, values: defaultFormValues(first.id, constraint.type) });
                }
              }}
            >
              {CONSTRAINT_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {CONSTRAINT_GROUP_LABELS[g] ?? g}
                </option>
              ))}
            </select>
          </div>

          {/* Bước 2: Tên ràng buộc */}
          <div>
            <FieldLabel>Tên ràng buộc</FieldLabel>
            <select
              className={inputClass}
              value={activeValues.templateId}
              onChange={(e) => {
                const tid = e.target.value as ConstraintFormTemplateId;
                setDraftValues({ key: formKey, values: defaultFormValues(tid, constraint.type) });
              }}
            >
              {groupTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Bước 3: Form fields */}
          <TemplateFields values={activeValues} ctx={ctx} patch={patch} meta={currentMeta} />

          {constraint.type === 'preferred' && (
            <div>
              <FieldLabel>Trọng số (soft)</FieldLabel>
              <input
                type="number"
                min={1}
                max={10}
                className={inputClass}
                value={activeValues.weight ?? 5}
                onChange={(e) => patch({ weight: Number(e.target.value) })}
              />
            </div>
          )}

          {previewDraft ? (
            <div className="rounded border border-white/[0.08] bg-[#0a0a0a] p-2.5 text-xs text-white/65">
              <p className="text-[10px] uppercase tracking-widest text-white/30">Xem trước</p>
              <p className="mt-1">{humanizeDraft(previewDraft)}</p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" onClick={() => onOpenChange(false)} className="rounded-md border border-white/10 px-4 py-2 text-sm text-white/70">
            Hủy
          </button>
          <button type="button" onClick={handleSave} className={primaryButtonClass}>
            Lưu
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TemplateFields({
  values,
  ctx,
  patch,
  meta,
}: {
  values: ConstraintFormValues;
  ctx: FormEntityContext;
  patch: (p: Partial<ConstraintFormValues>) => void;
  meta?: ConstraintTemplateMeta;
}) {
  const tid = values.templateId;

  const selectTeacher = (label?: string) => (
    <div>
      <FieldLabel>{label ?? 'Giáo viên'}</FieldLabel>
      <select className={inputClass} value={values.teacher ?? ''} onChange={(e) => patch({ teacher: e.target.value })}>
        <option value="">— chọn —</option>
        {ctx.teachers.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </div>
  );

  const selectDay = (label?: string) => (
    <div>
      <FieldLabel>{label ?? 'Ngày'}</FieldLabel>
      <select className={inputClass} value={values.day ?? ''} onChange={(e) => patch({ day: e.target.value })}>
        <option value="">— chọn —</option>
        {ctx.days.map((d) => (
          <option key={d.id} value={d.id}>{d.label}</option>
        ))}
      </select>
    </div>
  );

  const selectSession = (
    <div>
      <FieldLabel>Buổi</FieldLabel>
      <select className={inputClass} value={values.session ?? ''} onChange={(e) => patch({ session: e.target.value })}>
        <option value="">— chọn —</option>
        {ctx.sessions.map((session) => (
          <option key={session.id} value={session.id}>{session.label}</option>
        ))}
      </select>
    </div>
  );

  const selectSubject = (label?: string) => (
    <div>
      <FieldLabel>{label ?? 'Môn'}</FieldLabel>
      <select className={inputClass} value={values.subject ?? ''} onChange={(e) => patch({ subject: e.target.value })}>
        <option value="">Mọi môn (mở rộng)</option>
        {ctx.subjects.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );

  const selectSubjectA = (
    <div>
      <FieldLabel>Môn A</FieldLabel>
      <select className={inputClass} value={values.subjectA ?? ''} onChange={(e) => patch({ subjectA: e.target.value })}>
        <option value="">— chọn —</option>
        {ctx.subjects.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );

  const selectSubjectB = (
    <div>
      <FieldLabel>Môn B</FieldLabel>
      <select className={inputClass} value={values.subjectB ?? ''} onChange={(e) => patch({ subjectB: e.target.value })}>
        <option value="">— chọn —</option>
        {ctx.subjects.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );

  const selectClass = (label?: string) => (
    <div>
      <FieldLabel>{label ?? 'Lớp'}</FieldLabel>
      <select className={inputClass} value={values.className ?? ''} onChange={(e) => patch({ className: e.target.value })}>
        <option value="">— chọn —</option>
        {ctx.classes.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );

  const selectAssignment = (
    <div>
      <FieldLabel>Phân công</FieldLabel>
      <select className={inputClass} value={values.assignmentId ?? ''} onChange={(e) => patch({ assignmentId: e.target.value })}>
        <option value="">— chọn —</option>
        {(ctx.assignments ?? []).map((a) => (
          <option key={a.id} value={a.id}>{a.label}</option>
        ))}
      </select>
    </div>
  );

  const numInput = (label: string, field: keyof ConstraintFormValues, min = 1) => (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        min={min}
        className={inputClass}
        value={String(values[field] ?? '')}
        onChange={(e) => patch({ [field]: Number(e.target.value) })}
      />
    </div>
  );

  const periodsInput = (label: string) => (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        className={inputClass}
        placeholder="1,2,3"
        value={(values.periods ?? []).join(',')}
        onChange={(e) =>
          patch({
            periods: e.target.value
              .split(/[,;]/u)
              .map((x) => Number(x.trim()))
              .filter((n) => Number.isFinite(n)),
          })
        }
      />
    </div>
  );

  const daysMultiSelect = (
    <div>
      <FieldLabel>Ngày được chọn (chọn nhiều)</FieldLabel>
      <div className="flex flex-wrap gap-1.5">
        {ctx.days.map((d) => {
          const selected = (values.days ?? []).includes(d.id);
          return (
            <button
              key={d.id}
              type="button"
              className={`rounded px-2 py-1 text-xs border ${selected ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-white/10 bg-white/[0.03] text-white/50'}`}
              onClick={() => {
                const current = values.days ?? [];
                patch({ days: selected ? current.filter((x) => x !== d.id) : [...current, d.id] });
              }}
            >
              {d.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const subjectsMultiInput = (
    <div>
      <FieldLabel>Danh sách môn (cách nhau dấu phẩy)</FieldLabel>
      <input
        className={inputClass}
        value={(values.subjects ?? []).join(', ')}
        onChange={(e) =>
          patch({
            subjects: e.target.value
              .split(/[,;]/u)
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
      />
    </div>
  );

  const classesScopeSelect = (
    <div>
      <FieldLabel>Phạm vi lớp</FieldLabel>
      <select
        className={inputClass}
        value={values.classesScope === 'all' ? 'all' : 'pick'}
        onChange={(e) =>
          patch({
            classesScope: e.target.value === 'all' ? 'all' : values.className ? [values.className] : [],
          })
        }
      >
        <option value="all">Mọi lớp</option>
        <option value="pick">Một lớp</option>
      </select>
      {values.classesScope !== 'all' ? selectClass() : null}
    </div>
  );

  // Custom forms for kinds with specific UX
  switch (tid) {
    case 'teacher_block_day':
      return <>{selectTeacher()}{selectDay()}</>;
    case 'teacher_block_slot':
      return <>{selectTeacher()}{selectDay()}{numInput('Tiết', 'period')}</>;
    case 'teacher_max_per_day':
      return <>{selectTeacher()}{numInput('Tối đa tiết/ngày', 'maxPerDay')}</>;
    case 'teacher_max_consecutive':
      return <>{selectTeacher()}{numInput('Tối đa tiết liên tiếp', 'maxConsecutive')}</>;
    case 'teacher_max_classes_per_day':
      return <>{selectTeacher()}{numInput('Tối đa lớp/ngày', 'maxClasses')}</>;
    case 'teacher_max_working_days':
      return <>{selectTeacher()}{numInput('Tối đa ngày/tuần', 'maxDays')}</>;
    case 'teacher_min_per_day':
      return <>{selectTeacher()}{numInput('Tối thiểu tiết/ngày', 'minPerDay')}</>;
    case 'teacher_no_gaps':
      return <>{selectTeacher()}</>;
    case 'teacher_allowed_days':
      return <>{selectTeacher()}{daysMultiSelect}</>;
    case 'teacher_allowed_periods':
      return <>{selectTeacher()}{periodsInput('Các tiết được dạy')}</>;
    case 'teacher_pair_not_same_slot':
      return (
        <>
          <div>
            <FieldLabel>Giáo viên 1</FieldLabel>
            <select
              className={inputClass}
              value={values.teachers?.[0] ?? ''}
              onChange={(e) => patch({ teachers: [e.target.value, values.teachers?.[1] ?? ''] })}
            >
              <option value="">—</option>
              {ctx.teachers.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Giáo viên 2</FieldLabel>
            <select
              className={inputClass}
              value={values.teachers?.[1] ?? ''}
              onChange={(e) => patch({ teachers: [values.teachers?.[0] ?? '', e.target.value] })}
            >
              <option value="">—</option>
              {ctx.teachers.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </>
      );
    case 'teacher_homeroom_first_period':
      return <>{selectTeacher()}{selectClass('Lớp chủ nhiệm')}</>;
    case 'subject_pin_period':
      return <>{selectSubject()}{selectClass()}{periodsInput('Các tiết (vd: 1,2)')}</>;
    case 'subject_not_last_period':
      return <>{selectSubject()}{selectClass()}</>;
    case 'subject_max_consecutive':
      return (
        <>
          {selectSubject()}
          <div>
            <FieldLabel>Phạm vi môn</FieldLabel>
            <select
              className={inputClass}
              value={values.subjectsScope === 'all' ? 'all' : 'one'}
              onChange={(e) =>
                patch({
                  subjectsScope: e.target.value === 'all' ? 'all' : values.subject ? [values.subject] : [],
                  subject: e.target.value === 'all' ? undefined : values.subject,
                })
              }
            >
              <option value="all">Mọi môn</option>
              <option value="one">Một môn (chọn ở trên)</option>
            </select>
          </div>
          {numInput('Tối đa tiết liên tiếp (N)', 'maxConsecutive')}
        </>
      );
    case 'subject_block_period':
      return <>{selectSubject()}{periodsInput('Các tiết bị cấm')}</>;
    case 'subject_order_before':
      return <>{selectSubjectA}{selectSubjectB}</>;
    case 'subject_not_after_subject':
      return <>{selectSubjectA}{selectSubjectB}</>;
    case 'subject_min_gap_days':
      return <>{selectSubject()}{numInput('Khoảng cách tối thiểu (ngày)', 'minGap')}</>;
    case 'subject_flag_ceremony_slot':
      return <>{selectDay()}{numInput('Tiết', 'period')}</>;
    case 'class_block_day':
      return <>{selectClass()}{selectDay()}</>;
    case 'class_block_slot':
      return <>{selectClass()}{selectDay()}{numInput('Tiết', 'period')}</>;
    case 'class_max_per_day':
      return <>{selectClass()}{numInput('Tối đa tiết/ngày', 'maxPerDay')}</>;
    case 'class_min_per_day':
      return <>{selectClass()}{numInput('Tối thiểu tiết/ngày', 'min')}</>;
    case 'class_no_gaps':
      return <>{selectClass()}</>;
    case 'class_no_double_subject_day':
      return <>{selectClass()}{selectSubject()}</>;
    case 'class_max_subjects_per_day':
      return <>{classesScopeSelect}{numInput('Tối đa môn/ngày', 'maxPerDay')}</>;
    case 'class_max_consecutive':
      return <>{selectClass()}{numInput('Tối đa tiết liên tiếp', 'maxConsecutive')}</>;
    case 'class_first_period_required':
      return <>{classesScopeSelect}</>;
    case 'class_max_heavy_subjects_per_day':
      return <>{selectClass()}{subjectsMultiInput}{numInput('Tối đa môn nặng/ngày', 'maxHeavy')}</>;
    case 'class_max_heavy_subjects_per_session':
      return <>{classesScopeSelect}{subjectsMultiInput}{numInput('Tối đa môn nặng/buổi', 'maxHeavyInSession')}</>;
    case 'class_subjects_not_same_day':
      return <>{subjectsMultiInput}</>;
    case 'class_allowed_days':
      return <>{selectClass()}{daysMultiSelect}</>;
    case 'assignment_pin_slot':
      return <>{selectAssignment}{selectDay()}{numInput('Tiết', 'period')}</>;
    case 'assignment_block_slot':
      return <>{selectAssignment}{selectDay()}{numInput('Tiết', 'period')}</>;
    case 'assignment_max_per_day':
      return <>{selectAssignment}{numInput('Tối đa tiết/ngày', 'maxPerDay')}</>;
    case 'assignment_spread_days':
      return <>{selectAssignment}{numInput('Tối thiểu ngày', 'minDays')}</>;
    case 'global_teacher_utilization_balance':
      return <div>
        <FieldLabel>Dung sai cân bằng</FieldLabel>
        <input
          type="number"
          min={1}
          className={inputClass}
          value={values.tolerance ?? 2}
          onChange={(e) => patch({ tolerance: Number(e.target.value) })}
        />
      </div>;
    case 'session_limit':
      return <>{selectTeacher()}{selectSession}{numInput('Số tiết tối đa', 'maxPeriods')}</>;
    case 'if_then':
      return <IfThenFields values={values} ctx={ctx} patch={patch} />;
    case 'custom_dsl':
      return (
        <div>
          <FieldLabel>Python predicate</FieldLabel>
          <textarea
            className={`${inputClass} h-24 font-mono text-xs`}
            value={values.pythonPredicate ?? ''}
            onChange={(e) => patch({ pythonPredicate: e.target.value })}
            placeholder="def check(schedule): return True  # hoặc list violations"
          />
        </div>
      );
    default: {
      // Generic renderer from fields metadata
      if (!meta) return null;
      return <GenericFields fields={meta.fields} ctx={ctx} values={values} patch={patch} />;
    }
  }
}

function IfThenFields({
  values,
  ctx,
  patch,
}: {
  values: ConstraintFormValues;
  ctx: FormEntityContext;
  patch: (p: Partial<ConstraintFormValues>) => void;
}) {
  const cond = values.ifThenCondition;
  const thenList = values.ifThenThen ?? [];

  const updateCond = (p: Partial<{ teacher: string; day: string; period: number; op: string }>) => {
    const current = cond ?? { op: 'teacher_teaches_on_day' as const, teacher: '', day: '' };
    const next = { ...current, ...p } as typeof cond;
    patch({ ifThenCondition: next });
  };

  const updateThen = (idx: number, p: Partial<{ kind: string; teacher: string; day: string; period: number }>) => {
    const list = [...thenList];
    const item = list[idx] ?? { kind: 'teacher_block_day', params: {} };
    list[idx] = { ...item, params: { ...item.params, ...p } };
    patch({ ifThenThen: list });
  };

  const addThen = () => {
    patch({ ifThenThen: [...thenList, { kind: 'teacher_block_day', params: { teacher: '', day: '' } }] });
  };

  const removeThen = (idx: number) => {
    patch({ ifThenThen: thenList.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Điều kiện (Nếu)</p>
      <div>
        <FieldLabel>Giáo viên</FieldLabel>
        <select
          className={inputClass}
          value={cond?.teacher ?? ''}
          onChange={(e) => updateCond({ teacher: e.target.value })}
        >
          <option value="">— chọn —</option>
          {ctx.teachers.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <div>
        <FieldLabel>Có dạy vào ngày</FieldLabel>
        <select
          className={inputClass}
          value={cond?.day ?? ''}
          onChange={(e) => updateCond({ day: e.target.value })}
        >
          <option value="">— chọn —</option>
          {ctx.days.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
      </div>
      <div>
        <FieldLabel>Loại điều kiện</FieldLabel>
        <select
          className={inputClass}
          value={cond?.op ?? 'teacher_teaches_on_day'}
          onChange={(e) => updateCond({ op: e.target.value })}
        >
          <option value="teacher_teaches_on_day">Dạy vào ngày</option>
          <option value="teacher_teaches_at_slot">Dạy tại slot (ngày + tiết)</option>
        </select>
      </div>
      {cond?.op === 'teacher_teaches_at_slot' && (
        <div>
          <FieldLabel>Tiết</FieldLabel>
          <input
            type="number"
            min={1}
            className={inputClass}
            value={cond?.period ?? 1}
            onChange={(e) => updateCond({ period: Number(e.target.value) })}
          />
        </div>
      )}

      <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Kết quả (Thì)</p>
      {thenList.map((item, idx) => {
        const tp = item.params ?? {};
        return (
          <div key={idx} className="rounded border border-white/[0.08] bg-white/[0.02] p-2 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-white/50">Kết quả {idx + 1}</p>
              <button type="button" className="text-xs text-red-400 hover:text-red-300" onClick={() => removeThen(idx)}>Xóa</button>
            </div>
            <div>
              <FieldLabel>Loại</FieldLabel>
              <select
                className={inputClass}
                value={item.kind}
                onChange={(e) => {
                  const list = [...thenList];
                  list[idx] = { kind: e.target.value, params: {} };
                  patch({ ifThenThen: list });
                }}
              >
                <option value="teacher_block_day">GV không dạy ngày</option>
                <option value="teacher_block_slot">GV không dạy slot</option>
                <option value="pair_not_same_slot">Hai GV không trùng tiết</option>
                <option value="teacher_no_gaps">GV không có tiết trống</option>
              </select>
            </div>
            {item.kind !== 'pair_not_same_slot' ? (
              <>
                <div>
                  <FieldLabel>Giáo viên</FieldLabel>
                  <select
                    className={inputClass}
                    value={typeof tp.teacher === 'string' ? tp.teacher : ''}
                    onChange={(e) => updateThen(idx, { teacher: e.target.value })}
                  >
                    <option value="">— chọn —</option>
                    {ctx.teachers.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                {item.kind !== 'teacher_no_gaps' && (
                  <>
                    <div>
                      <FieldLabel>Ngày</FieldLabel>
                      <select
                        className={inputClass}
                        value={typeof tp.day === 'string' ? tp.day : ''}
                        onChange={(e) => updateThen(idx, { day: e.target.value })}
                      >
                        <option value="">— chọn —</option>
                        {ctx.days.map((d) => (
                          <option key={d.id} value={d.id}>{d.label}</option>
                        ))}
                      </select>
                    </div>
                    {item.kind === 'teacher_block_slot' && (
                      <div>
                        <FieldLabel>Tiết</FieldLabel>
                        <input
                          type="number"
                          min={1}
                          className={inputClass}
                          value={typeof tp.period === 'number' ? tp.period : 1}
                          onChange={(e) => updateThen(idx, { period: Number(e.target.value) })}
                        />
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <p className="text-xs text-white/40">Dùng form GV pair_not_same_slot ở trên.</p>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="rounded border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.06]"
        onClick={addThen}
      >
        + Thêm kết quả
      </button>
    </div>
  );
}

function GenericFields({
  fields,
  ctx,
  values,
  patch,
}: {
  fields: string[];
  ctx: FormEntityContext;
  values: ConstraintFormValues;
  patch: (p: Partial<ConstraintFormValues>) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] text-white/30">Form nâng cao (tự động)</p>
      {fields.map((field) => {
        switch (field) {
          case 'teacher':
            return (
              <div key={field}>
                <FieldLabel>Giáo viên</FieldLabel>
                <select className={inputClass} value={values.teacher ?? ''} onChange={(e) => patch({ teacher: e.target.value })}>
                  <option value="">— chọn —</option>
                  {ctx.teachers.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            );
          case 'teachers':
            return (
              <div key={field} className="space-y-1">
                <FieldLabel>Hai giáo viên</FieldLabel>
                <select className={inputClass} value={values.teachers?.[0] ?? ''} onChange={(e) => patch({ teachers: [e.target.value, values.teachers?.[1] ?? ''] })}>
                  <option value="">GV 1 —</option>
                  {ctx.teachers.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select className={inputClass} value={values.teachers?.[1] ?? ''} onChange={(e) => patch({ teachers: [values.teachers?.[0] ?? '', e.target.value] })}>
                  <option value="">GV 2 —</option>
                  {ctx.teachers.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            );
          case 'subject':
            return (
              <div key={field}>
                <FieldLabel>Môn</FieldLabel>
                <select className={inputClass} value={values.subject ?? ''} onChange={(e) => patch({ subject: e.target.value })}>
                  <option value="">— chọn —</option>
                  {ctx.subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            );
          case 'subjectA':
            return (
              <div key={field}>
                <FieldLabel>Môn A</FieldLabel>
                <select className={inputClass} value={values.subjectA ?? ''} onChange={(e) => patch({ subjectA: e.target.value })}>
                  <option value="">— chọn —</option>
                  {ctx.subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            );
          case 'subjectB':
            return (
              <div key={field}>
                <FieldLabel>Môn B</FieldLabel>
                <select className={inputClass} value={values.subjectB ?? ''} onChange={(e) => patch({ subjectB: e.target.value })}>
                  <option value="">— chọn —</option>
                  {ctx.subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            );
          case 'subjects':
            return (
              <div key={field}>
                <FieldLabel>Danh sách môn</FieldLabel>
                <input
                  className={inputClass}
                  value={(values.subjects ?? []).join(', ')}
                  onChange={(e) => patch({ subjects: e.target.value.split(/[,;]/u).map((s) => s.trim()).filter(Boolean) })}
                  placeholder="Toán, Văn, Anh"
                />
              </div>
            );
          case 'class':
            return (
              <div key={field}>
                <FieldLabel>Lớp</FieldLabel>
                <select className={inputClass} value={values.className ?? ''} onChange={(e) => patch({ className: e.target.value })}>
                  <option value="">— chọn —</option>
                  {ctx.classes.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            );
          case 'day':
            return (
              <div key={field}>
                <FieldLabel>Ngày</FieldLabel>
                <select className={inputClass} value={values.day ?? ''} onChange={(e) => patch({ day: e.target.value })}>
                  <option value="">— chọn —</option>
                  {ctx.days.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </div>
            );
          case 'days':
            return (
              <div key={field}>
                <FieldLabel>Ngày (chọn nhiều)</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {ctx.days.map((d) => {
                    const selected = (values.days ?? []).includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        className={`rounded px-2 py-1 text-xs border ${selected ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-white/10 bg-white/[0.03] text-white/50'}`}
                        onClick={() => {
                          const current = values.days ?? [];
                          patch({ days: selected ? current.filter((x) => x !== d.id) : [...current, d.id] });
                        }}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          case 'period':
            return (
              <div key={field}>
                <FieldLabel>Tiết</FieldLabel>
                <input type="number" min={1} className={inputClass} value={values.period ?? 1} onChange={(e) => patch({ period: Number(e.target.value) })} />
              </div>
            );
          case 'periods':
            return (
              <div key={field}>
                <FieldLabel>Các tiết (cách nhau dấu phẩy)</FieldLabel>
                <input
                  className={inputClass}
                  placeholder="1,2,3"
                  value={(values.periods ?? []).join(',')}
                  onChange={(e) => patch({ periods: e.target.value.split(/[,;]/u).map((x) => Number(x.trim())).filter((n) => Number.isFinite(n)) })}
                />
              </div>
            );
          case 'assignmentId':
            return (
              <div key={field}>
                <FieldLabel>Phân công</FieldLabel>
                <select className={inputClass} value={values.assignmentId ?? ''} onChange={(e) => patch({ assignmentId: e.target.value })}>
                  <option value="">— chọn —</option>
                  {(ctx.assignments ?? []).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
            );
          case 'assignmentIds':
            return (
              <div key={field}>
                <FieldLabel>Phân công (chọn nhiều)</FieldLabel>
                <input
                  className={inputClass}
                  value={(values.assignmentIds ?? []).join(', ')}
                  onChange={(e) => patch({ assignmentIds: e.target.value.split(/[,;]/u).map((s) => s.trim()).filter(Boolean) })}
                  placeholder="ID phân công 1, ID phân công 2"
                />
              </div>
            );
          default: {
            // Numeric or text fallback
            const numericFields = ['max', 'min', 'maxPerDay', 'maxConsecutive', 'maxClasses', 'maxHeavy', 'maxHeavyInSession', 'maxDays', 'minDays', 'minPerDay', 'minGap', 'maxGaps', 'minConsecutive', 'length', 'tolerance', 'count', 'maxPeriods'];
            if (numericFields.includes(field)) {
              return (
                <div key={field}>
                  <FieldLabel>{field}</FieldLabel>
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    value={String((values as Record<string, unknown>)[field] ?? '')}
                    onChange={(e) => patch({ [field]: Number(e.target.value) } as Partial<ConstraintFormValues>)}
                  />
                </div>
              );
            }
            return (
              <div key={field}>
                <FieldLabel>{field}</FieldLabel>
                <input
                  className={inputClass}
                  value={String((values as Record<string, unknown>)[field] ?? '')}
                  onChange={(e) => patch({ [field]: e.target.value } as Partial<ConstraintFormValues>)}
                />
              </div>
            );
          }
        }
      })}
    </div>
  );
}
