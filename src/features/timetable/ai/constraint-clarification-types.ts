/**
 * constraint-clarification-types.ts — M5 UI Clarification Contract
 *
 * Per Plan_v2.md M5, the UI must show only structured Vietnamese DTOs
 * to the user. The UI must NOT show:
 *   - backend enum names (teacher_required_period, etc.)
 *   - ConstraintIR shapes
 *   - params / DSL / internal fields
 *
 * This DTO is the boundary between the AI pipeline and the UI. The UI
 * renders questionVi and option.labelVi only. The id and specDraft/irDraft
 * travel with the option so the user click can deterministically map back
 * to a ConstraintSpec without further LLM calls.
 */

import type { ConstraintKind, ConstraintSpec } from './constraint-spec';
import type { ConstraintIR } from './constraint-ir';

/**
 * A single option the user can pick when clarifying an ambiguous
 * constraint. `labelVi` is what the user sees — must be natural
 * Vietnamese. `specDraft` and `irDraft` are the deterministic mappings
 * the pipeline can apply if the user picks this option.
 */
export type ClarificationOption = {
  /** Stable id, used for telemetry and to deterministically rebuild spec. */
  id: string;
  /** User-facing Vietnamese label — no backend enums, no IR shapes. */
  labelVi: string;
  /** Optional preview text shown beneath the label for longer context. */
  previewVi?: string;
  /** If this option maps to a built-in kind, the draft spec to commit. */
  specDraft?: ConstraintSpec;
  /** If this option maps to an executable IR, the IR to commit. */
  irDraft?: ConstraintIR;
};

/**
 * A clarification question the UI shows to the user. The UI must show
 * ONLY `questionVi` and each option's `labelVi` / `previewVi`. The
 * `reasonCode` lets the UI display a small status badge (e.g. "mơ hồ
 * hướng") and the `allowFreeText` toggles a free-text input as a
 * fallback for users who don't see a fitting option.
 */
export type ClarificationQuestion = {
  id: string;
  questionVi: string;
  options: ClarificationOption[];
  allowFreeText: boolean;
  reasonCode:
    | 'ambiguous_entity'
    | 'ambiguous_direction'
    | 'missing_entity'
    | 'missing_period'
    | 'missing_scope'
    | 'unsupported_semantics'
    | 'contradictory_markers'
    | 'confirm_interpretation';
};

/**
 * WHY code tags that the UI may use to display a small label
 * (e.g. "Mơ hồ về hướng" or "Thiếu thực thể"). These MUST be in
 * Vietnamese.
 */
export const REASON_CODE_LABEL_VI: Record<ClarificationQuestion['reasonCode'], string> = {
  ambiguous_entity: 'Mơ hồ về thực thể',
  ambiguous_direction: 'Mơ hồ về hướng',
  missing_entity: 'Thiếu thực thể',
  missing_period: 'Thiếu tiết',
  missing_scope: 'Thiếu phạm vi',
  unsupported_semantics: 'Chưa hỗ trợ',
  contradictory_markers: 'Mâu thuẫn trong câu',
  confirm_interpretation: 'Xác nhận cách hiểu',
};

/**
 * DTO for rendering an interpretation confirmation card in the UI.
 * Shows the user how the system understood their constraint,
 * broken down into Scope / IF / THEN-atoms with notes.
 */
export type InterpretationCardDTO = {
  /** Scope in Vietnamese, e.g. "Vào thứ 6" */
  scopeVi?: string;
  /** IF clause in Vietnamese, e.g. "nếu Thúy và Yên đều có dạy" */
  ifAtomVi?: string;
  /** THEN atoms in Vietnamese, e.g. ["không được dạy trùng cùng một tiết"] */
  thenAtomsVi: string[];
  /** Notes/audit trail, e.g. ["'tiết 2' được hiểu là ví dụ minh hoạ"] */
  notesVi: string[];
  /** Atom IDs that the user can edit individually */
  editableAtomIds: string[];
};

// ─── Helpers used by the pipeline to build DTOs deterministically ─────

/**
 * Convert a built-in kind+params draft to a fully-formed ClarificationOption.
 * `labelVi` is rendered from the spec via the humanizer so the UI never
 * shows `kind` directly. `specDraft` carries the raw spec for commit.
 */
export function clarificationOptionFromBuiltIn(
  id: string,
  kind: ConstraintKind,
  params: Record<string, unknown>,
  labelVi: string,
  previewVi?: string
): ClarificationOption {
  return {
    id,
    labelVi,
    previewVi,
    specDraft: {
      id: `clarify_${id}_${Date.now()}`,
      original: labelVi,
      severity: 'hard',
      kind,
      params,
    },
  };
}
