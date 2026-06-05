import type { ParsedConstraintDraft } from '../ai/constraint-review-types';

export const STATUS_LABELS: Record<ParsedConstraintDraft['status'], string> = {
  parsed: 'Đã hiểu',
  needs_review: 'Cần kiểm tra',
  ambiguous: 'Mơ hồ',
  unparsed: 'Chưa phân tích',
  unsupported: 'Không hỗ trợ',
  ignored: 'Đã bỏ qua',
};

export const STATUS_BADGE_CLASS: Record<ParsedConstraintDraft['status'], string> = {
  parsed: 'border-green-500/30 bg-green-500/10 text-green-400',
  needs_review: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  ambiguous: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  unparsed: 'border-white/20 bg-white/5 text-white/50',
  unsupported: 'border-red-500/30 bg-red-500/10 text-red-400',
  ignored: 'border-white/15 bg-white/5 text-white/40',
};
