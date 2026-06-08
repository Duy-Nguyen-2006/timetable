import type { ConstraintSpec } from './constraint-spec';
import type { AgentInputPayload } from './types';

export function includesLabel(text: string, label: string): boolean {
  return text.toLocaleLowerCase('vi').includes(label.toLocaleLowerCase('vi'));
}

export function extractFirstNumber(text: string): number | null {
  const matched = text.match(/\b(\d+)\b/u);
  if (!matched) return null;
  const value = Number(matched[1]);
  return Number.isFinite(value) ? value : null;
}

/** Số tiết trong cụm “N tiết liên tiếp” (tránh lấy nhầm “1 môn”, “1 lớp”). */
export function extractConsecutiveBanCount(text: string): number | null {
  const matched = text.match(/(\d+)\s*(?:tiết|tiet)\s*(?:liên\s*tiếp|lien\s*tiep)/iu);
  if (matched) {
    const value = Number(matched[1]);
    if (Number.isFinite(value) && value >= 2) return value;
  }
  return extractFirstNumber(text);
}

export function extractPeriodNumber(text: string): number | null {
  const matched = text.match(/(?:tiết|tiet|period)\s*(\d+)/iu);
  if (matched) {
    const value = Number(matched[1]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

/** Map Vietnamese day-of-week number to the canonical index (0=Mon … 6=Sun). */
const VN_DAY_NUMBER_TO_INDEX: Record<string, number> = {
  '2': 0, 'hai': 0,
  '3': 1, 'ba': 1,
  '4': 2, 'tư': 2, 'tu': 2,
  '5': 3, 'năm': 3, 'nam': 3,
  '6': 4, 'sáu': 4, 'sau': 4,
  '7': 5, 'bảy': 5, 'bay': 5,
};

const HARDCODED_DAY_IDS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

function lookupDayIdByNumber(text: string, days: Array<{ id: string; label: string }>): string | null {
  // Try "thứ N" / "thu N" pattern — look up N in the days array by label.
  const m = text.match(/th[ứu]\s*(\d)/iu);
  if (m) {
    const idx = VN_DAY_NUMBER_TO_INDEX[m[1]];
    if (idx !== undefined && days[idx]) return days[idx].id;
  }
  // Try Vietnamese word forms ("hai", "ba", …).
  const m2 = text.match(/th[ứu]\s*(hai|ba|tư|tu|năm|nam|sáu|sau|bảy|bay)/iu);
  if (m2) {
    const idx = VN_DAY_NUMBER_TO_INDEX[m2[1].toLowerCase()];
    if (idx !== undefined && days[idx]) return days[idx].id;
  }
  // "chủ nhật" / "CN"
  if (/chủ\s*nhật|chu\s*nhat|\bcn\b/iu.test(text) && days[6]) return days[6].id;
  return null;
}

export function extractDayId(text: string, days: Array<{ id: string; label: string }>): string | null {
  // First pass: direct match against context day IDs and labels.
  for (const day of days) {
    if (includesLabel(text, day.id) || includesLabel(text, day.label)) return day.id;
  }

  // Second pass: match Vietnamese day-of-week patterns and resolve to context ID.
  const contextId = lookupDayIdByNumber(text, days);
  if (contextId) return contextId;

  // Third pass: hardcoded English fallback — chỉ chạy khi days array ngắn (< 7).
  // Với mỗi hardcoded ID, CHỈ return nếu ID đó thực sự có trong days array.
  // Tránh silent fail-open khi dataset 5 ngày (T2-T6) mà user nói "thứ 7"
  // → trả 'saturday' không tồn tại, sanitize sẽ phải reject về custom_dsl.
  if (days.length < HARDCODED_DAY_IDS.length) {
    const dayIds = new Set(days.map((d) => d.id));
    if (/thứ\s*2|thu\s*2/iu.test(text) && dayIds.has('monday')) return 'monday';
    if (/thứ\s*3|thu\s*3/iu.test(text) && dayIds.has('tuesday')) return 'tuesday';
    if (/thứ\s*4|thu\s*4/iu.test(text) && dayIds.has('wednesday')) return 'wednesday';
    if (/thứ\s*5|thu\s*5/iu.test(text) && dayIds.has('thursday')) return 'thursday';
    if (/thứ\s*6|thu\s*6/iu.test(text) && dayIds.has('friday')) return 'friday';
    if (/thứ\s*7|thu\s*7/iu.test(text) && dayIds.has('saturday')) return 'saturday';
    if (/chủ\s*nhật|chu\s*nhat|\bcn\b/iu.test(text) && dayIds.has('sunday')) return 'sunday';
  }

  return null;
}

export function normalizeConstraintText(text: string): string {
  return text
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isAutoBaseConstraintText(text: string): boolean {
  const normalized = normalizeConstraintText(text);
  const mentionsEvery = /\b(moi|tat ca|all|each)\b/u.test(normalized);
  const mentionsSlot = /\b(slot|tiet|period)\b/u.test(normalized);

  if (mentionsEvery && /\blop\b/u.test(normalized) && /\b(mon|mon hoc)\b/u.test(normalized) && mentionsSlot) {
    return true;
  }

  if (
    mentionsEvery &&
    /\bgiao vien\b/u.test(normalized) &&
    /\b(day|lop)\b/u.test(normalized) &&
    /(qua 1|hon 1|toi da 1|1 lop)/u.test(normalized) &&
    mentionsSlot
  ) {
    return true;
  }

  if (
    mentionsEvery &&
    /\bassignment\b/u.test(normalized) &&
    /(dung|du|chinh xac|phai xep)/u.test(normalized) &&
    /(so tiet|tiet\/tuan|tiet moi tuan)/u.test(normalized)
  ) {
    return true;
  }

  return false;
}

export function parseGlobalClassSubjectDailyLimit(text: string): { maxPerDay: number } | null {
  const normalized = normalizeConstraintText(text);
  const mentionsEvery = /\b(moi|tat ca|all|each)\b/u.test(normalized);
  const mentionsClass = /\blop\b/u.test(normalized);
  const mentionsSameSubject = /\bcung\s*(1|mot)?\s*mon\b/u.test(normalized);
  const mentionsDay = /\bngay\b/u.test(normalized);
  if (!(mentionsEvery && mentionsClass && mentionsSameSubject && mentionsDay)) {
    return null;
  }
  const m = normalized.match(/(?:khong qua|toi da|hon|qua)\s*(\d+)/u);
  const maxPerDay = m ? Number(m[1]) : 1;
  if (!Number.isFinite(maxPerDay) || maxPerDay < 1) return null;
  return { maxPerDay };
}

export function markAutoBaseSpec(spec: ConstraintSpec): ConstraintSpec {
  const tags = new Set(spec.tags ?? []);
  tags.add('auto_base');
  return {
    ...spec,
    severity: 'info',
    tags: [...tags],
  };
}

export function isResourceCapacityText(text: string): { subject: string; capacity: number } | null {
  const normalized = normalizeConstraintText(text);
  const match = normalized.match(
    /(.+?)\s+toi\s+da\s+(\d+)\s+lop\s+cung\s+(?:slot|tiet)/iu
  );
  if (match) {
    const subject = match[1].trim();
    const capacity = Number(match[2]);
    if (subject && Number.isFinite(capacity) && capacity > 0) return { subject, capacity };
  }
  return null;
}

export function isSessionLimitText(text: string): { teacher: string; maxPeriods: number; session: string } | null {
  const normalized = normalizeConstraintText(text);
  const match = normalized.match(
    /(?:moi|tat ca|all|each)\s+giao vien\s+khong\s+day\s+qua\s+(\d+)\s+tiet\s+trong\s+cung\s+1\s+buoi\s+(sang|chieu)/iu
  );
  if (match) {
    const maxPeriods = Number(match[1]);
    const session = match[2].toLowerCase().includes('sang') ? 'morning' : 'afternoon';
    if (Number.isFinite(maxPeriods) && maxPeriods > 0) return { teacher: '', maxPeriods, session };
  }
  return null;
}

export function isSubjectSessionMaxPeriodsText(text: string): { maxPeriods: number; session: 'morning' | 'afternoon' | 'all' } | null {
  const normalized = normalizeConstraintText(text);
  const match = normalized.match(
    /(?:khong|khong de|khong duoc|toi da|max)\s*(?:de\s+)?(?:\d+\s+)?(?:lop\s+)?(?:hoc\s+)?(?:qua\s+)?(\d+)\s+tiet\s+(?:cung\s+)?(?:1\s+)?(?:mon\s+)?(?:trong\s+)?(?:cung\s+)?(?:1\s+)?buoi(?:\s+(sang|chieu))?/iu
  );
  if (match) {
    const maxPeriods = Number(match[1]);
    const sessionRaw = match[2];
    let session: 'morning' | 'afternoon' | 'all' = 'all';
    if (sessionRaw) {
      session = sessionRaw.toLowerCase().includes('sang') ? 'morning' : 'afternoon';
    }
    if (Number.isFinite(maxPeriods) && maxPeriods > 0) return { maxPeriods, session };
  }

  const match2 = normalized.match(
    /(\d+)\s+tiet\s+(?:cung\s+)?(?:1\s+)?(?:mon\s+)?(?:trong\s+)?(?:cung\s+)?(?:1\s+)?buoi(?:\s+(sang|chieu))?/iu
  );
  if (match2 && /(khong|toi da|max|qua)/u.test(normalized)) {
    const maxPeriods = Number(match2[1]);
    const sessionRaw = match2[2];
    let session: 'morning' | 'afternoon' | 'all' = 'all';
    if (sessionRaw) {
      session = sessionRaw.toLowerCase().includes('sang') ? 'morning' : 'afternoon';
    }
    if (Number.isFinite(maxPeriods) && maxPeriods > 0) return { maxPeriods, session };
  }

  return null;
}

export function isSubjectGroupText(text: string): { name: string; subjects: string[] } | null {
  const normalized = normalizeConstraintText(text);
  const match = normalized.match(/mon\s+(.+?)\s+gom\s*:\s*(.+)/iu);
  if (match) {
    const name = match[1].trim();
    const subjects = match[2].split(/[,;]/u).map((s) => s.trim()).filter(Boolean);
    if (name && subjects.length > 0) return { name, subjects };
  }
  return null;
}

export function isSubjectGroupDailyLimitText(text: string): { groupName: string; maxPerDay: number } | null {
  const normalized = normalizeConstraintText(text);
  const match = normalized.match(
    /(?:moi|tat ca|all|each)\s+lop\s+khong\s+duoc\s+co\s+qua\s+(\d+)\s+mon\s+(.+?)\s+trong\s+cung\s+1\s+ngay/iu
  );
  if (match) {
    const maxPerDay = Number(match[1]);
    const groupName = match[2].trim();
    if (groupName && Number.isFinite(maxPerDay) && maxPerDay > 0) return { groupName, maxPerDay };
  }
  return null;
}

/** Split a THEN clause into independent sub-clauses by comma.
 *  "Sơn không dạy thứ 3 tiết 1, Hương không dạy thứ 4 tiết 3"
 *    → ["Sơn không dạy thứ 3 tiết 1", "Hương không dạy thứ 4 tiết 3"]
 *  We deliberately keep "A và B không dạy X" as one clause so its teachers stay paired. */
export function splitThenClause(text: string): string[] {
  if (!text) return [];
  return text
    .split(/,\s*/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Match teacher labels with word-boundary awareness and length-DESC ordering.
 *  Prevents false positives where one teacher's name is a substring of another
 *  (e.g. "Hương" inside "Phương"). Longer names are matched first and "consume"
 *  their position so overlapping substrings cannot re-match. */
export function matchTeacherLabels(text: string, labels: string[]): string[] {
  const lowerText = text.toLocaleLowerCase('vi');
  const sorted = [...labels].filter(Boolean).sort((a, b) => b.length - a.length);
  const matched: string[] = [];
  let remaining = lowerText;
  for (const label of sorted) {
    const lower = label.toLocaleLowerCase('vi');
    const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Word boundary: not preceded/followed by a Unicode letter or digit.
    const re = new RegExp(`(^|[^\\p{L}\\p{M}_0-9])(${escaped})(?=$|[^\\p{L}\\p{M}_0-9])`, 'u');
    if (re.test(remaining)) {
      matched.push(label);
      remaining = remaining.replace(new RegExp(escaped, 'u'), ' '.repeat(lower.length));
    }
  }
  return matched;
}

/** Match (teacher, subject, class) tuple from a text snippet, returning the
 *  unique `assignmentId` whose metadata appears in the text. Returns null if
 *  no assignment uniquely matches. Used by `if_then` THEN-clause to emit
 *  `assignment_pin_slot` / `assignment_spread_days` (F-8).
 *
 *  Lenient mode: a field (teacher/subject/class) only narrows the candidate
 *  set when it is actually mentioned in the text. So "Toán 6A" still matches
 *  a unique assignment whose teacher isn't named in the text. */
export function extractAssignmentMatch(
  text: string,
  assignments: AgentInputPayload['assignments']
): string | null {
  if (!assignments?.length) return null;
  const lower = text.toLocaleLowerCase('vi');

  const allTeacherLabels = [...new Set(assignments.map((a) => a.teacher.label).filter(Boolean))];
  const allSubjectLabels = [...new Set(assignments.map((a) => a.subject.label).filter(Boolean))];
  const allClassLabels = [...new Set(assignments.map((a) => a.class.label).filter(Boolean))];

  const teachersInText = allTeacherLabels.filter((t) => includesLabel(lower, t));
  const subjectsInText = allSubjectLabels.filter((s) => includesLabel(lower, s));
  const classesInText = allClassLabels.filter((c) => includesLabel(lower, c));

  const candidates = assignments.filter((assignment) => {
    if (teachersInText.length > 0 && !teachersInText.includes(assignment.teacher.label)) return false;
    if (subjectsInText.length > 0 && !subjectsInText.includes(assignment.subject.label)) return false;
    if (classesInText.length > 0 && !classesInText.includes(assignment.class.label)) return false;
    return true;
  });
  return candidates.length === 1 ? candidates[0].id : null;
}

export function splitFallbackConstraintText(text: string): string[] {
  if (/(nếu|neu)[\s\S]*(thì|thi)/iu.test(text)) {
    return [text.trim()].filter(Boolean);
  }

  const hasPredicate = (clause: string) =>
    /(không|khong|chỉ|chi|phải|phai|tối\s*đa|toi\s*da|max|đúng|dung|chính\s*xác|chinh\s*xac|liên\s*tiếp|lien\s*tiep|cùng|trùng|cung|trung)/iu.test(
      clause,
    );

  // "đồng thời" is only a clause separator when NOT preceded by a negation word
  // like "không". "không đồng thời dạy" = "not simultaneously teach" — keep together.
  const splitDongThoi = (t: string): string[] => {
    const pattern = /\s+(?:đồng\s+thời|dong\s+thoi)\s+/iu;
    const parts: string[] = [];
    let remaining = t;
    while (remaining) {
      const m = pattern.exec(remaining);
      if (!m) {
        parts.push(remaining);
        break;
      }
      const before = remaining.slice(0, m.index);
      // Check if "đồng thời" is preceded by a negation — if so, don't split here
      if (/(không|khong|chẳng|chang|chưa|chua|đừng|dung)\s*$/iu.test(before)) {
        parts.push(remaining);
        break;
      }
      parts.push(before);
      remaining = remaining.slice(m.index + m[0].length);
    }
    return parts;
  };

  return text
    .split(/(?:;|\n|\r)/u)
    .flatMap(splitDongThoi)
    .flatMap((segment) => {
      const clauses: string[] = [];
      let remainder = segment.trim();
      while (remainder) {
        const match = /\s+(?:và)\s+/iu.exec(remainder);
        if (!match) {
          clauses.push(remainder);
          break;
        }

        const before = remainder.slice(0, match.index).trim();
        const after = remainder.slice(match.index + match[0].length).trim();
        if (!hasPredicate(before) || !hasPredicate(after)) {
          clauses.push(remainder);
          break;
        }

        clauses.push(before);
        remainder = after;
      }
      return clauses;
    })
    .map((clause) => clause.trim())
    .filter(Boolean);
}

export function applyConstraintWeight(spec: ConstraintSpec, weight: number | undefined): ConstraintSpec {
  if (spec.severity !== 'soft') return spec;
  const safeWeight = Number(weight);
  if (!Number.isFinite(safeWeight) || safeWeight <= 0) return spec;
  return {
    ...spec,
    weight: safeWeight,
    params: { ...spec.params, weight: safeWeight },
  };
}

export function inferWeeklyAssignmentId(
  assignments: AgentInputPayload['assignments'],
  teacher: string | null,
  subject: string | null,
  klass: string | null,
  weeklyPeriods: number
): string | null {
  const matched = assignments.filter((assignment) => {
    if (teacher && assignment.teacher.label !== teacher) return false;
    if (subject && assignment.subject.label !== subject) return false;
    if (klass && assignment.class.label !== klass) return false;
    return assignment.weeklyPeriods === weeklyPeriods;
  });
  return matched.length === 1 ? matched[0].id : null;
}

export function shouldMarkWeeklyAutoBase(
  spec: ConstraintSpec,
  assignments: AgentInputPayload['assignments']
): boolean {
  if (spec.kind !== 'weekly_periods_exact') return false;
  const assignmentId = typeof spec.params.assignmentId === 'string' ? spec.params.assignmentId : '';
  if (!assignmentId) return false;
  const weeklyPeriods = Number(spec.params.weeklyPeriods ?? NaN);
  if (!Number.isFinite(weeklyPeriods)) return false;
  const assignment = assignments.find((item) => item.id === assignmentId);
  if (!assignment) return false;
  return assignment.weeklyPeriods === weeklyPeriods;
}
