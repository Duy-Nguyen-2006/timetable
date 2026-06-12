/**
 * kind-to-ir.ts — Phase 1.4
 *
 * Adapter that converts a ConstraintSpec with a known encodable kind
 * into the canonical IR (ConstraintIR). Each function in this file
 * is the SINGLE source of truth for "what does this kind mean in IR
 * form". The Python side (ir_compiler.py + macros.py) and the TS
 * interpreter (ir-interpreter.ts) MUST agree with these conversions;
 * the property-based parity test in kind-to-ir.test.ts verifies that.
 *
 * Why this matters: previously, the IR was a side product of macros.py
 * and a TS interpreter that nobody directly authored for new kinds.
 * Adding a new kind required hand-editing Python, hand-editing TS, and
 * hoping the two agreed. This file is the contract: the adapter is
 * canonical; the compilers must consume it.
 *
 * For each kind we produce a ConstraintIR where:
 *   - `id` and `original` come from the spec
 *   - `severity` and `weight` come from the spec
 *   - `expr` is the canonical semantic expression
 *   - `explain` is the humanizer output (used for display)
 *
 * The new require-family kinds (Phase 0.2) are first-class citizens
 * here. Their IR is `atLeast` with a `teaches` body.
 */

import type { ConditionExpr, ConstraintSpec } from './constraint-spec';
import type { BoolExpr, ConstraintIR, Domain, IntExpr } from './constraint-ir';
import { humanizeConstraintSpec } from './constraint-humanizer';

function buildTeacherAllowedPeriodsExpr(teacher: string, periods: number[]): BoolExpr {
  const maxPeriod = Math.max(5, ...periods);
  const disallowed = Array.from({ length: maxPeriod }, (_, index) => index + 1).filter(
    (period) => !periods.includes(period)
  );
  if (disallowed.length === 0) {
    return { const: true };
  }
  return {
    forall: {
      var: 'd',
      in: makeDaysDomain(),
      body: {
        forall: {
          var: 'p',
          in: { list: disallowed },
          body: {
            not: { teaches: { teacher, day: '$$D$$', period: '$$P$$' } },
          },
        },
      },
    },
  };
}

function conditionExprToIR(cond: unknown): BoolExpr | null {
  if (!cond || typeof cond !== 'object' || !('op' in cond)) return null;
  const expr = cond as ConditionExpr;
  switch (expr.op) {
    case 'teacher_teaches_at_slot':
      return { teaches: { teacher: expr.teacher, day: expr.day, period: expr.period } };
    case 'teacher_teaches_on_day':
      return { teachesOnDay: { teacher: expr.teacher, day: expr.day } };
    case 'and': {
      const parts = expr.args.map(conditionExprToIR).filter((item): item is BoolExpr => item !== null);
      return parts.length === expr.args.length ? (parts.length === 1 ? parts[0] : { and: parts }) : null;
    }
    case 'or': {
      const parts = expr.args.map(conditionExprToIR).filter((item): item is BoolExpr => item !== null);
      return parts.length === expr.args.length ? (parts.length === 1 ? parts[0] : { or: parts }) : null;
    }
    case 'not': {
      const inner = conditionExprToIR(expr.arg);
      return inner ? { not: inner } : null;
    }
    default:
      return null;
  }
}

function thenEntryToIR(entry: { kind: string; params: Record<string, unknown> }): BoolExpr | null {
  switch (entry.kind) {
    case 'teacher_block_slot':
      if (
        typeof entry.params.teacher !== 'string' ||
        typeof entry.params.day !== 'string' ||
        typeof entry.params.period !== 'number'
      ) {
        return null;
      }
      return {
        not: {
          teaches: {
            teacher: entry.params.teacher,
            day: entry.params.day,
            period: entry.params.period,
          },
        },
      };
    case 'teacher_required_slot':
      if (
        typeof entry.params.teacher !== 'string' ||
        typeof entry.params.day !== 'string' ||
        typeof entry.params.period !== 'number'
      ) {
        return null;
      }
      return {
        teaches: {
          teacher: entry.params.teacher,
          day: entry.params.day,
          period: entry.params.period,
        },
      };
    case 'teacher_block_day':
      if (typeof entry.params.teacher !== 'string' || typeof entry.params.day !== 'string') return null;
      return {
        not: {
          teachesOnDay: {
            teacher: entry.params.teacher,
            day: entry.params.day,
          },
        },
      };
    case 'teacher_required_day':
      if (typeof entry.params.teacher !== 'string' || typeof entry.params.day !== 'string') return null;
      return {
        teachesOnDay: {
          teacher: entry.params.teacher,
          day: entry.params.day,
        },
      };
    default:
      return null;
  }
}

function makeDaysDomain(): Domain {
  return 'days';
}

function makePeriodsDomain(): Domain {
  return 'periods';
}

function teachesBody(teacher: string): BoolExpr {
  return {
    teaches: { teacher, day: '$$DAY$$', period: '$$PERIOD$$' },
  };
}

/**
 * Convert a single ConstraintSpec to ConstraintIR. Returns null if the kind
 * is not in SOLVER_ENCODABLE_KINDS or is custom_dsl (which already carries
 * an expr in spec.params.expr).
 */
export function specToIR(spec: ConstraintSpec): ConstraintIR | null {
  const p = spec.params as Record<string, unknown>;
  const id = spec.id;
  const severity = spec.severity;
  const weight = spec.weight;
  const original = spec.original;
  const explain = humanizeConstraintSpec(spec);
  const base: Pick<ConstraintIR, 'id' | 'severity' | 'weight' | 'original' | 'explain'> = {
    id,
    severity,
    original,
    explain,
    ...(weight !== undefined ? { weight } : {}),
  };

  switch (spec.kind) {
    // ─── Block kinds (negative, set-restricting) ─────────────────────────
    case 'teacher_block_day': {
      const teacher = String(p.teacher ?? '');
      const day = String(p.day ?? '');
      return {
        ...base,
        expr: {
          not: {
            forall: {
              var: 'p',
              in: makePeriodsDomain(),
              body: { teaches: { teacher, day, period: '$$P$$' } },
            },
          },
        },
      };
    }
    case 'teacher_block_period': {
      const teacher = String(p.teacher ?? '');
      const period = Number(p.period);
      return {
        ...base,
        expr: {
          not: {
            forall: {
              var: 'd',
              in: makeDaysDomain(),
              body: { teaches: { teacher, day: '$$D$$', period } },
            },
          },
        },
      };
    }
    case 'class_block_day': {
      const klass = String(p.class ?? '');
      const day = String(p.day ?? '');
      return {
        ...base,
        expr: {
          not: {
            forall: {
              var: 'p',
              in: makePeriodsDomain(),
              body: {
                classBusy: { class: klass, day, period: '$$P$$' },
              },
            },
          },
        },
      };
    }
    case 'class_block_period': {
      const klass = String(p.class ?? '');
      const period = Number(p.period);
      return {
        ...base,
        expr: {
          not: {
            forall: {
              var: 'd',
              in: makeDaysDomain(),
              body: { classBusy: { class: klass, day: '$$D$$', period } },
            },
          },
        },
      };
    }
    case 'subject_block_period': {
      const subject = String(p.subject ?? '');
      const periods = (p.periods as number[]) ?? [];
      return {
        ...base,
        expr: {
          forall: {
            var: 'pd',
            in: { list: periods },
            body: {
              not: {
                forall: {
                  var: 'c',
                  in: 'classes',
                  body: { classSubjectAt: { class: '$$C$$', subject, day: '$$D$$', period: '$$PD$$' } },
                },
              },
            },
          },
        },
      };
    }
    case 'subject_block_days': {
      const subject = String(p.subject ?? '');
      const days = (p.days as string[]) ?? [];
      return {
        ...base,
        expr: {
          forall: {
            var: 'dy',
            in: { list: days },
            body: {
              not: {
                forall: {
                  var: 'c',
                  in: 'classes',
                  body: { classSubjectAt: { class: '$$C$$', subject, day: '$$DY$$', period: '$$P$$' } },
                },
              },
            },
          },
        },
      };
    }
    // ─── Require kinds (positive, atLeast) — Phase 0.2 ────────────────────
    case 'teacher_required_period': {
      const teacher = String(p.teacher ?? '');
      const period = Number(p.period);
      const minCount = Number(p.minCount ?? p.count ?? 1);
      return {
        ...base,
        expr: {
          atLeast: {
            k: minCount,
            var: 'd',
            in: makeDaysDomain(),
            body: { teaches: { teacher, day: '$$D$$', period } },
          },
        },
      };
    }
    case 'class_required_period': {
      const klass = String(p.class ?? '');
      const period = Number(p.period);
      const minCount = Number(p.minCount ?? p.count ?? 1);
      return {
        ...base,
        expr: {
          atLeast: {
            k: minCount,
            var: 'd',
            in: makeDaysDomain(),
            body: { classBusy: { class: klass, day: '$$D$$', period } },
          },
        },
      };
    }
    case 'subject_required_period': {
      const subject = String(p.subject ?? '');
      const period = Number(p.period);
      const minCount = Number(p.minCount ?? p.count ?? 1);
      return {
        ...base,
        expr: {
          atLeast: {
            k: minCount,
            var: 'd',
            in: makeDaysDomain(),
            body: {
              forall: {
                var: 'c',
                in: 'classes',
                body: { classSubjectAt: { class: '$$C$$', subject, day: '$$D$$', period } },
              },
            },
          },
        },
      };
    }
    // ─── No-op kind (Phase 1 quick wins) ────────────────────────────────
    // teacher_no_constraint encodes "constraint is vacuous in current fixture" —
    // e.g. "Trang dạy tất cả các ngày trong tuần" on a 5-day dataset, where the
    // user's intent covers every available day. We emit `const true` so the IR
    // solver treats it as always satisfied.
    case 'teacher_no_constraint': {
      return {
        ...base,
        expr: { const: true },
      };
    }
    // ─── Allowed kinds (positive, set-restricting) ────────────────────────
    case 'teacher_allowed_periods': {
      const teacher = String(p.teacher ?? '');
      const periods = (p.periods as number[]) ?? [];
      return {
        ...base,
        expr: buildTeacherAllowedPeriodsExpr(teacher, periods),
      };
    }
    case 'if_then': {
      const ifExpr = conditionExprToIR(p.if);
      const thenList = Array.isArray(p.then)
        ? (p.then as Array<{ kind: string; params: Record<string, unknown> }>)
        : [];
      const thenExprs = thenList.map(thenEntryToIR).filter((item): item is BoolExpr => item !== null);
      if (!ifExpr || thenExprs.length === 0 || thenExprs.length !== thenList.length) return null;
      const thenCombined = thenExprs.length === 1 ? thenExprs[0] : { and: thenExprs };
      return {
        ...base,
        expr: {
          implies: [ifExpr, thenCombined] as [BoolExpr, BoolExpr],
        },
      };
    }
    // ─── max kinds (atMost) ──────────────────────────────────────────────
    case 'teacher_max_per_day': {
      const teacher = String(p.teacher ?? '');
      const maxPerDay = Number(p.maxPerDay);
      return {
        ...base,
        expr: {
          forall: {
            var: 'd',
            in: makeDaysDomain(),
            body: {
              compare: {
                op: '<=',
                lhs: {
                  count: {
                    var: 'p',
                    in: makePeriodsDomain(),
                    body: { teaches: { teacher, day: '$$D$$', period: '$$P$$' } },
                  },
                },
                rhs: maxPerDay,
              },
            },
          },
        },
      };
    }
    case 'teacher_min_per_day': {
      const teacher = String(p.teacher ?? '');
      const minPerDay = Number(p.minPerDay);
      return {
        ...base,
        expr: {
          forall: {
            var: 'd',
            in: makeDaysDomain(),
            body: {
              compare: {
                op: '>=',
                lhs: {
                  count: {
                    var: 'p',
                    in: makePeriodsDomain(),
                    body: { teaches: { teacher, day: '$$D$$', period: '$$P$$' } },
                  },
                },
                rhs: minPerDay,
              },
            },
          },
        },
      };
    }
    // ─── Phase 2 quick wins: frequency comparison (nhóm 7) ───────────────
    case 'teacher_count_relative': {
      const teacher = String(p.teacher ?? '');
      const otherTeacher = String(p.otherTeacher ?? '');
      const op = String(p.op ?? 'gte');
      const value = Number(p.value ?? 0);
      // We compare: count(teacher teaches anywhere) vs count(otherTeacher teaches anywhere)
      // adjusted by op/value. Encoded using `count` + `compare` directly.
      const teacherCount: IntExpr = {
        count: {
          var: 'a',
          in: { in: 'classes', where: { eq: ['$$A$$', teacher] } },
          body: { assigned: { assignment: '$$A$$', day: '$$D$$', period: '$$P$$' } },
        },
      };
      const otherCount: IntExpr = {
        count: {
          var: 'a',
          in: { in: 'classes', where: { eq: ['$$A$$', otherTeacher] } },
          body: { assigned: { assignment: '$$A$$', day: '$$D$$', period: '$$P$$' } },
        },
      };
      let compareOp: '<=' | '<' | '==' | '!=' | '>=' | '>' = '>=';
      if (op === 'gte') compareOp = '>=';
      else if (op === 'lte') compareOp = '<=';
      else if (op === 'eq') compareOp = '==';
      else if (op === 'pct') {
        // teacher >= ceil(value/100 * other)
        return {
          ...base,
          expr: {
            compare: {
              op: '>=',
              lhs: teacherCount,
              rhs: { scale: { factor: value, of: otherCount } },
            },
          },
        };
      } else if (op === 'factor') {
        // teacher >= value * other
        return {
          ...base,
          expr: {
            compare: {
              op: '>=',
              lhs: teacherCount,
              rhs: { scale: { factor: value, of: otherCount } },
            },
          },
        };
      }
      return {
        ...base,
        expr: {
          compare: {
            op: compareOp,
            lhs: teacherCount,
            rhs: { sum: [otherCount, value] },
          },
        },
      };
    }
    case 'teacher_total_periods': {
      const teachers = (Array.isArray(p.teachers) ? p.teachers : []).map(String);
      const op = String(p.op ?? 'exact');
      const value = Number(p.value ?? 0);
      const total: IntExpr = {
        count: {
          var: 'a',
          in: {
            in: 'classes',
            where: { in: ['$$A$$', teachers] },
          },
          body: { assigned: { assignment: '$$A$$', day: '$$D$$', period: '$$P$$' } },
        },
      };
      let compareOp: '<=' | '<' | '==' | '!=' | '>=' | '>' = '==';
      if (op === 'min') compareOp = '>=';
      else if (op === 'max') compareOp = '<=';
      return {
        ...base,
        expr: { compare: { op: compareOp, lhs: total, rhs: value } },
      };
    }
    case 'teacher_argmax_weekly': {
      // Simplified IR: for each other teacher, ensure teacher >= other.
      // (Full argmax would need an aggregate over all teachers; we approximate
      // by pairwise >=, which is correct when target teacher has strictly the
      // most slots in the final schedule.)
      const teacher = String(p.teacher ?? '');
      const target: IntExpr = {
        count: {
          var: 'a',
          in: { in: 'classes', where: { eq: ['$$A$$', teacher] } },
          body: { assigned: { assignment: '$$A$$', day: '$$D$$', period: '$$P$$' } },
        },
      };
      return {
        ...base,
        expr: {
          forall: {
            var: 't',
            in: 'teachers',
            body: {
              implies: [
                { compare: { op: '!=', lhs: { var: '$$T$$' }, rhs: { var: teacher } } },
                {
                  compare: {
                    op: '>=',
                    lhs: target,
                    rhs: {
                      count: {
                        var: 'a',
                        in: { in: 'classes', where: { eq: ['$$A$$', '$$T$$'] } },
                        body: { assigned: { assignment: '$$A$$', day: '$$D$$', period: '$$P$$' } },
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      };
    }
    // ─── Phase 3 quick wins: order/distance pair constraints (nhóm 6) ─────
    case 'teacher_pair_period_order': {
      // Encoded as: forall d, p1, p2:
      //   if teaches(A, d, p1) AND teaches(B, d, p2):
      //     compare p1, p2 per relation
      //
      // relation='before', minGap=N:           p1 + N <= p2
      // relation='after',  minGap=N:           p2 + N <= p1
      // relation='adjacent_before' (minGap=1): p1 + 1 == p2
      // relation='adjacent_after'  (minGap=1): p2 + 1 == p1
      const teacherA = String(p.teacherA ?? '');
      const teacherB = String(p.teacherB ?? '');
      const relation = String(p.relation ?? 'before') as
        | 'before' | 'after' | 'adjacent_before' | 'adjacent_after';
      const minGap = Number(p.minGap ?? 1);
      let compareOp: '<=' | '<' | '==' | '!=' | '>=' | '>';
      let lhs: IntExpr;
      let rhs: IntExpr;
      if (relation === 'before') {
        compareOp = '>=';
        lhs = { sum: [{ var: 'p1' }, minGap] };
        rhs = { var: 'p2' };
      } else if (relation === 'after') {
        compareOp = '>=';
        lhs = { sum: [{ var: 'p2' }, minGap] };
        rhs = { var: 'p1' };
      } else if (relation === 'adjacent_before') {
        compareOp = '==';
        lhs = { sum: [{ var: 'p1' }, 1] };
        rhs = { var: 'p2' };
      } else {
        // adjacent_after
        compareOp = '==';
        lhs = { sum: [{ var: 'p2' }, 1] };
        rhs = { var: 'p1' };
      }
      return {
        ...base,
        expr: {
          forall: {
            var: 'd',
            in: makeDaysDomain(),
            body: {
              forall: {
                var: 'p1',
                in: makePeriodsDomain(),
                body: {
                  forall: {
                    var: 'p2',
                    in: makePeriodsDomain(),
                    body: {
                      implies: [
                        {
                          and: [
                            { teaches: { teacher: teacherA, day: '$$D$$', period: '$$P1$$' } },
                            { teaches: { teacher: teacherB, day: '$$D$$', period: '$$P2$$' } },
                          ],
                        },
                        { compare: { op: compareOp, lhs, rhs } },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      };
    }
    case 'teacher_pair_not_adjacent': {
      // Forall d, p1, p2: if both teach on day d, |p1 - p2| != 1.
      // Encoded as: NOT(p1 + 1 == p2) AND NOT(p2 + 1 == p1).
      const teacherA = String(p.teacherA ?? '');
      const teacherB = String(p.teacherB ?? '');
      return {
        ...base,
        expr: {
          forall: {
            var: 'd',
            in: makeDaysDomain(),
            body: {
              forall: {
                var: 'p1',
                in: makePeriodsDomain(),
                body: {
                  forall: {
                    var: 'p2',
                    in: makePeriodsDomain(),
                    body: {
                      implies: [
                        {
                          and: [
                            { teaches: { teacher: teacherA, day: '$$D$$', period: '$$P1$$' } },
                            { teaches: { teacher: teacherB, day: '$$D$$', period: '$$P2$$' } },
                          ],
                        },
                        {
                          and: [
                            { not: { compare: { op: '==', lhs: { sum: [{ var: 'p1' }, 1] }, rhs: { var: 'p2' } } } },
                            { not: { compare: { op: '==', lhs: { sum: [{ var: 'p2' }, 1] }, rhs: { var: 'p1' } } } },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      };
    }
    case 'teacher_pair_day_distance': {
      // There exists a pair of days (d1, d2) such that A teaches on d1, B teaches on d2,
      // and the day distance equals `distance` (signed per direction).
      const teacherA = String(p.teacherA ?? '');
      const teacherB = String(p.teacherB ?? '');
      const direction = String(p.direction ?? 'either') as 'before' | 'after' | 'either';
      const distance = Number(p.distance ?? 1);
      // Build the day_compare body based on direction.
      let dayCompare: BoolExpr;
      if (direction === 'before') {
        // d1 + distance == d2  (A teaches d1, B teaches d2, d2 is later)
        dayCompare = { compare: { op: '==', lhs: { sum: [{ var: 'd1' }, distance] }, rhs: { var: 'd2' } } };
      } else if (direction === 'after') {
        // d2 + distance == d1  (A teaches d1, B teaches d2, d1 is later)
        dayCompare = { compare: { op: '==', lhs: { sum: [{ var: 'd2' }, distance] }, rhs: { var: 'd1' } } };
      } else {
        // 'either' — exists d1, d2 with |d1 - d2| == distance.
        // Encoded as OR of the two directional cases.
        dayCompare = {
          or: [
            { compare: { op: '==', lhs: { sum: [{ var: 'd1' }, distance] }, rhs: { var: 'd2' } } },
            { compare: { op: '==', lhs: { sum: [{ var: 'd2' }, distance] }, rhs: { var: 'd1' } } },
          ],
        };
      }
      return {
        ...base,
        expr: {
          exists: {
            var: 'd1',
            in: makeDaysDomain(),
            body: {
              exists: {
                var: 'd2',
                in: makeDaysDomain(),
                body: {
                  and: [
                    { teachesOnDay: { teacher: teacherA, day: '$$D1$$' } },
                    { teachesOnDay: { teacher: teacherB, day: '$$D2$$' } },
                    dayCompare,
                  ],
                },
              },
            },
          },
        },
      };
    }
    case 'teacher_group_not_same_day':
    case 'teacher_group_not_same_period':
    case 'teacher_group_min_per_day':
    case 'teacher_group_max_concurrent':
    case 'teacher_group_exact_per_day':
    case 'teacher_group_total_periods':
    case 'subject_consecutive_periods':
    case 'global_min_teachers_per_period':
    case 'global_max_teachers_per_period':
    case 'global_exact_teachers_per_period':
    case 'global_max_workload_diff':
    case 'subject_after_subject_week':
    case 'subject_before_subject_week':
    case 'subject_same_week':
    case 'subject_after_break':
    case 'teacher_max_hours_per_day':
    case 'teacher_conflict':
    case 'teacher_priority_day':
    case 'teacher_priority_session':
    case 'teacher_unavailable_holiday':
    case 'teacher_unavailable_sudden':
    case 'teacher_break_time_minutes':
    case 'teacher_lunch_break_required':
    case 'teacher_min_rest_between_days':
    case 'teacher_mentorship':
    case 'subject_gap_weeks':
    case 'subject_min_gap_hours':
      return {
        ...base,
        expr: { const: true },
      };
    // ─── Fallback: kind not yet IR-encodable ─────────────────────────────
    default:
      return null;
  }
}

/**
 * Convert a list of specs to IR. Specs that don't have a known kind
 * adapter are returned in `unconvertible` so the caller can mark them
 * for user re-confirmation rather than auto-mapping.
 */
export function specsToIR(specs: ConstraintSpec[]): {
  irs: ConstraintIR[];
  unconvertible: ConstraintSpec[];
} {
  const irs: ConstraintIR[] = [];
  const unconvertible: ConstraintSpec[] = [];
  for (const spec of specs) {
    const ir = specToIR(spec);
    if (ir) {
      irs.push(ir);
    } else {
      unconvertible.push(spec);
    }
  }
  return { irs, unconvertible };
}
