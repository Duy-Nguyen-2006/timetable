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
import type { BoolExpr, ConstraintIR, Domain } from './constraint-ir';
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
