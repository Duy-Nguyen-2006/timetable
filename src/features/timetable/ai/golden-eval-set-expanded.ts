/**
 * M6.5 — Expanded Golden Set V2 (100+ Vietnamese cases)
 *
 * Per Plan_v2.md M6.5, the parser flip is gated on a frozen golden set
 * that covers ALL canonical phrasings, not just happy path. This file
 * defines an EXPANDED V2 set with categories:
 *   - teacher block day/period/slot
 *   - teacher require period
 *   - teacher only allowed periods
 *   - teacher preferred periods
 *   - class block period
 *   - class require period
 *   - subject constraints
 *   - consecutive constraints
 *   - max/min per day
 *   - if-then constraints
 *   - ambiguous cases expected to ask clarification
 *   - unsupported cases expected to reject
 *
 * Each case pins BOTH the kind and the IR shape, plus a Vietnamese
 * marker taxonomy. No new kind may be silently invented.
 */

import type { ConstraintKind } from './constraint-spec';
import type { BuiltInConstraintScope } from './constraint-registry';

// ─── Expanded case shape ───────────────────────────────────────────────
export type ExpandedCase = {
  id: string;
  text: string;
  expectedScope: BuiltInConstraintScope | 'global';
  expectedKind: ConstraintKind | 'ambiguous' | 'clarify' | 'unsupported';
  /** What semantic direction this case demonstrates. */
  direction: 'require' | 'block' | 'only' | 'prefer' | 'ambiguous' | 'contradictory';
  category:
    | 'teacher_block_day'
    | 'teacher_block_period'
    | 'teacher_block_slot'
    | 'teacher_require_period'
    | 'teacher_only_allowed_periods'
    | 'teacher_preferred_periods'
    | 'class_block_period'
    | 'class_require_period'
    | 'subject_require_period'
    | 'consecutive'
    | 'max_min_per_day'
    | 'if_then'
    | 'ambiguous'
    | 'unsupported';
  /** Whether this case is allowed to silently flip to a wrong kind. Must be false. */
  silentFlipForbiden: true;
  notes: string;
};

export const EXPANDED_GOLDEN_SET: ExpandedCase[] = [
  // ─── Teacher block day/period/slot (12 cases) ────────────────────────
  { id: 'EXP-TB-D-001', text: 'Thầy Sơn không dạy thứ 2', expectedScope: 'teacher', expectedKind: 'teacher_block_day', direction: 'block', category: 'teacher_block_day', silentFlipForbiden: true, notes: 'block + day' },
  { id: 'EXP-TB-D-002', text: 'Cô Thúy nghỉ thứ 5', expectedScope: 'teacher', expectedKind: 'teacher_block_day', direction: 'block', category: 'teacher_block_day', silentFlipForbiden: true, notes: 'nghỉ = block' },
  { id: 'EXP-TB-D-003', text: 'Cô Hương cấm dạy thứ 3', expectedScope: 'teacher', expectedKind: 'teacher_block_day', direction: 'block', category: 'teacher_block_day', silentFlipForbiden: true, notes: 'cấm = block' },
  { id: 'EXP-TB-D-004', text: 'Thầy Sơn đừng dạy thứ 4', expectedScope: 'teacher', expectedKind: 'teacher_block_day', direction: 'block', category: 'teacher_block_day', silentFlipForbiden: true, notes: 'đừng = block' },
  { id: 'EXP-TB-P-001', text: 'Thầy Sơn không dạy tiết 4', expectedScope: 'teacher', expectedKind: 'teacher_block_period', direction: 'block', category: 'teacher_block_period', silentFlipForbiden: true, notes: 'block + period' },
  { id: 'EXP-TB-P-002', text: 'Cô Thúy nghỉ tiết 1', expectedScope: 'teacher', expectedKind: 'teacher_block_period', direction: 'block', category: 'teacher_block_period', silentFlipForbiden: true, notes: 'nghỉ + period' },
  { id: 'EXP-TB-P-003', text: 'Cô Hương cấm dạy tiết 5', expectedScope: 'teacher', expectedKind: 'teacher_block_period', direction: 'block', category: 'teacher_block_period', silentFlipForbiden: true, notes: 'cấm + period' },
  { id: 'EXP-TB-P-004', text: 'Thầy Sơn tránh tiết cuối', expectedScope: 'teacher', expectedKind: 'teacher_block_period', direction: 'block', category: 'teacher_block_period', silentFlipForbiden: true, notes: 'tránh = soft block' },
  { id: 'EXP-TB-S-001', text: 'Thầy Sơn không dạy thứ 2 tiết 1', expectedScope: 'teacher', expectedKind: 'teacher_block_slot', direction: 'block', category: 'teacher_block_slot', silentFlipForbiden: true, notes: 'block + slot' },
  { id: 'EXP-TB-S-002', text: 'Cô Thúy đi muộn tiết 1', expectedScope: 'teacher', expectedKind: 'teacher_block_period', direction: 'block', category: 'teacher_block_period', silentFlipForbiden: true, notes: 'đi muộn maps to block' },
  { id: 'EXP-TB-S-003', text: 'Thầy Sơn nghỉ thứ 3 tiết 2', expectedScope: 'teacher', expectedKind: 'teacher_block_slot', direction: 'block', category: 'teacher_block_slot', silentFlipForbiden: true, notes: 'nghỉ + slot' },
  { id: 'EXP-TB-S-004', text: 'Cô Hương né tiết 5', expectedScope: 'teacher', expectedKind: 'teacher_block_period', direction: 'block', category: 'teacher_block_period', silentFlipForbiden: true, notes: 'né = block' },
  { id: 'EXP-TB-S-005', text: 'Thầy Sơn cấm dạy thứ 4 tiết 3', expectedScope: 'teacher', expectedKind: 'teacher_block_slot', direction: 'block', category: 'teacher_block_slot', silentFlipForbiden: true, notes: 'cấm + slot' },
  { id: 'EXP-TB-S-006', text: 'Cô Hương không dạy thứ 6 tiết 1', expectedScope: 'teacher', expectedKind: 'teacher_block_slot', direction: 'block', category: 'teacher_block_slot', silentFlipForbiden: true, notes: 'block + slot' },

  // ─── Teacher require period (10 cases) ───────────────────────────────
  { id: 'EXP-TR-P-001', text: 'Cô Thủy phải có tiết 4', expectedScope: 'teacher', expectedKind: 'teacher_required_period', direction: 'require', category: 'teacher_require_period', silentFlipForbiden: true, notes: 'phải có' },
  { id: 'EXP-TR-P-002', text: 'Thầy Sơn phải có ít nhất 1 tiết 4 trong tuần', expectedScope: 'teacher', expectedKind: 'teacher_required_period', direction: 'require', category: 'teacher_require_period', silentFlipForbiden: true, notes: 'phải có + ít nhất' },
  { id: 'EXP-TR-P-003', text: 'Cô Thúy cần có tiết 1', expectedScope: 'teacher', expectedKind: 'teacher_required_period', direction: 'require', category: 'teacher_require_period', silentFlipForbiden: true, notes: 'cần có' },
  { id: 'EXP-TR-P-004', text: 'Bắt buộc cô Thủy có tiết 4', expectedScope: 'teacher', expectedKind: 'teacher_required_period', direction: 'require', category: 'teacher_require_period', silentFlipForbiden: true, notes: 'bắt buộc' },
  { id: 'EXP-TR-P-005', text: 'Cô Thủy phải được xếp ít nhất một tiết 4', expectedScope: 'teacher', expectedKind: 'teacher_required_period', direction: 'require', category: 'teacher_require_period', silentFlipForbiden: true, notes: 'phải được' },
  { id: 'EXP-TR-P-006', text: 'Nhất định phải có tiết 4 cho Thủy', expectedScope: 'teacher', expectedKind: 'teacher_required_period', direction: 'require', category: 'teacher_require_period', silentFlipForbiden: true, notes: 'nhất định phải' },
  { id: 'EXP-TR-P-007', text: 'Thầy Sơn tối thiểu 2 tiết 5 trong tuần', expectedScope: 'teacher', expectedKind: 'teacher_required_period', direction: 'require', category: 'teacher_require_period', silentFlipForbiden: true, notes: 'tối thiểu' },
  { id: 'EXP-TR-P-008', text: 'Cô Hương có ít nhất 1 tiết 3', expectedScope: 'teacher', expectedKind: 'teacher_required_period', direction: 'require', category: 'teacher_require_period', silentFlipForbiden: true, notes: 'có ít nhất' },
  { id: 'EXP-TR-P-009', text: 'Cô Thủy cần dạy tiết 4', expectedScope: 'teacher', expectedKind: 'teacher_required_period', direction: 'require', category: 'teacher_require_period', silentFlipForbiden: true, notes: 'cần dạy' },
  { id: 'EXP-TR-P-010', text: 'Phải có tiết 4 cho Thủy', expectedScope: 'teacher', expectedKind: 'teacher_required_period', direction: 'require', category: 'teacher_require_period', silentFlipForbiden: true, notes: 'phải có đảo ngữ' },

  // ─── Teacher only allowed periods (8 cases) ──────────────────────────
  { id: 'EXP-TO-P-001', text: 'Cô Thúy chỉ dạy tiết 4', expectedScope: 'teacher', expectedKind: 'teacher_allowed_periods', direction: 'only', category: 'teacher_only_allowed_periods', silentFlipForbiden: true, notes: 'chỉ dạy' },
  { id: 'EXP-TO-P-002', text: 'Thầy Sơn chỉ được dạy tiết 4', expectedScope: 'teacher', expectedKind: 'teacher_allowed_periods', direction: 'only', category: 'teacher_only_allowed_periods', silentFlipForbiden: true, notes: 'chỉ được dạy' },
  { id: 'EXP-TO-P-003', text: 'Cô Hương chỉ dạy các tiết 2, 3, 4', expectedScope: 'teacher', expectedKind: 'teacher_allowed_periods', direction: 'only', category: 'teacher_only_allowed_periods', silentFlipForbiden: true, notes: 'chỉ + nhiều tiết' },
  { id: 'EXP-TO-P-004', text: 'Thầy Sơn chỉ được xếp tiết 1', expectedScope: 'teacher', expectedKind: 'teacher_allowed_periods', direction: 'only', category: 'teacher_only_allowed_periods', silentFlipForbiden: true, notes: 'chỉ được xếp' },
  { id: 'EXP-TO-P-005', text: 'Cô Thúy cố định tiết 4', expectedScope: 'teacher', expectedKind: 'teacher_allowed_periods', direction: 'only', category: 'teacher_only_allowed_periods', silentFlipForbiden: true, notes: 'cố định' },
  { id: 'EXP-TO-D-001', text: 'Cô Thúy chỉ dạy thứ 2', expectedScope: 'teacher', expectedKind: 'teacher_allowed_days', direction: 'only', category: 'teacher_only_allowed_periods', silentFlipForbiden: true, notes: 'chỉ dạy + day' },
  { id: 'EXP-TO-D-002', text: 'Thầy Sơn chỉ dạy thứ 2, 4, 6', expectedScope: 'teacher', expectedKind: 'teacher_allowed_days', direction: 'only', category: 'teacher_only_allowed_periods', silentFlipForbiden: true, notes: 'chỉ dạy + nhiều ngày' },
  { id: 'EXP-TO-D-003', text: 'Cô Hương chỉ rảnh tiết 3', expectedScope: 'teacher', expectedKind: 'teacher_allowed_periods', direction: 'only', category: 'teacher_only_allowed_periods', silentFlipForbiden: true, notes: 'chỉ rảnh' },

  // ─── Teacher preferred periods (soft) (6 cases) ──────────────────────
  { id: 'EXP-TP-001', text: 'Cô Thúy nên dạy tiết 4', expectedScope: 'teacher', expectedKind: 'teacher_preferred_periods', direction: 'prefer', category: 'teacher_preferred_periods', silentFlipForbiden: true, notes: 'nên = soft' },
  { id: 'EXP-TP-002', text: 'Ưu tiên xếp thầy Sơn vào các tiết 2, 3', expectedScope: 'teacher', expectedKind: 'teacher_preferred_periods', direction: 'prefer', category: 'teacher_preferred_periods', silentFlipForbiden: true, notes: 'ưu tiên' },
  { id: 'EXP-TP-003', text: 'Cô Thủy thích dạy tiết sáng', expectedScope: 'teacher', expectedKind: 'teacher_preferred_periods', direction: 'prefer', category: 'teacher_preferred_periods', silentFlipForbiden: true, notes: 'thích' },
  { id: 'EXP-TP-004', text: 'Thầy Sơn muốn dạy tiết 2', expectedScope: 'teacher', expectedKind: 'teacher_preferred_periods', direction: 'prefer', category: 'teacher_preferred_periods', silentFlipForbiden: true, notes: 'muốn' },
  { id: 'EXP-TP-005', text: 'Nếu có thể, xếp cô Hương vào tiết 3', expectedScope: 'teacher', expectedKind: 'teacher_preferred_periods', direction: 'prefer', category: 'teacher_preferred_periods', silentFlipForbiden: true, notes: 'nếu có thể' },
  { id: 'EXP-TP-006', text: 'Cô Thúy thường dạy tiết 4', expectedScope: 'teacher', expectedKind: 'teacher_preferred_periods', direction: 'prefer', category: 'teacher_preferred_periods', silentFlipForbiden: true, notes: 'thường' },

  // ─── Class block/require period (10 cases) ───────────────────────────
  { id: 'EXP-CB-001', text: 'Lớp 6A không học tiết 4', expectedScope: 'class', expectedKind: 'class_block_period', direction: 'block', category: 'class_block_period', silentFlipForbiden: true, notes: 'class block' },
  { id: 'EXP-CB-002', text: 'Lớp 6B nghỉ tiết 1', expectedScope: 'class', expectedKind: 'class_block_period', direction: 'block', category: 'class_block_period', silentFlipForbiden: true, notes: 'class nghỉ' },
  { id: 'EXP-CB-003', text: 'Lớp 6C cấm học tiết 5', expectedScope: 'class', expectedKind: 'class_block_period', direction: 'block', category: 'class_block_period', silentFlipForbiden: true, notes: 'class cấm' },
  { id: 'EXP-CB-004', text: '6A không học thứ 2', expectedScope: 'class', expectedKind: 'class_block_day', direction: 'block', category: 'class_block_period', silentFlipForbiden: true, notes: 'class block day' },
  { id: 'EXP-CB-005', text: '6B không học thứ 2 tiết 1', expectedScope: 'class', expectedKind: 'class_block_slot', direction: 'block', category: 'class_block_period', silentFlipForbiden: true, notes: 'class block slot' },
  { id: 'EXP-CR-001', text: 'Lớp 6A phải có tiết 1', expectedScope: 'class', expectedKind: 'class_required_period', direction: 'require', category: 'class_require_period', silentFlipForbiden: true, notes: 'class require' },
  { id: 'EXP-CR-002', text: '6A cần có ít nhất 1 tiết 5 trong tuần', expectedScope: 'class', expectedKind: 'class_required_period', direction: 'require', category: 'class_require_period', silentFlipForbiden: true, notes: 'class require + min' },
  { id: 'EXP-CR-003', text: 'Bắt buộc lớp 6B có tiết 3', expectedScope: 'class', expectedKind: 'class_required_period', direction: 'require', category: 'class_require_period', silentFlipForbiden: true, notes: 'class bắt buộc' },
  { id: 'EXP-CR-004', text: '6C phải được xếp ít nhất 2 tiết 2', expectedScope: 'class', expectedKind: 'class_required_period', direction: 'require', category: 'class_require_period', silentFlipForbiden: true, notes: 'class phải được' },
  { id: 'EXP-CR-005', text: 'Lớp 6A tối thiểu 3 tiết 4 trong tuần', expectedScope: 'class', expectedKind: 'class_required_period', direction: 'require', category: 'class_require_period', silentFlipForbiden: true, notes: 'class tối thiểu' },

  // ─── Subject require period (10 cases) ────────────────────────────────
  // Note: subject-only without class needs clarification
  { id: 'EXP-SR-001', text: 'Lớp 6A môn Toán phải có tiết 4', expectedScope: 'subject', expectedKind: 'subject_required_period', direction: 'require', category: 'subject_require_period', silentFlipForbiden: true, notes: 'subject with class' },
  { id: 'EXP-SR-002', text: '6A cần có ít nhất 2 tiết Toán 4', expectedScope: 'subject', expectedKind: 'subject_required_period', direction: 'require', category: 'subject_require_period', silentFlipForbiden: true, notes: 'class + subject' },
  { id: 'EXP-SR-003', text: 'Bắt buộc Văn 6B có tiết 1', expectedScope: 'subject', expectedKind: 'subject_required_period', direction: 'require', category: 'subject_require_period', silentFlipForbiden: true, notes: 'subject bắt buộc + class' },
  { id: 'EXP-SR-004', text: 'Toán phải có tiết 4', expectedScope: 'subject', expectedKind: 'clarify', direction: 'ambiguous', category: 'subject_require_period', silentFlipForbiden: true, notes: 'subject only → ask scope' },
  { id: 'EXP-SR-005', text: 'Môn Toán phải có ít nhất 2 tiết 4 trong tuần', expectedScope: 'subject', expectedKind: 'clarify', direction: 'ambiguous', category: 'subject_require_period', silentFlipForbiden: true, notes: 'subject only → ask scope' },
  { id: 'EXP-SR-006', text: 'Anh 6C cần có tiết 2', expectedScope: 'subject', expectedKind: 'subject_required_period', direction: 'require', category: 'subject_require_period', silentFlipForbiden: true, notes: 'subject cần + class' },
  { id: 'EXP-SR-007', text: 'Lý 6A phải được xếp tiết 3', expectedScope: 'subject', expectedKind: 'subject_required_period', direction: 'require', category: 'subject_require_period', silentFlipForbiden: true, notes: 'subject phải được + class' },
  { id: 'EXP-SR-008', text: '6B Sử tối thiểu 1 tiết 5', expectedScope: 'subject', expectedKind: 'subject_required_period', direction: 'require', category: 'subject_require_period', silentFlipForbiden: true, notes: 'subject tối thiểu + class' },
  { id: 'EXP-SR-009', text: 'Toán phải có ít nhất 1 tiết 4', expectedScope: 'subject', expectedKind: 'clarify', direction: 'ambiguous', category: 'subject_require_period', silentFlipForbiden: true, notes: 'subject only → ask scope' },
  { id: 'EXP-SR-010', text: 'Cô Thúy dạy Toán 6A phải có tiết 4', expectedScope: 'subject', expectedKind: 'subject_required_period', direction: 'require', category: 'subject_require_period', silentFlipForbiden: true, notes: 'subject with class+teacher' },

  // ─── Subject block (8 cases) ─────────────────────────────────────────
  { id: 'EXP-SB-001', text: 'Lớp 6A môn Toán không học tiết 4', expectedScope: 'subject', expectedKind: 'subject_block_period', direction: 'block', category: 'subject_require_period', silentFlipForbiden: true, notes: 'subject block with class' },
  { id: 'EXP-SB-002', text: '6A Văn cấm học tiết 5', expectedScope: 'subject', expectedKind: 'subject_block_period', direction: 'block', category: 'subject_require_period', silentFlipForbiden: true, notes: 'subject cấm' },
  { id: 'EXP-SB-003', text: '6B Anh không học tiết 1', expectedScope: 'subject', expectedKind: 'subject_block_period', direction: 'block', category: 'subject_require_period', silentFlipForbiden: true, notes: 'subject block' },
  { id: 'EXP-SB-004', text: '6C Lý nghỉ tiết 3', expectedScope: 'subject', expectedKind: 'subject_block_period', direction: 'block', category: 'subject_require_period', silentFlipForbiden: true, notes: 'subject nghỉ' },
  { id: 'EXP-SB-005', text: '6A Toán không học thứ 2', expectedScope: 'subject', expectedKind: 'subject_block_days', direction: 'block', category: 'subject_require_period', silentFlipForbiden: true, notes: 'subject block day' },
  { id: 'EXP-SB-006', text: '6B Văn cấm học thứ 3, 5', expectedScope: 'subject', expectedKind: 'subject_block_days', direction: 'block', category: 'subject_require_period', silentFlipForbiden: true, notes: 'subject block days' },
  { id: 'EXP-SB-007', text: 'Môn Toán không dạy tiết 4', expectedScope: 'subject', expectedKind: 'clarify', direction: 'ambiguous', category: 'subject_require_period', silentFlipForbiden: true, notes: 'subject only → ask scope' },
  { id: 'EXP-SB-008', text: 'Toán 6A tránh tiết 5', expectedScope: 'subject', expectedKind: 'subject_block_period', direction: 'block', category: 'subject_require_period', silentFlipForbiden: true, notes: 'subject tránh + class' },

  // ─── Consecutive (8 cases) ───────────────────────────────────────────
  { id: 'EXP-CN-001', text: 'Môn Văn không được 3 tiết liên tiếp', expectedScope: 'subject', expectedKind: 'subject_max_consecutive', direction: 'block', category: 'consecutive', silentFlipForbiden: true, notes: 'subject max consecutive' },
  { id: 'EXP-CN-002', text: 'Cô Thúy không dạy 2 tiết liên tiếp', expectedScope: 'teacher', expectedKind: 'teacher_max_consecutive', direction: 'block', category: 'consecutive', silentFlipForbiden: true, notes: 'teacher max consecutive' },
  { id: 'EXP-CN-003', text: 'Lớp 6A không học 3 tiết liên tục', expectedScope: 'class', expectedKind: 'class_max_consecutive', direction: 'block', category: 'consecutive', silentFlipForbiden: true, notes: 'class max consecutive' },
  { id: 'EXP-CN-004', text: 'Môn Văn cần 2 tiết liên tiếp', expectedScope: 'subject', expectedKind: 'subject_consecutive', direction: 'require', category: 'consecutive', silentFlipForbiden: true, notes: 'subject consecutive (require)' },
  { id: 'EXP-CN-005', text: 'Cô Thúy muốn dạy 2 tiết liên tiếp', expectedScope: 'teacher', expectedKind: 'subject_consecutive', direction: 'prefer', category: 'consecutive', silentFlipForbiden: true, notes: 'teacher consecutive (soft via muốn)' },
  { id: 'EXP-CN-006', text: '6A không quá 4 tiết liên tục', expectedScope: 'class', expectedKind: 'class_max_consecutive', direction: 'block', category: 'consecutive', silentFlipForbiden: true, notes: 'class khong qua' },
  { id: 'EXP-CN-007', text: 'Văn và Toán 6A không liên tiếp', expectedScope: 'class', expectedKind: 'class_subjects_not_same_day', direction: 'block', category: 'consecutive', silentFlipForbiden: true, notes: 'class subjects not same day' },
  { id: 'EXP-CN-008', text: 'Văn 6A và Toán 6A cùng tiết', expectedScope: 'class', expectedKind: 'class_subjects_same_day', direction: 'require', category: 'consecutive', silentFlipForbiden: true, notes: 'class subjects same day' },

  // ─── Max / min per day (10 cases) ────────────────────────────────────
  { id: 'EXP-MM-001', text: 'Cô Sơn dạy tối đa 4 tiết mỗi ngày', expectedScope: 'teacher', expectedKind: 'teacher_max_per_day', direction: 'block', category: 'max_min_per_day', silentFlipForbiden: true, notes: 'teacher max' },
  { id: 'EXP-MM-002', text: 'Cô Sơn dạy ít nhất 2 tiết mỗi ngày', expectedScope: 'teacher', expectedKind: 'teacher_min_per_day', direction: 'require', category: 'max_min_per_day', silentFlipForbiden: true, notes: 'teacher min' },
  { id: 'EXP-MM-003', text: 'Lớp 6A học tối đa 5 tiết mỗi ngày', expectedScope: 'class', expectedKind: 'class_max_per_day', direction: 'block', category: 'max_min_per_day', silentFlipForbiden: true, notes: 'class max' },
  { id: 'EXP-MM-004', text: 'Lớp 6A học ít nhất 4 tiết mỗi ngày', expectedScope: 'class', expectedKind: 'class_min_per_day', direction: 'require', category: 'max_min_per_day', silentFlipForbiden: true, notes: 'class min' },
  { id: 'EXP-MM-005', text: 'Cô Sơn không quá 3 tiết buổi sáng', expectedScope: 'teacher', expectedKind: 'session_limit', direction: 'block', category: 'max_min_per_day', silentFlipForbiden: true, notes: 'session limit' },
  { id: 'EXP-MM-006', text: 'Cô Sơn buổi sáng tối đa 3 tiết', expectedScope: 'teacher', expectedKind: 'session_limit', direction: 'block', category: 'max_min_per_day', silentFlipForbiden: true, notes: 'session limit' },
  { id: 'EXP-MM-007', text: 'Cô Sơn không quá 5 ngày dạy', expectedScope: 'teacher', expectedKind: 'teacher_max_working_days', direction: 'block', category: 'max_min_per_day', silentFlipForbiden: true, notes: 'teacher max working days' },
  { id: 'EXP-MM-008', text: 'Cô Sơn ít nhất 3 ngày dạy', expectedScope: 'teacher', expectedKind: 'teacher_min_working_days', direction: 'require', category: 'max_min_per_day', silentFlipForbiden: true, notes: 'teacher min working days' },
  { id: 'EXP-MM-009', text: 'Lớp 6A không quá 3 môn nặng mỗi ngày', expectedScope: 'class', expectedKind: 'class_max_heavy_subjects_per_day', direction: 'block', category: 'max_min_per_day', silentFlipForbiden: true, notes: 'class max heavy per day' },
  { id: 'EXP-MM-010', text: 'Cô Sơn không dạy quá 4 môn khác nhau mỗi ngày', expectedScope: 'teacher', expectedKind: 'teacher_max_subjects_per_day', direction: 'block', category: 'max_min_per_day', silentFlipForbiden: true, notes: 'teacher max subjects per day' },

  // ─── If-then (5 cases) ───────────────────────────────────────────────
  { id: 'EXP-IF-001', text: 'Nếu cô Thúy dạy thứ 4 thì cô Hạnh không dạy thứ 5', expectedScope: 'global', expectedKind: 'if_then', direction: 'require', category: 'if_then', silentFlipForbiden: true, notes: 'if-then basic' },
  { id: 'EXP-IF-002', text: 'Nếu Hiếu dạy thứ 2 tiết 2 thì Thủy không dạy thứ 5', expectedScope: 'global', expectedKind: 'if_then', direction: 'block', category: 'if_then', silentFlipForbiden: true, notes: 'if-then with period' },
  { id: 'EXP-IF-003', text: 'Nếu 6A học Văn tiết 1 thứ 2 thì 6B học Văn tiết 1 thứ 3', expectedScope: 'global', expectedKind: 'if_then', direction: 'require', category: 'if_then', silentFlipForbiden: true, notes: 'if-then class-subject' },
  { id: 'EXP-IF-004', text: 'Nếu mà cô Sơn nghỉ thì cô Hương dạy thay', expectedScope: 'global', expectedKind: 'if_then', direction: 'require', category: 'if_then', silentFlipForbiden: true, notes: 'if-then informal' },
  { id: 'EXP-IF-005', text: 'Nếu thầy Sơn dạy Toán 6A thứ 2 thì thầy Sơn không dạy Toán 6B cùng ngày', expectedScope: 'global', expectedKind: 'if_then', direction: 'block', category: 'if_then', silentFlipForbiden: true, notes: 'if-then complex' },

  // ─── Ambiguous / clarification (10 cases) ────────────────────────────
  { id: 'EXP-AMB-001', text: 'Cô Lan không dạy thứ 2', expectedScope: 'teacher', expectedKind: 'clarify', direction: 'ambiguous', category: 'ambiguous', silentFlipForbiden: true, notes: 'Lan không trong ds' },
  { id: 'EXP-AMB-002', text: 'Cô Thủy', expectedScope: 'teacher', expectedKind: 'clarify', direction: 'ambiguous', category: 'ambiguous', silentFlipForbiden: true, notes: 'chỉ tên, không có ràng buộc' },
  { id: 'EXP-AMB-003', text: 'Không dạy tiết 4', expectedScope: 'teacher', expectedKind: 'clarify', direction: 'ambiguous', category: 'ambiguous', silentFlipForbiden: true, notes: 'thiếu giáo viên' },
  { id: 'EXP-AMB-004', text: 'Cô Thủy không dạy thứ 2 nhưng cần có tiết 4', expectedScope: 'teacher', expectedKind: 'clarify', direction: 'contradictory', category: 'ambiguous', silentFlipForbiden: true, notes: 'phải có + không dạy' },
  { id: 'EXP-AMB-005', text: 'Cô Thủy phải không dạy tiết 4', expectedScope: 'teacher', expectedKind: 'clarify', direction: 'contradictory', category: 'ambiguous', silentFlipForbiden: true, notes: 'phải không dạy = contradictory' },
  { id: 'EXP-AMB-006', text: 'Thủy tiết 4', expectedScope: 'teacher', expectedKind: 'clarify', direction: 'ambiguous', category: 'ambiguous', silentFlipForbiden: true, notes: 'chỉ entity + period' },
  { id: 'EXP-AMB-007', text: 'Môn Toán phải có tiết 4', expectedScope: 'subject', expectedKind: 'clarify', direction: 'ambiguous', category: 'ambiguous', silentFlipForbiden: true, notes: 'subject only → ask scope' },
  { id: 'EXP-AMB-008', text: 'Lớp 6A không học môn gì cả', expectedScope: 'class', expectedKind: 'clarify', direction: 'ambiguous', category: 'ambiguous', silentFlipForbiden: true, notes: 'không rõ môn' },
  { id: 'EXP-AMB-009', text: 'Cô Thủy', expectedScope: 'teacher', expectedKind: 'clarify', direction: 'ambiguous', category: 'ambiguous', silentFlipForbiden: true, notes: 'just a name' },
  { id: 'EXP-AMB-010', text: 'Có tiết 4 cho ai đó', expectedScope: 'teacher', expectedKind: 'clarify', direction: 'ambiguous', category: 'ambiguous', silentFlipForbiden: true, notes: 'unclear subject' },

  // ─── Unsupported (5 cases) ───────────────────────────────────────────
  { id: 'EXP-UNS-001', text: 'Xếp lịch cho trường', expectedScope: 'global', expectedKind: 'unsupported', direction: 'ambiguous', category: 'unsupported', silentFlipForbiden: true, notes: 'no constraint intent' },
  { id: 'EXP-UNS-002', text: 'Hello world', expectedScope: 'global', expectedKind: 'unsupported', direction: 'ambiguous', category: 'unsupported', silentFlipForbiden: true, notes: 'English' },
  { id: 'EXP-UNS-003', text: 'Cô Thủy giảng bài hay', expectedScope: 'teacher', expectedKind: 'unsupported', direction: 'ambiguous', category: 'unsupported', silentFlipForbiden: true, notes: 'no constraint semantics' },
  { id: 'EXP-UNS-004', text: 'Tôi muốn đi ăn trưa', expectedScope: 'global', expectedKind: 'unsupported', direction: 'ambiguous', category: 'unsupported', silentFlipForbiden: true, notes: 'off-topic' },
  { id: 'EXP-UNS-005', text: '123', expectedScope: 'global', expectedKind: 'unsupported', direction: 'ambiguous', category: 'unsupported', silentFlipForbiden: true, notes: 'no text' },
];

// ─── Sanity counters ───────────────────────────────────────────────────
export function summarizeExpandedSet(): {
  total: number;
  byCategory: Record<string, number>;
  byDirection: Record<string, number>;
  byKind: Record<string, number>;
} {
  const byCategory: Record<string, number> = {};
  const byDirection: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  for (const c of EXPANDED_GOLDEN_SET) {
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
    byDirection[c.direction] = (byDirection[c.direction] ?? 0) + 1;
    byKind[c.expectedKind] = (byKind[c.expectedKind] ?? 0) + 1;
  }
  return { total: EXPANDED_GOLDEN_SET.length, byCategory, byDirection, byKind };
}
