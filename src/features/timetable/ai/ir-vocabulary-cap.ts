/**
 * IR Vocabulary Cap (Section 12 — risk mitigation)
 *
 * Custom IR can grow unbounded if the LLM emits new shapes. We constrain
 * the IR vocabulary to a known set:
 *   - Boolean ops: and, or, not, implies, iff
 *   - Quantifiers: exists, forall
 *   - Aggregates: atLeast, atMost, exactly
 *   - Predicates: compare, consecutive
 *   - Atoms: teaches, teachesOnDay, classSubjectAt, classBusy, assigned, const
 *   - Domains: days, periods, classes, teachers, subjects, list, range, in/where
 *
 * If the LLM produces a shape outside this vocabulary, we either:
 *   - Reject (hard fail) and ask for clarification
 *   - Convert to a known equivalent (e.g., iff → and(or(a,b),or(not a, not b)))
 *
 * The cap keeps the interpreter testable and the long tail safe.
 */

import type { ConstraintIR, BoolExpr, Domain } from './constraint-ir';

export const IR_VOCABULARY = {
  boolOps: ['and', 'or', 'not', 'implies', 'iff'] as const,
  quantifiers: ['exists', 'forall'] as const,
  aggregates: ['atLeast', 'atMost', 'exactly'] as const,
  comparators: ['compare', 'consecutive'] as const,
  atomOps: ['teaches', 'teachesOnDay', 'classSubjectAt', 'classBusy', 'assigned', 'const'] as const,
  domainKinds: ['days', 'periods', 'classes', 'teachers', 'subjects', 'list', 'range', 'in'] as const,
} as const;

export type IRValidationResult = {
  ok: boolean;
  unknownOps: string[];
  unknownDomainKinds: string[];
  /** Suggested fix: convert to known equivalent. */
  rewrite?: ConstraintIR;
};

function exprOps(expr: BoolExpr | undefined | null, out: Set<string>): void {
  if (!expr || typeof expr !== 'object') return;
  for (const key of Object.keys(expr)) {
    if (key === 'and' || key === 'or') {
      const arr = (expr as Record<string, unknown>)[key] as BoolExpr[];
      for (const e of arr) exprOps(e, out);
    } else if (key === 'not') {
      exprOps((expr as Record<string, unknown>).not as BoolExpr, out);
    } else if (key === 'implies' || key === 'iff') {
      const tuple = (expr as Record<string, unknown>)[key] as [BoolExpr, BoolExpr];
      exprOps(tuple[0], out);
      exprOps(tuple[1], out);
      out.add(key);
    } else if (key === 'exists' || key === 'forall') {
      const q = (expr as Record<string, unknown>)[key] as { body: BoolExpr };
      exprOps(q.body, out);
      out.add(key);
    } else if (key === 'atLeast' || key === 'atMost' || key === 'exactly') {
      const q = (expr as Record<string, unknown>)[key] as { body: BoolExpr };
      exprOps(q.body, out);
      out.add(key);
    } else if (key === 'compare' || key === 'consecutive') {
      const q = (expr as Record<string, unknown>)[key] as { body?: BoolExpr };
      if (q.body) exprOps(q.body, out);
      out.add(key);
    } else {
      // atom ops
      out.add(key);
    }
  }
}

function domainKindsUsed(domain: Domain | undefined, out: Set<string>): void {
  if (domain === undefined || domain === null) return;
  if (typeof domain === 'string') {
    out.add(domain);
    return;
  }
  if ('list' in domain) {
    out.add('list');
    return;
  }
  if ('range' in domain) {
    out.add('range');
    return;
  }
  if ('in' in domain) {
    out.add('in');
    domainKindsUsed(domain.in, out);
  }
}

/** Check an IR for vocabulary compliance. */
export function validateIRVocabulary(ir: ConstraintIR): IRValidationResult {
  const unknownOps = new Set<string>();
  const unknownDomains = new Set<string>();
  exprOps(ir.expr, unknownOps);
  // Check quantifier domains
  function scanDomains(e: BoolExpr): void {
    if (!e || typeof e !== 'object') return;
    if ('exists' in e || 'forall' in e || 'atLeast' in e || 'atMost' in e || 'exactly' in e) {
      const q = (e as Record<string, unknown>)[Object.keys(e)[0]] as { in: Domain; body?: BoolExpr };
      if (q.in) domainKindsUsed(q.in, unknownDomains);
      if (q.body) scanDomains(q.body);
    }
    if ('and' in e || 'or' in e) {
      for (const sub of (e as Record<string, unknown>)[Object.keys(e)[0]] as BoolExpr[]) scanDomains(sub);
    }
    if ('not' in e) {
      scanDomains((e as Record<string, unknown>).not as BoolExpr);
    }
    if ('implies' in e || 'iff' in e) {
      const tuple = (e as Record<string, unknown>)[Object.keys(e)[0]] as [BoolExpr, BoolExpr];
      scanDomains(tuple[0]);
      scanDomains(tuple[1]);
    }
    if ('consecutive' in e) {
      const q = (e as Record<string, unknown>).consecutive as { in: Domain };
      domainKindsUsed(q.in, unknownDomains);
    }
  }
  scanDomains(ir.expr);

  const knownOps = new Set<string>([
    ...IR_VOCABULARY.boolOps,
    ...IR_VOCABULARY.quantifiers,
    ...IR_VOCABULARY.aggregates,
    ...IR_VOCABULARY.comparators,
    ...IR_VOCABULARY.atomOps,
  ]);
  const knownDomains = new Set<string>(IR_VOCABULARY.domainKinds);

  const unknownOpsList = [...unknownOps].filter((op) => !knownOps.has(op));
  const unknownDomainList = [...unknownDomains].filter((d) => !knownDomains.has(d));
  return {
    ok: unknownOpsList.length === 0 && unknownDomainList.length === 0,
    unknownOps: unknownOpsList,
    unknownDomainKinds: unknownDomainList,
  };
}

/** Reject an IR with a clear error message. Use this for "fail-loud" paths. */
export function rejectUnknownIR(ir: ConstraintIR): string {
  const v = validateIRVocabulary(ir);
  if (v.ok) return '';
  const parts: string[] = [];
  if (v.unknownOps.length > 0) {
    parts.push(`op chưa hỗ trợ: ${v.unknownOps.join(', ')}`);
  }
  if (v.unknownDomainKinds.length > 0) {
    parts.push(`domain chưa hỗ trợ: ${v.unknownDomainKinds.join(', ')}`);
  }
  return `IR không hợp lệ (${parts.join('; ')}). Hãy diễn đạt lại bằng built-in.`;
}
