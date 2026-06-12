/**
 * constraint-ir.ts — TypeScript types and validator for the Constraint IR.
 *
 * IR (Intermediate Representation) is the canonical representation of
 * timetable constraints. One IR, two backends:
 *   - Backend 1: ir_compiler.py → CP-SAT model (enforce)
 *   - Backend 2: ir_eval.py     → Python boolean (verify)
 *
 * Both backends share the same IR, guaranteeing enforce == verify.
 *
 * Grammar (informal):
 *   Constraint   := { id, severity, weight?, original, explain, expr }
 *   BoolExpr     := Atom | and[] | or[] | not | implies[] | iff[]
 *                  | exists | forall | atLeast | atMost | exactly
 *                  | compare | consecutive
 *   IntExpr      := int | count | sum | scale
 *   Atom         := teaches | teachesOnDay | classSubjectAt | classBusy
 *                  | assigned | const
 *   Domain       := "days"|"periods"|"classes"|"teachers"|"subjects"
 *                  | {list} | {range} | {filter}
 */

import { z } from 'zod';
import { SOLVER_ENCODABLE_KINDS } from './constraint-registry';

// -----------------------------------------------------------------------------------------
// Domain schemas
// -----------------------------------------------------------------------------------------

export const DomainSchema: z.ZodType<Domain> = z.lazy(() =>
  z.union([
    z.union([
      z.literal('days'),
      z.literal('periods'),
      z.literal('classes'),
      z.literal('teachers'),
      z.literal('subjects'),
    ]),
    z.object({
      list: z.array(z.union([z.string(), z.number()])),
    }),
    z.object({
      range: z.tuple([z.union([z.string(), z.number()]), z.union([z.string(), z.number()])]),
    }),
    z.object({
      in: DomainSchema,
      where: z.record(z.string(), z.unknown()).optional(),
    }),
  ])
);

// -----------------------------------------------------------------------------------------
// Atom schemas
// -----------------------------------------------------------------------------------------

const TeachesAtomSchema = z.object({
  teaches: z.object({
    teacher: z.string(),
    day: z.string(),
    period: z.union([z.string(), z.number()]),
  }),
});

const TeachesOnDayAtomSchema = z.object({
  teachesOnDay: z.object({
    teacher: z.string(),
    day: z.string(),
  }),
});

const ClassSubjectAtAtomSchema = z.object({
  classSubjectAt: z.object({
    class: z.string(),
    subject: z.string(),
    day: z.string(),
    period: z.union([z.string(), z.number()]),
  }),
});

const ClassBusyAtomSchema = z.object({
  classBusy: z.object({
    class: z.string(),
    day: z.string(),
    period: z.union([z.string(), z.number()]),
  }),
});

const AssignedAtomSchema = z.object({
  assigned: z.object({
    assignment: z.string(),
    day: z.string(),
    period: z.union([z.string(), z.number()]),
  }),
});

const ConstAtomSchema = z.object({
  const: z.boolean(),
});

const AtomSchema = z.union([
  TeachesAtomSchema,
  TeachesOnDayAtomSchema,
  ClassSubjectAtAtomSchema,
  ClassBusyAtomSchema,
  AssignedAtomSchema,
  ConstAtomSchema,
]);

// -----------------------------------------------------------------------------------------
// IntExpr schema
// -----------------------------------------------------------------------------------------

const IntExprSchema: z.ZodType<IntExpr> = z.lazy(() =>
  z.union([
    z.number().int(),
    // Phase 3: reference a forall/exists variable name in the IR env.
    // The compiler and evaluator resolve this against the current
    // `env` (a dict mapping var name → current value). For example,
    // { var: 'p1' } inside a forall: { var: 'p1', in: 'periods' }
    // body returns the value of p1 in the current iteration.
    z.object({
      var: z.string(),
    }),
    z.object({
      count: z.object({
        var: z.string(),
        in: DomainSchema,
        body: BoolExprSchema,
      }),
    }),
    z.object({
      sum: z.array(IntExprSchema),
    }),
    z.object({
      scale: z.object({
        factor: z.number().int(),
        of: IntExprSchema,
      }),
    }),
  ])
);

// -----------------------------------------------------------------------------------------
// BoolExpr schema
// -----------------------------------------------------------------------------------------

const BoolExprSchema: z.ZodType<BoolExpr> = z.lazy(() =>
  z.union([
    AtomSchema,
    z.object({ and: z.array(BoolExprSchema) }),
    z.object({ or: z.array(BoolExprSchema) }),
    z.object({ not: BoolExprSchema }),
    z.object({
      implies: z.tuple([BoolExprSchema, BoolExprSchema]),
    }),
    z.object({
      iff: z.tuple([BoolExprSchema, BoolExprSchema]),
    }),
    z.object({
      exists: z.object({
        var: z.string(),
        in: DomainSchema,
        body: BoolExprSchema,
      }),
    }),
    z.object({
      forall: z.object({
        var: z.string(),
        in: DomainSchema,
        body: BoolExprSchema,
      }),
    }),
    z.object({
      atLeast: z.object({
        k: z.number().int(),
        var: z.string(),
        in: DomainSchema,
        body: BoolExprSchema,
      }),
    }),
    z.object({
      atMost: z.object({
        k: z.number().int(),
        var: z.string(),
        in: DomainSchema,
        body: BoolExprSchema,
      }),
    }),
    z.object({
      exactly: z.object({
        k: z.number().int(),
        var: z.string(),
        in: DomainSchema,
        body: BoolExprSchema,
      }),
    }),
    z.object({
      compare: z.object({
        op: z.enum(['<=', '<', '==', '!=', '>=', '>']),
        lhs: IntExprSchema,
        rhs: IntExprSchema,
      }),
    }),
    z.object({
      consecutive: z.object({
        var: z.string(),
        in: DomainSchema,
        length: z.number().int().min(2),
        body: BoolExprSchema,
      }),
    }),
    // Phase 1.1: ordering / gap operators. "Với mỗi ngày có 2 tiết trở lên,
    // khoảng cách giữa tiết A và tiết B tối thiểu N" -> gap; "tiết A trước tiết B"
    // -> before; "tiết A sau tiết B" -> after. All three are universal over
    // the in-domain (typically days).
    z.object({
      gap: z.object({
        var: z.string(),
        in: DomainSchema,
        min: z.number().int().min(1),
        body: BoolExprSchema,
      }),
    }),
    z.object({
      before: z.object({
        var: z.string(),
        in: DomainSchema,
        first: BoolExprSchema,
        second: BoolExprSchema,
      }),
    }),
    z.object({
      after: z.object({
        var: z.string(),
        in: DomainSchema,
        first: BoolExprSchema,
        second: BoolExprSchema,
      }),
    }),
    // Phase 1.1: session (buổi sáng/chiều) atom. Used in constraints like
    // "Môn Toán phải có ít nhất 2 tiết buổi sáng". Maps to AgentInput.sessions.
    z.object({
      session: z.object({
        teacher: z.string().optional(),
        class: z.string().optional(),
        subject: z.string().optional(),
        session: z.string(),
      }),
    }),
  ])
);

// -----------------------------------------------------------------------------------------
// Constraint IR schema
// -----------------------------------------------------------------------------------------

export const ConstraintIRSchema = z.object({
  id: z.string(),
  severity: z.union([z.literal('hard'), z.literal('soft'), z.literal('info')]),
  weight: z.number().optional(),
  original: z.string(),
  explain: z.string().optional(),
  expr: BoolExprSchema,
}).passthrough(); // Allow additional fields (params, pythonPredicate, etc.)

export type Domain =
  | 'days' | 'periods' | 'classes' | 'teachers' | 'subjects'
  | { list: (string | number)[] }
  | { range: [string | number, string | number] }
  | { in: Domain; where?: Record<string, unknown> };

export type Atom =
  | { teaches: { teacher: string; day: string; period: string | number } }
  | { teachesOnDay: { teacher: string; day: string } }
  | { classSubjectAt: { class: string; subject: string; day: string; period: string | number } }
  | { classBusy: { class: string; day: string; period: string | number } }
  | { assigned: { assignment: string; day: string; period: string | number } }
  | { const: boolean }
  // Phase 1.1: session atom. presence/absence of (teacher|class|subject) in
  // a session on a given day. The (teacher|class|subject) field is optional
  // (e.g. "buổi sáng có tiết chào cờ" = session {session: 'morning'} with no
  // subject/teacher).
  | { session: { teacher?: string; class?: string; subject?: string; session: string } };

export type IntExpr =
  | number
  // Phase 3: reference a forall/exists variable name in the IR env.
  // The compiler and evaluator resolve this against the current
  // `env` (a dict mapping var name → current value). For example,
  // { var: 'p1' } inside a forall: { var: 'p1', in: 'periods' }
  // body returns the value of p1 in the current iteration.
  | { var: string }
  | { count: { var: string; in: Domain; body: BoolExpr } }
  | { sum: IntExpr[] }
  | { scale: { factor: number; of: IntExpr } };

export type BoolExpr = Atom
  | { and: BoolExpr[] }
  | { or: BoolExpr[] }
  | { not: BoolExpr }
  | { implies: [BoolExpr, BoolExpr] }
  | { iff: [BoolExpr, BoolExpr] }
  | { exists: { var: string; in: Domain; body: BoolExpr } }
  | { forall: { var: string; in: Domain; body: BoolExpr } }
  | { atLeast: { k: number; var: string; in: Domain; body: BoolExpr } }
  | { atMost: { k: number; var: string; in: Domain; body: BoolExpr } }
  | { exactly: { k: number; var: string; in: Domain; body: BoolExpr } }
  | { compare: { op: '<=' | '<' | '==' | '!=' | '>=' | '>'; lhs: IntExpr; rhs: IntExpr } }
  | { consecutive: { var: string; in: Domain; length: number; body: BoolExpr } }
  // Phase 1.1: gap, before, after.
  | { gap: { var: string; in: Domain; min: number; body: BoolExpr } }
  | { before: { var: string; in: Domain; first: BoolExpr; second: BoolExpr } }
  | { after: { var: string; in: Domain; first: BoolExpr; second: BoolExpr } };

export type ConstraintIR = {
  id: string;
  severity: 'hard' | 'soft' | 'info';
  weight?: number;
  original: string;
  explain?: string;
  expr: BoolExpr;
  [k: string]: unknown;
};

// -----------------------------------------------------------------------------------------
// Validator
// -----------------------------------------------------------------------------------------

export interface IRValidationError {
  path: string;
  message: string;
  node: unknown;
}

export function validateIR(constraint: unknown): IRValidationError[] {
  const result = ConstraintIRSchema.safeParse(constraint);
  if (result.success) return [];

  return result.error.issues.map((issue) => ({
    path: issue.path.join('/'),
    message: issue.message,
    node: issue.code,
  }));
}

export function isValidIR(constraint: unknown): boolean {
  return validateIR(constraint).length === 0;
}

// -----------------------------------------------------------------------------------------
// Hard constraint hardening (Phase 0)
// -----------------------------------------------------------------------------------------

// M1.1: Use SOLVER_ENCODABLE_KINDS from registry instead of maintaining duplicate list
// This prevents drift when new kinds are added to the registry

export interface HardConstraintCheck {
  id: string;
  ok: boolean;
  error?: string;
  mechanism: 'ir_expr' | 'python_predicate' | 'known_kind' | 'unknown';
}

export function checkHardConstraintMechanism(
  spec: { id: string; kind: string; severity: string; expr?: unknown; pythonPredicate?: string; params?: Record<string, unknown> }
): HardConstraintCheck {
  if (spec.severity !== 'hard') {
    return { id: spec.id, ok: true, mechanism: 'ir_expr' };
  }

  // Has IR expr (top-level or under params)
  const exprFromParams = (spec.params as Record<string, unknown> | undefined)?.expr;
  if ((spec.expr && typeof spec.expr === 'object') || (exprFromParams && typeof exprFromParams === 'object')) {
    return { id: spec.id, ok: true, mechanism: 'ir_expr' };
  }

  // Has pythonPredicate
  const pythonPred =
    spec.pythonPredicate ||
    (spec.params as Record<string, unknown> | undefined)?.pythonPredicate;
  if (pythonPred) {
    return { id: spec.id, ok: true, mechanism: 'python_predicate' };
  }

  // Is a known encodable kind
  if (SOLVER_ENCODABLE_KINDS.has(spec.kind as any)) {
    return { id: spec.id, ok: true, mechanism: 'known_kind' };
  }

  return {
    id: spec.id,
    ok: false,
    error: `Hard constraint '${spec.id}' (kind=${spec.kind}) has no expr, no pythonPredicate, and is not a known encodable kind. It will be verify-only (not enforced in solver). Add an 'expr' IR field.`,
    mechanism: 'unknown',
  };
}

/**
 * Phase 0 hardening: reject hard custom_dsl without enforcement.
 * Call this at the Translator/TS level before sending to solver.
 */
export function validateHardConstraints(
  specs: Array<{
    id: string;
    kind: string;
    severity: string;
    expr?: unknown;
    pythonPredicate?: string;
    params?: Record<string, unknown>;
  }>
): HardConstraintCheck[] {
  return specs.map((spec) => checkHardConstraintMechanism(spec));
}
