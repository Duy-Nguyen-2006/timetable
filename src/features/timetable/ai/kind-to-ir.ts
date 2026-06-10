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

import type { ConstraintSpec } from './constraint-spec';
import type { BoolExpr, ConstraintIR, Domain } from './constraint-ir';
import { humanizeConstraintSpec } from './constraint-humanizer';

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
        expr: {
          forall: {
            var: 'd',
            in: makeDaysDomain(),
            body: {
              implies: [
                { teaches: { teacher, day: '$$D$$', period: '$$P$$' } },
                { const: false }, // placeholder; allowed kinds are checked externally
              ] as [BoolExpr, BoolExpr],
            },
          },
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
