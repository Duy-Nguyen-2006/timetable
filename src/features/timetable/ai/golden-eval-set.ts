/**
 * Golden Evaluation Set — Parse Accuracy Layer 7
 *
 * A frozen set of >=50 Vietnamese constraint sentences with expected
 * (kind + params) labels. Used as a CI gate to detect regressions
 * when we change the parser/prompt/retriever.
 *
 * Each test case is a single sentence + the expected outcome:
 *   - expectedKind: the kind the parser should pick
 *   - expectedScope: scope (teacher/subject/class/...)
 *   - expectedParamKeys: keys that MUST appear in parsed params
 *   - severity: hard/soft expected
 *   - notes: human explanation
 *
 * Run: npx tsx --test src/features/timetable/ai/golden-eval-set.test.ts
 *
 * The eval also tracks per-case failures so we can add new synonyms /
 * few-shots whenever a case fails.
 */

import type { ConstraintKind } from './constraint-spec';
import type { BuiltInConstraintScope } from './constraint-registry';

export type GoldenCase = {
  /** Frozen ID; never change. */
  id: string;
  /** User input (Vietnamese). */
  text: string;
  /** Expected scope. */
  expectedScope: BuiltInConstraintScope;
  /** Expected kind. Use 'custom_dsl' or 'ambiguous' or 'clarify' for non-builtin outcomes. */
  expectedKind: ConstraintKind | 'ambiguous' | 'clarify' | 'custom_dsl';
  /** Param keys that MUST be present (only when expectedKind is a real kind). */
  expectedParamKeys?: string[];
  /** Severity expected. */
  severity: 'hard' | 'soft';
  /** Whether user confirmation should be required. */
  requiresConfirmation?: boolean;
  /** Notes for future maintainers. */
  notes: string;
};

export const GOLDEN_EVAL_SET: GoldenCase[] = [
  // ─── TEACHER constraints (15) ──────────────────────────────────────────────
  {
    id: 'G001',
    text: 'Giáo viên Sơn không dạy thứ 2',
    expectedScope: 'teacher',
    expectedKind: 'teacher_block_day',
    expectedParamKeys: ['teacher', 'day'],
    severity: 'hard',
    notes: 'canonical teacher block day',
  },
  {
    id: 'G002',
    text: 'Thầy Sơn không dạy tiết 1',
    expectedScope: 'teacher',
    expectedKind: 'teacher_block_period',
    expectedParamKeys: ['teacher', 'period'],
    severity: 'hard',
    notes: 'canonical teacher block period',
  },
  {
    id: 'G003',
    text: 'Cô Thúy nghỉ thứ 5',
    expectedScope: 'teacher',
    expectedKind: 'teacher_block_day',
    expectedParamKeys: ['teacher', 'day'],
    severity: 'hard',
    notes: 'synonym nghỉ → block day',
  },
  {
    id: 'G004',
    text: 'Cô Hương đi muộn tiết đầu',
    expectedScope: 'teacher',
    expectedKind: 'teacher_block_period',
    expectedParamKeys: ['teacher', 'period'],
    severity: 'hard',
    notes: 'synonym đi muộn → block period 1',
  },
  {
    id: 'G005',
    text: 'Giáo viên Sơn dạy tối đa 4 tiết mỗi ngày',
    expectedScope: 'teacher',
    expectedKind: 'teacher_max_per_day',
    expectedParamKeys: ['teacher', 'maxPerDay'],
    severity: 'hard',
    notes: 'canonical teacher max per day',
  },
  {
    id: 'G006',
    text: 'Sơn không quá 3 tiết liên tiếp',
    expectedScope: 'teacher',
    expectedKind: 'teacher_max_consecutive',
    expectedParamKeys: ['teacher', 'maxConsecutive'],
    severity: 'hard',
    notes: 'teacher max consecutive',
  },
  {
    id: 'G007',
    text: 'Thầy Sơn chỉ dạy Thứ 3 và Thứ 5',
    expectedScope: 'teacher',
    expectedKind: 'teacher_allowed_days',
    expectedParamKeys: ['teacher', 'days'],
    severity: 'hard',
    notes: 'teacher allowed days',
  },
  {
    id: 'G008',
    text: 'Cô Thúy chỉ dạy các tiết 2, 3, 4',
    expectedScope: 'teacher',
    expectedKind: 'teacher_allowed_periods',
    expectedParamKeys: ['teacher', 'periods'],
    severity: 'hard',
    notes: 'teacher allowed periods',
  },
  {
    id: 'G009',
    text: 'Giáo viên Sơn dạy ít nhất 2 tiết mỗi ngày',
    expectedScope: 'teacher',
    expectedKind: 'teacher_min_per_day',
    expectedParamKeys: ['teacher', 'minPerDay'],
    severity: 'hard',
    notes: 'teacher min per day',
  },
  {
    id: 'G010',
    text: 'Thầy Sơn không có tiết trống giữa các tiết dạy',
    expectedScope: 'teacher',
    expectedKind: 'teacher_no_gaps',
    expectedParamKeys: ['teacher'],
    severity: 'hard',
    notes: 'teacher no gaps',
  },
  {
    id: 'G011',
    text: 'Hai giáo viên Sơn và Thúy không dạy cùng một ngày',
    expectedScope: 'teacher',
    expectedKind: 'teacher_pair_not_same_day',
    expectedParamKeys: ['teachers'],
    severity: 'hard',
    notes: 'pair not same day',
  },
  {
    id: 'G012',
    text: 'Hai giáo viên Sơn và Thúy không dạy cùng một tiết',
    expectedScope: 'teacher',
    expectedKind: 'teacher_pair_not_same_slot',
    expectedParamKeys: ['teachers'],
    severity: 'hard',
    notes: 'pair not same slot',
  },
  {
    id: 'G013',
    text: 'Cô Hương dạy tối đa 4 ngày/tuần',
    expectedScope: 'teacher',
    expectedKind: 'teacher_max_working_days',
    expectedParamKeys: ['teacher', 'maxDays'],
    severity: 'hard',
    notes: 'teacher max working days',
  },
  {
    id: 'G014',
    text: 'Cô Dung dạy buổi sáng tối đa 3 tiết',
    expectedScope: 'assignment',
    expectedKind: 'session_limit',
    expectedParamKeys: ['teacher', 'maxPeriods', 'session'],
    severity: 'hard',
    notes: 'session limit morning',
  },
  {
    id: 'G015',
    text: 'Dung không dạy quá 3 tiết cho 1 lớp trong cùng 1 ngày',
    expectedScope: 'teacher',
    expectedKind: 'custom_dsl',
    severity: 'hard',
    requiresConfirmation: true,
    notes: 'Dung case: per-class per-day — no built-in, expect custom IR or clarify',
  },

  // ─── SUBJECT constraints (10) ──────────────────────────────────────────────
  {
    id: 'G016',
    text: 'Môn Toán chỉ được xếp vào tiết 1 và 2',
    expectedScope: 'subject',
    expectedKind: 'subject_pin_period',
    expectedParamKeys: ['subject', 'periods'],
    severity: 'hard',
    notes: 'subject pin period',
  },
  {
    id: 'G017',
    text: 'Ưu tiên xếp môn Văn vào các tiết 3, 4',
    expectedScope: 'subject',
    expectedKind: 'subject_preferred_periods',
    expectedParamKeys: ['subject', 'periods'],
    severity: 'soft',
    notes: 'subject preferred periods',
  },
  {
    id: 'G018',
    text: 'Môn Văn không xếp vào tiết cuối cùng của ngày',
    expectedScope: 'subject',
    expectedKind: 'subject_not_last_period',
    expectedParamKeys: ['subject'],
    severity: 'hard',
    notes: 'subject not last period',
  },
  {
    id: 'G019',
    text: 'Môn Văn không được 3 tiết liên tiếp',
    expectedScope: 'subject',
    expectedKind: 'subject_max_consecutive',
    expectedParamKeys: ['subject', 'max'],
    severity: 'hard',
    notes: 'subject max consecutive',
  },
  {
    id: 'G020',
    text: 'Môn Văn nên có các cụm 2 tiết học liên tiếp trong tuần',
    expectedScope: 'subject',
    expectedKind: 'subject_consecutive',
    expectedParamKeys: ['subject'],
    severity: 'soft',
    notes: 'subject consecutive (positive)',
  },
  {
    id: 'G021',
    text: 'Môn Toán chỉ được xếp vào Thứ 3 và Thứ 5',
    expectedScope: 'subject',
    expectedKind: 'subject_allowed_days',
    expectedParamKeys: ['subject', 'days'],
    severity: 'hard',
    notes: 'subject allowed days',
  },
  {
    id: 'G022',
    text: 'Môn Văn không được xếp vào tiết 5',
    expectedScope: 'subject',
    expectedKind: 'subject_block_period',
    expectedParamKeys: ['subject', 'periods'],
    severity: 'hard',
    notes: 'subject block period',
  },
  {
    id: 'G023',
    text: 'Môn Văn không được xếp vào Thứ 2',
    expectedScope: 'subject',
    expectedKind: 'subject_block_days',
    expectedParamKeys: ['subject', 'days'],
    severity: 'hard',
    notes: 'subject block days',
  },
  {
    id: 'G024',
    text: 'Môn Toán tối đa 2 tiết/ngày',
    expectedScope: 'subject',
    expectedKind: 'subject_daily_max_periods',
    expectedParamKeys: ['subject', 'max'],
    severity: 'hard',
    notes: 'subject daily max',
  },
  {
    id: 'G025',
    text: 'Môn Toán cách nhau ít nhất 2 ngày',
    expectedScope: 'subject',
    expectedKind: 'subject_min_gap_days',
    expectedParamKeys: ['subject', 'minGap'],
    severity: 'hard',
    notes: 'subject min gap days',
  },

  // ─── CLASS constraints (8) ────────────────────────────────────────────────
  {
    id: 'G026',
    text: 'Lớp 6A không học vào Thứ 2',
    expectedScope: 'class',
    expectedKind: 'class_block_day',
    expectedParamKeys: ['class', 'day'],
    severity: 'hard',
    notes: 'class block day',
  },
  {
    id: 'G027',
    text: 'Lớp 6A không học tiết 5',
    expectedScope: 'class',
    expectedKind: 'class_block_period',
    expectedParamKeys: ['class', 'period'],
    severity: 'hard',
    notes: 'class block period',
  },
  {
    id: 'G028',
    text: 'Lớp 6A không học Thứ 2 tiết 1',
    expectedScope: 'class',
    expectedKind: 'class_block_slot',
    expectedParamKeys: ['class', 'day', 'period'],
    severity: 'hard',
    notes: 'class block slot',
  },
  {
    id: 'G029',
    text: 'Lớp 6A học tối đa 5 tiết mỗi ngày',
    expectedScope: 'class',
    expectedKind: 'class_max_per_day',
    expectedParamKeys: ['class', 'max'],
    severity: 'hard',
    notes: 'class max per day',
  },
  {
    id: 'G030',
    text: 'Lớp 6A học ít nhất 3 tiết mỗi ngày',
    expectedScope: 'class',
    expectedKind: 'class_min_per_day',
    expectedParamKeys: ['class', 'min'],
    severity: 'hard',
    notes: 'class min per day',
  },
  {
    id: 'G031',
    text: 'Lớp 6A không có tiết trống giữa các tiết học',
    expectedScope: 'class',
    expectedKind: 'class_no_gaps',
    expectedParamKeys: ['class'],
    severity: 'hard',
    notes: 'class no gaps',
  },
  {
    id: 'G032',
    text: 'Lớp 6A tối đa 3 tiết liên tiếp',
    expectedScope: 'class',
    expectedKind: 'class_max_consecutive',
    expectedParamKeys: ['class', 'maxConsecutive'],
    severity: 'hard',
    notes: 'class max consecutive',
  },
  {
    id: 'G033',
    text: 'Lớp 6A chỉ học vào Thứ 3 và Thứ 5',
    expectedScope: 'class',
    expectedKind: 'class_allowed_days',
    expectedParamKeys: ['class', 'days'],
    severity: 'hard',
    notes: 'class allowed days',
  },

  // ─── IF_THEN / PAIR (5) ───────────────────────────────────────────────────
  {
    id: 'G034',
    text: 'Nếu cô Thúy dạy thứ 4 tiết 1 thì cô Hạnh không dạy thứ 5 tiết 2',
    expectedScope: 'global',
    expectedKind: 'if_then',
    expectedParamKeys: ['if', 'then'],
    severity: 'hard',
    notes: 'canonical if_then',
  },
  {
    id: 'G035',
    text: 'Nếu Hiếu dạy thứ 2 thì Hương không dạy thứ 3',
    expectedScope: 'global',
    expectedKind: 'if_then',
    expectedParamKeys: ['if', 'then'],
    severity: 'hard',
    notes: 'simple if_then',
  },
  {
    id: 'G036',
    text: 'Toán 6A và Văn 6A không được trùng tiết',
    expectedScope: 'assignment',
    expectedKind: 'pair_not_same_slot',
    expectedParamKeys: ['assignmentIds'],
    severity: 'hard',
    notes: 'pair not same slot',
  },
  {
    id: 'G037',
    text: 'Sinh hoạt 6A và Sinh hoạt 6B phải cùng tiết',
    expectedScope: 'assignment',
    expectedKind: 'pair_same_slot',
    expectedParamKeys: ['assignmentIds'],
    severity: 'hard',
    notes: 'pair same slot',
  },
  {
    id: 'G038',
    text: 'Trong nhóm phân công này, không được có 2 phân công trùng slot',
    expectedScope: 'assignment',
    expectedKind: 'mutual_exclusion',
    expectedParamKeys: ['assignmentIds'],
    severity: 'hard',
    notes: 'mutual exclusion',
  },

  // ─── AMBIGUOUS / CLARIFY (3) ──────────────────────────────────────────────
  {
    id: 'G039',
    text: 'Thầy ấy không dạy thứ 2',
    expectedScope: 'teacher',
    expectedKind: 'clarify',
    severity: 'hard',
    notes: 'vague "thầy ấy" → must clarify',
  },
  {
    id: 'G040',
    text: 'Cô Lan không dạy thứ 2',
    expectedScope: 'teacher',
    expectedKind: 'clarify',
    severity: 'hard',
    notes: '"Lan" not in teachers → must clarify',
  },
  {
    id: 'G041',
    text: 'Nếu Hiếu và Thúy dạy cùng ngày thì 1 người không được dạy tiết 4',
    expectedScope: 'global',
    expectedKind: 'clarify',
    severity: 'hard',
    notes: 'ambiguous "1 người" — needs clarification',
  },

  // ─── ASSIGNMENT / SPECIFIC (5) ────────────────────────────────────────────
  {
    id: 'G042',
    text: 'Phân công Sơn dạy Toán 6A đúng 3 tiết/tuần',
    expectedScope: 'assignment',
    expectedKind: 'weekly_periods_exact',
    expectedParamKeys: ['assignmentId', 'count'],
    severity: 'hard',
    notes: 'weekly periods exact',
  },
  {
    id: 'G043',
    text: 'Phân công Sơn dạy Toán 6A cụm 2 tiết liên tiếp',
    expectedScope: 'assignment',
    expectedKind: 'assignment_consecutive',
    expectedParamKeys: ['assignmentId', 'length'],
    severity: 'soft',
    notes: 'assignment consecutive',
  },
  {
    id: 'G044',
    text: 'Phân công Sơn dạy Toán 6A tối đa 1 tiết/ngày',
    expectedScope: 'assignment',
    expectedKind: 'assignment_max_per_day',
    expectedParamKeys: ['assignmentId', 'max'],
    severity: 'hard',
    notes: 'assignment max per day',
  },
  {
    id: 'G045',
    text: 'Chào cờ cố định: Thứ 2, tiết 1',
    expectedScope: 'global',
    expectedKind: 'subject_flag_ceremony_slot',
    expectedParamKeys: ['day', 'period'],
    severity: 'hard',
    notes: 'flag ceremony slot',
  },
  {
    id: 'G046',
    text: 'Cân bằng tải giáo viên toàn trường (dung sai 1)',
    expectedScope: 'global',
    expectedKind: 'global_teacher_utilization_balance',
    expectedParamKeys: ['tolerance'],
    severity: 'soft',
    notes: 'global teacher balance',
  },

  // ─── ADDITIONAL CASES (4) ────────────────────────────────────────────────
  {
    id: 'G047',
    text: 'Lớp 6A: mỗi ngày tối đa 2 môn nặng',
    expectedScope: 'class',
    expectedKind: 'class_max_heavy_subjects_per_day',
    expectedParamKeys: ['maxHeavy'],
    severity: 'hard',
    notes: 'class max heavy subjects',
  },
  {
    id: 'G048',
    text: 'Lớp 6A phải có tiết 1 trong mỗi ngày có học',
    expectedScope: 'class',
    expectedKind: 'class_first_period_required',
    expectedParamKeys: ['class'],
    severity: 'hard',
    notes: 'class first period required',
  },
  {
    id: 'G049',
    text: 'Môn Toán được phân bổ đều trong tuần',
    expectedScope: 'subject',
    expectedKind: 'subject_spread_evenly',
    expectedParamKeys: ['subject'],
    severity: 'soft',
    notes: 'subject spread evenly',
  },
  {
    id: 'G050',
    text: 'Môn Toán phải được rải ít nhất 3 ngày',
    expectedScope: 'subject',
    expectedKind: 'subject_min_days',
    expectedParamKeys: ['subject', 'minDays'],
    severity: 'hard',
    notes: 'subject min days',
  },
  // Edge case: complex custom (Dung-style)
  {
    id: 'G051',
    text: 'Sơn dạy tối đa 2 môn cho mỗi lớp trong 1 ngày',
    expectedScope: 'teacher',
    expectedKind: 'custom_dsl',
    severity: 'hard',
    requiresConfirmation: true,
    notes: 'per-class per-day teaching — no built-in, expect custom IR',
  },
  // Edge: typo / informal
  {
    id: 'G052',
    text: 'Cô Thúy hay đi muộn tiết đầu',
    expectedScope: 'teacher',
    expectedKind: 'teacher_block_period',
    expectedParamKeys: ['teacher', 'period'],
    severity: 'hard',
    notes: 'informal "đi muộn" → period 1',
  },
  // Edge: pair teacher
  {
    id: 'G053',
    text: 'Hai giáo viên Sơn và Thúy phải cùng dạy Thứ 3',
    expectedScope: 'teacher',
    expectedKind: 'teacher_pair_required_same_day',
    expectedParamKeys: ['teachers', 'day'],
    severity: 'hard',
    notes: 'pair required same day',
  },
  // Edge: subject group
  {
    id: 'G054',
    text: 'Mỗi lớp không được có quá 2 môn KHTN trong cùng 1 ngày',
    expectedScope: 'subject',
    expectedKind: 'subject_group_daily_limit',
    expectedParamKeys: ['max'],
    severity: 'hard',
    notes: 'subject group daily limit',
  },
  // Edge: ambiguous teacher
  {
    id: 'G055',
    text: 'Cả lớp không học thứ 2',
    expectedScope: 'class',
    expectedKind: 'class_block_day',
    expectedParamKeys: ['day'],
    severity: 'hard',
    notes: '"cả lớp" → all classes — may need clarify or __all__ scope',
  },
];

/** Summary stats. */
export function summarizeGoldenSet(): { total: number; byKind: Record<string, number>; byScope: Record<string, number> } {
  const byKind: Record<string, number> = {};
  const byScope: Record<string, number> = {};
  for (const c of GOLDEN_EVAL_SET) {
    byKind[c.expectedKind] = (byKind[c.expectedKind] ?? 0) + 1;
    byScope[c.expectedScope] = (byScope[c.expectedScope] ?? 0) + 1;
  }
  return { total: GOLDEN_EVAL_SET.length, byKind, byScope };
}
