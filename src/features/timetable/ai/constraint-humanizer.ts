import type { ConstraintSpec } from './constraint-spec';
import type { ParsedConstraintDraft } from './constraint-review-types';
import { buildClarificationQuestions } from './constraint-clarification';
import { formatPeriodList, resolveDayLabel, severityPhrase } from './constraint-humanizer-labels';

function paramStr(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(String).join(', ');
  return String(value);
}

/** Render a single `ConditionExpr` (teacher_teaches_at_slot | teacher_teaches_on_day | and | or | not) in Vietnamese. */
function renderConditionExpr(cond: {
  op?: string;
  teacher?: string;
  teachers?: string[];
  class?: string;
  subject?: string;
  day?: string;
  period?: number;
  args?: Array<Record<string, unknown>>;
  arg?: Record<string, unknown>;
} | undefined): string {
  if (!cond || typeof cond !== 'object' || !cond.op) return '(điều kiện chưa xác định)';
  const teacher = typeof cond.teacher === 'string' ? cond.teacher : '';
  const teachers = Array.isArray(cond.teachers) ? cond.teachers.filter((t): t is string => typeof t === 'string') : [];
  const klass = typeof cond.class === 'string' ? cond.class : '';
  const subject = typeof cond.subject === 'string' ? cond.subject : '';
  const day = cond.day ? dayInText(cond.day) : '';
  const period = typeof cond.period === 'number' ? cond.period : null;

  if (cond.op === 'teacher_teaches_at_slot' && teacher && day && period !== null) {
    return `Giáo viên ${teacher} dạy ${day}, tiết ${period}`;
  }
  if (cond.op === 'teacher_teaches_on_day' && teacher && day) {
    return `Giáo viên ${teacher} dạy ${day}`;
  }
  if (cond.op === 'teacher_pair_teaches_same_slot' && teachers.length >= 2 && day && period !== null) {
    return `${teachers[0]} và ${teachers[1]} cùng dạy ${day}, tiết ${period}`;
  }
  if (cond.op === 'teacher_pair_teaches_same_day' && teachers.length >= 2 && day) {
    return `${teachers[0]} và ${teachers[1]} cùng dạy vào ${day}`;
  }
  if (cond.op === 'class_teacher_at_slot' && klass && subject && day && period !== null) {
    return `Lớp ${klass} học môn ${subject} ${day}, tiết ${period}`;
  }
  if (cond.op === 'and' && Array.isArray(cond.args) && cond.args.length > 0) {
    const parts = cond.args.map((a) => renderConditionExpr(a as Parameters<typeof renderConditionExpr>[0]));
    if (cond.args.length === 2) {
      return `${parts[0]} và ${parts[1]}`;
    }
    return parts.join(', ');
  }
  if (cond.op === 'or' && Array.isArray(cond.args) && cond.args.length > 0) {
    const parts = cond.args.map((a) => renderConditionExpr(a as Parameters<typeof renderConditionExpr>[0]));
    if (cond.args.length === 2) {
      return `${parts[0]} hoặc ${parts[1]}`;
    }
    return `${parts.slice(0, -1).join(', ')} hoặc ${parts[parts.length - 1]}`;
  }
  if (cond.op === 'not' && cond.arg) {
    return `không (${renderConditionExpr(cond.arg as Parameters<typeof renderConditionExpr>[0])})`;
  }
  if (teacher && day && period !== null) {
    return `Giáo viên ${teacher} dạy ${day}, tiết ${period}`;
  }
  if (teacher && day) {
    return `Giáo viên ${teacher} dạy ${day}`;
  }
  return '(điều kiện chưa xác định)';
}

function dayInText(dayId: unknown): string {
  const label = resolveDayLabel(dayId);
  return label || paramStr(dayId);
}

function dayListInText(days: unknown): string {
  if (!Array.isArray(days)) return dayInText(days);
  const labels = days.map((day) => dayInText(day)).filter(Boolean);
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} và ${labels[labels.length - 1]}`;
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
    case 'teacher_pair_not_same_slot': {
      const teachers = Array.isArray(p.teachers) ? p.teachers.join(' và ') : paramStr(p.teachers);
      const scopeDay = (p.scope as { day?: string } | undefined)?.day ?? p.day;
      const dayPart = scopeDay ? ` trong ngày ${dayInText(scopeDay)}` : '';
      return `${prefix}Hai giáo viên ${teachers} không dạy cùng một tiết${dayPart}${soft(spec)}.`;
    }
    case 'teacher_pair_not_same_day': {
      const teachers = Array.isArray(p.teachers) ? p.teachers.join(' và ') : paramStr(p.teachers);
      const scopeDay = (p.scope as { day?: string } | undefined)?.day ?? p.day;
      const dayPart = scopeDay ? ` trong ngày ${dayInText(scopeDay)}` : '';
      return `${prefix}Hai giáo viên ${teachers} không dạy cùng một ngày${dayPart}${soft(spec)}.`;
    }
    case 'teacher_max_working_days':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} dạy tối đa ${paramStr(p.maxDays)} ngày/tuần${soft(spec)}.`;
    case 'teacher_min_per_day':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} dạy ít nhất ${paramStr(p.minPerDay)} tiết mỗi ngày${soft(spec)}.`;
    case 'teacher_no_gaps':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} không có tiết trống giữa các tiết dạy${soft(spec)}.`;
    case 'teacher_min_working_days':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} dạy ít nhất ${paramStr(p.minDays)} ngày/tuần${soft(spec)}.`;
    case 'teacher_max_gaps':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} tối đa ${paramStr(p.maxGaps)} tiết trống/ngày${soft(spec)}.`;
    case 'teacher_min_consecutive':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} mỗi khi dạy phải ít nhất ${paramStr(p.minConsecutive)} tiết liền${soft(spec)}.`;
    case 'teacher_min_off_days':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} được nghỉ tối thiểu ${paramStr(p.minOffDays ?? p.min)} ngày/tuần${soft(spec)}.`;
    case 'subject_min_days':
      return `${prefix}Môn ${paramStr(p.subject)} phải được rải ít nhất ${paramStr(p.minDays)} ngày${soft(spec)}.`;
    case 'teacher_allowed_days':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} chỉ dạy vào ${dayListInText(p.days)}${soft(spec)}.`;
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
      return `${prefix}Môn ${paramStr(p.subject)} chỉ được xếp vào ${dayListInText(p.days)}${soft(spec)}.`;
    case 'subject_block_period':
      return `${prefix}Môn ${paramStr(p.subject)} không được xếp vào tiết ${paramStr(p.periods)}${soft(spec)}.`;
    case 'subject_block_days':
      return `${prefix}Môn ${paramStr(p.subject)} không được xếp vào ${dayListInText(p.days)}${soft(spec)}.`;
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
      return `${prefix}Lớp ${paramStr(p.class)} chỉ học vào ${dayListInText(p.days)}${soft(spec)}.`;
    case 'class_max_consecutive':
      return `${prefix}Lớp ${paramStr(p.class)} tối đa ${paramStr(p.maxConsecutive)} tiết liên tiếp${soft(spec)}.`;
    case 'class_balanced_load':
      return `${prefix}Cân bằng tải lớp (dung sai ${paramStr(p.tolerance)})${soft(spec)}.`;
    case 'global_teacher_utilization_balance':
      return `${prefix}Cân bằng tải giáo viên toàn trường (dung sai ${paramStr(p.tolerance)})${soft(spec)}.`;
    case 'session_limit':
      return `${prefix}Giới hạn ${paramStr(p.max)} tiết tại ${dayInText(p.day)}, tiết ${paramStr(p.period)}${soft(spec)}.`;
    case 'if_then': {
      const cond = p.if as
        | {
            op?: string;
            teacher?: string;
            day?: string;
            period?: number;
            args?: Array<Record<string, unknown>>;
            arg?: Record<string, unknown>;
          }
        | undefined;
      const thenList = Array.isArray(p.then) ? p.then : [];
      const condText = renderConditionExpr(cond);
      const thenDesc = thenList.map((t: { kind?: string; params?: Record<string, unknown> }) => {
        const tp = t.params ?? {};
        if (t.kind === 'teacher_block_day') return `Giáo viên ${paramStr(tp.teacher)} không dạy ${dayInText(tp.day)}`;
        if (t.kind === 'teacher_block_slot') return `Giáo viên ${paramStr(tp.teacher)} không dạy ${dayInText(tp.day)}, tiết ${paramStr(tp.period)}`;
        if (t.kind === 'teacher_required_day') return `Giáo viên ${paramStr(tp.teacher)} phải dạy ${dayInText(tp.day)}`;
        if (t.kind === 'teacher_required_slot') return `Giáo viên ${paramStr(tp.teacher)} phải dạy ${dayInText(tp.day)}, tiết ${paramStr(tp.period)}`;
        if (t.kind === 'teacher_pair_required_same_day') return `${paramStr(tp.teachers)} phải cùng dạy ${dayInText(tp.day)}`;
        if (t.kind === 'teacher_pair_required_same_slot') return `${paramStr(tp.teachers)} phải cùng dạy ${dayInText(tp.day)}, tiết ${paramStr(tp.period)}`;
        if (t.kind === 'pair_not_same_slot') return `${paramStr(tp.teachers)} không trùng tiết`;
        if (t.kind === 'teacher_no_gaps') return `Giáo viên ${paramStr(tp.teacher)} không có tiết trống`;
        return `(${t.kind ?? 'không xác định'})`;
      }).join('; ') || 'chưa phân tích được vế thì';
      return `Nếu ${condText} thì ${thenDesc}${soft(spec)}.`;
    }
    // --- Assignment-scoped kinds (added in M1 to fix debug-string leak) ---
    case 'assignment_pin_slot':
      return `${prefix}Phân công ${paramStr(p.assignmentId)} cố định vào ${dayInText(p.day)}, tiết ${paramStr(p.period)}${soft(spec)}.`;
    case 'assignment_block_slot':
      return `${prefix}Phân công ${paramStr(p.assignmentId)} không xếp vào ${dayInText(p.day)}, tiết ${paramStr(p.period)}${soft(spec)}.`;
    case 'assignment_allowed_slots': {
      const slots = Array.isArray(p.slots) ? p.slots : [];
      return `${prefix}Phân công ${paramStr(p.assignmentId)} chỉ được xếp vào ${slots.length} ô cho phép${soft(spec)}.`;
    }
    case 'assignment_spread_days':
      return `${prefix}Phân công ${paramStr(p.assignmentId)} phải trải qua ít nhất ${paramStr(p.minDays)} ngày${soft(spec)}.`;
    case 'weekly_periods_exact':
      return `${prefix}Phân công ${paramStr(p.assignmentId)}: đúng ${paramStr(p.count)} tiết mỗi tuần${soft(spec)}.`;
    case 'assignment_consecutive':
      return `${prefix}Phân công ${paramStr(p.assignmentId)}: dạy cụm ${paramStr(p.length)} tiết liên tiếp${soft(spec)}.`;
    case 'assignment_max_per_day':
      return `${prefix}Phân công ${paramStr(p.assignmentId)}: tối đa ${paramStr(p.max)} tiết mỗi ngày${soft(spec)}.`;
    case 'assignment_same_day': {
      const ids = Array.isArray(p.assignmentIds) ? p.assignmentIds.join(', ') : paramStr(p.assignmentIds);
      return `${prefix}Các phân công (${ids}) phải cùng ngày${soft(spec)}.`;
    }
    case 'assignment_not_same_day': {
      const ids = Array.isArray(p.assignmentIds) ? p.assignmentIds.join(', ') : paramStr(p.assignmentIds);
      return `${prefix}Các phân công (${ids}) không cùng ngày${soft(spec)}.`;
    }

    // --- Pair / mutual exclusion (added in M1) ---
    case 'pair_same_slot': {
      const ids = Array.isArray(p.assignmentIds) ? p.assignmentIds.join(', ') : paramStr(p.assignmentIds);
      return `${prefix}Hai phân công (${ids}) phải cùng tiết${soft(spec)}.`;
    }
    case 'mutual_exclusion': {
      const ids = Array.isArray(p.assignmentIds) ? p.assignmentIds.join(', ') : paramStr(p.assignmentIds);
      return `${prefix}Trong nhóm (${ids}), không có 2 phân công nào trùng tiết${soft(spec)}.`;
    }

    // --- Class-scoped kinds (added in M1) ---
    case 'class_allowed_periods':
      return `${prefix}Lớp ${paramStr(p.class)} chỉ học các tiết ${paramStr(p.periods)}${soft(spec)}.`;
    case 'class_fixed_period':
      return `${prefix}Lớp ${paramStr(p.class)} cố định học ${dayInText(p.day)}, tiết ${paramStr(p.period)}${soft(spec)}.`;
    case 'class_min_working_days':
      return `${prefix}Lớp ${paramStr(p.class)} học ít nhất ${paramStr(p.minDays)} ngày/tuần${soft(spec)}.`;
    case 'class_no_double_subject_day':
      return `${prefix}Lớp ${paramStr(p.class)} không học 2 tiết ${paramStr(p.subject)} cùng ngày${soft(spec)}.`;
    case 'class_subjects_same_day': {
      const subs = Array.isArray(p.subjects) ? p.subjects.join(', ') : paramStr(p.subjects);
      return `${prefix}Lớp ${paramStr(p.class)}: các môn (${subs}) cùng ngày${soft(spec)}.`;
    }

    // --- Subject group / session limits (added in M1) ---
    case 'subject_group': {
      const subs = Array.isArray(p.subjects) ? p.subjects.join(', ') : paramStr(p.subjects);
      return `${prefix}Nhóm môn: (${subs})${soft(spec)}.`;
    }
    case 'subject_group_daily_limit': {
      const subs = Array.isArray(p.subjects) ? p.subjects.join(', ') : paramStr(p.subjects);
      return `${prefix}Nhóm môn (${subs}): mỗi ngày tối đa ${paramStr(p.max)} tiết${soft(spec)}.`;
    }
    case 'subject_session_max_periods':
      return `${prefix}Môn ${paramStr(p.subject)} buổi ${paramStr(p.session)}: tối đa ${paramStr(p.max)} tiết${soft(spec)}.`;

    // --- THEN positive atoms (added in M1; usually appear inside if_then.then) ---
    case 'teacher_required_day':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} phải dạy ${dayInText(p.day)}${soft(spec)}.`;
    case 'teacher_required_slot':
      return `${prefix}Giáo viên ${paramStr(p.teacher)} phải dạy ${dayInText(p.day)}, tiết ${paramStr(p.period)}${soft(spec)}.`;
    case 'teacher_pair_required_same_day': {
      const teachers = Array.isArray(p.teachers) ? p.teachers.join(' và ') : paramStr(p.teachers);
      return `${prefix}${teachers} cùng dạy ${dayInText(p.day)}${soft(spec)}.`;
    }
    case 'teacher_pair_required_same_slot': {
      const teachers = Array.isArray(p.teachers) ? p.teachers.join(' và ') : paramStr(p.teachers);
      return `${prefix}${teachers} cùng dạy ${dayInText(p.day)}, tiết ${paramStr(p.period)}${soft(spec)}.`;
    }

    case 'custom_dsl': {
      // If LLM emitted IR form (expr present) or has explain text, the constraint
      // IS understood and encoded — show a friendly description, not "needs review".
      if (spec.params.expr || spec.params.explain) {
        const explain = typeof spec.params.explain === 'string' && spec.params.explain.trim()
          ? spec.params.explain
          : spec.original;
        return `${prefix}${explain}${soft(spec)}.`;
      }
      // Fall through to clarification (handled in default below) when no expr/explain.
      const questions = buildClarificationQuestions(spec.original ?? '');
      const prompt = questions[0]?.prompt
        ?? 'Bạn có thể diễn đạt rõ hơn ý này được không?';
      if (typeof console !== 'undefined' && process.env.NODE_ENV !== 'production') {
        console.warn('[humanizer:custom_dsl] No expr/explain, falling back to clarification');
      }
      return `${prefix}${prompt} (về: «${spec.original}»)${soft(spec)}.`;
    }
    default: {
      // FIX.md §3 / PRD M1: unrecognized kind must NEVER leak a debug-style message
      // to the user. Always ask a clarification question in plain Vietnamese.
      const questions = buildClarificationQuestions(spec.original ?? '');
      const prompt = questions[0]?.prompt
        ?? 'Bạn có thể diễn đạt rõ hơn ý này được không?';
      if (typeof console !== 'undefined' && process.env.NODE_ENV !== 'production') {
        console.warn(
          '[humanizer:default] Unhandled kind, falling back to clarification:',
          spec.kind,
        );
      }
      return `${prefix}${prompt} (về: «${spec.original}»)${soft(spec)}.`;
    }
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
