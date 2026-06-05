'use client';

import { LayoutTemplate } from 'lucide-react';

import { CONSTRAINT_GROUP_LABELS, CONSTRAINT_GROUPS, CONSTRAINT_TEMPLATES, type ConstraintFormTemplateId } from './constraint-form-schema';
import { ghostButtonClass, panelMutedClass } from '../constants';

type ConstraintTemplatePickerProps = {
  onSelect: (templateId: ConstraintFormTemplateId) => void;
};

export function ConstraintTemplatePicker({ onSelect }: ConstraintTemplatePickerProps) {
  return (
    <div className={`${panelMutedClass} p-3`}>
      <p className="mb-2 flex items-center gap-2 text-xs font-medium text-white/50">
        <LayoutTemplate size={14} />
        Chọn mẫu ràng buộc
      </p>
      <div className="flex flex-col gap-3">
        {CONSTRAINT_GROUPS.map((group) => {
          const items = CONSTRAINT_TEMPLATES.filter((t) => t.group === group);
          if (!items.length) return null;
          return (
            <div key={group}>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-white/30">
                {CONSTRAINT_GROUP_LABELS[group] ?? group}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {items.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`${ghostButtonClass} text-xs py-1 px-2`}
                    onClick={() => onSelect(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
