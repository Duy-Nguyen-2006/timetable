import { z } from 'zod';

import { parseConstraint } from '@/lib/constraint-parser';

import { CONSTRAINT_KINDS } from './constraint-spec';
import type { ConstraintSpec } from './constraint-spec';
import { parseModelJson } from './parse-model-json';
import type { AgentInputPayload, AIProviderConfig, ChatUsage, TranslatorTurnResult } from './types';
import { invokeChat, type ChatPayload } from './chat-client';

type ChatInvoke = (payload: ChatPayload) => Promise<{ content?: string; usage?: ChatUsage }>;

const constraintSpecSchema = z.object({
  id: z.string(),
  original: z.string(),
  severity: z.enum(['hard', 'soft', 'info']),
  kind: z.enum(CONSTRAINT_KINDS),
  params: z.record(z.string(), z.unknown()),
  tags: z.array(z.enum(['auto_base', 'user_required', 'user_preferred'])).optional(),
  notes: z.string().optional(),
});

const translatorResponseSchema = z.object({
  constraintSpecs: z.array(constraintSpecSchema),
});

const TRANSLATOR_CHAT_TIMEOUT_MS = 30_000;

const defaultInvokeChat: ChatInvoke = (payload) => invokeChat(payload);

function includesLabel(text: string, label: string): boolean {
  return text.toLocaleLowerCase('vi').includes(label.toLocaleLowerCase('vi'));
}

function extractFirstNumber(text: string): number | null {
  const matched = text.match(/\b(\d+)\b/u);
  if (!matched) return null;
  const value = Number(matched[1]);
  return Number.isFinite(value) ? value : null;
}

// Trích số đứng ngay sau từ "tiết" / "tiet" / "period" — dùng cho
// parsing câu như "thứ 6 tiết 5" để tránh nhầm số "6" (thứ 6) thành
// period. (fix bug #14)
function extractPeriodNumber(text: string): number | null {
  const matched = text.match(/(?:tiết|tiet|period)\s*(\d+)/iu);
  if (matched) {
    const value = Number(matched[1]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function extractDayId(text: string, days: Array<{ id: string; label: string }>): string | null {
  for (const day of days) {
    if (includesLabel(text, day.id) || includesLabel(text, day.label)) return day.id;
  }

  if (/thứ\s*2|thu\s*2/u.test(text)) return 'mon';
  if (/thứ\s*3|thu\s*3/u.test(text)) return 'tue';
  if (/thứ\s*4|thu\s*4/u.test(text)) return 'wed';
  if (/thứ\s*5|thu\s*5/u.test(text)) return 'thu';
  if (/thứ\s*6|thu\s*6/u.test(text)) return 'fri';
  if (/thứ\s*7|thu\s*7/u.test(text)) return 'sat';
  if (/chủ\s*nhật|chu\s*nhat|cn/u.test(text)) return 'sun';

  return null;
}

function buildTranslatorPeriods(input: AgentInputPayload): number[] {
  const periodSet = new Set<number>();
  const periodsByDay = buildTranslatorPeriodsByDay(input);

  for (const periods of Object.values(periodsByDay)) {
    for (const period of periods) {
      if (Number.isFinite(period) && period > 0) periodSet.add(period);
    }
  }

  return [...periodSet].sort((a, b) => a - b);
}

function buildTranslatorPeriodsByDay(input: AgentInputPayload): Record<string, number[]> {
  const periodsByDay: Record<string, number[]> = {};
  const allDaysHaveDayLevelCount = input.days.every((day) => {
    const value = Number(input.periodCounts[day.id]);
    return Number.isFinite(value) && value > 0;
  });
  const hasSessionCounts = input.sessions.some((session) => {
    const value = Number(input.periodCounts[session.id]);
    return Number.isFinite(value) && value > 0;
  });

  for (const day of input.days) {
    const activePeriods: number[] = [];
    const dayLevelValue = Number(input.periodCounts[day.id]);
    const dayHasOwnCount = Number.isFinite(dayLevelValue) && dayLevelValue > 0;

    if ((allDaysHaveDayLevelCount || dayHasOwnCount) && !hasSessionCounts) {
      const deletedPeriods = new Set<number>();
      for (const [key, isDeleted] of Object.entries(input.deletedPeriods)) {
        if (!isDeleted) continue;
        const [keyDay, , keyPeriodRaw] = key.split('-');
        const keyPeriod = Number(keyPeriodRaw);
        if (keyDay === day.id && Number.isFinite(keyPeriod)) deletedPeriods.add(keyPeriod);
      }
      for (let period = 1; period <= dayLevelValue; period += 1) {
        if (!deletedPeriods.has(period)) activePeriods.push(period);
      }
      periodsByDay[day.id] = activePeriods;
      continue;
    }

    let offset = 0;
    for (const session of input.sessions) {
      const sessionMax = Number(input.periodCounts[session.id] ?? 0);
      for (let period = 1; period <= sessionMax; period += 1) {
        const key = `${day.id}-${session.id}-${period}`;
        if (!input.deletedPeriods[key]) activePeriods.push(offset + period);
      }
      offset += sessionMax;
    }
    periodsByDay[day.id] = activePeriods;
  }

  return periodsByDay;
}

function periodsForSession(input: AgentInputPayload, sessionId: string): number[] {
  let offset = 0;
  for (const session of input.sessions) {
    const count = Number(input.periodCounts[session.id] ?? 0);
    const periods = Array.from({ length: Math.max(0, count) }, (_, index) => offset + index + 1);
    if (session.id === sessionId) return periods;
    offset += count;
  }
  return [];
}

function normalizeConstraintText(text: string): string {
  return text
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveLabelByNormalized(labels: string[], value: string): string {
  const normalized = normalizeConstraintText(value);
  return labels.find((label) => normalizeConstraintText(label) === normalized) ?? value;
}

function isAutoBaseConstraintText(text: string): boolean {
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

function parseGlobalClassSubjectDailyLimit(text: string): { maxPerDay: number } | null {
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

function markAutoBaseSpec(spec: ConstraintSpec): ConstraintSpec {
  const tags = new Set(spec.tags ?? []);
  tags.add('auto_base');
  return {
    ...spec,
    severity: 'info',
    tags: [...tags],
  };
}

function isResourceCapacityText(text: string): { subject: string; capacity: number } | null {
  const normalized = normalizeConstraintText(text);
  const match = normalized.match(
    /(.+?)\s+toi\s+da\s+(\d+)\s+lop\s+cung\s+slot/iu
  );
  if (match) {
    const subject = match[1].trim();
    const capacity = Number(match[2]);
    if (subject && Number.isFinite(capacity) && capacity > 0) return { subject, capacity };
  }
  return null;
}

function isSessionLimitText(text: string): { teacher: string; maxPeriods: number; session: string } | null {
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

function isSubjectGroupText(text: string): { name: string; subjects: string[] } | null {
  const normalized = normalizeConstraintText(text);
  const match = normalized.match(/mon\s+(.+?)\s+gom\s*:\s*(.+)/iu);
  if (match) {
    const name = match[1].trim();
    const subjects = match[2].split(/[,;]/u).map((s) => s.trim()).filter(Boolean);
    if (name && subjects.length > 0) return { name, subjects };
  }
  return null;
}

function isSubjectGroupDailyLimitText(text: string): { groupName: string; maxPerDay: number } | null {
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

function splitFallbackConstraintText(text: string): string[] {
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

function fallbackFromRuleParser(input: AgentInputPayload): ConstraintSpec[] {
  const teacherLabels = [...new Set(input.assignments.map((assignment) => assignment.teacher.label))];
  const classLabels = [...new Set(input.assignments.map((assignment) => assignment.class.label))];
  const subjectLabels = [...new Set(input.assignments.map((assignment) => assignment.subject.label))];
  const dayIds = Object.fromEntries(input.days.map((day) => [day.id, day.id]));
  const sessionIds = Object.fromEntries(input.sessions.map((session) => [session.id, session.id]));

  let nextId = 1;
  return input.constraints.flatMap((rawConstraint) => {
    const clauses = splitFallbackConstraintText(rawConstraint.text);
    return clauses.flatMap<ConstraintSpec>((clause) => {
      const constraint = { ...rawConstraint, text: clause };
      const id = `c${nextId++}`;
      const parsed = parseConstraint(constraint.text, {
        teacherLabels,
        classLabels,
        subjectLabels,
        dayIds,
        sessionIds,
      });
      const severity = constraint.type === 'required' ? 'hard' : 'soft';

    if (/nếu|neu/iu.test(constraint.text) && /thì|thi/iu.test(constraint.text)) {
      const [ifClauseRaw, thenClauseRaw = ''] = constraint.text.split(/thì|thi/iu);
      const ifTeachers = teacherLabels.filter((label) => includesLabel(ifClauseRaw, label));
      const ifDay = extractDayId(ifClauseRaw, input.days);
      const condition =
        ifTeachers.length >= 2 && ifDay
          ? {
              op: 'and' as const,
              args: ifTeachers.slice(0, 2).map((teacher) => ({
                op: 'teacher_teaches_on_day' as const,
                teacher,
                day: ifDay,
              })),
            }
          : ifTeachers[0] && ifDay
            ? ({
                op: 'teacher_teaches_on_day' as const,
                teacher: ifTeachers[0],
                day: ifDay,
              } as const)
            : null;

      const thenTeachers = teacherLabels.filter((label) => includesLabel(thenClauseRaw, label));
      const thenDay = extractDayId(thenClauseRaw, input.days);
      const thenPeriod = extractFirstNumber(thenClauseRaw);
      const thenSpecs: Array<{ kind: string; params: Record<string, unknown> }> = [];

      if (/(không|khong).*(cùng|trùng).*(tiết|tiet)/iu.test(thenClauseRaw) && thenTeachers.length >= 2) {
        thenSpecs.push({
          kind: 'pair_not_same_slot',
          params: {
            teachers: thenTeachers.slice(0, 2),
            ...(thenDay ? { scope: { day: thenDay } } : {}),
          },
        });
      } else if (/(không|khong).*(dạy|day)/iu.test(thenClauseRaw) && thenTeachers[0] && thenDay && (extractPeriodNumber(thenClauseRaw) ?? thenPeriod) !== null) {
        thenSpecs.push({
          kind: 'teacher_block_slot',
          params: { teacher: thenTeachers[0], day: thenDay, period: extractPeriodNumber(thenClauseRaw) ?? thenPeriod },
        });
      } else if (/(không|khong).*(dạy|day)/iu.test(thenClauseRaw) && thenTeachers[0] && thenDay) {
        thenSpecs.push({
          kind: 'teacher_block_day',
          params: { teacher: thenTeachers[0], day: thenDay },
        });
      }

      if (condition && thenSpecs.length > 0) {
        return {
          id,
          original: constraint.text,
          severity,
          kind: 'if_then',
          params: {
            if: condition,
            then: thenSpecs,
          },
        } satisfies ConstraintSpec;
      }
    }

    if (parsed.kind === 'teacher_block_days' && parsed.teacherLabels[0] && parsed.dayIds[0]) {
      return {
        id,
        original: constraint.text,
        severity,
        kind: 'teacher_block_day',
        params: { teacher: parsed.teacherLabels[0], day: parsed.dayIds[0] },
      } satisfies ConstraintSpec;
    }

    if (parsed.kind === 'teacher_block_periods' && parsed.teacherLabels[0] && parsed.periods[0]) {
      return {
        id,
        original: constraint.text,
        severity,
        kind: 'teacher_block_period',
        params: { teacher: parsed.teacherLabels[0], period: parsed.periods[0] },
      } satisfies ConstraintSpec;
    }

    if (
      parsed.kind === 'teacher_block_day_period' &&
      parsed.teacherLabels[0] &&
      parsed.dayIds[0] &&
      parsed.periods[0]
    ) {
      return {
        id,
        original: constraint.text,
        severity,
        kind: 'teacher_block_slot',
        params: { teacher: parsed.teacherLabels[0], day: parsed.dayIds[0], period: parsed.periods[0] },
      } satisfies ConstraintSpec;
    }

    if (parsed.kind === 'teacher_block_session_day' && parsed.teacherLabels[0] && parsed.sessionIds[0]) {
      const day = parsed.dayIds[0];
      return periodsForSession(input, parsed.sessionIds[0]).map((period) => ({
        id,
        original: constraint.text,
        severity,
        kind: day ? 'teacher_block_slot' : 'teacher_block_period',
        params: day
          ? { teacher: parsed.teacherLabels[0], day, period }
          : { teacher: parsed.teacherLabels[0], period },
      }) satisfies ConstraintSpec);
    }

    if (parsed.kind === 'teacher_block_sessions' && parsed.teacherLabels[0] && parsed.sessionIds[0]) {
      return periodsForSession(input, parsed.sessionIds[0]).map((period) => ({
        id,
        original: constraint.text,
        severity,
        kind: 'teacher_block_period',
        params: { teacher: parsed.teacherLabels[0], period },
      }) satisfies ConstraintSpec);
    }

    if (parsed.kind === 'teacher_allow_only_days' && parsed.teacherLabels[0] && parsed.dayIds.length > 0) {
      const allowedDays = new Set(parsed.dayIds);
      return input.days
        .map((day) => day.id)
        .filter((day) => !allowedDays.has(day))
        .map((day) => ({
          id,
          original: constraint.text,
          severity,
          kind: 'teacher_block_day',
          params: { teacher: parsed.teacherLabels[0], day },
        }) satisfies ConstraintSpec);
    }

    if (parsed.kind === 'teacher_allow_only_sessions' && parsed.teacherLabels[0] && parsed.sessionIds.length > 0) {
      const allowedPeriods = new Set(parsed.sessionIds.flatMap((sessionId) => periodsForSession(input, sessionId)));
      return buildTranslatorPeriods(input)
        .filter((period) => !allowedPeriods.has(period))
        .map((period) => ({
          id,
          original: constraint.text,
          severity,
          kind: 'teacher_block_period',
          params: { teacher: parsed.teacherLabels[0], period },
        }) satisfies ConstraintSpec);
    }

    if (parsed.kind === 'teacher_max_consecutive') {
      const teacher = parsed.teacherLabels === '*' ? '' : parsed.teacherLabels[0];
      if (teacher) {
        return {
          id,
          original: constraint.text,
          severity,
          kind: 'teacher_max_consecutive',
          params: { teacher, maxConsecutive: parsed.max },
        } satisfies ConstraintSpec;
      }
    }

    if (parsed.kind === 'subject_pin_periods' && parsed.subjectLabels[0] && parsed.periods.length > 0) {
      const classes = classLabels.filter((label) => includesLabel(constraint.text, label));
      return {
        id,
        original: constraint.text,
        severity,
        kind: 'subject_pin_period',
        params: {
          subject: parsed.subjectLabels[0],
          periods: parsed.periods,
          ...(classes.length ? { classes } : {}),
        },
      } satisfies ConstraintSpec;
    }

    if (parsed.kind === 'subject_block_periods' && parsed.subjectLabels[0] && parsed.periods.length > 0) {
      const blockedPeriods = new Set(parsed.periods);
      const allowedPeriods = buildTranslatorPeriods(input).filter((period) => !blockedPeriods.has(period));
      if (allowedPeriods.length > 0) {
        const classes = classLabels.filter((label) => includesLabel(constraint.text, label));
        return {
          id,
          original: constraint.text,
          severity,
          kind: 'subject_pin_period',
          params: {
            subject: parsed.subjectLabels[0],
            periods: allowedPeriods,
            ...(classes.length ? { classes } : {}),
          },
        } satisfies ConstraintSpec;
      }
    }

    if (parsed.kind === 'subject_only_sessions' && parsed.subjectLabels[0] && parsed.sessionIds.length > 0) {
      const allowedPeriods = parsed.sessionIds.flatMap((sessionId) => periodsForSession(input, sessionId));
      if (allowedPeriods.length > 0) {
        const classes = classLabels.filter((label) => includesLabel(constraint.text, label));
        return {
          id,
          original: constraint.text,
          severity,
          kind: 'subject_pin_period',
          params: {
            subject: parsed.subjectLabels[0],
            periods: allowedPeriods,
            ...(classes.length ? { classes } : {}),
          },
        } satisfies ConstraintSpec;
      }
    }

    if (parsed.kind === 'subject_prefer_periods' && parsed.subjectLabels[0] && parsed.periods.length > 0) {
      const classes = classLabels.filter((label) => includesLabel(constraint.text, label));
      const isPinned = /(chỉ|chi|duy\s*nhất|duy\s*nhat)/u.test(constraint.text);
      if (isPinned) {
        return {
          id,
          original: constraint.text,
          severity,
          kind: 'subject_pin_period',
          params: {
            subject: parsed.subjectLabels[0],
            periods: parsed.periods,
            ...(classes.length ? { classes } : {}),
          },
        } satisfies ConstraintSpec;
      }
    }

    if (parsed.kind === 'subject_block_consecutive' && parsed.subjectLabels[0]) {
      const classes = classLabels.filter((label) => includesLabel(constraint.text, label));
      return {
        id,
        original: constraint.text,
        severity,
        kind: 'subject_consecutive',
        params: {
          subject: parsed.subjectLabels[0],
          length: parsed.blockSize || 2,
          ...(classes.length ? { classes } : {}),
        },
      } satisfies ConstraintSpec;
    }

    const mentionsLegacyNoDouble =
      /không\s*học|khong\s*hoc/u.test(constraint.text) &&
      /(2|hai).*(lần|lan|tiết|tiet).*(ngày|ngay)/u.test(constraint.text);
    const mentionsDailyLimitText =
      /(không\s*quá|khong\s*qua|không\s*học|khong\s*hoc|tối\s*đa|toi\s*da)/u.test(constraint.text) &&
      /(cùng|cung).*(môn|mon)/u.test(constraint.text) &&
      /(ngày|ngay)/u.test(constraint.text);
    if (mentionsLegacyNoDouble || mentionsDailyLimitText) {
      const klass = classLabels.find((label) => includesLabel(constraint.text, label));
      if (klass) {
        const subject = subjectLabels.find((label) => includesLabel(constraint.text, label));
        const limitMatch = normalizeConstraintText(constraint.text).match(
          /(?:khong qua|toi da|hon|qua)\s*(\d+)/u
        );
        const parsedLimit = limitMatch ? Number(limitMatch[1]) : 1;
        const maxPerDay = Number.isFinite(parsedLimit) && parsedLimit >= 1 ? parsedLimit : 1;
        return {
          id,
          original: constraint.text,
          severity,
          kind: 'class_no_double_subject_day',
          params: {
            class: klass,
            ...(subject ? { subject } : {}),
            maxPerDay,
          },
        } satisfies ConstraintSpec;
      }
    }

    const globalDailyLimit = parseGlobalClassSubjectDailyLimit(constraint.text);
    if (globalDailyLimit) {
      const classSubjectPairs = [
        ...new Map(
          input.assignments.map((assignment) => [
            `${assignment.class.label}::${assignment.subject.label}`,
            { class: assignment.class.label, subject: assignment.subject.label },
          ])
        ).values(),
      ];

      return classSubjectPairs.map((pair, pairIndex) => ({
        id: classSubjectPairs.length === 1 ? id : `${id}_${pairIndex + 1}`,
        original: constraint.text,
        severity,
        kind: 'class_no_double_subject_day',
        params: { ...pair, maxPerDay: globalDailyLimit.maxPerDay },
      }) satisfies ConstraintSpec);
    }

    if (/(tối\s*đa|max).*(tiết|tiet).*(ngày|ngay)/u.test(constraint.text)) {
      const teacher = teacherLabels.find((label) => includesLabel(constraint.text, label));
      const maxPerDay = extractFirstNumber(constraint.text);
      if (teacher && maxPerDay !== null) {
        return {
          id,
          original: constraint.text,
          severity,
          kind: 'teacher_max_per_day',
          params: { teacher, maxPerDay },
        } satisfies ConstraintSpec;
      }
    }

    if (/(không|khong).*(cùng|trùng).*(tiết|tiet)/u.test(constraint.text)) {
      const teachers = teacherLabels.filter((label) => includesLabel(constraint.text, label)).slice(0, 2);
      if (teachers.length === 2) {
        const day = extractDayId(constraint.text, input.days);
        return {
          id,
          original: constraint.text,
          severity,
          kind: 'pair_not_same_slot',
          params: {
            teachers,
            ...(day ? { scope: { day } } : {}),
          },
        } satisfies ConstraintSpec;
      }
    }

    if (/(đúng|dung|chính\s*xác).*(tiết|tiet)/u.test(constraint.text)) {
      const weeklyPeriods = extractFirstNumber(constraint.text);
      if (weeklyPeriods !== null) {
        const teacher = teacherLabels.find((label) => includesLabel(constraint.text, label));
        const subject = subjectLabels.find((label) => includesLabel(constraint.text, label));
        const klass = classLabels.find((label) => includesLabel(constraint.text, label));
        const matchedAssignments = input.assignments.filter((assignment) => {
          if (teacher && assignment.teacher.label !== teacher) return false;
          if (subject && assignment.subject.label !== subject) return false;
          if (klass && assignment.class.label !== klass) return false;
          return true;
        });
        const assignmentId = matchedAssignments.length === 1 ? matchedAssignments[0].id : undefined;
        if (teacher || subject || klass) {
          return {
            id,
            original: constraint.text,
            severity,
            kind: 'weekly_periods_exact',
            params: {
              ...(teacher ? { teacher } : {}),
              ...(subject ? { subject } : {}),
              ...(klass ? { class: klass } : {}),
              ...(assignmentId ? { assignmentId } : {}),
              weeklyPeriods,
            },
          } satisfies ConstraintSpec;
        }
      }
    }

    const resourceCapacity = isResourceCapacityText(constraint.text);
    if (resourceCapacity) {
      return {
        id,
        original: constraint.text,
        severity,
        kind: 'resource_capacity',
        params: resourceCapacity,
      } satisfies ConstraintSpec;
    }

    const sessionLimit = isSessionLimitText(constraint.text);
    if (sessionLimit) {
      return {
        id,
        original: constraint.text,
        severity,
        kind: 'session_limit',
        params: sessionLimit,
      } satisfies ConstraintSpec;
    }

    const subjectGroup = isSubjectGroupText(constraint.text);
    if (subjectGroup) {
      return {
        id,
        original: constraint.text,
        severity,
        kind: 'subject_group',
        params: {
          ...subjectGroup,
          subjects: subjectGroup.subjects.map((subject) => resolveLabelByNormalized(subjectLabels, subject)),
        },
      } satisfies ConstraintSpec;
    }

    const subjectGroupLimit = isSubjectGroupDailyLimitText(constraint.text);
    if (subjectGroupLimit) {
      return {
        id,
        original: constraint.text,
        severity,
        kind: 'subject_group_daily_limit',
        params: subjectGroupLimit,
      } satisfies ConstraintSpec;
    }

    // teacher_min_off_days → teacher_max_working_days
    if (parsed.kind === 'teacher_min_off_days') {
      const teachers = parsed.teacherLabels === '*' ? [] : parsed.teacherLabels;
      const minOff = parsed.min;
      if (teachers.length > 0) {
        return teachers.map((teacher, i) => ({
          id: teachers.length === 1 ? id : `${id}_${i + 1}`,
          original: constraint.text,
          severity,
          kind: 'teacher_max_working_days' as const,
          params: { teacher, minDaysOff: minOff },
        }) satisfies ConstraintSpec);
      }
      // wildcard '*' — áp dụng cho tất cả GV
      return {
        id,
        original: constraint.text,
        severity,
        kind: 'teacher_max_working_days' as const,
        params: { minDaysOff: minOff },
      } satisfies ConstraintSpec;
    }

    // subject_prefer_periods → subject_pin_period (soft)
    if (parsed.kind === 'subject_prefer_periods' && parsed.subjectLabels[0] && parsed.periods.length > 0) {
      const classes = parsed.classFilter ?? classLabels.filter((label) => includesLabel(constraint.text, label));
      return {
        id,
        original: constraint.text,
        severity: 'soft',
        kind: 'subject_pin_period' as const,
        params: {
          subject: parsed.subjectLabels[0],
          periods: parsed.periods,
          ...(classes.length ? { classes } : {}),
        },
      } satisfies ConstraintSpec;
    }

    // subject_prefer_sessions → subject_pin_period (soft, map session → periods)
    if (parsed.kind === 'subject_prefer_sessions' && parsed.subjectLabels[0] && parsed.sessionIds.length > 0) {
      const allowedPeriods = parsed.sessionIds.flatMap((sessionId) => periodsForSession(input, sessionId));
      if (allowedPeriods.length > 0) {
        const classes = classLabels.filter((label) => includesLabel(constraint.text, label));
        return {
          id,
          original: constraint.text,
          severity: 'soft',
          kind: 'subject_pin_period' as const,
          params: {
            subject: parsed.subjectLabels[0],
            periods: allowedPeriods,
            ...(classes.length ? { classes } : {}),
          },
        } satisfies ConstraintSpec;
      }
    }

    // class_daily_subject_any → class_subjects_not_same_day (đảm bảo mỗi ngày có ít nhất 1 trong nhóm môn)
    if (parsed.kind === 'class_daily_subject_any' && parsed.subjectLabels.length > 0) {
      const targetClasses = parsed.classLabels === '*'
        ? classLabels
        : parsed.classLabels.length > 0 ? parsed.classLabels : classLabels;
      return targetClasses.map((klass, i) => ({
        id: targetClasses.length === 1 ? id : `${id}_${i + 1}`,
        original: constraint.text,
        severity,
        kind: 'class_subjects_not_same_day' as const,
        params: {
          class: klass,
          subjects: parsed.subjectLabels,
          maxSubjectsPerDay: 1,
        },
      }) satisfies ConstraintSpec);
    }

    // subjects_not_consecutive → subject_not_consecutive_days cho từng môn
    if (parsed.kind === 'subjects_not_consecutive' && parsed.subjectLabels.length > 0) {
      return parsed.subjectLabels.map((subject, i) => ({
        id: parsed.subjectLabels.length === 1 ? id : `${id}_${i + 1}`,
        original: constraint.text,
        severity,
        kind: 'subject_not_consecutive_days' as const,
        params: { subject },
      }) satisfies ConstraintSpec);
    }

    const fallbackSpec = {
      id,
      original: constraint.text,
      severity,
      kind: 'custom_dsl',
      params: {
        naturalLanguage: constraint.text,
      },
      notes: severity === 'hard' ? 'fallback_parser:UNPARSED_HARD' : 'fallback_parser',
    } satisfies ConstraintSpec;

    return isAutoBaseConstraintText(constraint.text) ? markAutoBaseSpec(fallbackSpec) : fallbackSpec;
    });
  });
}

function fuzzyMatchLabel(value: string, validLabels: Set<string>): string | null {
  if (validLabels.has(value)) return value;
  const norm = normalizeConstraintText(value);
  for (const label of validLabels) {
    if (normalizeConstraintText(label) === norm) return label;
  }
  // substring match: value is contained in label or vice versa
  for (const label of validLabels) {
    const normLabel = normalizeConstraintText(label);
    if (normLabel.includes(norm) || norm.includes(normLabel)) return label;
  }
  return null;
}

function fuzzyFixParams(
  params: Record<string, unknown>,
  validTeachers: Set<string>,
  validClasses: Set<string>,
  validSubjects: Set<string>,
  validDays: Set<string>
): { params: Record<string, unknown>; fixed: boolean } {
  let fixed = false;
  const result = { ...params };
  if (typeof result.teacher === 'string') {
    const match = fuzzyMatchLabel(result.teacher, validTeachers);
    if (match && match !== result.teacher) { result.teacher = match; fixed = true; }
  }
  if (typeof result.class === 'string') {
    const match = fuzzyMatchLabel(result.class, validClasses);
    if (match && match !== result.class) { result.class = match; fixed = true; }
  }
  if (typeof result.subject === 'string') {
    const match = fuzzyMatchLabel(result.subject, validSubjects);
    if (match && match !== result.subject) { result.subject = match; fixed = true; }
  }
  if (typeof result.day === 'string') {
    const match = fuzzyMatchLabel(result.day, validDays);
    if (match && match !== result.day) { result.day = match; fixed = true; }
  }
  if (Array.isArray(result.classes)) {
    const newClasses = result.classes.map((c) =>
      typeof c === 'string' ? (fuzzyMatchLabel(c, validClasses) ?? c) : c
    );
    if (newClasses.some((c, i) => c !== (result.classes as unknown[])[i])) {
      result.classes = newClasses; fixed = true;
    }
  }
  if (Array.isArray(result.subjects)) {
    const newSubjects = result.subjects.map((s) =>
      typeof s === 'string' ? (fuzzyMatchLabel(s, validSubjects) ?? s) : s
    );
    if (newSubjects.some((s, i) => s !== (result.subjects as unknown[])[i])) {
      result.subjects = newSubjects; fixed = true;
    }
  }
  if (Array.isArray(result.teachers)) {
    const newTeachers = result.teachers.map((t) =>
      typeof t === 'string' ? (fuzzyMatchLabel(t, validTeachers) ?? t) : t
    );
    if (newTeachers.some((t, i) => t !== (result.teachers as unknown[])[i])) {
      result.teachers = newTeachers; fixed = true;
    }
  }
  return { params: result, fixed };
}


function hasHardCustomDsl(specs: ConstraintSpec[]): boolean {
  return specs.some((spec) => spec.severity === 'hard' && spec.kind === 'custom_dsl');
}

function sanitizeSpecs(input: AgentInputPayload, specs: ConstraintSpec[]): ConstraintSpec[] {
  const validTeachers = new Set(input.assignments.map((assignment) => assignment.teacher.label));
  const validClasses = new Set(input.assignments.map((assignment) => assignment.class.label));
  const validSubjects = new Set(input.assignments.map((assignment) => assignment.subject.label));
  const validDays = new Set(input.days.map((day) => day.id));

  return specs.flatMap((spec, index) => {
    const base: ConstraintSpec = {
      ...spec,
      id: `c${index + 1}`,
      original: spec.original || input.constraints[index]?.text || '',
      severity:
        spec.severity ?? (input.constraints[index]?.type === 'required' ? 'hard' : 'soft'),
      params: spec.params ?? {},
      tags: spec.tags ?? [],
    };

    const teacher = typeof base.params.teacher === 'string' ? base.params.teacher : null;
    const klass = typeof base.params.class === 'string' ? base.params.class : null;
    const subject = typeof base.params.subject === 'string' ? base.params.subject : null;
    const day = typeof base.params.day === 'string' ? base.params.day : null;
    const weeklyPeriods = Number(base.params.weeklyPeriods ?? NaN);
    const period = Number(base.params.period ?? NaN);

    if (base.kind === 'custom_dsl' && base.original.trim() && isAutoBaseConstraintText(base.original)) {
      return markAutoBaseSpec(base);
    }

    if (base.kind === 'custom_dsl' && base.original.trim()) {
      const fallback = fallbackFromRuleParser({
        ...input,
        constraints: [
          {
            type: base.severity === 'hard' ? 'required' : 'preferred',
            text: base.original,
          },
        ],
      });
      const reparsed = fallback.filter((item) => item.kind !== 'custom_dsl');

      if (reparsed.length > 0) {
        return reparsed.map((item, itemIndex) => ({
          ...item,
          id: reparsed.length === 1 ? base.id : `${base.id}_${itemIndex + 1}`,
          original: base.original,
          severity: base.severity,
          tags: base.tags,
        }));
      }

      if (fallback.length === 0) return [];
    }

    if (base.kind === 'teacher_block_day' && /(?:buổi|buoi|sáng|sang|chiều|chieu|tối|toi)/iu.test(base.original)) {
      const reparsed = fallbackFromRuleParser({
        ...input,
        constraints: [
          {
            type: base.severity === 'hard' ? 'required' : 'preferred',
            text: base.original,
          },
        ],
      }).filter((item) => item.kind !== 'custom_dsl');

      if (reparsed.length > 0) {
        return reparsed.map((item, itemIndex) => ({
          ...item,
          id: reparsed.length === 1 ? base.id : `${base.id}_${itemIndex + 1}`,
          original: base.original,
          severity: base.severity,
          tags: base.tags,
        }));
      }
    }

    if (
      (base.kind === 'teacher_block_period' || base.kind === 'teacher_block_slot') &&
      (!Number.isFinite(period) || period <= 0)
    ) {
      const reparsed = fallbackFromRuleParser({
        ...input,
        constraints: [
          {
            type: base.severity === 'hard' ? 'required' : 'preferred',
            text: base.original,
          },
        ],
      }).filter((item) => item.kind !== 'custom_dsl');

      if (reparsed.length > 0) {
        return reparsed.map((item, itemIndex) => ({
          ...item,
          id: reparsed.length === 1 ? base.id : `${base.id}_${itemIndex + 1}`,
          original: base.original,
          severity: base.severity,
          tags: base.tags,
        }));
      }
    }

    if (teacher && !validTeachers.has(teacher)) {
      const matched = fuzzyMatchLabel(teacher, validTeachers);
      if (matched) {
        return { ...base, params: { ...base.params, teacher: matched } };
      }
      return {
        ...base,
        kind: 'custom_dsl',
        params: { naturalLanguage: base.original },
        notes: `unknown_teacher:${teacher}`,
      };
    }
    if (klass && !validClasses.has(klass)) {
      const matched = fuzzyMatchLabel(klass, validClasses);
      if (matched) {
        return { ...base, params: { ...base.params, class: matched } };
      }
      return {
        ...base,
        kind: 'custom_dsl',
        params: { naturalLanguage: base.original },
        notes: `unknown_class:${klass}`,
      };
    }
    if (subject && !validSubjects.has(subject)) {
      const matched = fuzzyMatchLabel(subject, validSubjects);
      if (matched) {
        return { ...base, params: { ...base.params, subject: matched } };
      }
      return {
        ...base,
        kind: 'custom_dsl',
        params: { naturalLanguage: base.original },
        notes: `unknown_subject:${subject}`,
      };
    }
    if (day && !validDays.has(day)) {
      const matched = fuzzyMatchLabel(day, validDays);
      if (matched) {
        return { ...base, params: { ...base.params, day: matched } };
      }
      return {
        ...base,
        kind: 'custom_dsl',
        params: { naturalLanguage: base.original },
        notes: `unknown_day:${day}`,
      };
    }

    // Fuzzy-fix array params (classes, subjects, teachers) and other scalar entities
    const { params: fixedParams, fixed } = fuzzyFixParams(base.params, validTeachers, validClasses, validSubjects, validDays);
    if (fixed) {
      return { ...base, params: fixedParams };
    }

    let weeklySpec = base;
    if (base.kind === 'weekly_periods_exact') {
      const currentAssignmentId =
        typeof base.params.assignmentId === 'string' ? base.params.assignmentId : '';
      if (!currentAssignmentId && Number.isFinite(weeklyPeriods)) {
        const inferred = inferWeeklyAssignmentId(
          input.assignments,
          teacher,
          subject,
          klass,
          weeklyPeriods
        );
        if (inferred) {
          weeklySpec = {
            ...weeklySpec,
            params: {
              ...weeklySpec.params,
              assignmentId: inferred,
            },
          };
        }
      }
    }

    if (
      weeklySpec.kind === 'weekly_periods_exact' &&
      shouldMarkWeeklyAutoBase(weeklySpec, input.assignments)
    ) {
      const mergedTags = new Set(base.tags ?? []);
      mergedTags.add('auto_base');
      return {
        ...weeklySpec,
        severity: 'info',
        tags: [...mergedTags],
      };
    }

    return weeklySpec;
  });
}

function inferWeeklyAssignmentId(
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

function shouldMarkWeeklyAutoBase(
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

function loadTranslatorSystemPrompt(): Promise<string> {
  return fetch('/prompts/translator.system.md')
    .then(async (response) => {
      if (!response.ok) {
        return 'You are a Constraint Translator. Output strict JSON.';
      }
      return response.text();
    })
    .catch(() => 'You are a Constraint Translator. Output strict JSON.');
}

export async function runTranslatorTurn(
  config: AIProviderConfig,
  input: AgentInputPayload,
  invokeChat: ChatInvoke = defaultInvokeChat
): Promise<TranslatorTurnResult> {
  const fallbackSpecs = fallbackFromRuleParser(input);
  if (!hasHardCustomDsl(fallbackSpecs)) {
    return {
      constraintSpecs: fallbackSpecs,
      rawResponse: '',
      usageTokens: 0,
    };
  }

  const systemPrompt = await loadTranslatorSystemPrompt();
  const periods = buildTranslatorPeriods(input);
  const context = {
    teachers: [...new Set(input.assignments.map((assignment) => assignment.teacher.label))],
    classes: [...new Set(input.assignments.map((assignment) => assignment.class.label))],
    subjects: [...new Set(input.assignments.map((assignment) => assignment.subject.label))],
    days: input.days,
    periods,
    periodsByDay: buildTranslatorPeriodsByDay(input),
  };

  const payload = {
    baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
    apiKey: config.apiKey,
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: JSON.stringify(
          {
            context,
            raw_constraints: input.constraints.map((constraint) => ({
              text: constraint.text,
              severity_hint: constraint.type === 'required' ? 'hard' : 'soft',
            })),
          },
          null,
          0
        ),
      },
    ],
    temperature: 0,
    max_tokens: 3500,
    timeoutMs: TRANSLATOR_CHAT_TIMEOUT_MS,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'translator_specs',
        schema: {
          type: 'object',
          properties: {
            constraintSpecs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  original: { type: 'string' },
                  severity: { type: 'string', enum: ['hard', 'soft', 'info'] },
                  kind: {
                    type: 'string',
                    enum: CONSTRAINT_KINDS,
                  },
                  params: { type: 'object', additionalProperties: true },
                  tags: {
                    type: 'array',
                    items: {
                      type: 'string',
                      enum: ['auto_base', 'user_required', 'user_preferred'],
                    },
                  },
                  notes: { type: 'string' },
                },
                required: ['id', 'original', 'severity', 'kind', 'params'],
                additionalProperties: false,
              },
            },
          },
          required: ['constraintSpecs'],
          additionalProperties: false,
        },
      },
    },
  };

  try {
    const response = await invokeChat(payload);
    const parsedJson = parseModelJson(response.content);
    const validated = translatorResponseSchema.parse(parsedJson);
    const sanitized = sanitizeSpecs(input, validated.constraintSpecs);
    return {
      constraintSpecs: sanitized,
      rawResponse: response.content,
      usageTokens: response.usage?.total_tokens,
    };
  } catch {
    return {
      constraintSpecs: fallbackSpecs,
      rawResponse: '',
      usageTokens: 0,
    };
  }
}

export const __translatorInternal = {
  sanitizeSpecs,
  buildTranslatorPeriods,
  buildTranslatorPeriodsByDay,
  splitFallbackConstraintText,
  fallbackFromRuleParser,
  hasHardCustomDsl,
  fuzzyMatchLabel,
  fuzzyFixParams,
};
