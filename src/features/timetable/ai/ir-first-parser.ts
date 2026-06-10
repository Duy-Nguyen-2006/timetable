/**
 * ir-first-parser.ts — Phase 2.1
 *
 * Tier-1 deterministic pattern-based parser that outputs the IR DIRECTLY
 * (not a built-in kind). This is the new fast-path that the IR-first
 * pipeline uses.
 *
 * Architecture (B2):
 *   [1] Disambiguation table -> direction (require / only / block / soft_prefer)
 *   [2] Resolver hints (entity + number) from Stage 1
 *   [3] Pattern matching for the common require/only/block families
 *   [4] Output: ConstraintIR (or `null` to indicate "I don't know, escalate
 *       to Tier-2 LLM")
 *
 * This module is SHADOW-MODE only in Phase 2. The legacy built-in
 * parser (built-in-suggestion.ts + analyze-constraint-service.ts) is
 * still the AUTHORITATIVE parser. The new parser runs in parallel and
 * logs divergence via shadow-mode.ts. Flipping the parser to be
 * authoritative is Phase 4 work, gated on:
 *   - silentFlipRate === 0 on the shadow log
 *   - clarification rate < 25% on golden V2
 *   - all frozen regression cases still pass
 *
 * Why the parser is a function and not a stateful class:
 *   - Deterministic / pure / no LLM
 *   - Easy to test
 *   - Easy to wrap in shadow mode
 */

import type { BoolExpr, ConstraintIR } from './constraint-ir';
import { validateIR } from './constraint-ir';
import { normalizeConstraintText } from './translator-text';
import { findDisambiguationMatch } from './disambiguation-table';
import { evaluateNegativeGuard } from './negative-guard';
import type { ConstraintSpec } from './constraint-spec';
import type { ConstraintResolverHints } from './constraint-retriever';
import { analyzeSemanticDirection } from './semantic-direction';

export type IRFirstParseResult =
  | { kind: 'ir'; ir: ConstraintIR; spec: ConstraintSpec }
  | { kind: 'needs_clarification'; reason: string; candidates?: Array<{ kind: string; params: Record<string, unknown> }> }
  | { kind: 'escalate_to_tier2'; reason: string };

/**
 * Build a ConstraintSpec from a direction + extracted params. The spec
 * is the LEGACY form (so we can compare divergence against the legacy
 * parser). The IR is the new canonical form.
 */
function specFromIR(ir: ConstraintIR, kind: string, params: Record<string, unknown>): ConstraintSpec {
  return {
    id: ir.id,
    original: ir.original,
    severity: ir.severity as 'hard' | 'soft' | 'info',
    kind: kind as ConstraintSpec['kind'],
    params,
    ...(ir.weight !== undefined ? { weight: ir.weight } : {}),
  };
}

/**
 * Extract the period number from a sentence. Returns the first positive
 * integer that follows "tiết". Returns null if no period is found.
 */
function extractPeriod(rawText: string, normalized: string): number | null {
  // Look for "tiết N" or "tiết thứ N" patterns.
  const m = normalized.match(/tiet\s+(\d+)/u);
  if (m) return Number(m[1]);
  // Also try "tiết đầu" = 1.
  if (/tiet\s+dau|tiet\s+1/u.test(normalized)) return 1;
  // Look for "tiết cuối" — caller will need to resolve to actual count later.
  return null;
}

function extractPeriods(normalized: string): number[] {
  const periods: number[] = [];
  const periodMatches = normalized.matchAll(/tiet\s+(\d+)/gu);
  for (const m of periodMatches) {
    periods.push(Number(m[1]));
  }
  return periods;
}

function buildIR(args: {
  id: string;
  original: string;
  severity: 'hard' | 'soft' | 'info';
  weight?: number;
  expr: BoolExpr;
  explain?: string;
}): ConstraintIR {
  const result: ConstraintIR = {
    id: args.id,
    severity: args.severity,
    original: args.original,
    expr: args.expr,
  };
  if (args.weight !== undefined) result.weight = args.weight;
  if (args.explain !== undefined) result.explain = args.explain;
  return result;
}

/**
 * Try to parse the sentence as a require-family constraint
 * (phải có | cần có | ít nhất + period/day) for the given teacher.
 *
 * Returns the IR or null if the sentence doesn't match.
 */
function tryParseRequireTeacher(
  rawText: string,
  normalized: string,
  teacher: string,
  hints: ConstraintResolverHints
): ConstraintIR | null {
  // Use semantic direction analyzer instead of disambiguation table
  const semanticAnalysis = analyzeSemanticDirection(rawText);
  if (semanticAnalysis.direction !== 'require') return null;

  // Must be a teacher-scope sentence.
  if (hints.inferredScope && hints.inferredScope !== 'teacher') return null;

  const period = extractPeriod(rawText, normalized);
  if (period === null) return null;

  const minCount = hints.extractedNumber ?? 1;

  const ir = buildIR({
    id: 'ir_first_teacher_required_period',
    original: rawText,
    severity: 'hard',
    expr: {
      atLeast: {
        k: minCount,
        var: 'd',
        in: 'days',
        body: { teaches: { teacher, day: '$$D$$', period } },
      },
    },
    explain: `Giáo viên ${teacher} phải có ít nhất ${minCount} tiết ${period} trong tuần`,
  });
  return ir;
}

function tryParseRequireClass(
  rawText: string,
  normalized: string,
  klass: string,
  hints: ConstraintResolverHints
): ConstraintIR | null {
  const semanticAnalysis = analyzeSemanticDirection(rawText);
  if (semanticAnalysis.direction !== 'require') return null;
  if (hints.inferredScope && hints.inferredScope !== 'class') return null;
  const period = extractPeriod(rawText, normalized);
  if (period === null) return null;
  const minCount = hints.extractedNumber ?? 1;
  return buildIR({
    id: 'ir_first_class_required_period',
    original: rawText,
    severity: 'hard',
    expr: {
      atLeast: {
        k: minCount,
        var: 'd',
        in: 'days',
        body: { classBusy: { class: klass, day: '$$D$$', period } },
      },
    },
    explain: `Lớp ${klass} phải có ít nhất ${minCount} tiết ${period} trong tuần`,
  });
}

function tryParseRequireSubject(
  rawText: string,
  normalized: string,
  subject: string,
  hints: ConstraintResolverHints
): ConstraintIR | null {
  const semanticAnalysis = analyzeSemanticDirection(rawText);
  if (semanticAnalysis.direction !== 'require') return null;
  if (hints.inferredScope && hints.inferredScope !== 'subject') return null;
  const period = extractPeriod(rawText, normalized);
  if (period === null) return null;
  const minCount = hints.extractedNumber ?? 1;
  return buildIR({
    id: 'ir_first_subject_required_period',
    original: rawText,
    severity: 'hard',
    expr: {
      atLeast: {
        k: minCount,
        var: 'd',
        in: 'days',
        body: {
          forall: {
            var: 'c',
            in: 'classes',
            body: { classSubjectAt: { class: '$$C$$', subject, day: '$$D$$', period } },
          },
        },
      },
    },
    explain: `Mỗi lớp, mỗi ngày: số tiết môn ${subject} ở tiết ${period} ≥ ${minCount}`,
  });
}

function tryParseBlockTeacher(
  rawText: string,
  normalized: string,
  teacher: string,
  hints: ConstraintResolverHints
): ConstraintIR | null {
  const semanticAnalysis = analyzeSemanticDirection(rawText);
  if (semanticAnalysis.direction !== 'block') return null;
  if (hints.inferredScope && hints.inferredScope !== 'teacher') return null;
  const period = extractPeriod(rawText, normalized);
  if (period === null) return null;
  return buildIR({
    id: 'ir_first_teacher_block_period',
    original: rawText,
    severity: 'hard',
    expr: {
      not: {
        forall: {
          var: 'd',
          in: 'days',
          body: { teaches: { teacher, day: '$$D$$', period } },
        },
      },
    },
    explain: `Giáo viên ${teacher} không dạy tiết ${period}`,
  });
}

function tryParseOnlyTeacher(
  rawText: string,
  normalized: string,
  teacher: string,
  hints: ConstraintResolverHints
): ConstraintIR | null {
  const semanticAnalysis = analyzeSemanticDirection(rawText);
  if (semanticAnalysis.direction !== 'only') return null;
  if (hints.inferredScope && hints.inferredScope !== 'teacher') return null;
  // Allowed: "chỉ dạy tiết 4" or "chỉ dạy các tiết 2, 3, 4"
  const periods = extractPeriods(normalized);
  if (periods.length === 0) return null;
  return buildIR({
    id: 'ir_first_teacher_allowed_periods',
    original: rawText,
    severity: 'hard',
    expr: {
      forall: {
        var: 'd',
        in: 'days',
        body: {
          implies: [
            { teaches: { teacher, day: '$$D$$', period: '$$P$$' } },
            { const: false }, // sentinel; allowed_periods is a positive-set kind
          ] as [BoolExpr, BoolExpr],
        },
      },
    },
    explain: `Giáo viên ${teacher} chỉ dạy các tiết ${periods.join(', ')}`,
  });
}

function tryParseMaxPerDayTeacher(
  rawText: string,
  normalized: string,
  teacher: string,
  hints: ConstraintResolverHints
): ConstraintIR | null {
  // "tối đa N tiết mỗi ngày" with extractedNumber=N
  if (!/toi\s*da|tối\s*đa/iu.test(normalized)) return null;
  if (!/ngay|mot\s*ngay/iu.test(normalized)) return null;
  if (!/tiet/iu.test(normalized)) return null;
  if (hints.inferredScope && hints.inferredScope !== 'teacher') return null;
  const n = hints.extractedNumber;
  if (n === null) return null;
  return buildIR({
    id: 'ir_first_teacher_max_per_day',
    original: rawText,
    severity: 'hard',
    expr: {
      forall: {
        var: 'd',
        in: 'days',
        body: {
          compare: {
            op: '<=',
            lhs: {
              count: {
                var: 'p',
                in: 'periods',
                body: { teaches: { teacher, day: '$$D$$', period: '$$P$$' } },
              },
            },
            rhs: n,
          },
        },
      },
    },
    explain: `Với mỗi ngày: số tiết của giáo viên ${teacher} tối đa ${n}`,
  });
}

/**
 * Run the IR-first parser on a sentence with the given resolver hints.
 *
 * This is the public entry point. It tries each pattern in order and
 * returns the first match. If no pattern matches, it returns
 * `escalate_to_tier2` so the caller knows to invoke the LLM.
 */
export function parseIRFirst(
  rawText: string,
  hints: ConstraintResolverHints
): IRFirstParseResult {
  const normalized = normalizeConstraintText(rawText);

  // Try each require/block/only family.
  const teacher = hints.resolvedTeacher;
  const klass = hints.resolvedClass;
  const subject = hints.resolvedSubject;

  if (teacher) {
    const requireIr = tryParseRequireTeacher(rawText, normalized, teacher, hints);
    if (requireIr) return { kind: 'ir', ir: requireIr, spec: specFromIR(requireIr, 'teacher_required_period', { teacher, period: extractPeriod(rawText, normalized) ?? 0, minCount: hints.extractedNumber ?? 1 }) };

    const blockIr = tryParseBlockTeacher(rawText, normalized, teacher, hints);
    if (blockIr) return { kind: 'ir', ir: blockIr, spec: specFromIR(blockIr, 'teacher_block_period', { teacher, period: extractPeriod(rawText, normalized) ?? 0 }) };

    const onlyIr = tryParseOnlyTeacher(rawText, normalized, teacher, hints);
    if (onlyIr) return { kind: 'ir', ir: onlyIr, spec: specFromIR(onlyIr, 'teacher_allowed_periods', { teacher, periods: extractPeriods(normalized) }) };

    const maxIr = tryParseMaxPerDayTeacher(rawText, normalized, teacher, hints);
    if (maxIr) return { kind: 'ir', ir: maxIr, spec: specFromIR(maxIr, 'teacher_max_per_day', { teacher, maxPerDay: hints.extractedNumber ?? 0 }) };
  }

  if (klass) {
    const requireIr = tryParseRequireClass(rawText, normalized, klass, hints);
    if (requireIr) return { kind: 'ir', ir: requireIr, spec: specFromIR(requireIr, 'class_required_period', { class: klass, period: extractPeriod(rawText, normalized) ?? 0, minCount: hints.extractedNumber ?? 1 }) };
  }

  if (subject) {
    const requireIr = tryParseRequireSubject(rawText, normalized, subject, hints);
    if (requireIr) return { kind: 'ir', ir: requireIr, spec: specFromIR(requireIr, 'subject_required_period', { subject, period: extractPeriod(rawText, normalized) ?? 0, minCount: hints.extractedNumber ?? 1 }) };
  }

  // Disambiguation table detected a row but no scope/period matched;
  // surface as a clarification rather than escalate.
  const disambig = findDisambiguationMatch(rawText);
  if (disambig.length > 0 && !disambig[0].contradictory) {
    const m = disambig[0];
    return {
      kind: 'needs_clarification',
      reason: `Câu có thể hiểu theo hướng ${m.direction}; cần thêm thông tin (giáo viên/lớp/môn, tiết cụ thể).`,
      candidates: [
        { kind: m.row.positiveKinds[0], params: {} },
        { kind: m.row.negativeKinds[0], params: {} },
      ],
    };
  }

  return { kind: 'escalate_to_tier2', reason: 'No Tier-1 pattern matched; LLM semantic parser should handle this.' };
}

/**
 * Run the IR-first parser and run the negative-guard over the resulting
 * spec (if any). This is the integration point that prevents silent
 * flips. If the guard flags a flip, the result is demoted to
 * `needs_clarification` and the user is asked to re-confirm.
 */
export function parseIRFirstWithGuard(
  rawText: string,
  hints: ConstraintResolverHints
): IRFirstParseResult & { guardReason?: string } {
  const result = parseIRFirst(rawText, hints);
  if (result.kind !== 'ir') return result;
  const decision = evaluateNegativeGuard(result.spec, rawText);
  if (decision.kind === 'force_clarification') {
    return {
      kind: 'needs_clarification',
      reason: decision.hardReasons.join('; '),
      guardReason: decision.reason,
    };
  }
  if (decision.kind === 'demote_to_medium_with_confirmation') {
    // Still return the IR, but flag for the caller to require confirmation.
    return { ...result, guardReason: decision.reason };
  }
  return result;
}

/**
 * Validate that a parseIRFirst result is semantically valid. The caller
 * should run this before consuming the IR.
 */
export function validateIRFirstResult(result: IRFirstParseResult): string[] {
  if (result.kind !== 'ir') return [];
  return validateIR(result.ir).map((i) => `${i.path}: ${i.message}`);
}
