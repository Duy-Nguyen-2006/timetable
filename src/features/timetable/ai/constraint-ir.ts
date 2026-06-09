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
  | { const: boolean };

export type IntExpr =
  | number
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
  | { consecutive: { var: string; in: Domain; length: number; body: BoolExpr } };

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

/** List of kinds that have known IR encodings in macros.py */
export const KNOWN_ENCODABLE_KINDS = new Set([
  // Teacher constraints
  'teacher_block_day',
  'teacher_block_period',
  'teacher_block_slot',
  'teacher_max_per_day',
  'teacher_max_consecutive',
  'teacher_max_working_days',
  'teacher_min_per_day',
  'teacher_no_gaps',
  'teacher_allowed_days',
  'teacher_allowed_periods',
  'teacher_min_working_days',
  'teacher_max_gaps',
  'teacher_min_consecutive',
  'teacher_balanced_load',
  'teacher_max_subjects_per_day',
  'teacher_max_consecutive_days',
  'teacher_preferred_periods',
  'teacher_max_classes_per_day',
  'teacher_pair_not_same_slot',
  'teacher_pair_not_same_day',
  'teacher_homeroom_first_period',
  // Subject constraints
  'subject_pin_period',
  'subject_preferred_periods',
  'subject_not_last_period',
  'subject_consecutive',
  'subject_max_consecutive',
  'subject_allowed_days',
  'subject_min_gap_days',
  'subject_daily_max_periods',
  'subject_block_period',
  'subject_block_days',
  'subject_not_consecutive',
  'subject_min_days',
  'subject_spread_evenly',
  'subject_order_before',
  'subject_not_after_subject',
  // Class constraints
  'class_block_day',
  'class_block_period',
  'class_block_slot',
  'class_max_per_day',
  'class_min_per_day',
  'class_no_gaps',
  'class_no_double_subject_day',
  'class_subjects_not_same_day',
  'class_fixed_period',
  'class_allowed_days',
  'class_allowed_periods',
  'class_max_consecutive',
  'class_max_subjects_per_day',
  'class_balanced_load',
  'class_subjects_same_day',
  'class_min_working_days',
  'class_max_heavy_subjects_per_day',
  'class_max_heavy_subjects_per_session',
  'class_first_period_required',
  // Global / assignment / pair / session
  'subject_flag_ceremony_slot',
  'global_teacher_utilization_balance',
  'assignment_pin_slot',
  'assignment_block_slot',
  'assignment_allowed_slots',
  'assignment_spread_days',
  'weekly_periods_exact',
  'assignment_consecutive',
  'assignment_max_per_day',
  'assignment_same_day',
  'assignment_not_same_day',
  'if_then',
  'pair_not_same_slot',
  'pair_same_slot',
  'mutual_exclusion',
  'session_limit',
  'subject_group',
  'subject_group_daily_limit',
  'subject_session_max_periods',
] as const);

export type KnownEncodableKind =
  typeof KNOWN_ENCODABLE_KINDS extends Set<infer T> ? T : never;

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

  // Has IR expr
  if (spec.expr && typeof spec.expr === 'object') {
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
  if (KNOWN_ENCODABLE_KINDS.has(spec.kind as KnownEncodableKind)) {
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
