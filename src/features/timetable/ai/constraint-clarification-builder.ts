/**
 * constraint-clarification-builder.ts — M5 structured clarification DTO
 *
 * Per Plan_v2.md M5, this builder produces DTOs that are safe to render
 * to the user: only Vietnamese text, no backend enum names, no IR shapes.
 * Each option carries a `specDraft` or `irDraft` that can be committed
 * deterministically when the user picks the option.
 *
 * The older `buildClarificationQuestions` in constraint-clarification.ts
 * still exists for the parse-pipeline path. This builder is used by the
 * clarification DTO consumers (UI / wizard / reparse loop).
 */

import type { ConstraintSpec } from './constraint-spec';
import {
  type ClarificationOption,
  type ClarificationQuestion,
  type InterpretationCardDTO,
  clarificationOptionFromBuiltIn,
} from './constraint-clarification-types';

export type { ClarificationOption, ClarificationQuestion };

/**
 * Build a clarification question for ambiguous require-vs-only direction
 * (e.g. "Cô Thủy có tiết 4" — is it at-least, or allowed-only?).
 */
export function buildRequireVsOnlyQuestion(
  teacher: string,
  period: number,
  classLabel?: string
): ClarificationQuestion {
  return {
    id: 'require_vs_only',
    questionVi: classLabel
      ? `Bạn muốn nói là giáo viên «${teacher}» của lớp «${classLabel}» bắt buộc có ít nhất một tiết ${period} trong tuần, hay chỉ được dạy ở tiết ${period}?`
      : `Bạn muốn nói là «${teacher}» bắt buộc có ít nhất một tiết ${period} trong tuần, hay chỉ được dạy ở tiết ${period}?`,
    allowFreeText: true,
    reasonCode: 'ambiguous_direction',
    options: [
      clarificationOptionFromBuiltIn(
        'require_at_least',
        'teacher_required_period',
        { teacher, period, minCount: 1 },
        `Bắt buộc có ít nhất một tiết ${period} trong tuần`,
        `«${teacher}» phải dạy tiết ${period} ít nhất 1 lần trong tuần.`
      ),
      clarificationOptionFromBuiltIn(
        'only_allowed',
        'teacher_allowed_periods',
        { teacher, periods: [period] },
        `Chỉ được dạy ở tiết ${period}`,
        `«${teacher}» không được dạy ngoài tiết ${period}.`
      ),
    ],
  };
}

/**
 * Build a clarification question for missing teacher (e.g. "Không dạy
 * tiết 4" with no teacher mentioned). The UI must be passed the list
 * of known teachers so it can render them as options.
 */
export function buildMissingEntityQuestion(
  entityKind: 'teacher' | 'class' | 'subject',
  knownLabels: string[]
): ClarificationQuestion {
  const labels = knownLabels.length > 0
    ? knownLabels
    : ['(chưa có ' + (entityKind === 'teacher' ? 'giáo viên' : entityKind === 'class' ? 'lớp' : 'môn học') + ' nào trong dữ liệu)'];

  const labelEntityVi = entityKind === 'teacher' ? 'giáo viên' : entityKind === 'class' ? 'lớp' : 'môn học';
  const questionVi = `Bạn muốn áp dụng ràng buộc này cho ${labelEntityVi} nào?`;

  const options: ClarificationOption[] = labels.slice(0, 8).map((label) => ({
    id: `pick_${entityKind}_${label}`,
    labelVi: label,
  }));

  return {
    id: `missing_${entityKind}`,
    questionVi,
    options,
    allowFreeText: true,
    reasonCode: 'missing_entity',
  };
}

/**
 * Build a clarification question for ambiguous teacher name (multiple
 * "Thủy" in the dataset).
 */
export function buildAmbiguousEntityQuestion(
  entityKind: 'teacher' | 'class' | 'subject',
  partialName: string,
  candidates: string[]
): ClarificationQuestion {
  const labelEntityVi = entityKind === 'teacher' ? 'giáo viên' : entityKind === 'class' ? 'lớp' : 'môn học';
  return {
    id: `ambiguous_${entityKind}`,
    questionVi: `Trong danh sách có nhiều ${labelEntityVi} tên «${partialName}». Bạn muốn chọn ai?`,
    allowFreeText: false,
    reasonCode: 'ambiguous_entity',
    options: candidates.slice(0, 6).map((candidate) => ({
      id: `pick_${entityKind}_${candidate}`,
      labelVi: candidate,
    })),
  };
}

/**
 * Build a clarification question for unresolved subject semantics
 * (per-class vs global vs preference).
 */
export function buildSubjectScopeQuestion(
  subject: string,
  period: number
): ClarificationQuestion {
  return {
    id: 'subject_scope',
    questionVi: `Bạn muốn áp dụng môn «${subject}» ở phạm vi nào?`,
    allowFreeText: true,
    reasonCode: 'missing_scope',
    options: [
      {
        id: 'per_class',
        labelVi: 'Mỗi lớp học ' + subject + ' phải có ít nhất một tiết ' + period + ' trong tuần',
        previewVi: 'Mỗi lớp có môn này sẽ được áp dụng riêng.',
        specDraft: {
          id: 'clarify_subject_per_class',
          original: 'Mỗi lớp học ' + subject + ' phải có ít nhất một tiết ' + period,
          severity: 'hard',
          kind: 'subject_required_period',
          params: { subject, period, minCount: 1, scope: 'per_class' },
        },
      },
      {
        id: 'specific_class',
        labelVi: 'Chỉ một lớp cụ thể cần có ' + subject + ' tiết ' + period,
        previewVi: 'Bạn sẽ chọn lớp ở bước tiếp theo.',
      },
      {
        id: 'just_preference',
        labelVi: 'Đây chỉ là ưu tiên, không bắt buộc',
        specDraft: {
          id: 'clarify_subject_preference',
          original: 'Ưu tiên ' + subject + ' tiết ' + period,
          severity: 'soft',
          kind: 'subject_preferred_periods',
          params: { subject, periods: [period] },
        },
      },
    ],
  };
}

/**
 * Build a confirmation preview for a confirmed constraint.
 * Shown before the user clicks "Lưu ràng buộc" / "Sửa lại".
 */
export function buildConfirmationPreview(
  spec: ConstraintSpec,
  labelVi: string
): { questionVi: string; options: ClarificationOption[] } {
  return {
    questionVi: `Mình sẽ lưu ràng buộc này: ${labelVi}`,
    options: [
      {
        id: 'confirm',
        labelVi: 'Lưu ràng buộc',
        specDraft: spec,
      },
      {
        id: 'edit',
        labelVi: 'Sửa lại',
      },
    ],
    // Confirmation preview reuses the ClarificationOption shape but is
    // never returned as a ClarificationQuestion (no reasonCode, no
    // allowFreeText needed). Callers wrap this in a confirmation step.
  } as unknown as { questionVi: string; options: ClarificationOption[] };
}

/**
 * Build an interpretation confirmation question for compound constraints.
 * This is triggered when:
 *   - self-consistency detected divergence
 *   - atom confidence < high
 *   - LLM-verify found semantic mismatch
 *   - type-check failed
 *   - ALWAYS for if-then multi-clause constraints
 *
 * The question shows the user the system's understanding (from IR, humanized)
 * and asks for confirmation or correction.
 */
export function buildInterpretationConfirm(
  interpretation: InterpretationCardDTO,
  rawText: string
): ClarificationQuestion {
  const parts: string[] = [];

  if (interpretation.scopeVi) {
    parts.push(`Phạm vi: ${interpretation.scopeVi}`);
  }
  if (interpretation.ifAtomVi) {
    parts.push(`Điều kiện: ${interpretation.ifAtomVi}`);
  }
  parts.push(...interpretation.thenAtomsVi.map((a, i) => `Ràng buộc ${i + 1}: ${a}`));

  const notesSection = interpretation.notesVi.length > 0
    ? `\n\nGhi chú: ${interpretation.notesVi.join('; ')}`
    : '';

  return {
    id: 'confirm_interpretation',
    questionVi: `Mình hiểu câu "${rawText}" như sau:\n${parts.join('\n')}${notesSection}\n\nCách hiểu này đúng không?`,
    options: [
      {
        id: 'confirm_ok',
        labelVi: 'Đúng, lưu ràng buộc này',
      },
      {
        id: 'confirm_edit',
        labelVi: 'Sửa lại cách hiểu',
      },
    ],
    allowFreeText: true,
    reasonCode: 'confirm_interpretation',
  };
}
