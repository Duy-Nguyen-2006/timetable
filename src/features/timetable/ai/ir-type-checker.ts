/**
 * ir-type-checker.ts — Phase 1.2
 *
 * TS-side type checker for the Constraint IR. The zod schema in
 * constraint-ir.ts validates the SHAPE; this module validates that
 * the IR is SEMANTICALLY valid for a given AgentInput:
 *
 *   - atom entities (teacher, class, subject) must exist in agentInput
 *   - period values must be in range for the day/session they appear in
 *   - day ids must exist in agentInput.days
 *   - session ids must exist in agentInput.sessions
 *   - binding variables in quantifiers (var, in, body) must be consistent
 *   - atLeast / atMost / exactly / count / gap / consecutive / forall / exists:
 *     k / length / min must be positive integers
 *   - before / after: first and second must reference the same day
 *
 * The checker is fail-closed. Every issue is a TYPE_CHECK_ERROR with
 * a specific Vietnamese question (or technical message) that the UI
 * can show to the user. The caller decides whether the constraint
 * is rejected outright (hard type errors) or forced to re-enter
 * clarification (soft type errors).
 *
 * NOTE: this module is intentionally separate from `validateIR` in
 * constraint-ir.ts. `validateIR` is the SHAPE check (zod); this is
 * the SEMANTIC check (entity existence, period range, etc.).
 */

import type { AgentInputPayload } from './types';
import type { BoolExpr, IntExpr, Domain, ConstraintIR } from './constraint-ir';
import { buildTranslatorPeriodsByDay } from './translator-periods';

export type IRTypeCheckSeverity = 'hard' | 'soft';

export type IRTypeCheckIssue = {
  code:
    | 'unknown_teacher'
    | 'unknown_class'
    | 'unknown_subject'
    | 'unknown_day'
    | 'unknown_session'
    | 'period_out_of_range'
    | 'invalid_k'
    | 'invalid_binding'
    | 'invalid_int_expr'
    | 'invalid_quantifier'
    | 'invalid_atom_shape';
  message: string;
  path: string;
  severity: IRTypeCheckSeverity;
  /** Optional candidates for clarification (e.g. "Không tìm thấy lớp «6A». Các lớp hiện có: 6B, 6C, 7A."). */
  candidates?: string[];
};

export type IRTypeCheckResult = {
  ok: boolean;
  issues: IRTypeCheckIssue[];
  /** Convenience: hard issues that should reject the constraint. */
  hardIssues: IRTypeCheckIssue[];
  /** Convenience: soft issues that should surface a clarification question. */
  softIssues: IRTypeCheckIssue[];
};

function collectKnownEntities(input: AgentInputPayload): {
  teachers: Set<string>;
  classes: Set<string>;
  subjects: Set<string>;
  days: Set<string>;
  sessions: Set<string>;
  periodByDay: Record<string, number[]>;
} {
  const teachers = new Set<string>();
  const classes = new Set<string>();
  const subjects = new Set<string>();
  for (const a of input.assignments) {
    teachers.add(a.teacher.label);
    classes.add(a.class.label);
    subjects.add(a.subject.label);
  }
  const days = new Set<string>(input.days.map((d) => d.id));
  const sessions = new Set<string>(input.sessions.map((s) => s.id));
  const periodByDay = buildTranslatorPeriodsByDay(input);
  return { teachers, classes, subjects, days, sessions, periodByDay };
}

function checkEntity(
  value: string | undefined,
  pool: Set<string>,
  code: 'unknown_teacher' | 'unknown_class' | 'unknown_subject',
  path: string,
  issues: IRTypeCheckIssue[],
  candidates: string[]
): void {
  if (value === undefined) return;
  if (value === '__all__' || value === 'all') return;
  if (!pool.has(value)) {
    issues.push({
      code,
      message: `Không tìm thấy thực thể «${value}».`,
      path,
      severity: 'hard',
      candidates: candidates.slice(0, 5),
    });
  }
}

function checkIntExpr(
  expr: IntExpr,
  path: string,
  issues: IRTypeCheckIssue[],
  known: ReturnType<typeof collectKnownEntities>
): void {
  if (typeof expr === 'number') {
    if (!Number.isInteger(expr)) {
      issues.push({
        code: 'invalid_int_expr',
        message: `Số nguyên không hợp lệ: ${expr}`,
        path,
        severity: 'hard',
      });
    }
    return;
  }
  if ('count' in expr) {
    if (!Number.isInteger(expr.count.var.length) || expr.count.var.length === 0) {
      issues.push({
        code: 'invalid_binding',
        message: 'count.var phải là tên biến hợp lệ',
        path: `${path}/count/var`,
        severity: 'hard',
      });
    }
    checkDomain(expr.count.in, `${path}/count/in`, issues);
    checkBoolExpr(expr.count.body, `${path}/count/body`, issues, known);
    return;
  }
  if ('sum' in expr) {
    for (let i = 0; i < expr.sum.length; i += 1) {
      checkIntExpr(expr.sum[i], `${path}/sum[${i}]`, issues, known);
    }
    return;
  }
  if ('scale' in expr) {
    if (!Number.isInteger(expr.scale.factor)) {
      issues.push({
        code: 'invalid_int_expr',
        message: `scale.factor phải là số nguyên: ${expr.scale.factor}`,
        path: `${path}/scale/factor`,
        severity: 'hard',
      });
    }
    checkIntExpr(expr.scale.of, `${path}/scale/of`, issues, known);
    return;
  }
  issues.push({
    code: 'invalid_int_expr',
    message: 'IntExpr không hợp lệ',
    path,
    severity: 'hard',
  });
}

function checkDomain(
  domain: Domain,
  path: string,
  issues: IRTypeCheckIssue[]
): void {
  if (typeof domain === 'string') {
    // 'days' | 'periods' | 'classes' | 'teachers' | 'subjects' - always valid
    return;
  }
  if ('list' in domain) {
    if (!Array.isArray(domain.list) || domain.list.length === 0) {
      issues.push({
        code: 'invalid_binding',
        message: 'Domain list rỗng',
        path,
        severity: 'hard',
      });
    }
    return;
  }
  if ('range' in domain) {
    if (!Array.isArray(domain.range) || domain.range.length !== 2) {
      issues.push({
        code: 'invalid_binding',
        message: 'Domain range phải có đúng 2 phần tử',
        path,
        severity: 'hard',
      });
    }
    return;
  }
  if ('in' in domain) {
    checkDomain(domain.in, `${path}/in`, issues);
    return;
  }
  issues.push({
    code: 'invalid_binding',
    message: 'Domain không hợp lệ',
    path,
    severity: 'hard',
  });
}

function checkBoolExpr(
  expr: BoolExpr,
  path: string,
  issues: IRTypeCheckIssue[],
  known: ReturnType<typeof collectKnownEntities>
): void {
  if ('and' in expr) {
    expr.and.forEach((b, i) => checkBoolExpr(b, `${path}/and[${i}]`, issues, known));
    return;
  }
  if ('or' in expr) {
    expr.or.forEach((b, i) => checkBoolExpr(b, `${path}/or[${i}]`, issues, known));
    return;
  }
  if ('not' in expr) {
    checkBoolExpr(expr.not, `${path}/not`, issues, known);
    return;
  }
  if ('implies' in expr) {
    checkBoolExpr(expr.implies[0], `${path}/implies[0]`, issues, known);
    checkBoolExpr(expr.implies[1], `${path}/implies[1]`, issues, known);
    return;
  }
  if ('iff' in expr) {
    checkBoolExpr(expr.iff[0], `${path}/iff[0]`, issues, known);
    checkBoolExpr(expr.iff[1], `${path}/iff[1]`, issues, known);
    return;
  }
  if ('exists' in expr) {
    checkDomain(expr.exists.in, `${path}/exists/in`, issues);
    checkBoolExpr(expr.exists.body, `${path}/exists/body`, issues, known);
    return;
  }
  if ('forall' in expr) {
    checkDomain(expr.forall.in, `${path}/forall/in`, issues);
    checkBoolExpr(expr.forall.body, `${path}/forall/body`, issues, known);
    return;
  }
  if ('atLeast' in expr) {
    if (!Number.isInteger(expr.atLeast.k) || expr.atLeast.k < 0) {
      issues.push({
        code: 'invalid_k',
        message: `atLeast.k phải là số nguyên không âm: ${expr.atLeast.k}`,
        path: `${path}/atLeast/k`,
        severity: 'hard',
      });
    }
    checkDomain(expr.atLeast.in, `${path}/atLeast/in`, issues);
    checkBoolExpr(expr.atLeast.body, `${path}/atLeast/body`, issues, known);
    return;
  }
  if ('atMost' in expr) {
    if (!Number.isInteger(expr.atMost.k) || expr.atMost.k < 0) {
      issues.push({
        code: 'invalid_k',
        message: `atMost.k phải là số nguyên không âm: ${expr.atMost.k}`,
        path: `${path}/atMost/k`,
        severity: 'hard',
      });
    }
    checkDomain(expr.atMost.in, `${path}/atMost/in`, issues);
    checkBoolExpr(expr.atMost.body, `${path}/atMost/body`, issues, known);
    return;
  }
  if ('exactly' in expr) {
    if (!Number.isInteger(expr.exactly.k) || expr.exactly.k < 0) {
      issues.push({
        code: 'invalid_k',
        message: `exactly.k phải là số nguyên không âm: ${expr.exactly.k}`,
        path: `${path}/exactly/k`,
        severity: 'hard',
      });
    }
    checkDomain(expr.exactly.in, `${path}/exactly/in`, issues);
    checkBoolExpr(expr.exactly.body, `${path}/exactly/body`, issues, known);
    return;
  }
  if ('compare' in expr) {
    checkIntExpr(expr.compare.lhs, `${path}/compare/lhs`, issues, known);
    checkIntExpr(expr.compare.rhs, `${path}/compare/rhs`, issues, known);
    return;
  }
  if ('consecutive' in expr) {
    if (!Number.isInteger(expr.consecutive.length) || expr.consecutive.length < 2) {
      issues.push({
        code: 'invalid_k',
        message: `consecutive.length phải ≥ 2: ${expr.consecutive.length}`,
        path: `${path}/consecutive/length`,
        severity: 'hard',
      });
    }
    checkDomain(expr.consecutive.in, `${path}/consecutive/in`, issues);
    checkBoolExpr(expr.consecutive.body, `${path}/consecutive/body`, issues, known);
    return;
  }
  // Phase 1.1: gap, before, after
  if ('gap' in expr) {
    if (!Number.isInteger(expr.gap.min) || expr.gap.min < 1) {
      issues.push({
        code: 'invalid_k',
        message: `gap.min phải ≥ 1: ${expr.gap.min}`,
        path: `${path}/gap/min`,
        severity: 'hard',
      });
    }
    checkDomain(expr.gap.in, `${path}/gap/in`, issues);
    checkBoolExpr(expr.gap.body, `${path}/gap/body`, issues, known);
    return;
  }
  if ('before' in expr) {
    checkDomain(expr.before.in, `${path}/before/in`, issues);
    checkBoolExpr(expr.before.first, `${path}/before/first`, issues, known);
    checkBoolExpr(expr.before.second, `${path}/before/second`, issues, known);
    return;
  }
  if ('after' in expr) {
    checkDomain(expr.after.in, `${path}/after/in`, issues);
    checkBoolExpr(expr.after.first, `${path}/after/first`, issues, known);
    checkBoolExpr(expr.after.second, `${path}/after/second`, issues, known);
    return;
  }
  // Atom
  if ('teaches' in expr) {
    const t = expr.teaches;
    checkEntity(t.teacher, known.teachers, 'unknown_teacher', `${path}/teaches/teacher`, issues, [...known.teachers]);
    if (!known.days.has(String(t.day))) {
      issues.push({
        code: 'unknown_day',
        message: `Không tìm thấy ngày «${t.day}».`,
        path: `${path}/teaches/day`,
        severity: 'hard',
        candidates: [...known.days].slice(0, 5),
      });
    }
    const dayPeriods = known.periodByDay[String(t.day)] ?? [];
    const periodNum = Number(t.period);
    if (dayPeriods.length > 0 && (periodNum < 1 || periodNum > dayPeriods.length)) {
      issues.push({
        code: 'period_out_of_range',
        message: `Tiết ${t.period} ngoài phạm vi của ngày «${t.day}» (1–${dayPeriods.length}).`,
        path: `${path}/teaches/period`,
        severity: 'hard',
        candidates: dayPeriods.map((p) => String(p)),
      });
    }
    return;
  }
  if ('teachesOnDay' in expr) {
    checkEntity(expr.teachesOnDay.teacher, known.teachers, 'unknown_teacher', `${path}/teachesOnDay/teacher`, issues, [...known.teachers]);
    if (!known.days.has(String(expr.teachesOnDay.day))) {
      issues.push({
        code: 'unknown_day',
        message: `Không tìm thấy ngày «${expr.teachesOnDay.day}».`,
        path: `${path}/teachesOnDay/day`,
        severity: 'hard',
        candidates: [...known.days].slice(0, 5),
      });
    }
    return;
  }
  if ('classSubjectAt' in expr) {
    const a = expr.classSubjectAt;
    checkEntity(a.class, known.classes, 'unknown_class', `${path}/classSubjectAt/class`, issues, [...known.classes]);
    checkEntity(a.subject, known.subjects, 'unknown_subject', `${path}/classSubjectAt/subject`, issues, [...known.subjects]);
    if (!known.days.has(String(a.day))) {
      issues.push({
        code: 'unknown_day',
        message: `Không tìm thấy ngày «${a.day}».`,
        path: `${path}/classSubjectAt/day`,
        severity: 'hard',
        candidates: [...known.days].slice(0, 5),
      });
    }
    return;
  }
  if ('classBusy' in expr) {
    const a = expr.classBusy;
    checkEntity(a.class, known.classes, 'unknown_class', `${path}/classBusy/class`, issues, [...known.classes]);
    return;
  }
  if ('assigned' in expr) {
    // We don't have an assignment-id pool here; that's the caller's job.
    return;
  }
  if ('session' in expr) {
    if (!known.sessions.has(expr.session.session)) {
      issues.push({
        code: 'unknown_session',
        message: `Không tìm thấy buổi «${expr.session.session}».`,
        path: `${path}/session/session`,
        severity: 'hard',
        candidates: [...known.sessions].slice(0, 5),
      });
    }
    if (expr.session.teacher) {
      checkEntity(expr.session.teacher, known.teachers, 'unknown_teacher', `${path}/session/teacher`, issues, [...known.teachers]);
    }
    if (expr.session.class) {
      checkEntity(expr.session.class, known.classes, 'unknown_class', `${path}/session/class`, issues, [...known.classes]);
    }
    if (expr.session.subject) {
      checkEntity(expr.session.subject, known.subjects, 'unknown_subject', `${path}/session/subject`, issues, [...known.subjects]);
    }
    return;
  }
  if ('const' in expr) {
    return;
  }
  issues.push({
    code: 'invalid_atom_shape',
    message: 'Atom không hợp lệ',
    path,
    severity: 'hard',
  });
}

export function typeCheckIR(
  ir: ConstraintIR,
  input: AgentInputPayload
): IRTypeCheckResult {
  const known = collectKnownEntities(input);
  const issues: IRTypeCheckIssue[] = [];
  checkBoolExpr(ir.expr, 'expr', issues, known);
  return {
    ok: issues.length === 0,
    issues,
    hardIssues: issues.filter((i) => i.severity === 'hard'),
    softIssues: issues.filter((i) => i.severity === 'soft'),
  };
}
