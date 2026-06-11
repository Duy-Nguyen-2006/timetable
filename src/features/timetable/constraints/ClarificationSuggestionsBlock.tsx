'use client';

import { useState } from 'react';
import { Lightbulb } from 'lucide-react';

import type { ClarificationOption } from '../ai/constraint-clarification-types';
import type { ConstraintClarificationQuestion } from '../ai/constraint-review-types';
import type { ConstraintSpec } from '../ai/constraint-spec';

export type ClarificationSuggestionsBlockProps = {
  questions: ConstraintClarificationQuestion[];
  reparseCount?: number;
  constraintType?: 'required' | 'preferred';
  onSelectOption: (questionId: string, selected: ClarificationOption) => void;
  onApplySpecDraft?: (spec: ConstraintSpec) => void;
  onReparseWithFeedback?: (feedback: string) => void;
  onOpenManualEdit?: () => void;
  onOpenTemplatePicker?: () => void;
  onDemoteToPreferred?: () => void;
  showAiRetry?: boolean;
  onAiRetry?: () => void;
};

export function ClarificationSuggestionsBlock({
  questions,
  reparseCount = 0,
  constraintType = 'required',
  onSelectOption,
  onApplySpecDraft,
  onReparseWithFeedback,
  onOpenManualEdit,
  onOpenTemplatePicker,
  onDemoteToPreferred,
  showAiRetry = false,
  onAiRetry,
}: ClarificationSuggestionsBlockProps) {
  const [freeTextQuestionId, setFreeTextQuestionId] = useState<string | null>(null);
  const [freeText, setFreeText] = useState('');
  const hideAiRetry = reparseCount >= 2;

  const handleOptionClick = (question: ConstraintClarificationQuestion, selected: ClarificationOption) => {
    if (selected.id === 'none_fit') {
      setFreeTextQuestionId(question.id);
      setFreeText('');
      return;
    }
    if (selected.specDraft && onApplySpecDraft) {
      onApplySpecDraft(selected.specDraft);
      return;
    }
    onSelectOption(question.id, selected);
  };

  const submitFreeText = () => {
    const trimmed = freeText.trim();
    if (!trimmed || !onReparseWithFeedback) return;
    onReparseWithFeedback(trimmed);
    setFreeTextQuestionId(null);
    setFreeText('');
  };

  return (
    <div data-testid="clarification-suggestions-block" className="space-y-3">
      {questions.map((question, questionIndex) => {
        const recommended = question.options.find((option) => option.recommended);
        const otherOptions = question.options.filter((option) => !option.recommended && option.id !== 'none_fit');
        const escapeOption = question.options.find((option) => option.id === 'none_fit');

        return (
          <div key={question.id ?? `clarification-${questionIndex}`}>
            <p className="text-xs leading-relaxed text-amber-100/90">{question.prompt}</p>

            {recommended ? (
              <div
                data-testid="clarification-recommended"
                className="mt-2 rounded-md border border-emerald-500/35 bg-emerald-500/[0.08] p-2.5"
              >
                <p className="text-[10px] font-medium uppercase tracking-widest text-emerald-300/80">
                  <Lightbulb size={10} className="mr-1 inline" />
                  Gợi ý
                </p>
                <p className="mt-1 text-xs leading-relaxed text-emerald-50/95">{recommended.labelVi}</p>
                {recommended.exampleVi ? (
                  <p className="mt-1 text-[11px] italic leading-relaxed text-emerald-100/65">
                    {recommended.exampleVi}
                  </p>
                ) : null}
                <button
                  type="button"
                  data-testid="use-recommended-button"
                  onClick={() => handleOptionClick(question, recommended)}
                  className="mt-2 rounded-md bg-[#4DB848] px-3 py-1.5 text-xs font-medium text-[#0a0a0a] hover:bg-[#40993C]"
                >
                  Dùng gợi ý này
                </button>
              </div>
            ) : null}

            {otherOptions.length > 0 ? (
              <div className="mt-2 flex flex-col gap-1.5">
                {otherOptions.map((option) => (
                  <button
                    key={`${question.id}-option-${option.id}`}
                    type="button"
                    data-testid="clarification-option"
                    onClick={() => handleOptionClick(question, option)}
                    className="rounded-md border border-amber-500/25 bg-[#0a0a0a] px-2.5 py-2 text-left text-xs text-amber-100/90 hover:border-amber-400/40 hover:bg-amber-500/[0.08]"
                  >
                    <span>{option.labelVi}</span>
                    {option.exampleVi ? (
                      <span className="mt-1 block text-[11px] italic text-amber-200/55">{option.exampleVi}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}

            {escapeOption && freeTextQuestionId !== question.id ? (
              <button
                type="button"
                data-testid="clarification-escape-option"
                onClick={() => handleOptionClick(question, escapeOption)}
                className="mt-2 text-left text-[11px] text-amber-200/70 underline-offset-2 hover:text-amber-100 hover:underline"
              >
                {escapeOption.labelVi}
              </button>
            ) : null}

            {freeTextQuestionId === question.id ? (
              <div data-testid="clarification-free-text" className="mt-2 space-y-2">
                <textarea
                  value={freeText}
                  onChange={(event) => setFreeText(event.target.value)}
                  placeholder="Viết lại bằng lời của bạn..."
                  rows={2}
                  className="w-full rounded-md border border-white/[0.08] bg-[#0a0a0a] px-2.5 py-2 text-xs text-white outline-none placeholder:text-white/25 focus:border-white/20"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={submitFreeText}
                    disabled={!freeText.trim()}
                    className="rounded-md border border-violet-500/40 bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-500/25 disabled:opacity-40"
                  >
                    Gửi và thử lại
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFreeTextQuestionId(null);
                      setFreeText('');
                    }}
                    className="rounded-md border border-white/[0.08] px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.04]"
                  >
                    Huỷ
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-2">
        {onOpenManualEdit ? (
          <button
            type="button"
            data-testid="manual-edit-button"
            onClick={onOpenManualEdit}
            className="rounded-md bg-[#4DB848] px-3 py-1.5 text-xs font-medium text-[#0a0a0a] hover:bg-[#40993C]"
          >
            Tự đặt luật
          </button>
        ) : null}
        {onOpenTemplatePicker ? (
          <button
            type="button"
            data-testid="use-template-button"
            onClick={onOpenTemplatePicker}
            className="rounded-md border border-white/[0.12] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/75 hover:bg-white/[0.08]"
          >
            Dùng mẫu có sẵn
          </button>
        ) : null}
        {showAiRetry && onAiRetry && !hideAiRetry ? (
          <button
            type="button"
            data-testid="ai-retry-button"
            onClick={onAiRetry}
            className="rounded-md border border-violet-500/40 bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-500/25"
          >
            Tôi chọn cách khác
          </button>
        ) : null}
        {constraintType === 'required' && onDemoteToPreferred ? (
          <button
            type="button"
            data-testid="demote-preferred-button"
            onClick={onDemoteToPreferred}
            className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20"
          >
            Hạ xuống ưu tiên (mềm)
          </button>
        ) : null}
      </div>
    </div>
  );
}