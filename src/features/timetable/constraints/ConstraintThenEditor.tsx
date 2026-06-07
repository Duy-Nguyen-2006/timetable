'use client';

/**
 * ConstraintThenEditor — visual editor for the `then` array of an if_then spec.
 * Used when parsing dropped teacher entities (issue `possible_entity_loss`).
 * Each entry is one row with teacher/day/(period) dropdowns; +/− buttons to add/remove.
 */

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import type { ConstraintSpec } from '../ai/constraint-spec';
import type { AgentInputPayload } from '../ai/types';
import { inputClass, primaryButtonClass, days as DAYS } from '../constants';

type ThenEntry = {
  kind: 'teacher_block_slot' | 'teacher_block_day';
  teacher: string;
  day: string;
  period: number | null;
};

type ConstraintThenEditorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spec: ConstraintSpec;
  agentInput: AgentInputPayload;
  /** Optional list of teacher labels the parser dropped, shown as quick-add chips. */
  suggestedTeachers?: string[];
  onSave: (updatedSpec: ConstraintSpec) => void;
};

function toEntry(value: unknown): ThenEntry | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { kind?: unknown; params?: { teacher?: unknown; day?: unknown; period?: unknown } };
  const kind = v.kind === 'teacher_block_day' || v.kind === 'teacher_block_slot' ? v.kind : null;
  if (!kind) return null;
  const teacher = typeof v.params?.teacher === 'string' ? v.params.teacher : '';
  const day = typeof v.params?.day === 'string' ? v.params.day : '';
  const period = typeof v.params?.period === 'number' ? v.params.period : null;
  if (!teacher || !day) return null;
  return { kind, teacher, day, period: kind === 'teacher_block_day' ? null : period };
}

export function ConstraintThenEditor({
  open,
  onOpenChange,
  spec,
  agentInput,
  suggestedTeachers = [],
  onSave,
}: ConstraintThenEditorProps) {
  const teacherLabels = useMemo(() => {
    const set = new Set<string>();
    for (const a of agentInput.assignments) set.add(a.teacher.label);
    return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [agentInput.assignments]);

  const dayLabels = useMemo(() => {
    return agentInput.days.length > 0
      ? agentInput.days.map((d) => ({ id: d.id, label: d.label }))
      : DAYS.map((d) => ({ id: d.id, label: d.label }));
  }, [agentInput.days]);

  const initialEntries = useMemo<ThenEntry[]>(() => {
    const then = Array.isArray(spec.params.then) ? (spec.params.then as unknown[]) : [];
    return then.map(toEntry).filter((e): e is ThenEntry => e !== null);
  }, [spec]);

  const [entries, setEntries] = useState<ThenEntry[]>(initialEntries);

  const patchEntry = (index: number, patch: Partial<ThenEntry>) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  const addEntry = (teacher?: string) => {
    setEntries((prev) => [
      ...prev,
      {
        kind: 'teacher_block_slot',
        teacher: teacher ?? (teacherLabels[0] ?? ''),
        day: dayLabels[0]?.id ?? 'monday',
        period: 1,
      },
    ]);
  };

  const removeEntry = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const then = entries
      .filter((e) => e.teacher && e.day)
      .map((e) => {
        if (e.kind === 'teacher_block_day' || e.period === null) {
          return { kind: 'teacher_block_day', params: { teacher: e.teacher, day: e.day } };
        }
        return {
          kind: 'teacher_block_slot',
          params: { teacher: e.teacher, day: e.day, period: e.period },
        };
      });
    const updatedSpec: ConstraintSpec = {
      ...spec,
      params: { ...spec.params, ['then']: then },
    };
    onSave(updatedSpec);
    onOpenChange(false);
  };

  const missingTeachers = useMemo(
    () => suggestedTeachers.filter((t) => !entries.some((e) => e.teacher === t)),
    [suggestedTeachers, entries],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Force a fresh state when the dialog reopens with a different spec.
        key={`${open}-${spec.id}-${initialEntries.length}`}
        className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#141414] text-white sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="text-white">Sửa phần THEN</DialogTitle>
          <p className="text-xs text-white/40">Mỗi dòng là một ràng buộc GV-không-dạy. Thêm/sửa/xóa để khớp ý bạn.</p>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {missingTeachers.length > 0 ? (
            <div className="rounded border border-amber-500/30 bg-amber-500/[0.06] p-2.5 text-xs text-amber-200/90">
              <p className="font-medium">GV có thể bị thiếu (gợi ý thêm nhanh):</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {missingTeachers.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addEntry(t)}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] hover:bg-amber-500/20"
                  >
                    <Plus size={10} /> {t}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {entries.length === 0 ? (
            <p className="rounded border border-white/[0.08] bg-[#0a0a0a] p-3 text-xs text-white/40">
              Chưa có ràng buộc THEN nào. Bấm “+ Thêm” để thêm.
            </p>
          ) : (
            <ul className="space-y-2">
              {entries.map((entry, index) => (
                <li
                  key={`then-${index}`}
                  className="flex flex-wrap items-center gap-1.5 rounded border border-white/[0.08] bg-[#0a0a0a] p-2"
                >
                  <select
                    className={inputClass + ' h-8 w-auto min-w-[7rem] flex-1 px-2 text-xs'}
                    value={entry.teacher}
                    onChange={(e) => patchEntry(index, { teacher: e.target.value })}
                    aria-label="Giáo viên"
                  >
                    {teacherLabels.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>

                  <select
                    className={inputClass + ' h-8 w-auto min-w-[6rem] flex-1 px-2 text-xs'}
                    value={entry.day}
                    onChange={(e) => patchEntry(index, { day: e.target.value })}
                    aria-label="Ngày"
                  >
                    {dayLabels.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>

                  <select
                    className={inputClass + ' h-8 w-auto min-w-[5rem] px-2 text-xs'}
                    value={entry.period === null ? 'all' : 'slot'}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'all') {
                        patchEntry(index, { kind: 'teacher_block_day', period: null });
                      } else {
                        patchEntry(index, { kind: 'teacher_block_slot', period: 1 });
                      }
                    }}
                    aria-label="Loại"
                  >
                    <option value="slot">Tiết cụ thể</option>
                    <option value="all">Cả ngày</option>
                  </select>

                  {entry.kind === 'teacher_block_slot' ? (
                    <input
                      type="number"
                      min={1}
                      max={20}
                      className={inputClass + ' h-8 w-14 px-2 text-xs'}
                      value={entry.period ?? 1}
                      onChange={(e) => patchEntry(index, { period: Number(e.target.value) })}
                      aria-label="Tiết"
                    />
                  ) : null}

                  <button
                    type="button"
                    onClick={() => removeEntry(index)}
                    className="rounded p-1 text-red-400/70 transition hover:bg-red-500/10 hover:text-red-400"
                    aria-label="Xóa"
                    title="Xóa"
                  >
                    <Trash2 size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => addEntry()}
            className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.04]"
          >
            <Plus size={12} /> Thêm ràng buộc THEN
          </button>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-white/10 px-4 py-2 text-sm text-white/70"
          >
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

export default ConstraintThenEditor;
