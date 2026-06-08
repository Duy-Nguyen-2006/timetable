import { z } from 'zod';

import type { ConstraintKind, ConstraintSeverity, ConstraintSpec } from './constraint-spec';
import {
  BUILT_IN_CONSTRAINT_DEFINITIONS,
  BUILT_IN_CONSTRAINT_KINDS,
  getConstraintMeta,
} from './constraint-registry';

export type BuiltInConstraintKind = Exclude<ConstraintKind, 'custom_dsl'>;
export type TimetableConstraintSeverity = 'hard' | 'soft';
export type TimetableConstraintScope = 'teacher' | 'subject' | 'class' | 'assignment' | 'global';

export type BuiltInConstraint = {
  id: string;
  mode: 'built_in';
  severity: TimetableConstraintSeverity;
  scope: TimetableConstraintScope;
  kind: BuiltInConstraintKind;
  params: Record<string, unknown>;
  weight?: number;
  displayText: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomConstraint = {
  id: string;
  mode: 'custom';
  severity: TimetableConstraintSeverity;
  originalText: string;
  normalizedText: string;
  structuredDraft?: unknown;
  status: 'draft' | 'needs_user_confirmation' | 'confirmed' | 'unsupported';
  aiConfidence?: number;
  createdAt: string;
  updatedAt: string;
};

export type TimetableConstraint = BuiltInConstraint | CustomConstraint;

const timestampSchema = z.string().min(1);
const hardSoftSchema = z.enum(['hard', 'soft']);
const scopeSchema = z.enum(['teacher', 'subject', 'class', 'assignment', 'global']);
const builtInKindSchema = z.custom<BuiltInConstraintKind>(
  (value) => typeof value === 'string' && BUILT_IN_CONSTRAINT_KINDS.has(value as BuiltInConstraintKind),
  'Unknown built-in constraint kind'
);

function hasRequiredParam(params: Record<string, unknown>, name: string): boolean {
  const value = params[name];
  if (value === undefined || value === null || value === '') return false;
  return !Array.isArray(value) || value.length > 0;
}

export function validateBuiltInParams(kind: BuiltInConstraintKind, params: Record<string, unknown>): string[] {
  const definition = BUILT_IN_CONSTRAINT_DEFINITIONS.find((item) => item.kind === kind);
  if (!definition) return [`Unknown built-in constraint kind: ${kind}`];
  return definition.paramsSchema.required
    .filter((paramName) => !hasRequiredParam(params, paramName))
    .map((paramName) => `Missing required param: ${paramName}`);
}

export const builtInConstraintSchema = z.object({
  id: z.string().min(1),
  mode: z.literal('built_in'),
  severity: hardSoftSchema,
  scope: scopeSchema,
  kind: builtInKindSchema,
  params: z.record(z.string(), z.unknown()),
  weight: z.number().positive().optional(),
  displayText: z.string().min(1),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).superRefine((value, ctx) => {
  const meta = getConstraintMeta(value.kind);
  if (meta && value.scope !== meta.group) {
    ctx.addIssue({
      code: 'custom',
      message: `Scope ${value.scope} does not match registry scope ${meta.group}`,
      path: ['scope'],
    });
  }
  for (const message of validateBuiltInParams(value.kind, value.params)) {
    ctx.addIssue({ code: 'custom', message, path: ['params'] });
  }
  if (value.severity === 'hard' && value.weight !== undefined) {
    ctx.addIssue({ code: 'custom', message: 'Hard constraints must not carry weight', path: ['weight'] });
  }
});

export const customConstraintSchema = z.object({
  id: z.string().min(1),
  mode: z.literal('custom'),
  severity: hardSoftSchema,
  originalText: z.string().min(1),
  normalizedText: z.string(),
  structuredDraft: z.unknown().optional(),
  status: z.enum(['draft', 'needs_user_confirmation', 'confirmed', 'unsupported']),
  aiConfidence: z.number().min(0).max(1).optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const timetableConstraintSchema = z.discriminatedUnion('mode', [
  builtInConstraintSchema,
  customConstraintSchema,
]);

export const timetableConstraintsSchema = z.array(timetableConstraintSchema);

export function parseTimetableConstraint(input: unknown): TimetableConstraint {
  return timetableConstraintSchema.parse(input);
}

export function parseTimetableConstraints(input: unknown): TimetableConstraint[] {
  return timetableConstraintsSchema.parse(input);
}

export function serializeTimetableConstraints(constraints: TimetableConstraint[]): string {
  return JSON.stringify(timetableConstraintsSchema.parse(constraints));
}

export function deserializeTimetableConstraints(serialized: string): TimetableConstraint[] {
  return parseTimetableConstraints(JSON.parse(serialized));
}

function coerceHardSoft(severity: ConstraintSeverity): TimetableConstraintSeverity {
  return severity === 'hard' ? 'hard' : 'soft';
}

function stableTimestamp(timestamp?: string): string {
  return timestamp ?? new Date(0).toISOString();
}

export function constraintSpecToTimetableConstraint(
  spec: ConstraintSpec,
  timestamp?: string
): TimetableConstraint {
  const now = stableTimestamp(timestamp);
  const severity = coerceHardSoft(spec.severity);
  if (spec.kind === 'custom_dsl') {
    return {
      id: spec.id,
      mode: 'custom',
      severity,
      originalText: spec.original,
      normalizedText: typeof spec.params.normalizedText === 'string' ? spec.params.normalizedText : spec.original,
      structuredDraft: spec,
      status: 'confirmed',
      createdAt: now,
      updatedAt: now,
    };
  }
  const meta = getConstraintMeta(spec.kind);
  const builtIn: BuiltInConstraint = {
    id: spec.id,
    mode: 'built_in',
    severity,
    scope: meta?.group ?? 'global',
    kind: spec.kind,
    params: spec.params,
    ...(severity === 'soft' && spec.weight !== undefined ? { weight: spec.weight } : {}),
    displayText: spec.original,
    createdAt: now,
    updatedAt: now,
  };
  return parseTimetableConstraint(builtIn);
}

export function constraintSpecsToTimetableConstraints(
  specs: ConstraintSpec[],
  timestamp?: string
): TimetableConstraint[] {
  return specs.map((spec) => constraintSpecToTimetableConstraint(spec, timestamp));
}

function customConstraintToSpec(constraint: CustomConstraint): ConstraintSpec {
  return {
    id: constraint.id,
    original: constraint.originalText,
    severity: constraint.severity,
    kind: 'custom_dsl',
    params: {
      originalText: constraint.originalText,
      normalizedText: constraint.normalizedText,
      status: constraint.status,
    },
    notes: constraint.status === 'unsupported' ? 'unsupported_custom_constraint' : undefined,
  };
}

export function timetableConstraintToConstraintSpecs(constraint: TimetableConstraint): ConstraintSpec[] {
  const parsed = parseTimetableConstraint(constraint);
  if (parsed.mode === 'custom') return [customConstraintToSpec(parsed)];
  return [{
    id: parsed.id,
    original: parsed.displayText,
    severity: parsed.severity,
    kind: parsed.kind,
    params: parsed.params,
    ...(parsed.severity === 'soft' ? { weight: parsed.weight ?? 5 } : {}),
    tags: [parsed.severity === 'hard' ? 'user_required' : 'user_preferred'],
  }];
}

export function timetableConstraintsToConstraintSpecs(constraints: TimetableConstraint[]): ConstraintSpec[] {
  return constraints.flatMap(timetableConstraintToConstraintSpecs);
}
