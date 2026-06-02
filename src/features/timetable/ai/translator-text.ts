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

export function extractPeriodNumber(text: string): number | null {
  const matched = text.match(/(?:tiết|tiet|period)\s*(\d+)/iu);
  if (matched) {
    const value = Number(matched[1]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

export function extractDayId(text: string, days: Array<{ id: string; label: string }>): string | null {
  for (const day of days) {
    if (includesLabel(text, day.id) || includesLabel(text, day.label)) return day.id;
  }

  if (/thứ\s*2|thu\s*2/iu.test(text)) return 'monday';
  if (/thứ\s*3|thu\s*3/iu.test(text)) return 'tuesday';
  if (/thứ\s*4|thu\s*4/iu.test(text)) return 'wednesday';
  if (/thứ\s*5|thu\s*5/iu.test(text)) return 'thursday';
  if (/thứ\s*6|thu\s*6/iu.test(text)) return 'friday';
  if (/thứ\s*7|thu\s*7/iu.test(text)) return 'saturday';
  if (/chủ\s*nhật|chu\s*nhat|\bcn\b/iu.test(text)) return 'sunday';

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

export function splitFallbackConstraintText(text: string): string[] {
  if (/(nếu|neu)[\s\S]*(thì|thi)/iu.test(text)) {
    return [text.trim()].filter(Boolean);
  }

  const hasPredicate = (clause: string) =>
    /(không|khong|chỉ|chi|phải|phai|tối\s*đa|toi\s*da|max|đúng|dung|chính\s*xác|chinh\s*xac|liên\s*tiếp|lien\s*tiep|cùng|trùng|cung|trung)/iu.test(
      clause,
    );

  return text
    .split(/(?:;|\n|\r|\s+(?:đồng\s+thời|dong\s+thoi)\s+)/iu)
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
