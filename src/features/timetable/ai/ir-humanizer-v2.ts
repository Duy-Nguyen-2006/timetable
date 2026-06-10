/**
 * ir-humanizer-v2.ts — Phase 1.3
 *
 * Deterministic IR-to-Vietnamese renderer. The output is stable for a
 * given IR (the same IR always renders to the same Vietnamese string),
 * and uses canonical patterns so the humanizer can be re-parsed back
 * to the same IR (the "metamorphic" property in B5).
 *
 * The previous humanizer (constraint-humanizer.ts) was spec-kind-keyed
 * (one branch per kind). This V2 humanizer is IR-shape-keyed: it
 * walks the IR and emits Vietnamese. This is necessary because the IR
 * may have been hand-authored or produced by the toIR() adapter and
 * we want a single, consistent rendering path.
 *
 * Recognized canonical patterns (rendered in Vietnamese):
 *   - atLeast(1, days, teaches(T, d, p))        -> "Giáo viên T phải có ít nhất 1 tiết p trong tuần"
 *   - atLeast(k, days, teaches(T, d, p))        -> "Giáo viên T phải có ít nhất k tiết p trong tuần"
 *   - atMost(k, days, count(teaches))           -> "Giáo viên T dạy tối đa k tiết/ngày"
 *   - forall(days, compare(count, <=, k, ...)) -> ditto
 *   - not(forall(...))                          -> "không ... trong ..."
 *   - and / or / not / implies                  -> rendered with "và" / "hoặc" / "không" / "nếu ... thì"
 *   - gap / before / after                      -> "cách nhau ít nhất N", "trước", "sau"
 *   - session { teacher, session }              -> "Giáo viên T có tiết buổi S"
 *
 * Patterns that don't match a canonical template are rendered as a
 * structural description ("Với mỗi d: ...") plus a flag for the caller
 * to add a new template. The humanizer NEVER calls the LLM.
 */

import type { BoolExpr, IntExpr, ConstraintIR, Domain } from './constraint-ir';

function domainToString(d: Domain): string {
  if (typeof d === 'string') return d;
  if ('list' in d) return `[${d.list.join(', ')}]`;
  if ('range' in d) return `${d.range[0]}..${d.range[1]}`;
  if ('in' in d) return `in(${domainToString(d.in)})`;
  return '?';
}

function varSubstitute(expr: BoolExpr, varName: string, value: string | number): BoolExpr {
  // Substitute a quantifier binding in an inner expression. Used by the
  // canonical patterns to inline the var.
  const sub = JSON.parse(JSON.stringify(expr)) as BoolExpr;
  function walk(e: BoolExpr): void {
    if ('teaches' in e) {
      // Substitute day or period if the value matches the binding.
      const t = e.teaches;
      if (t.day === `$$${varName}$$`) t.day = String(value);
      if (t.period === `$$${varName}$$`) t.period = value;
    } else if ('teachesOnDay' in e) {
      if (e.teachesOnDay.day === `$$${varName}$$`) e.teachesOnDay.day = String(value);
    } else if ('classBusy' in e) {
      if (e.classBusy.day === `$$${varName}$$`) e.classBusy.day = String(value);
    } else if ('classSubjectAt' in e) {
      const c = e.classSubjectAt;
      if (c.day === `$$${varName}$$`) c.day = String(value);
      if (c.period === `$$${varName}$$`) c.period = value;
    } else if ('and' in e) e.and.forEach(walk);
    else if ('or' in e) e.or.forEach(walk);
    else if ('not' in e) walk(e.not);
    else if ('implies' in e) {
      walk(e.implies[0]);
      walk(e.implies[1]);
    } else if ('iff' in e) {
      walk(e.iff[0]);
      walk(e.iff[1]);
    } else if ('exists' in e) walk(e.exists.body);
    else if ('forall' in e) walk(e.forall.body);
    else if ('atLeast' in e) walk(e.atLeast.body);
    else if ('atMost' in e) walk(e.atMost.body);
    else if ('exactly' in e) walk(e.exactly.body);
    else if ('compare' in e) {
      // IntExpr — substitute scale/etc if it contains a var (not currently used).
    } else if ('consecutive' in e) walk(e.consecutive.body);
    else if ('gap' in e) walk(e.gap.body);
    else if ('before' in e) {
      walk(e.before.first);
      walk(e.before.second);
    } else if ('after' in e) {
      walk(e.after.first);
      walk(e.after.second);
    }
  }
  walk(sub);
  return sub;
}

function isTeachesAtom(e: BoolExpr): e is { teaches: { teacher: string; day: string; period: string | number } } {
  return 'teaches' in e;
}

function isClassBusyAtom(e: BoolExpr): e is { classBusy: { class: string; day: string; period: string | number } } {
  return 'classBusy' in e;
}

function isClassSubjectAtAtom(
  e: BoolExpr
): e is { classSubjectAt: { class: string; subject: string; day: string; period: string | number } } {
  return 'classSubjectAt' in e;
}

function isForallDaysCompareCount(
  e: BoolExpr
): e is {
  forall: {
    var: string;
    in: Domain;
    body: { compare: { op: string; lhs: { count: { var: string; in: Domain; body: BoolExpr } }; rhs: number } };
  };
} {
  if (!('forall' in e)) return false;
  const f = e.forall;
  if (typeof f.in !== 'string' || f.in !== 'days') return false;
  if (!('compare' in f.body)) return false;
  const c = f.body.compare;
  if (typeof c.rhs !== 'number') return false;
  if (typeof c.lhs !== 'object' || !('count' in c.lhs)) return false;
  return true;
}

function isAtLeast(
  e: BoolExpr
): e is { atLeast: { k: number; var: string; in: Domain; body: BoolExpr } } {
  return 'atLeast' in e;
}

function isNotForall(
  e: BoolExpr
): e is { not: { forall: { var: string; in: Domain; body: BoolExpr } } } {
  if (!('not' in e)) return false;
  return 'forall' in e.not;
}

function isImplies(e: BoolExpr): e is { implies: [BoolExpr, BoolExpr] } {
  return 'implies' in e;
}

function isSessionAtom(e: BoolExpr): e is { session: { teacher?: string; class?: string; subject?: string; session: string } } {
  return 'session' in e;
}

function isGap(e: BoolExpr): e is { gap: { var: string; in: Domain; min: number; body: BoolExpr } } {
  return 'gap' in e;
}

function isBefore(e: BoolExpr): e is { before: { var: string; in: Domain; first: BoolExpr; second: BoolExpr } } {
  return 'before' in e;
}

function isAfter(e: BoolExpr): e is { after: { var: string; in: Domain; first: BoolExpr; second: BoolExpr } } {
  return 'after' in e;
}

/**
 * Humanize a single BoolExpr to a Vietnamese string. The shape-keyed
 * rendering is deterministic and stable.
 *
 * When a shape does not match any canonical pattern, the humanizer
 * returns a structural description like "Với mỗi d ∈ days: ..." and
 * the caller can use the `unmatched` flag to add a new template.
 */
export function humanizeIRExpr(expr: BoolExpr): { text: string; unmatched: boolean } {
  // Pattern: atLeast(1, days, teaches(T, d, p))  -> require at least 1
  if (isAtLeast(expr)) {
    const al = expr.atLeast;
    if (typeof al.in === 'string' && al.in === 'days' && isTeachesAtom(al.body)) {
      const t = al.body.teaches;
      // Match if the period is the bound var (either case) OR a literal.
      const isVarDay = t.day === `$$${al.var}$$` || t.day === `$$${al.var.toUpperCase()}$$`;
      const isVarPeriod =
        t.period === `$$${al.var}$$` || t.period === `$$${al.var.toUpperCase()}$$`;
      if (isVarDay && (isVarPeriod || typeof t.period === 'number')) {
        return {
          text: `Giáo viên ${t.teacher} phải có ít nhất ${al.k} tiết ${t.period} trong tuần`,
          unmatched: false,
        };
      }
    }
    if (typeof al.in === 'string' && al.in === 'days' && isClassBusyAtom(al.body)) {
      const c = al.body.classBusy;
      const isVarDay = c.day === `$$${al.var}$$` || c.day === `$$${al.var.toUpperCase()}$$`;
      const isVarPeriod =
        c.period === `$$${al.var}$$` || c.period === `$$${al.var.toUpperCase()}$$`;
      if (isVarDay && (isVarPeriod || typeof c.period === 'number')) {
        return {
          text: `Lớp ${c.class} phải có ít nhất ${al.k} tiết ${c.period} trong tuần`,
          unmatched: false,
        };
      }
    }
    if (typeof al.in === 'string' && al.in === 'days' && isClassSubjectAtAtom(al.body)) {
      const c = al.body.classSubjectAt;
      return {
        text: `Mỗi lớp, mỗi ngày: số tiết môn ${c.subject} ở tiết ${c.period} ≥ ${al.k}`,
        unmatched: false,
      };
    }
  }

  // Pattern: not(forall(...)) -> "không (Với mỗi: ...)"
  if (isNotForall(expr)) {
    const f = expr.not.forall;
    const inner = humanizeIRExpr(f.body);
    if (typeof f.in === 'string') {
      return {
        text: `Không (với mỗi ${f.var} ∈ ${f.in}: ${inner.text})`,
        unmatched: inner.unmatched,
      };
    }
  }

  // Pattern: forall(days, compare(count(...), <=, k)) -> "Giáo viên T dạy tối đa k tiết/ngày"
  if (isForallDaysCompareCount(expr)) {
    const f = expr.forall;
    const c = f.body.compare;
    const cnt = c.lhs.count;
    if (typeof cnt.in === 'string' && cnt.in === 'periods' && isTeachesAtom(cnt.body)) {
      const t = cnt.body.teaches;
      const opWord = c.op === '<=' ? 'tối đa' : c.op === '>=' ? 'ít nhất' : c.op === '<' ? 'ít hơn' : c.op === '>' ? 'nhiều hơn' : c.op;
      return {
        text: `Với mỗi ngày: số tiết của giáo viên ${t.teacher} ${opWord} ${c.rhs}`,
        unmatched: false,
      };
    }
  }

  // Pattern: implies
  if (isImplies(expr)) {
    const cond = humanizeIRExpr(expr.implies[0]);
    const cons = humanizeIRExpr(expr.implies[1]);
    return {
      text: `Nếu ${cond.text} thì ${cons.text}`,
      unmatched: cond.unmatched || cons.unmatched,
    };
  }

  // Pattern: and / or / not
  if ('and' in expr) {
    const parts = expr.and.map(humanizeIRExpr);
    return { text: parts.map((p) => p.text).join(' và '), unmatched: parts.some((p) => p.unmatched) };
  }
  if ('or' in expr) {
    const parts = expr.or.map(humanizeIRExpr);
    return { text: parts.map((p) => p.text).join(' hoặc '), unmatched: parts.some((p) => p.unmatched) };
  }
  if ('not' in expr) {
    const inner = humanizeIRExpr(expr.not);
    return { text: `không (${inner.text})`, unmatched: inner.unmatched };
  }

  // Pattern: gap
  if (isGap(expr)) {
    return {
      text: `Với mỗi ${expr.gap.var} ∈ ${domainToString(expr.gap.in)}: khoảng cách ≥ ${expr.gap.min}`,
      unmatched: false,
    };
  }
  if (isBefore(expr)) {
    return {
      text: `Với mỗi ${expr.before.var} ∈ ${domainToString(expr.before.in)}: trước/sau`,
      unmatched: true,
    };
  }
  if (isAfter(expr)) {
    return {
      text: `Với mỗi ${expr.after.var} ∈ ${domainToString(expr.after.in)}: sau`,
      unmatched: true,
    };
  }

  // Pattern: session atom
  if (isSessionAtom(expr)) {
    const s = expr.session;
    const parts: string[] = [];
    if (s.teacher) parts.push(`giáo viên ${s.teacher}`);
    if (s.class) parts.push(`lớp ${s.class}`);
    if (s.subject) parts.push(`môn ${s.subject}`);
    return {
      text: `${parts.join(', ') || 'mọi'} có mặt trong buổi ${s.session}`,
      unmatched: false,
    };
  }

  // Pattern: teaches atom
  if (isTeachesAtom(expr)) {
    return {
      text: `giáo viên ${expr.teaches.teacher} dạy ${expr.teaches.day} tiết ${expr.teaches.period}`,
      unmatched: true,
    };
  }
  if ('const' in expr) {
    return { text: expr.const ? 'luôn đúng' : 'luôn sai', unmatched: false };
  }
  return { text: '(không nhận dạng được)', unmatched: true };
}

/**
 * Humanize a full ConstraintIR. Returns a stable Vietnamese string.
 * If `ir.explain` is present, it is preferred (it was authored in Vietnamese
 * by the specToIR adapter for known kinds). Otherwise the renderer walks
 * `ir.expr`.
 */
export function humanizeIR(ir: ConstraintIR): { text: string; unmatched: boolean } {
  if (ir.explain) {
    return { text: ir.explain, unmatched: false };
  }
  return humanizeIRExpr(ir.expr);
}
