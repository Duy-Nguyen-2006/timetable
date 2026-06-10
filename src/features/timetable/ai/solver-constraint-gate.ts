import type { AgentInputPayload } from './types';
import type { ConstraintSpec } from './constraint-spec';
import type {
  ConfirmedConstraint,
  ParsedConstraintDraft,
  RawConstraintInput,
} from './constraint-review-types';
import { humanizeDraft } from './constraint-humanizer';
import { assertSolvableConstraintState, flattenConfirmedSpecs } from './constraint-preflight';
import { normalizeConstraintSpecsForSolving } from './constraint-spec-normalizer';

export type ConfirmedSolveRequest = {
  input: Omit<AgentInputPayload, 'constraints'>;
  confirmedConstraints: ConfirmedConstraint[];
};

export type SolveGateResult =
  | {
      ok: true;
      agentInput: AgentInputPayload;
      preTranslatedSpecs: ConstraintSpec[];
      warnings: string[];
    }
  | {
      ok: false;
      status: number;
      error: string;
      messages?: string[];
      warnings?: string[];
    };

export function buildAgentInputWithConfirmedSpecs(
  base: Omit<AgentInputPayload, 'constraints'>,
  confirmed: ConfirmedConstraint[]
): { agentInput: AgentInputPayload; preTranslatedSpecs: ConstraintSpec[]; issues: string[] } {
  const flattenedSpecs = flattenConfirmedSpecs(confirmed);
  const constraints = confirmed.map((c) => {
    const raw = c.specs[0]?.original ?? c.summary;
    const severity = c.specs[0]?.severity;
    const type = severity === 'soft' ? ('preferred' as const) : ('required' as const);
    const weight = c.specs.find((s) => s.weight != null)?.weight;
    return {
      type,
      text: raw,
      ...(type === 'preferred' && weight != null ? { weight } : {}),
    };
  });

  const candidateInput: AgentInputPayload = { ...base, constraints };
  const normalized = normalizeConstraintSpecsForSolving(candidateInput, flattenedSpecs);

  return {
    agentInput: candidateInput,
    preTranslatedSpecs: normalized.specs,
    issues: normalized.issues.map((issue) => issue.message),
  };
}

export function validateConfirmedSolveRequest(
  rawConstraints: RawConstraintInput[],
  drafts: ParsedConstraintDraft[],
  request: ConfirmedSolveRequest
): SolveGateResult {
  const preflight = assertSolvableConstraintState(
    rawConstraints,
    drafts,
    request.confirmedConstraints
  );
  if (!preflight.canSolve) {
    return {
      ok: false,
      status: 400,
      error: 'Không thể chạy solver: còn ràng buộc bắt buộc chưa xác nhận hoặc không hỗ trợ.',
      messages: preflight.messages,
      warnings: preflight.warnings,
    };
  }

  const { agentInput, preTranslatedSpecs, issues } = buildAgentInputWithConfirmedSpecs(
    request.input,
    request.confirmedConstraints
  );

  if (issues.length > 0) {
    return {
      ok: false,
      status: 400,
      error: 'Không thể chạy solver: ràng buộc đã xác nhận có dữ liệu thiếu hoặc sai định dạng.',
      messages: issues,
      warnings: preflight.warnings,
    };
  }

  if (!preTranslatedSpecs.length && rawConstraints.some((r) => r.type === 'required')) {
    return {
      ok: false,
      status: 400,
      error: 'Thiếu ConstraintSpec đã xác nhận cho ràng buộc bắt buộc.',
      warnings: preflight.warnings,
    };
  }

  return { ok: true, agentInput, preTranslatedSpecs, warnings: preflight.warnings };
}

/** Legacy solve: user đã confirm dialog → gắn specs từ drafts (chưa có UI review đầy đủ). */
export function confirmedFromDraftsAfterUserAccept(drafts: ParsedConstraintDraft[]): ConfirmedConstraint[] {
  const now = new Date().toISOString();
  return drafts
    .filter((d) => d.proposedSpecs.length > 0 && d.status !== 'ignored')
    .map((d) => ({
      id: `conf_${d.rawConstraintId}`,
      rawConstraintId: d.rawConstraintId,
      specs: d.proposedSpecs,
      confirmedBy: 'user' as const,
      confirmedAt: now,
      summary: humanizeDraft(d),
      displayText: d.displayText || humanizeDraft(d),
      semanticRepresentation: d.semanticRepresentation,
    }));
}

export function constraintItemsToRaw(
  items: Array<{ id: string; type: 'required' | 'preferred'; text: string; weight?: number }>
): RawConstraintInput[] {
  const now = new Date().toISOString();
  return items.map((item) => ({
    id: item.id,
    text: item.text,
    type: item.type,
    weight: item.weight,
    createdAt: now,
  }));
}
