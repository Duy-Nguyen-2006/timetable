/**
 * golden-eval-set-v2.ts — Phase 2.4
 *
 * Frozen regression cases with DUAL keys: expectedKind (built-in
 * compatibility) AND expectedExprShape (the canonical IR). This is
 * the second axis along which the parser will be flipped:
 *
 *   - Phase 2 ships the new IR-first parser alongside the legacy
 *     built-in parser. The shadow log (shadow-mode.ts) tracks
 *     divergence. The flip criteria in Phase 4 require that the
 *     golden set V2 pass on BOTH axes (kind AND IR shape).
 *
 * Each row also tracks:
 *   - divergenceMarker: which DirectionMarker applies (require / only /
 *     block / soft_prefer / ambiguous). The disambiguation table is
 *     the single source of truth.
 *   - isFrozen: true means changing the test (or the IR) requires
 *     manual sign-off from a senior. The original "Thủy phải có tiết
 *     4" case is frozen forever.
 *
 * The full set is the union of GOLDEN_EVAL_SET (kind-keyed) + the
 * cases below (dual-keyed). The CI test runs BOTH sets.
 */

import type { ConstraintKind } from './constraint-spec';
import type { BuiltInConstraintScope } from './constraint-registry';
import type { BoolExpr } from './constraint-ir';

export type ExprShape =
  // Phase 0.2 require-family atLeast
  | { shape: 'atLeastDaysTeaches'; teacher: string; period: number; minCount: number }
  | { shape: 'atLeastDaysClassBusy'; class: string; period: number; minCount: number }
  | { shape: 'atLeastDaysClassSubjectAt'; subject: string; period: number; minCount: number }
  // Block
  | { shape: 'notForallDaysTeaches'; teacher: string; period: number }
  | { shape: 'notForallDaysClassBusy'; class: string; period: number }
  // Allowed
  | { shape: 'forallDaysTeachesInPeriods'; teacher: string; periods: number[] }
  // max
  | { shape: 'forallDaysCompareCount'; entity: string; op: '<=' | '>='; rhs: number }
  // Ordering
  | { shape: 'gap'; min: number }
  | { shape: 'before' }
  | { shape: 'after' }
  // Session
  | { shape: 'sessionAtom'; session: string; teacher?: string; class?: string; subject?: string }
  // if_then
  | {
      shape: 'impliesIfThen';
      ifTeacher: string;
      ifDay: string;
      ifPeriod: number;
      thenTeacher: string;
      thenDay: string;
      thenPeriod: number;
    }
  // Custom / clarify
  | { shape: 'customDSL' }
  | { shape: 'clarify' };

export type GoldenCaseV2 = {
  id: string;
  text: string;
  expectedScope: BuiltInConstraintScope;
  expectedKind: ConstraintKind | 'ambiguous' | 'clarify' | 'custom_dsl';
  expectedParamKeys?: string[];
  expectedExprShape: ExprShape;
  severity: 'hard' | 'soft';
  requiresConfirmation?: boolean;
  /** Which disambiguation row applies (e.g. D001). Optional. */
  disambiguationRowId?: string;
  /** True means changing this case requires senior sign-off. */
  isFrozen: boolean;
  notes: string;
};

/**
 * Helper: build an atLeastDaysTeaches shape (the canonical require IR).
 */
function atLeastTeacherPeriod(teacher: string, period: number, minCount: number): ExprShape {
  return { shape: 'atLeastDaysTeaches', teacher, period, minCount };
}
function atLeastClassPeriod(className: string, period: number, minCount: number): ExprShape {
  return { shape: 'atLeastDaysClassBusy', class: className, period, minCount };
}
function atLeastSubjectPeriod(subject: string, period: number, minCount: number): ExprShape {
  return { shape: 'atLeastDaysClassSubjectAt', subject, period, minCount };
}
function blockTeacherPeriod(teacher: string, period: number): ExprShape {
  return { shape: 'notForallDaysTeaches', teacher, period };
}
function blockClassPeriod(className: string, period: number): ExprShape {
  return { shape: 'notForallDaysClassBusy', class: className, period };
}
function allowedTeacherPeriods(teacher: string, periods: number[]): ExprShape {
  return { shape: 'forallDaysTeachesInPeriods', teacher, periods };
}
function maxPerDay(entity: string, rhs: number): ExprShape {
  return { shape: 'forallDaysCompareCount', entity, op: '<=', rhs };
}
function minPerDay(entity: string, rhs: number): ExprShape {
  return { shape: 'forallDaysCompareCount', entity, op: '>=', rhs };
}

export const GOLDEN_EVAL_SET_V2: GoldenCaseV2[] = [
  // ─── FROZEN regression: the bug that started everything ──────────────────
  {
    id: 'G2-FROZEN-001',
    text: 'Cô Thủy phải có ít nhất 1 tiết 4 trong tuần',
    expectedScope: 'teacher',
    expectedKind: 'teacher_required_period',
    expectedParamKeys: ['teacher', 'period', 'minCount'],
    expectedExprShape: atLeastTeacherPeriod('Thủy', 4, 1),
    severity: 'hard',
    disambiguationRowId: 'D001',
    isFrozen: true,
    notes: 'The original silent-flip bug. MUST map to require family; MUST NOT be teacher_block_period or teacher_allowed_periods.',
  },
  {
    id: 'G2-FROZEN-002',
    text: 'Thủy phải có tiết 4',
    expectedScope: 'teacher',
    expectedKind: 'teacher_required_period',
    expectedParamKeys: ['teacher', 'period', 'minCount'],
    expectedExprShape: atLeastTeacherPeriod('Thủy', 4, 1),
    severity: 'hard',
    disambiguationRowId: 'D001',
    isFrozen: true,
    notes: 'Shorter form of the same intent. Same IR shape expected.',
  },
  // ─── FROZEN regression: chỉ dạy (only) ────────────────────────────────────
  {
    id: 'G2-FROZEN-003',
    text: 'Cô Thủy chỉ dạy tiết 4',
    expectedScope: 'teacher',
    expectedKind: 'teacher_allowed_periods',
    expectedParamKeys: ['teacher', 'periods'],
    expectedExprShape: allowedTeacherPeriods('Thủy', [4]),
    severity: 'hard',
    disambiguationRowId: 'D004',
    isFrozen: true,
    notes: 'only -> allowed_periods. NEVER require or block.',
  },
  // ─── FROZEN regression: không dạy (block) ────────────────────────────────
  {
    id: 'G2-FROZEN-004',
    text: 'Cô Thủy không dạy tiết 4',
    expectedScope: 'teacher',
    expectedKind: 'teacher_block_period',
    expectedParamKeys: ['teacher', 'period'],
    expectedExprShape: blockTeacherPeriod('Thủy', 4),
    severity: 'hard',
    isFrozen: true,
    notes: 'block -> block_period. NEVER require or allowed.',
  },
  // ─── Class require family (Phase 0.2) ────────────────────────────────────
  {
    id: 'G2-010',
    text: 'Lớp 6A phải có ít nhất 1 tiết 4 trong tuần',
    expectedScope: 'class',
    expectedKind: 'class_required_period',
    expectedParamKeys: ['class', 'period', 'minCount'],
    expectedExprShape: atLeastClassPeriod('6A', 4, 1),
    severity: 'hard',
    disambiguationRowId: 'D010',
    isFrozen: false,
    notes: 'Class-side require family.',
  },
  {
    id: 'G2-011',
    text: 'Lớp 6A không học tiết 4',
    expectedScope: 'class',
    expectedKind: 'class_block_period',
    expectedParamKeys: ['class', 'period'],
    expectedExprShape: blockClassPeriod('6A', 4),
    severity: 'hard',
    isFrozen: false,
    notes: 'Class-side block.',
  },
  // ─── Subject require family (Phase 0.2) ──────────────────────────────────
  {
    id: 'G2-020',
    text: 'Môn Toán phải có ít nhất 2 tiết 4 trong tuần',
    expectedScope: 'subject',
    expectedKind: 'subject_required_period',
    expectedParamKeys: ['subject', 'period', 'minCount'],
    expectedExprShape: atLeastSubjectPeriod('Toán', 4, 2),
    severity: 'hard',
    disambiguationRowId: 'D020',
    isFrozen: false,
    notes: 'Subject-side require family.',
  },
  // ─── Max / min kinds (existing semantics, new dual-key) ──────────────────
  {
    id: 'G2-030',
    text: 'Cô Sơn dạy tối đa 4 tiết mỗi ngày',
    expectedScope: 'teacher',
    expectedKind: 'teacher_max_per_day',
    expectedParamKeys: ['teacher', 'maxPerDay'],
    expectedExprShape: maxPerDay('Sơn', 4),
    severity: 'hard',
    isFrozen: false,
    notes: 'forall-days compare count <= 4',
  },
  {
    id: 'G2-031',
    text: 'Cô Sơn dạy ít nhất 2 tiết mỗi ngày',
    expectedScope: 'teacher',
    expectedKind: 'teacher_min_per_day',
    expectedParamKeys: ['teacher', 'minPerDay'],
    expectedExprShape: minPerDay('Sơn', 2),
    severity: 'hard',
    isFrozen: false,
    notes: 'forall-days compare count >= 2',
  },
  // ─── Session (Phase 1.1) ────────────────────────────────────────────────
  {
    id: 'G2-040',
    text: 'Môn Toán phải có ít nhất 2 tiết buổi sáng',
    expectedScope: 'subject',
    expectedKind: 'custom_dsl',
    expectedParamKeys: ['expr'],
    expectedExprShape: { shape: 'customDSL' },
    severity: 'hard',
    requiresConfirmation: true,
    isFrozen: false,
    notes: 'Session constraint — currently custom_dsl. Future Phase 3 will add a subject_session_required kind.',
  },
  // ─── Ambiguous / clarify ────────────────────────────────────────────────
  {
    id: 'G2-050',
    text: 'Cô Lan không dạy thứ 2',
    expectedScope: 'teacher',
    expectedKind: 'clarify',
    expectedExprShape: { shape: 'clarify' },
    severity: 'hard',
    isFrozen: false,
    notes: 'Lan not in teachers -> must clarify (entity not resolved).',
  },
  {
    id: 'G2-051',
    text: 'Cô Thủy',
    expectedScope: 'teacher',
    expectedKind: 'clarify',
    expectedExprShape: { shape: 'clarify' },
    severity: 'hard',
    isFrozen: false,
    notes: 'Just an entity, no constraint intent -> must clarify.',
  },
  // ─── if_then (two-teacher conditional) ───────────────────────────────────
  {
    id: 'G2-070',
    text: 'Nếu Sơn dạy thứ 2 tiết 1 thì Hương không dạy thứ 3 tiết 3',
    expectedScope: 'global',
    expectedKind: 'if_then',
    expectedParamKeys: ['if', 'then'],
    expectedExprShape: {
      shape: 'impliesIfThen',
      ifTeacher: 'Sơn',
      ifDay: 'monday',
      ifPeriod: 1,
      thenTeacher: 'Hương',
      thenDay: 'tuesday',
      thenPeriod: 3,
    },
    severity: 'hard',
    isFrozen: false,
    notes: 'Two-teacher if_then must stay in retriever top-k and convert to executable spec.',
  },
  // ─── Feedback loop (Phase 0.4) ──────────────────────────────────────────
  {
    id: 'G2-060',
    text: 'phải có ít nhất 1 tiết 4',
    expectedScope: 'teacher',
    expectedKind: 'teacher_required_period',
    expectedParamKeys: ['teacher', 'period', 'minCount'],
    expectedExprShape: atLeastTeacherPeriod('Thủy', 4, 1),
    severity: 'hard',
    isFrozen: false,
    notes: 'Feedback-only text from user. The previous attempt is in the request context. The new pipeline must integrate this with the raw text + previousAttempts.',
  },
];

/** Summary stats for the V2 set. */
export function summarizeGoldenSetV2(): {
  total: number;
  frozen: number;
  byKind: Record<string, number>;
  byShape: Record<string, number>;
} {
  const byKind: Record<string, number> = {};
  const byShape: Record<string, number> = {};
  let frozen = 0;
  for (const c of GOLDEN_EVAL_SET_V2) {
    byKind[c.expectedKind] = (byKind[c.expectedKind] ?? 0) + 1;
    byShape[c.expectedExprShape.shape] = (byShape[c.expectedExprShape.shape] ?? 0) + 1;
    if (c.isFrozen) frozen += 1;
  }
  return { total: GOLDEN_EVAL_SET_V2.length, frozen, byKind, byShape };
}
