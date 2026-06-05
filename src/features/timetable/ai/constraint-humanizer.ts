import type { ConstraintSpec } from './constraint-spec';
import type { ParsedConstraintDraft } from './constraint-review-types';
import { formatPeriodList, resolveDayLabel, severityPhrase } from './constraint-humanizer-labels';

function paramStr(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(String).join(', ');
  return String(value);
}

function dayInText(dayId: unknown): string {
  const label = resolveDayLabel(dayId);
  return label || paramStr(dayId);
}

function soft(spec: ConstraintSpec): string {
  return severityPhrase(spec.severity, spec.weight);
}

function scopeAllLabel(spec: ConstraintSpec): string | null {
  const p = spec.params;
  const classScope = p.class === '__all__' || p.classes === '__all__' || p.class === 'all';
  const subjectScope = p.subject === '__all__' || p.subjects === '__all__' || p.subject === 'all';
  if (spec.kind === 'subject_max_consecutive' && (p.subject === '__all__' || !p.subject)) {
    return 'Với mọi lớp, mọi môn, mỗi ngày';
  }
  if (classScope && subjectScope) return 'Với mọi lớp và mọi môn';
  if (classScope) return 'Với mọi lớp';
  if (subjectScope) return 'Với mọi môn';
  return null;
}

export function humanizeConstraintSpec(spec: ConstraintSpec): string {
  const scope = scopeAllLabel(spec);
  const prefix = scope ? `${scope}: ` : '';
  const p = spec.params;

  switch (spec.kind) {
    case 'teacher_block_day':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} không dạy vào ${dayInText(p.day)}${soft(spec)}.`;
    case 'teacher_block_period':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} không dạy tiết ${paramStr(p.period)}${soft(spec)}.`;
    case 'teacher_block_slot':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} không dạy ${dayInText(p.day)}, tiết ${paramStr(p.period)}${soft(spec)}.`;
    case 'teacher_max_per_day':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} dạy tối đa ${paramStr(p.maxPerDay)} tiết mỗi ngày${soft(spec)}.`;
    case 'teacher_max_consecutive':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} không dạy quá ${paramStr(p.maxConsecutive)} tiết liên tiếp${soft(spec)}.`;
    case 'teacher_preferred_periods': {
      const periods = formatPeriodList(p.periods);
      return `${prefix}Ưu tiên xếp giáo viên ${paramStr(p.teacher)} vào ${periods || 'một số tiết'}${soft(spec)}.`;
    }
    case 'subject_preferred_periods': {
      const periods = formatPeriodList(p.periods);
      return `${prefix}Ưu tiên xếp môn ${paramStr(p.subject)} vào ${periods || 'một số tiết'}${soft(spec)}.`;
    }
    case 'subject_consecutive': {
      const len = p.length ?? p.minConsecutive ?? p.maxConsecutive;
      return `${prefix}Môn ${paramStr(p.subject)} nên có các cụm ${paramStr(len)} tiết học liên tiếp trong tuần${soft(spec)}.`;
    }
    case 'subject_max_consecutive': {
      const max = p.max ?? p.maxConsecutive;
      const subject = p.subject ?? 'mọi môn';
      return `${prefix}Môn ${paramStr(subject)}: tối đa ${paramStr(max)} tiết liên tiếp trong cùng một ngày (mỗi lớp)${soft(spec)}.`;
    }
    case 'subject_not_last_period':
      return `${prefix}Môn ${paramStr(p.subject)} không xếp vào tiết cuối cùng của ngày${soft(spec)}.`;
    case 'subject_pin_period': {
      const periods = formatPeriodList(p.periods) || `tiết ${paramStr(p.period)}`;
      return `${prefix}Môn ${paramStr(p.subject)} chỉ được xếp vào ${periods}${soft(spec)}.`;
    }
    case 'class_block_day':
      return `${prefix}Lớp ${paramStr(p.class)} không học vào ${dayInText(p.day)}${soft(spec)}.`;
    case 'class_subjects_not_same_day':
      return `${prefix}Mỗi lớp, mỗi ngày: không xếp hai môn trong danh sách (${paramStr(p.subjects)}) vào cùng một ngày${soft(spec)}.`;
    case 'class_max_heavy_subjects_per_day':
      return `${prefix}Lớp ${paramStr(p.class ?? 'mọi lớp')}: mỗi ngày tối đa ${paramStr(p.maxHeavy)} môn nặng${soft(spec)}.`;
    case 'class_max_heavy_subjects_per_session':
      return `${prefix}Mỗi lớp, mỗi ngày, trong cùng một buổi (sáng/chiều): không dồn quá ${paramStr(p.maxHeavyInSession ?? 2)} môn nặng trong danh sách (${paramStr(p.subjects)}) — nên xen kẽ với môn khác${soft(spec)}.`;
    case 'class_first_period_required':
      return `${prefix}Lớp ${paramStr(p.class)} phải có tiết 1 trong mỗi ngày có học${soft(spec)}.`;
    case 'subject_flag_ceremony_slot':
      return `Chào cờ/sinh hoạt cố định: ${dayInText(p.day)}, tiết ${paramStr(p.period)}${soft(spec)}.`;
    case 'pair_not_same_slot': {
      const teachers = Array.isArray(p.teachers) ? p.teachers.join(' và ') : paramStr(p.teachers);
      const scopeDay = (p.scope as { day?: string } | undefined)?.day ?? p.day;
      const dayPart = scopeDay ? ` trong ngày ${dayInText(scopeDay)}` : '';
      return `${prefix}Hai giáo viên ${teachers} không dạy cùng một tiết${dayPart}${soft(spec)}.`;
    }
    case 'teacher_max_working_days':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} dạy tối đa ${paramStr(p.maxDays)} ngày/tuần${soft(spec)}.`;
    case 'teacher_min_per_day':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} dạy ít nhất ${paramStr(p.minPerDay)} tiết mỗi ngày${soft(spec)}.`;
    case 'teacher_no_gaps':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} không có tiết trống giữa các tiết dạy${soft(spec)}.`;
    case 'teacher_allowed_days':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} chỉ dạy vào ${paramStr(p.days)}${soft(spec)}.`;
    case 'teacher_allowed_periods':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} chỉ dạy các tiết ${paramStr(p.periods)}${soft(spec)}.`;
    case 'teacher_max_classes_per_day':
      return `${prefix}Giáo viên ${paramStr(p.teacher || 'mọi GV')} dạy tối đa ${paramStr(p.maxClasses)} lớp mỗi ngày${soft(spec)}.`;
    case 'teacher_max_subjects_per_day':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} dạy tối đa ${paramStr(p.max)} môn mỗi ngày${soft(spec)}.`;
    case 'teacher_max_consecutive_days':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} dạy tối đa ${paramStr(p.maxDays)} ngày liên tiếp${soft(spec)}.`;
    case 'teacher_homeroom_first_period':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} (chủ nhiệm lớp ${paramStr(p.class)}) dạy tiết 1${soft(spec)}.`;
    case 'teacher_balanced_load':
      return `${prefix}Cân bằng tải giáo viên (dung sai ${paramStr(p.tolerance)})${soft(spec)}.`;
    case 'subject_allowed_days':
      return `${prefix}Môn ${paramStr(p.subject)} chỉ được xếp vào ${paramStr(p.days)}${soft(spec)}.`;
    case 'subject_block_period':
      return `${prefix}Môn ${paramStr(p.subject)} không được xếp vào tiết ${paramStr(p.periods)}${soft(spec)}.`;
    case 'subject_block_days':
      return `${prefix}Môn ${paramStr(p.subject)} không được xếp vào ${paramStr(p.days)}${soft(spec)}.`;
    case 'subject_not_consecutive':
      return `${prefix}Môn ${paramStr(p.subject)} không được xếp vào các tiết liên tiếp${soft(spec)}.`;
    case 'subject_daily_max_periods':
      return `${prefix}Môn ${paramStr(p.subject)} tối đa ${paramStr(p.max)} tiết/ngày${soft(spec)}.`;
    case 'subject_spread_evenly':
      return `${prefix}Môn ${paramStr(p.subject)} được phân bổ đều trong tuần${soft(spec)}.`;
    case 'subject_order_before':
      return `${prefix}Môn ${paramStr(p.subjectA)} phải xếp trước môn ${paramStr(p.subjectB)}${soft(spec)}.`;
    case 'subject_not_after_subject':
      return `${prefix}Môn ${paramStr(p.subjectA)} không được xếp sau môn ${paramStr(p.subjectB)}${soft(spec)}.`;
    case 'subject_min_gap_days':
      return `${prefix}Môn ${paramStr(p.subject)} cách nhau ít nhất ${paramStr(p.minGap)} ngày${soft(spec)}.`;
    case 'class_max_per_day':
      return `${prefix}Lớp ${paramStr(p.class)} học tối đa ${paramStr(p.max)} tiết mỗi ngày${soft(spec)}.`;
    case 'class_min_per_day':
      return `${prefix}Lớp ${paramStr(p.class)} học ít nhất ${paramStr(p.min)} tiết mỗi ngày${soft(spec)}.`;
    case 'class_max_subjects_per_day':
      return `${prefix}Lớp ${paramStr(p.class)} học tối đa ${paramStr(p.max)} môn mỗi ngày${soft(spec)}.`;
    case 'class_no_gaps':
      return `${prefix}Lớp ${paramStr(p.class)} không có tiết trống giữa các tiết học${soft(spec)}.`;
    case 'class_block_period':
      return `${prefix}Lớp ${paramStr(p.class)} không học tiết ${paramStr(p.period)}${soft(spec)}.`;
    case 'class_block_slot':
      return `${prefix}Lớp ${paramStr(p.class)} không học ${dayInText(p.day)}, tiết ${paramStr(p.period)}${soft(spec)}.`;
    case 'class_allowed_days':
      return `${prefix}Lớp ${paramStr(p.class)} chỉ học vào ${paramStr(p.days)}${soft(spec)}.`;
    case 'class_max_consecutive':
      return `${prefix}Lớp ${paramStr(p.class)} tối đa ${paramStr(p.maxConsecutive)} tiết liên tiếp${soft(spec)}.`;
    case 'class_balanced_load':
      return `${prefix}Cân bằng tải lớp (dung sai ${paramStr(p.tolerance)})${soft(spec)}.`;
    case 'global_teacher_utilization_balance':
      return `${prefix}Cân bằng tải giáo viên toàn trường (dung sai ${paramStr(p.tolerance)})${soft(spec)}.`;
    case 'session_limit':
      return `${prefix}Giới hạn ${paramStr(p.max)} tiết tại ${dayInText(p.day)}, tiết ${paramStr(p.period)}${soft(spec)}.`;
    case 'if_then': {
      const cond = p.if as { op?: string; teacher?: string; day?: string; period?: number } | undefined;
      const thenList = Array.isArray(p.then) ? p.then : [];
      const condTeacher = cond?.teacher ?? '';
      const condDay = cond?.day ? dayInText(cond.day) : '';
      const condPeriod = cond?.period;
      let condText = '';
      if (cond?.op === 'teacher_teaches_at_slot' && condTeacher && condDay && condPeriod) {
        condText = `Giáo viên ${condTeacher} dạy ${condDay}, tiết ${condPeriod}`;
      } else if (cond?.op === 'teacher_teaches_on_day' && condTeacher && condDay) {
        condText = `Giáo viên ${condTeacher} dạy vào ${condDay}`;
      } else if (condTeacher && condDay) {
        condText = `Giáo viên ${condTeacher} dạy ${condDay}`;
      } else {
        condText = '(điều kiện chưa xác định)';
      }
      const thenDesc = thenList.map((t: { kind?: string; params?: Record<string, unknown> }) => {
        const tp = t.params ?? {};
        if (t.kind === 'teacher_block_day') return `Giáo viên ${paramStr(tp.teacher)} không dạy ${dayInText(tp.day)}`;
        if (t.kind === 'teacher_block_slot') return `Giáo viên ${paramStr(tp.teacher)} không dạy ${dayInText(tp.day)}, tiết ${paramStr(tp.period)}`;
        if (t.kind === 'pair_not_same_slot') return `${paramStr(tp.teachers)} không trùng tiết`;
        if (t.kind === 'teacher_no_gaps') return `Giáo viên ${paramStr(tp.teacher)} không có tiết trống`;
        return `(${t.kind ?? 'không xác định'})`;
      }).join('; ');
      return `Nếu ${condText} thì ${thenDesc}${soft(spec)}.`;
    }
    case 'custom_dsl':
      return `Ràng buộc đặc biệt (cần kiểm tra lại): «${spec.original}»${soft(spec)}.`;
    default:
      return `${prefix}Ràng buộc «${spec.original}» — chưa có mô tả tiếng Việt chi tiết; dùng «Sửa cách hiểu» hoặc «Chọn mẫu»${soft(spec)}.`;
  }
}

/** Diễn giải câu “không xếp N tiết liên tiếp…” → tối đa N-1 tiết liên tiếp. */
export function humanizeMaxConsecutiveFromBanText(original: string, maxConsecutive: number): string {
  return (
    `Với mọi lớp, mọi môn, mỗi ngày: không được có ${maxConsecutive + 1} tiết liên tiếp cùng môn. ` +
    `Tức tối đa ${maxConsecutive} tiết liên tiếp. (${original.trim()})`
  );
}

export function humanizeDraft(draft: ParsedConstraintDraft): string {
  if (!draft.proposedSpecs.length) {
    return draft.explanation || `Chưa phân tích được: ${draft.original}`;
  }
  return draft.proposedSpecs.map((s) => humanizeConstraintSpec(s)).join('\n');
}
