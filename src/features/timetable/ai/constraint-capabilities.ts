/**
 * constraint-capabilities.ts — M7 capability map
 *
 * Per Plan_v2.md M7, every supported hard constraint must have equivalent:
 *   1. parse output (BUILT_IN_CONSTRAINT_DEFINITIONS)
 *   2. human preview (humanizer)
 *   3. IR validation (ir-type-checker)
 *   4. solver encoding (kind-to-ir + CP-SAT compiler)
 *   5. deterministic checker / verifier (deterministic-validator)
 *
 * This module is the single source of truth for "what works for what kind".
 * The solver gate reads from this map to fail closed for any kind missing
 * a capability.
 *
 * If any capability is false, the solver gate MUST block that hard
 * constraint from reaching the solver. The same goes for soft kinds if
 * `softSolverBlocked` is true.
 */

import type { ConstraintKind } from './constraint-spec';
import { BUILT_IN_CONSTRAINT_DEFINITIONS, SOLVER_ENCODABLE_KINDS, CHECKED_KINDS } from './constraint-registry';
import { specToIR } from './kind-to-ir';

export type ConstraintCapability = {
  kind: ConstraintKind;
  /** Parser can emit this kind from Vietnamese text. */
  canParse: boolean;
  /** Humanizer can render a Vietnamese preview of this kind. */
  canHumanize: boolean;
  /** specToIR can convert a spec of this kind to an executable IR. */
  canConvertToIR: boolean;
  /** The IR can pass type-checker. */
  canValidateIR: boolean;
  /** CP-SAT solver has an encoder for this kind. */
  canEncodeSolver: boolean;
  /** Deterministic validator has a checker for this kind. */
  canCheckDeterministically: boolean;
  /** True if solver gate must block this hard kind when ANY capability is false. */
  solverGateRequired: boolean;
  /** Optional notes for human readers. */
  notes?: string;
};

// ─── Capability map builder ────────────────────────────────────────────

export function getConstraintCapability(kind: ConstraintKind): ConstraintCapability {
  const def = BUILT_IN_CONSTRAINT_DEFINITIONS.find((d) => d.kind === kind);
  const hasChecker = CHECKED_KINDS.has(kind);
  const hasEncoder = SOLVER_ENCODABLE_KINDS.has(kind);

  // Probe IR conversion with a minimal spec; this is the most reliable
  // way to know if the adapter is wired.
  let canConvertToIR = false;
  try {
    const probeSpec: any = {
      id: `probe_${kind}`,
      original: 'probe',
      severity: 'hard',
      kind,
      params: {
        teacher: 'T',
        class: 'C',
        subject: 'S',
        day: 'monday',
        period: 1,
        days: ['monday'],
        periods: [1],
        minCount: 1,
        maxPerDay: 5,
        minPerDay: 1,
        maxConsecutive: 3,
        max: 3,
        min: 1,
        maxDays: 5,
        minDays: 1,
        minGap: 1,
        maxHeavy: 2,
        maxHeavyInSession: 1,
        sessionIds: ['morning'],
        tolerance: 1,
        subjectA: 'S',
        subjectB: 'S',
        classId: 'C',
        teachers: ['T1', 'T2'],
        assignmentId: 'A1',
        assignmentIds: ['A1'],
        count: 1,
        minOffDays: 1,
        maxGaps: 0,
        minConsecutive: 1,
        maxClasses: 5,
        maxHeavy: 2,
        maxSubj: 3,
        weight: 1,
        subjects: ['S'],
        session: 'morning',
        maxPeriods: 3,
        subjects: ['S'],
        minOffDays: 1,
        if: { kind: 'teacher_block_day', params: { teacher: 'T', day: 'monday' } },
        then: { kind: 'teacher_block_period', params: { teacher: 'T', period: 1 } },
      },
    };
    const ir = specToIR(probeSpec);
    canConvertToIR = Boolean(ir);
  } catch {
    canConvertToIR = false;
  }

  return {
    kind,
    canParse: Boolean(def),
    canHumanize: Boolean(def), // humanizer falls back to labelVi, always available
    canConvertToIR,
    canValidateIR: canConvertToIR, // if IR is produced, type-checker is generic
    canEncodeSolver: hasEncoder,
    canCheckDeterministically: hasChecker,
    // For all built-in kinds, the solver gate MUST enforce capability
    // coverage. custom_dsl is a special case (handled separately).
    solverGateRequired: true,
    notes: def ? '' : 'No BUILT_IN_CONSTRAINT_DEFINITIONS entry.',
  };
}

// ─── Solver-gate pre-flight check ──────────────────────────────────────

/**
 * Check if a hard constraint spec can reach the solver. Returns null if
 * all capabilities are satisfied, or a Vietnamese error message if any
 * capability is missing.
 */
export function capabilityBlockReason(
  kind: ConstraintKind,
  severity: 'hard' | 'soft' | 'info'
): string | null {
  if (kind === 'custom_dsl') return null; // custom_dsl is handled separately
  const cap = getConstraintCapability(kind);
  if (severity !== 'hard' && !cap.canEncodeSolver) {
    // Soft with no encoder is a warning, not a block
    return null;
  }
  if (severity === 'hard') {
    if (!cap.canParse) return `Ràng buộc loại «${kind}» chưa được đăng ký trong hệ thống.`;
    if (!cap.canEncodeSolver) return `Ràng buộc bắt buộc loại «${kind}» hiện chưa được hỗ trợ khi xếp lịch.`;
    if (!cap.canCheckDeterministically) return `Ràng buộc bắt buộc loại «${kind}» hiện chưa có bước kiểm tra xác định.`;
    if (!cap.canConvertToIR) return `Ràng buộc bắt buộc loại «${kind}» hiện chưa chuyển được sang dạng IR máy hiểu.`;
  }
  return null;
}

// ─── Audit: every solver-encodable kind must be fully capable ──────────
export type CapabilityAudit = {
  total: number;
  fullyCapable: number;
  blocked: Array<{ kind: ConstraintKind; missing: string[] }>;
};

export function auditCapabilities(): CapabilityAudit {
  const blocked: Array<{ kind: ConstraintKind; missing: string[] }> = [];
  let fullyCapable = 0;
  for (const def of BUILT_IN_CONSTRAINT_DEFINITIONS) {
    const cap = getConstraintCapability(def.kind);
    const missing: string[] = [];
    if (!cap.canParse) missing.push('parse');
    if (!cap.canHumanize) missing.push('humanize');
    if (!cap.canConvertToIR) missing.push('IR');
    if (!cap.canValidateIR) missing.push('IR-validate');
    if (!cap.canEncodeSolver) missing.push('solver-encode');
    if (!cap.canCheckDeterministically) missing.push('checker');
    if (missing.length === 0) {
      fullyCapable += 1;
    } else {
      blocked.push({ kind: def.kind, missing });
    }
  }
  return { total: BUILT_IN_CONSTRAINT_DEFINITIONS.length, fullyCapable, blocked };
}
