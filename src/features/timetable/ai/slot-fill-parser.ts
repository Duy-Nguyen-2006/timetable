import { z } from 'zod';

import { BUILT_IN_CONSTRAINT_KINDS, getAllowedParamsForKind } from './constraint-registry';
import { parseModelJson } from './parse-model-json';
import type { SlotFillResponse } from './slot-fill-types';

const confidenceSchema = z.enum(['high', 'medium', 'low']);

const atomSchema = z.object({
  kind: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
  confidence: confidenceSchema.default('low'),
  missingParams: z.array(z.string()).default([]),
}).strict();

const conditionSchema = z.object({
  op: z.string(),
  teachers: z.array(z.string()).optional(),
  teacher: z.string().optional(),
  day: z.string().optional(),
  period: z.number().int().positive().optional(),
}).strict();

const slotFillSchema = z.object({
  atoms: z.array(atomSchema),
  condition: conditionSchema.optional(),
}).strict();

const legacySlotFillSchema = z.object({
  decision: z.string().optional(),
  kind: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
  confidence: confidenceSchema.default('low'),
  missingParams: z.array(z.string()).default([]),
  condition: conditionSchema.optional(),
}).passthrough();

export function parseSlotFillJson(content: string | undefined): SlotFillResponse {
  const parsed = parseModelJson(content);
  const modern = slotFillSchema.safeParse(parsed);
  if (modern.success) return sanitizeSlotFillResponse(modern.data);

  const legacy = legacySlotFillSchema.safeParse(parsed);
  if (legacy.success) {
    const { kind, params, confidence, missingParams, condition } = legacy.data;
    return sanitizeSlotFillResponse({
      atoms: [{ kind, params, confidence, missingParams }],
      condition,
    });
  }

  throw new Error(`Invalid slot-fill schema: ${modern.error.issues[0]?.message ?? 'unknown error'}`);
}

export function sanitizeSlotFillResponse(response: SlotFillResponse): SlotFillResponse {
  return {
    condition: response.condition,
    atoms: response.atoms.map((atom) => {
      if (atom.kind === 'custom' || !BUILT_IN_CONSTRAINT_KINDS.has(atom.kind as never)) {
        return { ...atom, kind: 'custom', confidence: atom.confidence ?? 'low' };
      }
      const allowed = getAllowedParamsForKind(atom.kind);
      const params: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(atom.params ?? {})) {
        if (allowed.has(key)) params[key] = value;
      }
      return { ...atom, params };
    }),
  };
}
