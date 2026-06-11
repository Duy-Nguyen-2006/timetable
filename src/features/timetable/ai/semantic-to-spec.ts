/**
 * semantic-to-spec.ts
 *
 * Bridge from LLM semantic representation to executable ConstraintSpec / IR.
 * Used when the analyzer returns semantic_only but the semantic payload is
 * fully convertible to a solver-encodable kind (e.g. if_then).
 */

import type { AgentInputPayload } from './types';
import type { ConditionExpr, ConstraintKind, ConstraintSpec } from './constraint-spec';
import type { BoolExpr } from './constraint-ir';
import { validateIR } from './constraint-ir';
import { typeCheckIR } from './ir-type-checker';
import type { SemanticAction, SemanticCondition, SemanticConstraint } from './semantic-constraint';

const ACTION_OP_TO_KIND: Record<string, ConstraintKind> = {
  teacher_block_slot: 'teacher_block_slot',
  teacher_required_slot: 'teacher_required_slot',
  teacher_block_day: 'teacher_block_day',
  teacher_required_day: 'teacher_required_day',
};

type ConvertOptions = {
  rawText: string;
  constraintType: 'required' | 'preferred';
  weight?: number;
  idPrefix?: string;
  agentInput?: AgentInputPayload;
};

function normalizeConditionOp(op: string): string {
  if (op === 'teacher_teaching_at_slot') return 'teacher_teaches_at_slot';
  if (op === 'teacher_teaching_on_day') return 'teacher_teaches_on_day';
  return op;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function convertCondition(cond: unknown): ConditionExpr | null {
  if (!isRecord(cond) || typeof cond.op !== 'string') return null;
  const op = cond.op;

  if (op === 'and' || op === 'or') {
    const args = Array.isArray(cond.args) ? cond.args : [];
    const converted = args.map(convertCondition).filter((item): item is ConditionExpr => item !== null);
    if (converted.length !== args.length) return null;
    return { op, args: converted };
  }

  if (op === 'not') {
    const arg = convertCondition(cond.arg);
    if (!arg) return null;
    return { op: 'not', arg };
  }

  if (op === 'teacher_not_teaching_at_slot') {
    const inner = convertCondition({
      op: 'teacher_teaches_at_slot',
      teacher: cond.teacher,
      day: cond.day,
      period: cond.period,
    });
    if (!inner) return null;
    return { op: 'not', arg: inner };
  }

  if (op === 'teacher_not_teaching_on_day') {
    const inner = convertCondition({
      op: 'teacher_teaches_on_day',
      teacher: cond.teacher,
      day: cond.day,
    });
    if (!inner) return null;
    return { op: 'not', arg: inner };
  }

  if (op === 'class_has_subject_at_slot') {
    if (
      typeof cond.class !== 'string' ||
      typeof cond.subject !== 'string' ||
      typeof cond.day !== 'string' ||
      typeof cond.period !== 'number'
    ) {
      return null;
    }
    return {
      op: 'class_teacher_at_slot',
      class: cond.class,
      subject: cond.subject,
      day: cond.day,
      period: cond.period,
    };
  }

  const normalizedOp = normalizeConditionOp(op);
  if (normalizedOp === 'teacher_teaches_at_slot') {
    if (
      typeof cond.teacher !== 'string' ||
      typeof cond.day !== 'string' ||
      typeof cond.period !== 'number'
    ) {
      return null;
    }
    return {
      op: 'teacher_teaches_at_slot',
      teacher: cond.teacher,
      day: cond.day,
      period: cond.period,
    };
  }

  if (normalizedOp === 'teacher_teaches_on_day') {
    if (typeof cond.teacher !== 'string' || typeof cond.day !== 'string') return null;
    return {
      op: 'teacher_teaches_on_day',
      teacher: cond.teacher,
      day: cond.day,
    };
  }

  return null;
}

function convertThenAction(action: unknown): { kind: ConstraintKind; params: Record<string, unknown> } | null {
  if (!isRecord(action) || typeof action.op !== 'string') return null;
  const kind = ACTION_OP_TO_KIND[action.op];
  if (!kind) return null;

  const params: Record<string, unknown> = {};
  if (typeof action.teacher === 'string') params.teacher = action.teacher;
  if (typeof action.day === 'string') params.day = action.day;
  if (typeof action.period === 'number') params.period = action.period;
  if (typeof action.assignmentId === 'string') params.assignmentId = action.assignmentId;

  if (kind === 'teacher_block_slot' || kind === 'teacher_required_slot') {
    if (!params.teacher || !params.day || typeof params.period !== 'number') return null;
  }
  if (kind === 'teacher_block_day' || kind === 'teacher_required_day') {
    if (!params.teacher || !params.day) return null;
  }

  return { kind, params };
}

function conditionToBoolExpr(cond: ConditionExpr): BoolExpr | null {
  switch (cond.op) {
    case 'teacher_teaches_at_slot':
      return { teaches: { teacher: cond.teacher, day: cond.day, period: cond.period } };
    case 'teacher_teaches_on_day':
      return { teachesOnDay: { teacher: cond.teacher, day: cond.day } };
    case 'class_teacher_at_slot':
      return {
        classSubjectAt: {
          class: cond.class,
          subject: cond.subject,
          day: cond.day,
          period: cond.period,
        },
      };
    case 'and': {
      const parts = cond.args.map(conditionToBoolExpr).filter((item): item is BoolExpr => item !== null);
      if (parts.length !== cond.args.length) return null;
      return parts.length === 1 ? parts[0] : { and: parts };
    }
    case 'or': {
      const parts = cond.args.map(conditionToBoolExpr).filter((item): item is BoolExpr => item !== null);
      if (parts.length !== cond.args.length) return null;
      return parts.length === 1 ? parts[0] : { or: parts };
    }
    case 'not': {
      const inner = conditionToBoolExpr(cond.arg);
      return inner ? { not: inner } : null;
    }
    default:
      return null;
  }
}

function thenActionToBoolExpr(action: { kind: ConstraintKind; params: Record<string, unknown> }): BoolExpr | null {
  switch (action.kind) {
    case 'teacher_block_slot':
      if (
        typeof action.params.teacher !== 'string' ||
        typeof action.params.day !== 'string' ||
        typeof action.params.period !== 'number'
      ) {
        return null;
      }
      return {
        not: {
          teaches: {
            teacher: action.params.teacher,
            day: action.params.day,
            period: action.params.period,
          },
        },
      };
    case 'teacher_required_slot':
      if (
        typeof action.params.teacher !== 'string' ||
        typeof action.params.day !== 'string' ||
        typeof action.params.period !== 'number'
      ) {
        return null;
      }
      return {
        teaches: {
          teacher: action.params.teacher,
          day: action.params.day,
          period: action.params.period,
        },
      };
    case 'teacher_block_day':
      if (typeof action.params.teacher !== 'string' || typeof action.params.day !== 'string') return null;
      return {
        not: {
          teachesOnDay: {
            teacher: action.params.teacher,
            day: action.params.day,
          },
        },
      };
    case 'teacher_required_day':
      if (typeof action.params.teacher !== 'string' || typeof action.params.day !== 'string') return null;
      return {
        teachesOnDay: {
          teacher: action.params.teacher,
          day: action.params.day,
        },
      };
    default:
      return null;
  }
}

export function semanticConstraintToIRExpr(semantic: SemanticConstraint): BoolExpr | null {
  if (semantic.type !== 'if_then') return null;
  const ifCond = convertCondition(semantic.if);
  if (!ifCond) return null;
  const ifExpr = conditionToBoolExpr(ifCond);
  if (!ifExpr) return null;

  const thenActions = semantic.then
    .map(convertThenAction)
    .filter((item): item is { kind: ConstraintKind; params: Record<string, unknown> } => item !== null);
  if (thenActions.length !== semantic.then.length) return null;

  const thenExprs = thenActions
    .map(thenActionToBoolExpr)
    .filter((item): item is BoolExpr => item !== null);
  if (thenExprs.length !== thenActions.length) return null;

  const thenExpr = thenExprs.length === 1 ? thenExprs[0] : { and: thenExprs };
  return { implies: [ifExpr, thenExpr] };
}

function validateOptionalIRExpr(expr: BoolExpr, agentInput?: AgentInputPayload): boolean {
  const ir = {
    id: 'semantic_expr_check',
    severity: 'hard' as const,
    original: 'semantic',
    expr,
  };
  if (validateIR(ir).length > 0) return false;
  if (!agentInput) return true;
  return typeCheckIR(ir, agentInput).ok;
}

export function semanticConstraintToSpec(
  semantic: SemanticConstraint,
  options: ConvertOptions
): ConstraintSpec | null {
  const specs = semanticConstraintToSpecs(semantic, options);
  return specs[0] ?? null;
}

export function semanticConstraintToSpecs(
  semantic: SemanticConstraint,
  options: ConvertOptions
): ConstraintSpec[] {
  const severity = options.constraintType === 'required' ? 'hard' : 'soft';
  const idPrefix = options.idPrefix ?? 'ai_spec';

  if (semantic.type === 'all_of') {
    const nested = semantic.constraints.flatMap((item) => semanticConstraintToSpecs(item, options));
    return nested.length === semantic.constraints.length ? nested : [];
  }

  if (semantic.type !== 'if_then') return [];

  const ifCond = convertCondition(semantic.if);
  if (!ifCond) return [];

  const thenActions = semantic.then
    .map(convertThenAction)
    .filter((item): item is { kind: ConstraintKind; params: Record<string, unknown> } => item !== null);
  if (thenActions.length === 0 || thenActions.length !== semantic.then.length) return [];

  const params: Record<string, unknown> = {
    if: ifCond,
    then: thenActions,
  };

  const expr = semanticConstraintToIRExpr(semantic);
  if (expr && validateOptionalIRExpr(expr, options.agentInput)) {
    params.expr = expr;
  }

  return [
    {
      id: `${idPrefix}_0`,
      original: options.rawText,
      severity,
      kind: 'if_then',
      params,
      ...(options.constraintType === 'preferred' && options.weight !== undefined ? { weight: options.weight } : {}),
    },
  ];
}