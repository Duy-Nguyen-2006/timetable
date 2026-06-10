import type { AgentInputPayload } from './types';
import type { ConstraintSpec } from './constraint-spec';
import { SOLVER_ENCODABLE_KINDS } from './constraint-registry';
import type { ConstraintParseIssue } from './constraint-review-types';
import { validateConstraintSpecs } from './constraint-draft-validator';
import { normalizeConstraintSpecsForSolving } from './constraint-spec-normalizer';

export type ReparseSpecInput = { kind: string; params: Record<string, unknown> };

export type ValidateReparseResult =
  | { ok: true; specs: ConstraintSpec[] }
  | { ok: false; issues: ConstraintParseIssue[]; status: 'unsupported' | 'needs_review' | 'ambiguous' };

function materializeSpecs(
  raw: { id: string; text: string; type: 'required' | 'preferred'; weight?: number },
  inputs: ReparseSpecInput[]
): ConstraintSpec[] {
  const severity = raw.type === 'required' ? ('hard' as const) : ('soft' as const);
  return inputs.map((item, index) => ({
    id: inputs.length === 1 ? `reparse_${raw.id}` : `reparse_${raw.id}_${index + 1}`,
    original: raw.text,
    severity,
    kind: item.kind as ConstraintSpec['kind'],
    params: item.params ?? {},
    ...(raw.type === 'preferred' && raw.weight != null ? { weight: raw.weight } : {}),
  }));
}

/** Reject hard custom_dsl without pythonPredicate — never confirmable from AI reparse. */
function rejectInvalidReparseKinds(specs: ConstraintSpec[]): ConstraintParseIssue[] {
  const issues: ConstraintParseIssue[] = [];
  for (const spec of specs) {
    if (spec.kind === 'custom_dsl' && spec.severity === 'hard') {
      const predicate = spec.pythonPredicate ?? spec.params?.pythonPredicate;
      const expr = spec.params?.expr;
      const hasExpr = expr !== undefined && expr !== null && expr !== '';
      if ((typeof predicate !== 'string' || !predicate.trim()) && !hasExpr) {
        issues.push({
          code: 'hard_unchecked',
          message:
            'AI reparse trả về ràng buộc đặc biệt (custom_dsl) không mã hoá được — cần built-in hoặc IR (expr).',
        });
      }
    }
  }
  return issues;
}

/**
 * Validate AI reparse built-in specs after semantic normalization.
 * Does not call rule/regex fallback.
 */
export function validateReparseCandidateSpecs(
  input: AgentInputPayload,
  raw: { id: string; text: string; type: 'required' | 'preferred'; weight?: number },
  specInputs: ReparseSpecInput[] | undefined
): ValidateReparseResult {
  if (!specInputs?.length) {
    return {
      ok: false,
      issues: [{ code: 'low_confidence', message: 'AI không trả về ràng buộc có cấu trúc (specs).' }],
      status: 'needs_review',
    };
  }

  const materialized = materializeSpecs(raw, specInputs);
  const normalized = normalizeConstraintSpecsForSolving(input, materialized);
  if (normalized.issues.length > 0) {
    return {
      ok: false,
      issues: normalized.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
      })),
      status: 'needs_review',
    };
  }
  const specs = normalized.specs;
  const kindIssues = rejectInvalidReparseKinds(specs);
  if (kindIssues.length > 0) {
    return { ok: false, issues: kindIssues, status: 'unsupported' };
  }

  const validation = validateConstraintSpecs(input, specs, {
    rawText: raw.text,
    source: 'ai_reparse',
    confidence: 'high',
  });

  const mergedIssues = [...validation.issues, ...kindIssues];
  if (validation.status === 'unsupported' || validation.status === 'ambiguous') {
    return { ok: false, issues: mergedIssues, status: validation.status };
  }
  if (validation.status === 'needs_review' || validation.status === 'unparsed') {
    return { ok: false, issues: mergedIssues, status: 'needs_review' };
  }

  const hardBlocked = specs.some(
    (s) =>
      s.severity === 'hard' &&
      !SOLVER_ENCODABLE_KINDS.has(s.kind) &&
      !(s.kind === 'custom_dsl' && !!s.params.expr)
  );
  if (hardBlocked) {
    return {
      ok: false,
      issues: [
        ...mergedIssues,
        {
          code: 'hard_unchecked',
          message: 'Ràng buộc bắt buộc từ AI reparse chưa mã hoá được vào solver.',
        },
      ],
      status: 'unsupported',
    };
  }

  return { ok: true, specs };
}
