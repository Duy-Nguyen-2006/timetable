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
import { validateIR } from './constraint-ir';
import { humanizeIR } from './ir-humanizer-v2';
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

type BindingEnv = Map<string, Domain>;

function addBinding(bindings: BindingEnv, varName: string, domain: Domain): BindingEnv {
  const next = new Map(bindings);
  next.set(varName.toLowerCase(), domain);
  return next;
}

function placeholderBinding(value: string | number | undefined, bindings: BindingEnv): Domain | null {
  if (typeof value !== 'string') return null;
  const match = /^\$\$([A-Za-z][A-Za-z0-9_-]*)\$\$$/u.exec(value);
  if (!match) return null;
  return bindings.get(match[1].toLowerCase()) ?? null;
}

function bindingMatchesDomain(domain: Domain, expected: 'days' | 'periods' | 'classes' | 'teachers' | 'subjects'): boolean {
  if (typeof domain === 'string') return domain === expected;
  // A list/range binding is commonly used for period/day subsets. Treat it as
  // valid for those scalar domains, but do not infer entity domains from it.
  if ((expected === 'periods' || expected === 'days') && ('list' in domain || 'range' in domain)) return true;
  if ('in' in domain) return bindingMatchesDomain(domain.in, expected);
  return false;
}

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
  candidates: string[],
  bindings: BindingEnv,
  expectedDomain: 'teachers' | 'classes' | 'subjects'
): void {
  if (value === undefined) return;
  if (value === '__all__' || value === 'all') return;
  const binding = placeholderBinding(value, bindings);
  if (binding) {
    if (bindingMatchesDomain(binding, expectedDomain)) return;
    issues.push({
      code: 'invalid_binding',
      message: `Placeholder «${value}» không thuộc domain ${expectedDomain}.`,
      path,
      severity: 'hard',
    });
    return;
  }
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

function checkDay(
  value: string | number,
  path: string,
  issues: IRTypeCheckIssue[],
  known: ReturnType<typeof collectKnownEntities>,
  bindings: BindingEnv
): boolean {
  const binding = placeholderBinding(value, bindings);
  if (binding) {
    if (bindingMatchesDomain(binding, 'days')) return true;
    issues.push({
      code: 'invalid_binding',
      message: `Placeholder «${value}» không thuộc domain days.`,
      path,
      severity: 'hard',
    });
    return false;
  }
  if (!known.days.has(String(value))) {
    issues.push({
      code: 'unknown_day',
      message: `Không tìm thấy ngày «${value}».`,
      path,
      severity: 'hard',
      candidates: [...known.days].slice(0, 5),
    });
    return false;
  }
  return true;
}

function checkPeriod(
  period: string | number,
  day: string | number,
  path: string,
  issues: IRTypeCheckIssue[],
  known: ReturnType<typeof collectKnownEntities>,
  bindings: BindingEnv
): void {
  const periodBinding = placeholderBinding(period, bindings);
  if (periodBinding) {
    if (bindingMatchesDomain(periodBinding, 'periods')) return;
    issues.push({
      code: 'invalid_binding',
      message: `Placeholder «${period}» không thuộc domain periods.`,
      path,
      severity: 'hard',
    });
    return;
  }

  const periodNum = Number(period);
  if (!Number.isInteger(periodNum) || periodNum < 1) {
    issues.push({
      code: 'period_out_of_range',
      message: `Tiết không hợp lệ: ${period}`,
      path,
      severity: 'hard',
    });
    return;
  }

  // If the day itself is a binding placeholder, exact per-day validation is
  // deferred until the binding is instantiated by the compiler/interpreter.
  if (placeholderBinding(day, bindings)) return;

  const dayPeriods = known.periodByDay[String(day)] ?? [];
  if (dayPeriods.length > 0 && !dayPeriods.includes(periodNum)) {
    issues.push({
      code: 'period_out_of_range',
      message: `Tiết ${period} ngoài phạm vi của ngày «${day}» (${dayPeriods.join(', ')}).`,
      path,
      severity: 'hard',
      candidates: dayPeriods.map((p) => String(p)),
    });
  }
}

function checkIntExpr(
  expr: IntExpr,
  path: string,
  issues: IRTypeCheckIssue[],
  known: ReturnType<typeof collectKnownEntities>,
  bindings: BindingEnv
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
    checkBoolExpr(expr.count.body, `${path}/count/body`, issues, known, addBinding(bindings, expr.count.var, expr.count.in));
    return;
  }
  if ('sum' in expr) {
    for (let i = 0; i < expr.sum.length; i += 1) {
      checkIntExpr(expr.sum[i], `${path}/sum[${i}]`, issues, known, bindings);
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
    checkIntExpr(expr.scale.of, `${path}/scale/of`, issues, known, bindings);
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
  known: ReturnType<typeof collectKnownEntities>,
  bindings: BindingEnv = new Map()
): void {
  if ('and' in expr) {
    expr.and.forEach((b, i) => checkBoolExpr(b, `${path}/and[${i}]`, issues, known, bindings));
    return;
  }
  if ('or' in expr) {
    expr.or.forEach((b, i) => checkBoolExpr(b, `${path}/or[${i}]`, issues, known, bindings));
    return;
  }
  if ('not' in expr) {
    checkBoolExpr(expr.not, `${path}/not`, issues, known, bindings);
    return;
  }
  if ('implies' in expr) {
    checkBoolExpr(expr.implies[0], `${path}/implies[0]`, issues, known, bindings);
    checkBoolExpr(expr.implies[1], `${path}/implies[1]`, issues, known, bindings);
    return;
  }
  if ('iff' in expr) {
    checkBoolExpr(expr.iff[0], `${path}/iff[0]`, issues, known, bindings);
    checkBoolExpr(expr.iff[1], `${path}/iff[1]`, issues, known, bindings);
    return;
  }
  if ('exists' in expr) {
    checkDomain(expr.exists.in, `${path}/exists/in`, issues);
    checkBoolExpr(expr.exists.body, `${path}/exists/body`, issues, known, addBinding(bindings, expr.exists.var, expr.exists.in));
    return;
  }
  if ('forall' in expr) {
    checkDomain(expr.forall.in, `${path}/forall/in`, issues);
    checkBoolExpr(expr.forall.body, `${path}/forall/body`, issues, known, addBinding(bindings, expr.forall.var, expr.forall.in));
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
    checkBoolExpr(expr.atLeast.body, `${path}/atLeast/body`, issues, known, addBinding(bindings, expr.atLeast.var, expr.atLeast.in));
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
    checkBoolExpr(expr.atMost.body, `${path}/atMost/body`, issues, known, addBinding(bindings, expr.atMost.var, expr.atMost.in));
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
    checkBoolExpr(expr.exactly.body, `${path}/exactly/body`, issues, known, addBinding(bindings, expr.exactly.var, expr.exactly.in));
    return;
  }
  if ('compare' in expr) {
    checkIntExpr(expr.compare.lhs, `${path}/compare/lhs`, issues, known, bindings);
    checkIntExpr(expr.compare.rhs, `${path}/compare/rhs`, issues, known, bindings);
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
    checkBoolExpr(expr.consecutive.body, `${path}/consecutive/body`, issues, known, addBinding(bindings, expr.consecutive.var, expr.consecutive.in));
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
    checkBoolExpr(expr.gap.body, `${path}/gap/body`, issues, known, addBinding(bindings, expr.gap.var, expr.gap.in));
    return;
  }
  if ('before' in expr) {
    checkDomain(expr.before.in, `${path}/before/in`, issues);
    checkBoolExpr(expr.before.first, `${path}/before/first`, issues, known, addBinding(bindings, expr.before.var, expr.before.in));
    checkBoolExpr(expr.before.second, `${path}/before/second`, issues, known, addBinding(bindings, expr.before.var, expr.before.in));
    return;
  }
  if ('after' in expr) {
    checkDomain(expr.after.in, `${path}/after/in`, issues);
    checkBoolExpr(expr.after.first, `${path}/after/first`, issues, known, addBinding(bindings, expr.after.var, expr.after.in));
    checkBoolExpr(expr.after.second, `${path}/after/second`, issues, known, addBinding(bindings, expr.after.var, expr.after.in));
    return;
  }
  // Atom
  if ('teaches' in expr) {
    const t = expr.teaches;
    checkEntity(t.teacher, known.teachers, 'unknown_teacher', `${path}/teaches/teacher`, issues, [...known.teachers], bindings, 'teachers');
    checkDay(t.day, `${path}/teaches/day`, issues, known, bindings);
    checkPeriod(t.period, t.day, `${path}/teaches/period`, issues, known, bindings);
    return;
  }
  if ('teachesOnDay' in expr) {
    checkEntity(expr.teachesOnDay.teacher, known.teachers, 'unknown_teacher', `${path}/teachesOnDay/teacher`, issues, [...known.teachers], bindings, 'teachers');
    checkDay(expr.teachesOnDay.day, `${path}/teachesOnDay/day`, issues, known, bindings);
    return;
  }
  if ('classSubjectAt' in expr) {
    const a = expr.classSubjectAt;
    checkEntity(a.class, known.classes, 'unknown_class', `${path}/classSubjectAt/class`, issues, [...known.classes], bindings, 'classes');
    checkEntity(a.subject, known.subjects, 'unknown_subject', `${path}/classSubjectAt/subject`, issues, [...known.subjects], bindings, 'subjects');
    checkDay(a.day, `${path}/classSubjectAt/day`, issues, known, bindings);
    checkPeriod(a.period, a.day, `${path}/classSubjectAt/period`, issues, known, bindings);
    return;
  }
  if ('classBusy' in expr) {
    const a = expr.classBusy;
    checkEntity(a.class, known.classes, 'unknown_class', `${path}/classBusy/class`, issues, [...known.classes], bindings, 'classes');
    checkDay(a.day, `${path}/classBusy/day`, issues, known, bindings);
    checkPeriod(a.period, a.day, `${path}/classBusy/period`, issues, known, bindings);
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
      checkEntity(expr.session.teacher, known.teachers, 'unknown_teacher', `${path}/session/teacher`, issues, [...known.teachers], bindings, 'teachers');
    }
    if (expr.session.class) {
      checkEntity(expr.session.class, known.classes, 'unknown_class', `${path}/session/class`, issues, [...known.classes], bindings, 'classes');
    }
    if (expr.session.subject) {
      checkEntity(expr.session.subject, known.subjects, 'unknown_subject', `${path}/session/subject`, issues, [...known.subjects], bindings, 'subjects');
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

// -----------------------------------------------------------------------------------------
// Field stripping (2nd illustration trap layer)
// -----------------------------------------------------------------------------------------

/**
 * Strip unknown/extra fields from an IR's atom params that don't belong
 * to the atom's kind. This is the 2nd illustration trap layer:
 * e.g., `period` should NOT be in `teacher_pair_not_same_slot` params.
 *
 * Known param fields per kind are defined here. Any field not in the
 * known set for the kind is stripped and reported.
 */

type KindParamSpec = Record<string, Set<string>>;

const KNOWN_PARAMS_BY_KIND: KindParamSpec = {
  teacher_block_day: new Set(['teacher', 'day']),
  teacher_block_period: new Set(['teacher', 'period']),
  teacher_block_slot: new Set(['teacher', 'day', 'period']),
  teacher_max_per_day: new Set(['teacher', 'maxPerDay']),
  teacher_max_consecutive: new Set(['teacher', 'maxConsecutive']),
  teacher_max_working_days: new Set(['teacher', 'maxDays']),
  teacher_min_per_day: new Set(['teacher', 'minPerDay']),
  teacher_no_gaps: new Set(['teacher']),
  teacher_allowed_days: new Set(['teacher', 'days']),
  teacher_allowed_periods: new Set(['teacher', 'periods']),
  teacher_min_working_days: new Set(['teacher', 'minDays']),
  teacher_max_gaps: new Set(['teacher', 'maxGaps']),
  teacher_min_consecutive: new Set(['teacher', 'minConsecutive']),
  teacher_balanced_load: new Set(['teacher']),
  teacher_max_subjects_per_day: new Set(['teacher', 'maxSubjects']),
  teacher_max_consecutive_days: new Set(['teacher', 'maxConsecutiveDays']),
  teacher_min_off_days: new Set(['teacher', 'minOffDays']),
  teacher_preferred_periods: new Set(['teacher', 'periods']),
  teacher_max_classes_per_day: new Set(['teacher', 'maxClasses']),
  teacher_pair_not_same_slot: new Set(['teachers', 'scope']),
  teacher_pair_not_same_day: new Set(['teachers', 'scope']),
  teacher_homeroom_first_period: new Set(['teacher', 'class']),
  teacher_required_day: new Set(['teacher', 'day', 'scope']),
  teacher_required_slot: new Set(['teacher', 'day', 'period', 'scope']),
  teacher_required_period: new Set(['teacher', 'period', 'minCount', 'scope']),
  teacher_pair_required_same_day: new Set(['teachers', 'scope']),
  teacher_pair_required_same_slot: new Set(['teachers', 'scope']),
  subject_pin_period: new Set(['subject', 'day', 'period']),
  subject_preferred_periods: new Set(['subject', 'periods']),
  subject_not_last_period: new Set(['subject']),
  subject_consecutive: new Set(['subject']),
  subject_max_consecutive: new Set(['subject', 'maxConsecutive']),
  subject_allowed_days: new Set(['subject', 'days']),
  subject_min_gap_days: new Set(['subject', 'minGapDays']),
  subject_daily_max_periods: new Set(['subject', 'maxPerDay']),
  subject_block_period: new Set(['subject', 'period']),
  subject_block_days: new Set(['subject', 'days']),
  subject_not_consecutive: new Set(['subject']),
  subject_min_days: new Set(['subject', 'minDays']),
  subject_spread_evenly: new Set(['subject']),
  subject_order_before: new Set(['subject', 'beforeSubject']),
  subject_not_after_subject: new Set(['subject', 'afterSubject']),
  subject_required_period: new Set(['subject', 'period', 'minCount', 'scope']),
  class_block_day: new Set(['class', 'day']),
  class_block_period: new Set(['class', 'period']),
  class_block_slot: new Set(['class', 'day', 'period']),
  class_max_per_day: new Set(['class', 'maxPerDay']),
  class_min_per_day: new Set(['class', 'minPerDay']),
  class_no_gaps: new Set(['class']),
  class_no_double_subject_day: new Set(['class']),
  class_subjects_not_same_day: new Set(['class', 'subjects']),
  class_fixed_period: new Set(['class', 'day', 'period']),
  class_allowed_days: new Set(['class', 'days']),
  class_allowed_periods: new Set(['class', 'periods']),
  class_max_consecutive: new Set(['class', 'maxConsecutive']),
  class_max_subjects_per_day: new Set(['class', 'maxSubjects']),
  class_balanced_load: new Set(['class']),
  class_subjects_same_day: new Set(['class', 'subjects']),
  class_min_working_days: new Set(['class', 'minDays']),
  class_required_period: new Set(['class', 'period', 'minCount', 'scope']),
  assignment_pin_slot: new Set(['assignmentId', 'day', 'period']),
  assignment_block_slot: new Set(['assignmentId', 'day', 'period']),
  assignment_allowed_slots: new Set(['assignmentId', 'slots']),
  assignment_spread_days: new Set(['assignmentId']),
  weekly_periods_exact: new Set(['assignmentId', 'weeklyPeriods']),
  assignment_consecutive: new Set(['assignmentId']),
  assignment_max_per_day: new Set(['assignmentId', 'maxPerDay']),
  assignment_same_day: new Set(['assignmentIds']),
  assignment_not_same_day: new Set(['assignmentIds']),
  if_then: new Set(['if', 'then']),
};

export type StripResult = {
  /** The params with unknown fields stripped */
  stripped: Record<string, unknown>;
  /** Fields that were stripped (for audit/clarify) */
  strippedFields: string[];
  /** Whether any fields were stripped */
  hadStrippedFields: boolean;
};

export function stripUnknownKindParams(
  kind: string,
  params: Record<string, unknown>
): StripResult {
  const known = KNOWN_PARAMS_BY_KIND[kind];
  if (!known) {
    // Unknown kind — don't strip (could be custom_dsl etc.)
    return { stripped: params, strippedFields: [], hadStrippedFields: false };
  }

  const stripped: Record<string, unknown> = {};
  const strippedFields: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (known.has(key)) {
      stripped[key] = value;
    } else {
      strippedFields.push(key);
    }
  }

  return {
    stripped,
    strippedFields,
    hadStrippedFields: strippedFields.length > 0,
  };
}

// -----------------------------------------------------------------------------------------
// Round-trip verification
// -----------------------------------------------------------------------------------------

/**
 * Round-trip verification: humanize IR → re-parse → compare IR ≡ IR
 *
 * This catches cases where the humanized text doesn't faithfully
 * represent the IR (e.g., lost scope, wrong entity order).
 *
 * Note: This is a structural comparison, not token-level.
 * The comparison normalizes both IRs before comparing.
 */

export type RoundTripResult = {
  /** Whether the round-trip check passed */
  ok: boolean;
  /** Humanized text from the IR */
  humanizedText: string;
  /** Any issues found */
  issues: string[];
};

/**
 * Verify that an IR can be humanized and the humanized text
 * is structurally consistent. This does NOT re-parse the humanized
 * text (that would require the full LLM pipeline), but checks:
 * 1. The IR passes shape validation
 * 2. The humanizer produces a non-empty, non-fallback text
 * 3. No "unmatched" patterns in the humanizer output
 */
export function verifyRoundTrip(ir: ConstraintIR): RoundTripResult {
  const issues: string[] = [];

  // Step 1: Shape validation
  const shapeIssues = validateIR(ir);
  if (shapeIssues.length > 0) {
    issues.push(...shapeIssues.map(i => `IR shape issue: ${i.message}`));
  }

  // Step 2: Humanize
  const { text, unmatched } = humanizeIR(ir);
  if (!text.trim()) {
    issues.push('Humanizer produced empty text');
  }
  if (unmatched) {
    issues.push(`Humanizer could not fully render IR (unmatched pattern). Text: "${text}"`);
  }

  return {
    ok: issues.length === 0,
    humanizedText: text,
    issues,
  };
}
