import type {
  ConditionExpr,
  ConstraintSpec,
  DeterministicValidationContext,
  DeterministicValidationReport,
  ScheduleEntry,
  Violation,
} from './constraint-spec';
import { countHeavySubjectsInPeriods, sessionPeriodBuckets } from './class-heavy-session';
import { CHECKED_KINDS } from './constraint-registry';
import { appendToGroup, checkBaseConstraints, evaluateCondition, toPeriod } from './validator-helpers';

type CheckFn = (
  spec: ConstraintSpec,
  schedule: ScheduleEntry[],
  ctx: DeterministicValidationContext
) => Violation[];

const checkTeacherBlockDay: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const day = String(spec.params.day ?? '');
  const offendingEntries = schedule.filter((entry) => entry.teacher === teacher && entry.day === day);
  if (!offendingEntries.length) return [];
  return [
    {
      constraintId: spec.id,
      kind: spec.kind,
      message: `${teacher} không được dạy ${day} nhưng có ${offendingEntries.length} entry.`,
      offendingEntries,
    },
  ];
};

const checkTeacherBlockPeriod: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const period = Number(spec.params.period ?? NaN);
  const offendingEntries = schedule.filter(
    (entry) => entry.teacher === teacher && toPeriod(entry.period) === period
  );
  if (!offendingEntries.length) return [];
  return [
    {
      constraintId: spec.id,
      kind: spec.kind,
      message: `${teacher} không được dạy tiết ${period} nhưng có ${offendingEntries.length} entry.`,
      offendingEntries,
    },
  ];
};

const checkTeacherBlockSlot: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const day = String(spec.params.day ?? '');
  const period = Number(spec.params.period ?? NaN);
  const offendingEntries = schedule.filter(
    (entry) =>
      entry.teacher === teacher && entry.day === day && toPeriod(entry.period) === period
  );
  if (!offendingEntries.length) return [];
  return [
    {
      constraintId: spec.id,
      kind: spec.kind,
      message: `${teacher} không được dạy ${day} tiết ${period}.`,
      offendingEntries,
    },
  ];
};

const checkTeacherMaxPerDay: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const maxPerDay = Number(spec.params.maxPerDay ?? NaN);
  const violations: Violation[] = [];
  const byDay = new Map<string, ScheduleEntry[]>();

  for (const entry of schedule) {
    if (entry.teacher !== teacher) continue;
    appendToGroup(byDay, entry.day, entry);
  }

  for (const [day, entries] of byDay.entries()) {
    if (entries.length > maxPerDay) {
      violations.push({
        constraintId: spec.id,
        kind: spec.kind,
        message: `${teacher} dạy ${entries.length} tiết ở ${day}, vượt max ${maxPerDay}.`,
        offendingEntries: entries,
      });
    }
  }
  return violations;
};

const checkTeacherMaxConsecutive: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const maxConsecutive = Number(spec.params.maxConsecutive ?? NaN);
  const violations: Violation[] = [];
  const byDay = new Map<string, ScheduleEntry[]>();

  for (const entry of schedule) {
    if (entry.teacher !== teacher) continue;
    appendToGroup(byDay, entry.day, entry);
  }

  for (const [day, entries] of byDay.entries()) {
    const sortedPeriods = entries
      .map((entry) => toPeriod(entry.period))
      .filter((period): period is number => period !== null)
      .sort((a, b) => a - b);
    if (sortedPeriods.length === 0) continue;

    let streak = 1;
    let maxSeen = 1;
    for (let i = 1; i < sortedPeriods.length; i += 1) {
      if (sortedPeriods[i] === sortedPeriods[i - 1] + 1) {
        streak += 1;
      } else {
        streak = 1;
      }
      if (streak > maxSeen) maxSeen = streak;
    }

    if (maxSeen > maxConsecutive) {
      violations.push({
        constraintId: spec.id,
        kind: spec.kind,
        message: `${teacher} có chuỗi liên tiếp ${maxSeen} tiết ở ${day}, vượt max ${maxConsecutive}.`,
        offendingEntries: entries,
      });
    }
  }
  return violations;
};

const checkSubjectPinPeriod: CheckFn = (spec, schedule) => {
  const subject = String(spec.params.subject ?? '');
  const classes = Array.isArray(spec.params.classes)
    ? spec.params.classes.map((value) => String(value))
    : null;
  const allowedPeriods = new Set(
    (Array.isArray(spec.params.periods) ? spec.params.periods : []).map((value) => Number(value))
  );
  const offendingEntries = schedule.filter((entry) => {
    if (entry.subject !== subject) return false;
    if (classes && !classes.includes(entry.class)) return false;
    const period = toPeriod(entry.period);
    return period === null || !allowedPeriods.has(period);
  });

  if (!offendingEntries.length) return [];
  return [
    {
      constraintId: spec.id,
      kind: spec.kind,
      message: `Môn ${subject} nằm ngoài periods cho phép.`,
      offendingEntries,
    },
  ];
};

const checkSubjectConsecutive: CheckFn = (spec, schedule) => {
  const subject = String(spec.params.subject ?? '');
  const length = Number(spec.params.length ?? 2);
  const classes = Array.isArray(spec.params.classes)
    ? spec.params.classes.map((value) => String(value))
    : null;
  const violations: Violation[] = [];

  const target = schedule.filter((entry) => {
    if (entry.subject !== subject) return false;
    if (classes && !classes.includes(entry.class)) return false;
    return true;
  });

  const byClass = new Map<string, ScheduleEntry[]>();
  for (const entry of target) {
    appendToGroup(byClass, entry.class, entry);
  }

  for (const [klass, entries] of byClass.entries()) {
    if (entries.length < length) continue;
    const totalPeriodsForSubject = entries.length;
    // Rule A: subject_consecutive chỉ yêu cầu floor(total / length) block liên tiếp.
    // Nếu total % length != 0, phần dư được phép xếp lẻ ở cùng ngày hoặc ngày khác;
    // KHÔNG báo violation chỉ vì có tiết lẻ và không yêu cầu total chia hết cho length.

    // Đếm số streak liên tiếp đủ dài length trong từng ngày, không nối streak qua ngày khác.
    let runsOfCorrectLength = 0;
    const byDay = new Map<string, ScheduleEntry[]>();
    for (const entry of entries) {
      appendToGroup(byDay, entry.day, entry);
    }

    for (const dayEntries of byDay.values()) {
      const periods = dayEntries
        .map((entry) => toPeriod(entry.period))
        .filter((period): period is number => period !== null)
        .sort((a, b) => a - b);
      if (periods.length < length) continue;

      let streak = 1;
      for (let i = 1; i < periods.length; i += 1) {
        if (periods[i] === periods[i - 1] + 1) {
          streak += 1;
        } else {
          if (streak >= length) runsOfCorrectLength += Math.floor(streak / length);
          streak = 1;
        }
      }
      if (streak >= length) runsOfCorrectLength += Math.floor(streak / length);
    }

    const requiredRuns = Math.floor(totalPeriodsForSubject / length);
    if (requiredRuns > 0 && runsOfCorrectLength < requiredRuns) {
      violations.push({
        constraintId: spec.id,
        kind: spec.kind,
        message: `Lớp ${klass}: Môn ${subject} cần các block liên tiếp độ dài ${length}.`,
        offendingEntries: entries,
      });
    }
  }

  return violations;
};

const checkClassNoDoubleSubjectDay: CheckFn = (spec, schedule) => {
  const klass = String(spec.params.class ?? '');
  const subjectFilter = spec.params.subject ? String(spec.params.subject) : null;
  // maxPerDay: số tiết cùng môn tối đa/ngày. Mặc định 1 (giữ tương thích cũ),
  // nhưng cho phép "≤ N" (vd ≤ 2). (fix bug #3)
  const parsedMax = Number(spec.params.maxPerDay);
  const maxPerDay = Number.isFinite(parsedMax) && parsedMax >= 1 ? parsedMax : 1;
  const violations: Violation[] = [];
  const byDaySubject = new Map<string, ScheduleEntry[]>();

  for (const entry of schedule) {
    if (entry.class !== klass) continue;
    if (subjectFilter && entry.subject !== subjectFilter) continue;
    const key = `${entry.day}::${entry.subject}`;
    appendToGroup(byDaySubject, key, entry);
  }

  for (const [key, entries] of byDaySubject.entries()) {
    if (entries.length <= maxPerDay) continue;
    const [day, subject] = key.split('::');
    violations.push({
      constraintId: spec.id,
      kind: spec.kind,
      message: `Lớp ${klass} học môn ${subject} ${entries.length} lần trong ngày ${day} (tối đa ${maxPerDay}).`,
      offendingEntries: entries,
    });
  }
  return violations;
};

const checkClassSubjectsNotSameDay: CheckFn = (spec, schedule) => {
  const subjects = Array.isArray(spec.params.subjects)
    ? spec.params.subjects.map((value) => String(value))
    : [];
  if (subjects.length < 2) return [];
  const targetClass = spec.params.class ? String(spec.params.class) : null;
  const parsedMax = Number(spec.params.maxSubjectsPerDay);
  const maxSubjectsPerDay = Number.isFinite(parsedMax) && parsedMax >= 1 ? parsedMax : 1;
  const subjectSet = new Set(subjects);
  const violations: Violation[] = [];
  const byClassDay = new Map<string, Map<string, ScheduleEntry[]>>();

  for (const entry of schedule) {
    if (targetClass && entry.class !== targetClass) continue;
    if (!subjectSet.has(entry.subject)) continue;
    const key = `${entry.class}::${entry.day}`;
    if (!byClassDay.has(key)) byClassDay.set(key, new Map());
    const subjectMap = byClassDay.get(key)!;
    appendToGroup(subjectMap, entry.subject, entry);
  }

  for (const [key, subjectMap] of byClassDay.entries()) {
    if (subjectMap.size <= maxSubjectsPerDay) continue;
    const [klass, day] = key.split('::');
    violations.push({
      constraintId: spec.id,
      kind: spec.kind,
      message: `Lớp ${klass} có ${subjectMap.size} môn {${subjects.join(', ')}} cùng ngày ${day} (tối đa ${maxSubjectsPerDay}).`,
      offendingEntries: [...subjectMap.values()].flat(),
    });
  }

  return violations;
};

const checkTeacherMaxWorkingDays: CheckFn = (spec, schedule) => {
  const teacher = spec.params.teacher ? String(spec.params.teacher) : null;
  const totalDays = new Set(schedule.map((entry) => entry.day)).size;
  let maxDays: number;
  if (spec.params.maxDays !== undefined && spec.params.maxDays !== null) {
    maxDays = Number(spec.params.maxDays);
  } else if (spec.params.minDaysOff !== undefined && spec.params.minDaysOff !== null) {
    maxDays = totalDays - Number(spec.params.minDaysOff);
  } else {
    maxDays = totalDays - 1;
  }

  const teachers = teacher ? [teacher] : [...new Set(schedule.map((entry) => entry.teacher))];
  const violations: Violation[] = [];

  for (const targetTeacher of teachers) {
    const entries = schedule.filter((entry) => entry.teacher === targetTeacher);
    const workingDays = new Set(entries.map((entry) => entry.day));
    if (workingDays.size > maxDays) {
      violations.push({
        constraintId: spec.id,
        kind: spec.kind,
        message: `${targetTeacher} dạy ${workingDays.size} ngày/tuần (tối đa ${maxDays}).`,
        offendingEntries: entries,
      });
    }
  }

  return violations;
};

const checkSubjectMaxConsecutive: CheckFn = (spec, schedule) => {
  const subject = String(spec.params.subject ?? '');
  const parsedMax = Number(spec.params.maxConsecutive);
  const maxConsecutive = Number.isFinite(parsedMax) && parsedMax >= 1 ? parsedMax : 1;
  const classes = Array.isArray(spec.params.classes)
    ? spec.params.classes.map((value) => String(value))
    : null;
  const violations: Violation[] = [];
  const byClassDay = new Map<string, ScheduleEntry[]>();

  for (const entry of schedule) {
    if (entry.subject !== subject) continue;
    if (classes && !classes.includes(entry.class)) continue;
    const key = `${entry.class}::${entry.day}`;
    appendToGroup(byClassDay, key, entry);
  }

  for (const [key, entries] of byClassDay.entries()) {
    const periods = entries
      .map((entry) => toPeriod(entry.period))
      .filter((period): period is number => period !== null)
      .sort((a, b) => a - b);
    let streak = 1;
    let maxSeen = periods.length ? 1 : 0;
    for (let i = 1; i < periods.length; i += 1) {
      if (periods[i] === periods[i - 1] + 1) streak += 1;
      else streak = 1;
      if (streak > maxSeen) maxSeen = streak;
    }
    if (maxSeen > maxConsecutive) {
      const [klass, day] = key.split('::');
      violations.push({
        constraintId: spec.id,
        kind: spec.kind,
        message: `Lớp ${klass} có ${maxSeen} tiết ${subject} liên tiếp ngày ${day} (tối đa ${maxConsecutive}).`,
        offendingEntries: entries,
      });
    }
  }

  return violations;
};

const checkWeeklyPeriodsExact: CheckFn = (spec, schedule, ctx) => {
  if (spec.tags?.includes('auto_base')) return [];

  const weeklyPeriods = Number(spec.params.weeklyPeriods ?? NaN);
  let teacher = spec.params.teacher ? String(spec.params.teacher) : null;
  const subject = spec.params.subject ? String(spec.params.subject) : null;
  const klass = spec.params.class ? String(spec.params.class) : null;
  const assignmentId = spec.params.assignmentId ? String(spec.params.assignmentId) : null;

  if (assignmentId && ctx.assignments?.length) {
    const match = ctx.assignments.find((assignment) => assignment.id === assignmentId);
    if (match) {
      teacher = teacher ?? match.teacher;
    }
  }

  const filtered = schedule.filter((entry) => {
    if (teacher && entry.teacher !== teacher) return false;
    if (subject && entry.subject !== subject) return false;
    if (klass && entry.class !== klass) return false;
    return true;
  });

  if (filtered.length === weeklyPeriods) return [];
  return [
    {
      constraintId: spec.id,
      kind: spec.kind,
      message: `Weekly exact mismatch: expected ${weeklyPeriods}, got ${filtered.length}.`,
      offendingEntries: filtered,
    },
  ];
};

const checkPairNotSameSlot: CheckFn = (spec, schedule) => {
  const teachers = Array.isArray(spec.params.teachers)
    ? spec.params.teachers.map((value) => String(value))
    : [];
  if (teachers.length !== 2) return [];
  const scope = (spec.params.scope ?? {}) as { day?: string };
  const relevant = schedule.filter((entry) => {
    if (!teachers.includes(entry.teacher)) return false;
    if (scope.day && entry.day !== scope.day) return false;
    return true;
  });

  const bySlot = new Map<string, ScheduleEntry[]>();
  for (const entry of relevant) {
    const key = `${entry.day}::${entry.period}`;
    appendToGroup(bySlot, key, entry);
  }

  const violations: Violation[] = [];
  for (const entries of bySlot.values()) {
    const uniqTeachers = new Set(entries.map((entry) => entry.teacher));
    if (uniqTeachers.size > 1) {
      violations.push({
        constraintId: spec.id,
        kind: spec.kind,
        message: `${teachers[0]} và ${teachers[1]} cùng dạy một slot.`,
        offendingEntries: entries,
      });
    }
  }
  return violations;
};

const checkIfThen: CheckFn = (spec, schedule, ctx) => {
  const condition = spec.params.if as ConditionExpr | undefined;
  const thenList = Array.isArray(spec.params.then)
    ? (spec.params.then as Array<{ kind?: string; params?: Record<string, unknown> }>)
    : [];
  if (!condition || thenList.length === 0) return [];
  if (!evaluateCondition(condition, schedule)) return [];

  const violations: Violation[] = [];
  for (let index = 0; index < thenList.length; index += 1) {
    const thenItem = thenList[index];
    // F-9 fix: nếu THEN item có params.weight (do translator set cho soft IF/THEN),
    // propagate lên top-level weight trên nestedSpec để các consumer downstream
    // (humanizer, future solver) có thể đọc được.
    const itemWeight = Number(thenItem?.params?.weight);
    const nestedSpec: ConstraintSpec = {
      id: `${spec.id}:then:${index + 1}`,
      original: spec.original,
      severity: spec.severity,
      kind: (thenItem.kind ?? 'custom_dsl') as ConstraintSpec['kind'],
      params: thenItem.params ?? {},
      notes: spec.notes,
      ...(Number.isFinite(itemWeight) && itemWeight > 0 ? { weight: itemWeight } : {}),
    };
    const checker = checkerByKind[nestedSpec.kind];
    if (!checker) continue;
    for (const violation of checker(nestedSpec, schedule, ctx)) {
      violations.push({
        ...violation,
        constraintId: spec.id,
        kind: spec.kind,
        message: `IF_THEN violation: ${violation.message}`,
      });
    }
  }
  return violations;
};

const checkSessionLimit: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const maxPeriods = Number(spec.params.maxPeriods ?? 1);
  const violations: Violation[] = [];

  if (!teacher) {
    violations.push({
      constraintId: spec.id,
      kind: spec.kind,
      message: `Session limit constraint thiếu teacher — không thể kiểm tra. Xem xét dùng subject_session_max_periods.`,
      offendingEntries: [],
    });
    return violations;
  }

  const byDay = new Map<string, ScheduleEntry[]>();
  for (const entry of schedule) {
    if (entry.teacher !== teacher) continue;
    appendToGroup(byDay, entry.day, entry);
  }

  for (const [day, entries] of byDay.entries()) {
    if (entries.length <= maxPeriods) continue;
    violations.push({
      constraintId: spec.id,
      kind: spec.kind,
      message: `Giáo viên ${teacher} dạy ${entries.length} tiết trong ngày ${day} (tối đa ${maxPeriods}).`,
      offendingEntries: entries,
    });
  }
  return violations;
};

const checkSubjectSessionMaxPeriods: CheckFn = (spec, schedule) => {
  const subject = spec.params.subject ? String(spec.params.subject) : null;
  const klass = spec.params.class ? String(spec.params.class) : null;
  const maxPeriods = Number(spec.params.maxPeriods ?? NaN);
  const sessionPeriods = Array.isArray(spec.params.sessionPeriods)
    ? new Set((spec.params.sessionPeriods as number[]).map(Number))
    : null;
  const violations: Violation[] = [];

  const byClassDaySession = new Map<string, Map<string, ScheduleEntry[]>>();

  for (const entry of schedule) {
    if (subject && entry.subject !== subject) continue;
    if (klass && entry.class !== klass) continue;
    const period = toPeriod(entry.period);
    if (period === null) continue;
    if (sessionPeriods && !sessionPeriods.has(period)) continue;

    const classDay = `${entry.class}::${entry.day}`;
    if (!byClassDaySession.has(classDay)) byClassDaySession.set(classDay, new Map());
    const subjectMap = byClassDaySession.get(classDay)!;
    const key = entry.subject;
    appendToGroup(subjectMap, key, entry);
  }

  for (const [classDay, subjectMap] of byClassDaySession) {
    for (const [subj, entries] of subjectMap) {
      if (entries.length > maxPeriods) {
        const [cls, day] = classDay.split('::');
        violations.push({
          constraintId: spec.id,
          kind: spec.kind,
          message: `Lớp ${cls} học môn ${subj} ${entries.length} tiết trong buổi ngày ${day} (tối đa ${maxPeriods}).`,
          offendingEntries: entries,
        });
      }
    }
  }

  return violations;
};

const checkSubjectGroupDailyLimit: CheckFn = (spec, schedule) => {
  const groupName = String(spec.params.groupName ?? '');
  const maxPerDay = Number(spec.params.maxPerDay ?? 1);
  const targetClass = spec.params.class ? String(spec.params.class) : null;
  const violations: Violation[] = [];

  const filtered = schedule.filter((entry) => {
    if (targetClass && entry.class !== targetClass) return false;
    return true;
  });

  const byDaySubject = new Map<string, Set<string>>();
  const byDayEntries = new Map<string, ScheduleEntry[]>();
  for (const entry of filtered) {
    const dayKey = entry.day;
    if (!byDaySubject.has(dayKey)) byDaySubject.set(dayKey, new Set());
    byDaySubject.get(dayKey)!.add(entry.subject);
    appendToGroup(byDayEntries, dayKey, entry);
  }

  for (const [day, subjects] of byDaySubject.entries()) {
    if (subjects.size <= maxPerDay) continue;
    const entries = byDayEntries.get(day) ?? [];
    violations.push({
      constraintId: spec.id,
      kind: spec.kind,
      message: `Nhóm môn ${groupName} vượt quá giới hạn: ${subjects.size} môn khác nhau trong ngày ${day} (tối đa ${maxPerDay}).`,
      offendingEntries: entries,
    });
  }
  return violations;
};

const checkClassBlockDay: CheckFn = (spec, schedule) => {
  const klass = String(spec.params.class ?? '');
  const day = String(spec.params.day ?? '');
  const offending = schedule.filter((e) => e.class === klass && e.day === day);
  if (!offending.length) return [];
  return [{ constraintId: spec.id, kind: spec.kind, message: `Lớp ${klass} không được học ${day} nhưng có ${offending.length} entry.`, offendingEntries: offending }];
};

const checkClassBlockPeriod: CheckFn = (spec, schedule) => {
  const klass = String(spec.params.class ?? '');
  const period = Number(spec.params.period ?? NaN);
  const offending = schedule.filter((e) => e.class === klass && toPeriod(e.period) === period);
  if (!offending.length) return [];
  return [{ constraintId: spec.id, kind: spec.kind, message: `Lớp ${klass} không được học tiết ${period}.`, offendingEntries: offending }];
};

const checkClassBlockSlot: CheckFn = (spec, schedule) => {
  const klass = String(spec.params.class ?? '');
  const day = String(spec.params.day ?? '');
  const period = Number(spec.params.period ?? NaN);
  const offending = schedule.filter((e) => e.class === klass && e.day === day && toPeriod(e.period) === period);
  if (!offending.length) return [];
  return [{ constraintId: spec.id, kind: spec.kind, message: `Lớp ${klass} không được học ${day} tiết ${period}.`, offendingEntries: offending }];
};

const checkClassMaxPerDay: CheckFn = (spec, schedule) => {
  const klass = String(spec.params.class ?? '');
  const maxPerDay = Number(spec.params.maxPerDay ?? NaN);
  const violations: Violation[] = [];
  const byDay = new Map<string, ScheduleEntry[]>();
  for (const e of schedule) {
    if (e.class !== klass) continue;
    appendToGroup(byDay, e.day, e);
  }
  for (const [day, entries] of byDay) {
    if (entries.length > maxPerDay) {
      violations.push({ constraintId: spec.id, kind: spec.kind, message: `Lớp ${klass} có ${entries.length} tiết ngày ${day} (tối đa ${maxPerDay}).`, offendingEntries: entries });
    }
  }
  return violations;
};

const checkClassMinPerDay: CheckFn = (spec, schedule) => {
  const klass = String(spec.params.class ?? '');
  const minPerDay = Number(spec.params.minPerDay ?? NaN);
  const violations: Violation[] = [];
  const byDay = new Map<string, ScheduleEntry[]>();
  for (const e of schedule) {
    if (e.class !== klass) continue;
    appendToGroup(byDay, e.day, e);
  }
  for (const [day, entries] of byDay) {
    if (entries.length < minPerDay) {
      violations.push({ constraintId: spec.id, kind: spec.kind, message: `Lớp ${klass} chỉ có ${entries.length} tiết ngày ${day} (tối thiểu ${minPerDay}).`, offendingEntries: entries });
    }
  }
  return violations;
};

const checkClassNoGaps: CheckFn = (spec, schedule) => {
  const klass = String(spec.params.class ?? '');
  const violations: Violation[] = [];
  const byDay = new Map<string, ScheduleEntry[]>();
  for (const e of schedule) {
    if (e.class !== klass) continue;
    appendToGroup(byDay, e.day, e);
  }
  for (const [day, entries] of byDay) {
    const periods = entries.map((e) => toPeriod(e.period)).filter((p): p is number => p !== null).sort((a, b) => a - b);
    for (let i = 1; i < periods.length; i++) {
      if (periods[i] > periods[i - 1] + 1) {
        violations.push({ constraintId: spec.id, kind: spec.kind, message: `Lớp ${klass} có tiết trống giữa tiết ${periods[i - 1]} và ${periods[i]} ngày ${day}.`, offendingEntries: entries });
        break;
      }
    }
  }
  return violations;
};

const checkTeacherMinPerDay: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const minPerDay = Number(spec.params.minPerDay ?? NaN);
  const violations: Violation[] = [];
  const byDay = new Map<string, ScheduleEntry[]>();
  for (const e of schedule) {
    if (e.teacher !== teacher) continue;
    appendToGroup(byDay, e.day, e);
  }
  for (const [day, entries] of byDay) {
    if (entries.length < minPerDay) {
      violations.push({ constraintId: spec.id, kind: spec.kind, message: `${teacher} chỉ dạy ${entries.length} tiết ngày ${day} (tối thiểu ${minPerDay}).`, offendingEntries: entries });
    }
  }
  return violations;
};

const checkTeacherNoGaps: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const violations: Violation[] = [];
  const byDay = new Map<string, ScheduleEntry[]>();
  for (const e of schedule) {
    if (e.teacher !== teacher) continue;
    appendToGroup(byDay, e.day, e);
  }
  for (const [day, entries] of byDay) {
    const periods = entries.map((e) => toPeriod(e.period)).filter((p): p is number => p !== null).sort((a, b) => a - b);
    for (let i = 1; i < periods.length; i++) {
      if (periods[i] > periods[i - 1] + 1) {
        violations.push({ constraintId: spec.id, kind: spec.kind, message: `${teacher} có tiết trống giữa tiết ${periods[i - 1]} và ${periods[i]} ngày ${day}.`, offendingEntries: entries });
        break;
      }
    }
  }
  return violations;
};

const checkTeacherAllowedDays: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const allowedDays = new Set((Array.isArray(spec.params.days) ? spec.params.days : []).map(String));
  const offending = schedule.filter((e) => e.teacher === teacher && !allowedDays.has(e.day));
  if (!offending.length) return [];
  return [{ constraintId: spec.id, kind: spec.kind, message: `${teacher} chỉ được dạy các ngày ${[...allowedDays].join(', ')} nhưng có entry ngoài danh sách.`, offendingEntries: offending }];
};

const checkTeacherAllowedPeriods: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const allowedPeriods = new Set((Array.isArray(spec.params.periods) ? spec.params.periods : []).map(Number));
  const offending = schedule.filter((e) => {
    if (e.teacher !== teacher) return false;
    const p = toPeriod(e.period);
    return p === null || !allowedPeriods.has(p);
  });
  if (!offending.length) return [];
  return [{ constraintId: spec.id, kind: spec.kind, message: `${teacher} chỉ được dạy các tiết ${[...allowedPeriods].join(', ')} nhưng có entry ngoài danh sách.`, offendingEntries: offending }];
};

const checkSubjectAllowedDays: CheckFn = (spec, schedule) => {
  const subject = String(spec.params.subject ?? '');
  const allowedDays = new Set((Array.isArray(spec.params.days) ? spec.params.days : []).map(String));
  const classes = Array.isArray(spec.params.classes) ? spec.params.classes.map(String) : null;
  const offending = schedule.filter((e) => {
    if (e.subject !== subject) return false;
    if (classes && !classes.includes(e.class)) return false;
    return !allowedDays.has(e.day);
  });
  if (!offending.length) return [];
  return [{ constraintId: spec.id, kind: spec.kind, message: `Môn ${subject} chỉ được xếp các ngày ${[...allowedDays].join(', ')}.`, offendingEntries: offending }];
};

const checkSubjectMinGapDays: CheckFn = (spec, schedule) => {
  const subject = String(spec.params.subject ?? '');
  const minGap = Number(spec.params.minGapDays ?? 1);
  const classes = Array.isArray(spec.params.classes) ? spec.params.classes.map(String) : null;
  const violations: Violation[] = [];

  // Build a stable day order from the schedule itself
  const dayOrder = [...new Set(schedule.map((e) => e.day))];

  const byClass = new Map<string, ScheduleEntry[]>();
  for (const e of schedule) {
    if (e.subject !== subject) continue;
    if (classes && !classes.includes(e.class)) continue;
    appendToGroup(byClass, e.class, e);
  }

  for (const [klass, entries] of byClass) {
    const days = [...new Set(entries.map((e) => e.day))];
    const indices = days.map((d) => dayOrder.indexOf(d)).sort((a, b) => a - b);
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] - indices[i - 1] < minGap) {
        violations.push({
          constraintId: spec.id,
          kind: spec.kind,
          message: `Lớp ${klass} môn ${subject} có 2 buổi học cách nhau ${indices[i] - indices[i - 1]} ngày (tối thiểu ${minGap} ngày).`,
          offendingEntries: entries,
        });
        break;
      }
    }
  }
  return violations;
};

const checkSubjectDailyMaxPeriods: CheckFn = (spec, schedule) => {
  const subject = String(spec.params.subject ?? '');
  const maxPerDay = Number(spec.params.maxPerDay ?? NaN);
  const classes = Array.isArray(spec.params.classes) ? spec.params.classes.map(String) : null;
  const violations: Violation[] = [];
  const byClassDay = new Map<string, ScheduleEntry[]>();
  for (const e of schedule) {
    if (e.subject !== subject) continue;
    if (classes && !classes.includes(e.class)) continue;
    const key = `${e.class}::${e.day}`;
    appendToGroup(byClassDay, key, e);
  }
  for (const [key, entries] of byClassDay) {
    if (entries.length > maxPerDay) {
      const [klass, day] = key.split('::');
      violations.push({ constraintId: spec.id, kind: spec.kind, message: `Lớp ${klass} học môn ${subject} ${entries.length} tiết ngày ${day} (tối đa ${maxPerDay}).`, offendingEntries: entries });
    }
  }
  return violations;
};

const checkAssignmentPinSlot: CheckFn = (spec, schedule) => {
  const assignmentId = String(spec.params.assignmentId ?? '');
  const day = String(spec.params.day ?? '');
  const period = Number(spec.params.period ?? NaN);
  const entries = schedule.filter((e) => String(e.assignmentId ?? '') === assignmentId);
  const pinned = entries.filter((e) => e.day === day && toPeriod(e.period) === period);
  if (entries.length > 0 && pinned.length === 0) {
    return [{ constraintId: spec.id, kind: spec.kind, message: `Assignment ${assignmentId} phải được xếp vào ${day} tiết ${period}.`, offendingEntries: entries }];
  }
  return [];
};

const checkAssignmentBlockSlot: CheckFn = (spec, schedule) => {
  const assignmentId = String(spec.params.assignmentId ?? '');
  const day = String(spec.params.day ?? '');
  const period = Number(spec.params.period ?? NaN);
  const offending = schedule.filter((e) => String(e.assignmentId ?? '') === assignmentId && e.day === day && toPeriod(e.period) === period);
  if (!offending.length) return [];
  return [{ constraintId: spec.id, kind: spec.kind, message: `Assignment ${assignmentId} không được xếp vào ${day} tiết ${period}.`, offendingEntries: offending }];
};

const checkAssignmentAllowedSlots: CheckFn = (spec, schedule) => {
  const assignmentId = String(spec.params.assignmentId ?? '');
  const allowedSlots = (Array.isArray(spec.params.slots) ? spec.params.slots : []) as Array<{ day: string; period: number }>;
  const slotSet = new Set(allowedSlots.map((s) => `${s.day}::${s.period}`));
  const offending = schedule.filter((e) => {
    if (String(e.assignmentId ?? '') !== assignmentId) return false;
    return !slotSet.has(`${e.day}::${toPeriod(e.period)}`);
  });
  if (!offending.length) return [];
  return [{ constraintId: spec.id, kind: spec.kind, message: `Assignment ${assignmentId} có entry ngoài các slot cho phép.`, offendingEntries: offending }];
};

const checkAssignmentSpreadDays: CheckFn = (spec, schedule) => {
  const assignmentId = String(spec.params.assignmentId ?? '');
  const minDays = Number(spec.params.minDays ?? NaN);
  const entries = schedule.filter((e) => String(e.assignmentId ?? '') === assignmentId);
  if (!entries.length) return [];
  const days = new Set(entries.map((e) => e.day));
  if (days.size < minDays) {
    return [{ constraintId: spec.id, kind: spec.kind, message: `Assignment ${assignmentId} chỉ trải trên ${days.size} ngày (tối thiểu ${minDays} ngày).`, offendingEntries: entries }];
  }
  return [];
};

// ===== NEW TEACHER CHECKERS =====

const checkTeacherMinWorkingDays: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const minDays = Number(spec.params.minDays ?? NaN);
  if (!teacher || !Number.isFinite(minDays)) return [];
  const workingDays = new Set(schedule.filter((e) => e.teacher === teacher).map((e) => e.day));
  if (workingDays.size >= minDays) return [];
  return [{
    constraintId: spec.id,
    kind: spec.kind,
    message: `${teacher} chỉ dạy ${workingDays.size} ngày (tối thiểu ${minDays}).`,
    offendingEntries: schedule.filter((e) => e.teacher === teacher),
  }];
};

const checkTeacherMaxGaps: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const maxGaps = Number(spec.params.maxGaps ?? NaN);
  if (!teacher || !Number.isFinite(maxGaps)) return [];
  const violations: Violation[] = [];
  const byDay = new Map<string, ScheduleEntry[]>();
  for (const e of schedule) if (e.teacher === teacher) appendToGroup(byDay, e.day, e);
  for (const [day, entries] of byDay) {
    const periods = entries.map((e) => toPeriod(e.period)).filter((p): p is number => p !== null).sort((a, b) => a - b);
    if (periods.length === 0) continue;
    const first = periods[0];
    const last = periods[periods.length - 1];
    const taught = new Set(periods);
    let gaps = 0;
    for (let p = first; p <= last; p++) if (!taught.has(p)) gaps++;
    if (gaps > maxGaps) {
      violations.push({
        constraintId: spec.id,
        kind: spec.kind,
        message: `${teacher} có ${gaps} tiết trống ngày ${day} (tối đa ${maxGaps}).`,
        offendingEntries: entries,
      });
    }
  }
  return violations;
};

const checkTeacherMinConsecutive: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const minConsecutive = Number(spec.params.minConsecutive ?? NaN);
  if (!teacher || !Number.isFinite(minConsecutive) || minConsecutive < 1) return [];
  const violations: Violation[] = [];
  const byDay = new Map<string, ScheduleEntry[]>();
  for (const e of schedule) if (e.teacher === teacher) appendToGroup(byDay, e.day, e);
  for (const [day, entries] of byDay) {
    const periods = entries.map((e) => toPeriod(e.period)).filter((p): p is number => p !== null).sort((a, b) => a - b);
    let streak = 1;
    for (let i = 1; i < periods.length; i++) {
      if (periods[i] === periods[i - 1] + 1) streak++;
      else {
        if (streak < minConsecutive) {
          violations.push({ constraintId: spec.id, kind: spec.kind, message: `${teacher} có chuỗi chỉ ${streak} tiết liên tiếp ngày ${day} (tối thiểu ${minConsecutive}).`, offendingEntries: entries });
        }
        streak = 1;
      }
    }
    if (streak < minConsecutive && periods.length > 0) {
      violations.push({ constraintId: spec.id, kind: spec.kind, message: `${teacher} có chuỗi chỉ ${streak} tiết liên tiếp ngày ${day} (tối thiểu ${minConsecutive}).`, offendingEntries: entries });
    }
  }
  return violations;
};

const checkTeacherBalancedLoad: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const tolerance = Number(spec.params.tolerance ?? 0);
  if (!teacher) return [];
  const byDay = new Map<string, number>();
  for (const e of schedule) if (e.teacher === teacher) byDay.set(e.day, (byDay.get(e.day) ?? 0) + 1);
  const counts = [...byDay.values()];
  if (counts.length === 0) return [];
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  if (max - min <= tolerance) return [];
  return [{
    constraintId: spec.id,
    kind: spec.kind,
    message: `${teacher} phân bố không đều (${min}–${max} tiết/ngày, tolerance ${tolerance}).`,
    offendingEntries: schedule.filter((e) => e.teacher === teacher),
  }];
};

const checkTeacherMaxSubjectsPerDay: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const max = Number(spec.params.max ?? NaN);
  if (!teacher || !Number.isFinite(max)) return [];
  const violations: Violation[] = [];
  const byDaySubject = new Map<string, Set<string>>();
  for (const e of schedule) {
    if (e.teacher !== teacher) continue;
    const key = e.day;
    if (!byDaySubject.has(key)) byDaySubject.set(key, new Set());
    byDaySubject.get(key)!.add(e.subject);
  }
  for (const [day, subjects] of byDaySubject) {
    if (subjects.size > max) {
      const entries = schedule.filter((e) => e.teacher === teacher && e.day === day);
      violations.push({ constraintId: spec.id, kind: spec.kind, message: `${teacher} dạy ${subjects.size} môn ngày ${day} (tối đa ${max}).`, offendingEntries: entries });
    }
  }
  return violations;
};

const checkTeacherMaxConsecutiveDays: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const maxDays = Number(spec.params.maxDays ?? NaN);
  if (!teacher || !Number.isFinite(maxDays)) return [];
  const dayOrder = [...new Set(schedule.map((e) => e.day))];
  const working = new Set(schedule.filter((e) => e.teacher === teacher).map((e) => e.day));
  let streak = 0;
  let maxSeen = 0;
  for (const d of dayOrder) {
    if (working.has(d)) { streak++; maxSeen = Math.max(maxSeen, streak); }
    else streak = 0;
  }
  if (maxSeen <= maxDays) return [];
  const entries = schedule.filter((e) => e.teacher === teacher);
  return [{ constraintId: spec.id, kind: spec.kind, message: `${teacher} dạy ${maxSeen} ngày liên tiếp (tối đa ${maxDays}).`, offendingEntries: entries }];
};

// ===== NEW SUBJECT CHECKERS =====

const checkSubjectBlockPeriod: CheckFn = (spec, schedule) => {
  const subject = String(spec.params.subject ?? '');
  const blocked = new Set((Array.isArray(spec.params.periods) ? spec.params.periods : []).map(Number));
  const classes = Array.isArray(spec.params.classes) ? spec.params.classes.map(String) : null;
  if (!subject || blocked.size === 0) return [];
  const offending = schedule.filter((e) => {
    if (e.subject !== subject) return false;
    if (classes && !classes.includes(e.class)) return false;
    const p = toPeriod(e.period);
    return p !== null && blocked.has(p);
  });
  if (offending.length === 0) return [];
  return [{ constraintId: spec.id, kind: spec.kind, message: `Môn ${subject} bị chặn một số tiết.`, offendingEntries: offending }];
};

const checkSubjectBlockDays: CheckFn = (spec, schedule) => {
  const subject = String(spec.params.subject ?? '');
  const blocked = new Set(Array.isArray(spec.params.days) ? spec.params.days.map(String) : []);
  const classes = Array.isArray(spec.params.classes) ? spec.params.classes.map(String) : null;
  if (!subject || blocked.size === 0) return [];
  const offending = schedule.filter((e) => {
    if (e.subject !== subject) return false;
    if (classes && !classes.includes(e.class)) return false;
    return blocked.has(e.day);
  });
  if (offending.length === 0) return [];
  return [{ constraintId: spec.id, kind: spec.kind, message: `Môn ${subject} bị chặn một số ngày.`, offendingEntries: offending }];
};

const checkSubjectNotConsecutive: CheckFn = (spec, schedule) => {
  const subject = String(spec.params.subject ?? '');
  const classes = Array.isArray(spec.params.classes) ? spec.params.classes.map(String) : null;
  if (!subject) return [];
  const violations: Violation[] = [];
  const byClassDay = new Map<string, ScheduleEntry[]>();
  for (const e of schedule) {
    if (e.subject !== subject) continue;
    if (classes && !classes.includes(e.class)) continue;
    const key = `${e.class}::${e.day}`;
    appendToGroup(byClassDay, key, e);
  }
  for (const [key, entries] of byClassDay) {
    const periods = entries.map((e) => toPeriod(e.period)).filter((p): p is number => p !== null).sort((a, b) => a - b);
    for (let i = 1; i < periods.length; i++) {
      if (periods[i] === periods[i - 1] + 1) {
        const [klass, day] = key.split('::');
        violations.push({ constraintId: spec.id, kind: spec.kind, message: `Lớp ${klass} môn ${subject} có tiết liên tiếp ngày ${day}.`, offendingEntries: entries });
        break;
      }
    }
  }
  return violations;
};

const checkSubjectMinDays: CheckFn = (spec, schedule) => {
  const subject = String(spec.params.subject ?? '');
  const minDays = Number(spec.params.minDays ?? NaN);
  const classes = Array.isArray(spec.params.classes) ? spec.params.classes.map(String) : null;
  if (!subject || !Number.isFinite(minDays)) return [];
  const byClass = new Map<string, Set<string>>();
  for (const e of schedule) {
    if (e.subject !== subject) continue;
    if (classes && !classes.includes(e.class)) continue;
    if (!byClass.has(e.class)) byClass.set(e.class, new Set());
    byClass.get(e.class)!.add(e.day);
  }
  const violations: Violation[] = [];
  for (const [klass, days] of byClass) {
    if (days.size < minDays) {
      const entries = schedule.filter((e) => e.subject === subject && e.class === klass);
      violations.push({ constraintId: spec.id, kind: spec.kind, message: `Lớp ${klass} môn ${subject} chỉ có ${days.size} ngày (tối thiểu ${minDays}).`, offendingEntries: entries });
    }
  }
  return violations;
};

const checkSubjectSpreadEvenly: CheckFn = (spec, schedule) => {
  const subject = String(spec.params.subject ?? '');
  const classes = Array.isArray(spec.params.classes) ? spec.params.classes.map(String) : null;
  if (!subject) return [];
  const byClassDay = new Map<string, number>();
  for (const e of schedule) {
    if (e.subject !== subject) continue;
    if (classes && !classes.includes(e.class)) continue;
    const key = `${e.class}::${e.day}`;
    byClassDay.set(key, (byClassDay.get(key) ?? 0) + 1);
  }
  // For each class, check that counts per day differ by at most 1
  const byClass = new Map<string, Map<string, number>>();
  for (const [key, count] of byClassDay) {
    const [klass, day] = key.split('::');
    if (!byClass.has(klass)) byClass.set(klass, new Map());
    byClass.get(klass)!.set(day, count);
  }
  const violations: Violation[] = [];
  for (const [klass, dayCounts] of byClass) {
    const counts = [...dayCounts.values()];
    if (counts.length <= 1) continue;
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    if (max - min > 1) {
      const entries = schedule.filter((e) => e.subject === subject && e.class === klass);
      violations.push({ constraintId: spec.id, kind: spec.kind, message: `Lớp ${klass} môn ${subject} phân bố không đều.`, offendingEntries: entries });
    }
  }
  return violations;
};

const checkSubjectOrderBefore: CheckFn = (spec, schedule) => {
  const subjectA = String(spec.params.subjectA ?? '');
  const subjectB = String(spec.params.subjectB ?? '');
  const scope = spec.params.scope as { class?: string; day?: string } | undefined;
  if (!subjectA || !subjectB) return [];
  const violations: Violation[] = [];
  const byClassDay = new Map<string, { a: number[]; b: number[] }>();
  for (const e of schedule) {
    if (scope?.class && e.class !== scope.class) continue;
    if (scope?.day && e.day !== scope.day) continue;
    const key = `${e.class}::${e.day}`;
    if (!byClassDay.has(key)) byClassDay.set(key, { a: [], b: [] });
    const p = toPeriod(e.period);
    if (p === null) continue;
    if (e.subject === subjectA) byClassDay.get(key)!.a.push(p);
    if (e.subject === subjectB) byClassDay.get(key)!.b.push(p);
  }
  for (const [key, data] of byClassDay) {
    if (data.a.length === 0 || data.b.length === 0) continue;
    const maxA = Math.max(...data.a);
    const minB = Math.min(...data.b);
    if (maxA >= minB) {
      const [klass, day] = key.split('::');
      const entries = schedule.filter((e) => e.class === klass && e.day === day && (e.subject === subjectA || e.subject === subjectB));
      violations.push({ constraintId: spec.id, kind: spec.kind, message: `Môn ${subjectA} không xếp trước ${subjectB} cho lớp ${klass} ngày ${day}.`, offendingEntries: entries });
    }
  }
  return violations;
};

const checkSubjectNotAfterSubject: CheckFn = (spec, schedule) => {
  const subjectA = String(spec.params.subjectA ?? '');
  const subjectB = String(spec.params.subjectB ?? '');
  const classes = Array.isArray(spec.params.classes) ? spec.params.classes.map(String) : null;
  if (!subjectA || !subjectB) return [];
  const violations: Violation[] = [];
  const byClassDay = new Map<string, ScheduleEntry[]>();
  for (const e of schedule) {
    if (e.subject !== subjectA && e.subject !== subjectB) continue;
    if (classes && !classes.includes(e.class)) continue;
    const key = `${e.class}::${e.day}`;
    appendToGroup(byClassDay, key, e);
  }
  for (const [key, entries] of byClassDay) {
    const periodsB = new Map<number, boolean>();
    for (const e of entries) if (e.subject === subjectB) {
      const p = toPeriod(e.period); if (p !== null) periodsB.set(p, true);
    }
    for (const e of entries) {
      if (e.subject !== subjectA) continue;
      const p = toPeriod(e.period);
      if (p !== null && periodsB.has(p - 1)) {
        const [klass, day] = key.split('::');
        violations.push({ constraintId: spec.id, kind: spec.kind, message: `Môn ${subjectA} ngay sau ${subjectB} lớp ${klass} ngày ${day}.`, offendingEntries: entries });
      }
    }
  }
  return violations;
};

// ===== NEW CLASS CHECKERS =====

const checkClassFixedPeriod: CheckFn = (spec, schedule) => {
  const klass = String(spec.params.class ?? '');
  const day = String(spec.params.day ?? '');
  const period = Number(spec.params.period ?? NaN);
  if (!klass || !day || !Number.isFinite(period)) return [];
  const has = schedule.some((e) => e.class === klass && e.day === day && toPeriod(e.period) === period);
  if (has) return [];
  return [{ constraintId: spec.id, kind: spec.kind, message: `Lớp ${klass} thiếu tiết cố định ${day} tiết ${period}.`, offendingEntries: [] }];
};

const checkClassAllowedDays: CheckFn = (spec, schedule) => {
  const klass = String(spec.params.class ?? '');
  const allowed = new Set(Array.isArray(spec.params.days) ? spec.params.days.map(String) : []);
  if (!klass || allowed.size === 0) return [];
  const offending = schedule.filter((e) => e.class === klass && !allowed.has(e.day));
  if (offending.length === 0) return [];
  return [{ constraintId: spec.id, kind: spec.kind, message: `Lớp ${klass} có tiết ngoài các ngày cho phép.`, offendingEntries: offending }];
};

const checkClassAllowedPeriods: CheckFn = (spec, schedule) => {
  const klass = String(spec.params.class ?? '');
  const allowed = new Set((Array.isArray(spec.params.periods) ? spec.params.periods : []).map(Number));
  if (!klass || allowed.size === 0) return [];
  const offending = schedule.filter((e) => {
    if (e.class !== klass) return false;
    const p = toPeriod(e.period);
    return p === null || !allowed.has(p);
  });
  if (offending.length === 0) return [];
  return [{ constraintId: spec.id, kind: spec.kind, message: `Lớp ${klass} có tiết ngoài các tiết cho phép.`, offendingEntries: offending }];
};

const checkClassMaxConsecutive: CheckFn = (spec, schedule) => {
  const klass = String(spec.params.class ?? '');
  const maxConsecutive = Number(spec.params.maxConsecutive ?? NaN);
  if (!klass || !Number.isFinite(maxConsecutive)) return [];
  const violations: Violation[] = [];
  const byDay = new Map<string, ScheduleEntry[]>();
  for (const e of schedule) if (e.class === klass) appendToGroup(byDay, e.day, e);
  for (const [day, entries] of byDay) {
    const periods = entries.map((e) => toPeriod(e.period)).filter((p): p is number => p !== null).sort((a, b) => a - b);
    let streak = 1;
    let maxSeen = 1;
    for (let i = 1; i < periods.length; i++) {
      if (periods[i] === periods[i - 1] + 1) streak++;
      else { maxSeen = Math.max(maxSeen, streak); streak = 1; }
    }
    maxSeen = Math.max(maxSeen, streak);
    if (maxSeen > maxConsecutive) {
      violations.push({ constraintId: spec.id, kind: spec.kind, message: `Lớp ${klass} có ${maxSeen} tiết liên tiếp ngày ${day} (tối đa ${maxConsecutive}).`, offendingEntries: entries });
    }
  }
  return violations;
};

const checkClassMaxSubjectsPerDay: CheckFn = (spec, schedule) => {
  const klass = String(spec.params.class ?? '');
  const max = Number(spec.params.max ?? NaN);
  if (!klass || !Number.isFinite(max)) return [];
  const violations: Violation[] = [];
  const byDay = new Map<string, Set<string>>();
  for (const e of schedule) if (e.class === klass) {
    if (!byDay.has(e.day)) byDay.set(e.day, new Set());
    byDay.get(e.day)!.add(e.subject);
  }
  for (const [day, subs] of byDay) {
    if (subs.size > max) {
      const entries = schedule.filter((e) => e.class === klass && e.day === day);
      violations.push({ constraintId: spec.id, kind: spec.kind, message: `Lớp ${klass} có ${subs.size} môn ngày ${day} (tối đa ${max}).`, offendingEntries: entries });
    }
  }
  return violations;
};

const checkClassBalancedLoad: CheckFn = (spec, schedule) => {
  const klass = String(spec.params.class ?? '');
  const tolerance = Number(spec.params.tolerance ?? 0);
  if (!klass) return [];
  const byDay = new Map<string, number>();
  for (const e of schedule) if (e.class === klass) byDay.set(e.day, (byDay.get(e.day) ?? 0) + 1);
  const counts = [...byDay.values()];
  if (counts.length <= 1) return [];
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  if (max - min <= tolerance) return [];
  return [{ constraintId: spec.id, kind: spec.kind, message: `Lớp ${klass} phân bố không đều (${min}–${max} tiết/ngày).`, offendingEntries: schedule.filter((e) => e.class === klass) }];
};

const checkClassSubjectsSameDay: CheckFn = (spec, schedule) => {
  const klass = String(spec.params.class ?? '');
  const subjects = Array.isArray(spec.params.subjects) ? spec.params.subjects.map(String) : [];
  if (!klass || subjects.length < 2) return [];
  const byDay = new Map<string, Set<string>>();
  for (const e of schedule) if (e.class === klass) {
    if (!byDay.has(e.day)) byDay.set(e.day, new Set());
    byDay.get(e.day)!.add(e.subject);
  }
  for (const [day, subs] of byDay) {
    if (subjects.every((s) => subs.has(s))) return []; // found at least one day
  }
  const entries = schedule.filter((e) => e.class === klass && subjects.includes(e.subject));
  return [{ constraintId: spec.id, kind: spec.kind, message: `Lớp ${klass} các môn {${subjects.join(', ')}} không cùng ngày nào.`, offendingEntries: entries }];
};

const checkClassMinWorkingDays: CheckFn = (spec, schedule) => {
  const klass = String(spec.params.class ?? '');
  const minDays = Number(spec.params.minDays ?? NaN);
  if (!klass || !Number.isFinite(minDays)) return [];
  const days = new Set(schedule.filter((e) => e.class === klass).map((e) => e.day));
  if (days.size >= minDays) return [];
  return [{ constraintId: spec.id, kind: spec.kind, message: `Lớp ${klass} chỉ học ${days.size} ngày (tối thiểu ${minDays}).`, offendingEntries: schedule.filter((e) => e.class === klass) }];
};

// ===== NEW ASSIGNMENT CHECKERS =====

const checkAssignmentConsecutive: CheckFn = (spec, schedule) => {
  const assignmentId = String(spec.params.assignmentId ?? '');
  const length = Number(spec.params.length ?? 0);
  if (!assignmentId) return [];
  const entries = schedule.filter((e) => String(e.assignmentId ?? '') === assignmentId);
  if (entries.length === 0) return [];
  const byDay = new Map<string, ScheduleEntry[]>();
  for (const e of entries) appendToGroup(byDay, e.day, e);
  for (const [day, dayEntries] of byDay) {
    const periods = dayEntries.map((e) => toPeriod(e.period)).filter((p): p is number => p !== null).sort((a, b) => a - b);
    // Check they form consecutive blocks
    let streak = 1;
    for (let i = 1; i < periods.length; i++) {
      if (periods[i] === periods[i - 1] + 1) streak++;
      else {
        if (length > 0 && streak < length) {
          return [{ constraintId: spec.id, kind: spec.kind, message: `Assignment ${assignmentId} có block chỉ ${streak} tiết ngày ${day}.`, offendingEntries: dayEntries }];
        }
        streak = 1;
      }
    }
    if (length > 0 && streak < length) {
      return [{ constraintId: spec.id, kind: spec.kind, message: `Assignment ${assignmentId} có block chỉ ${streak} tiết ngày ${day}.`, offendingEntries: dayEntries }];
    }
  }
  return [];
};

const checkAssignmentMaxPerDay: CheckFn = (spec, schedule) => {
  const assignmentId = String(spec.params.assignmentId ?? '');
  const max = Number(spec.params.max ?? NaN);
  if (!assignmentId || !Number.isFinite(max)) return [];
  const byDay = new Map<string, ScheduleEntry[]>();
  for (const e of schedule) if (String(e.assignmentId ?? '') === assignmentId) appendToGroup(byDay, e.day, e);
  for (const [day, entries] of byDay) {
    if (entries.length > max) {
      return [{ constraintId: spec.id, kind: spec.kind, message: `Assignment ${assignmentId} có ${entries.length} tiết ngày ${day} (tối đa ${max}).`, offendingEntries: entries }];
    }
  }
  return [];
};

const checkAssignmentSameDay: CheckFn = (spec, schedule) => {
  const ids = (Array.isArray(spec.params.assignmentIds) ? spec.params.assignmentIds : []).map(String);
  if (ids.length < 2) return [];
  const byDay = new Map<string, Set<string>>();
  for (const e of schedule) {
    const aid = String(e.assignmentId ?? '');
    if (!ids.includes(aid)) continue;
    if (!byDay.has(e.day)) byDay.set(e.day, new Set());
    byDay.get(e.day)!.add(aid);
  }
  for (const [, set] of byDay) {
    if (ids.every((id) => set.has(id))) return [];
  }
  return [{ constraintId: spec.id, kind: spec.kind, message: `Các assignment {${ids.join(', ')}} không cùng ngày.`, offendingEntries: schedule.filter((e) => ids.includes(String(e.assignmentId ?? ''))) }];
};

const checkAssignmentNotSameDay: CheckFn = (spec, schedule) => {
  const ids = (Array.isArray(spec.params.assignmentIds) ? spec.params.assignmentIds : []).map(String);
  if (ids.length < 2) return [];
  const byDay = new Map<string, Set<string>>();
  for (const e of schedule) {
    const aid = String(e.assignmentId ?? '');
    if (ids.includes(aid)) {
      if (!byDay.has(e.day)) byDay.set(e.day, new Set());
      byDay.get(e.day)!.add(aid);
    }
  }
  const violations: Violation[] = [];
  for (const [day, set] of byDay) {
    if (set.size > 1) {
      const entries = schedule.filter((e) => e.day === day && ids.includes(String(e.assignmentId ?? '')));
      violations.push({ constraintId: spec.id, kind: spec.kind, message: `Các assignment {${[...set].join(', ')}} cùng ngày ${day}.`, offendingEntries: entries });
    }
  }
  return violations;
};

const checkTeacherPreferredPeriods: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const preferred = new Set((Array.isArray(spec.params.periods) ? spec.params.periods : []).map(Number));
  if (!teacher || preferred.size === 0) return [];
  const offending = schedule.filter((e) => {
    if (e.teacher !== teacher) return false;
    const p = toPeriod(e.period);
    return p === null || !preferred.has(p);
  });
  if (!offending.length) return [];
  return [{
    constraintId: spec.id,
    kind: spec.kind,
    message: `${teacher} nên dạy các tiết ${[...preferred].join(', ')} nhưng có ${offending.length} tiết ngoài ưu tiên.`,
    offendingEntries: offending,
  }];
};

const checkSubjectPreferredPeriods: CheckFn = (spec, schedule) => {
  const subject = String(spec.params.subject ?? '');
  const preferred = new Set((Array.isArray(spec.params.periods) ? spec.params.periods : []).map(Number));
  const classes = Array.isArray(spec.params.classes) ? spec.params.classes.map(String) : null;
  if (!subject || preferred.size === 0) return [];
  const offending = schedule.filter((e) => {
    if (e.subject !== subject) return false;
    if (classes && !classes.includes(e.class)) return false;
    const p = toPeriod(e.period);
    return p === null || !preferred.has(p);
  });
  if (!offending.length) return [];
  return [{
    constraintId: spec.id,
    kind: spec.kind,
    message: `Môn ${subject} nên xếp tiết ${[...preferred].join(', ')} nhưng có tiết ngoài ưu tiên.`,
    offendingEntries: offending,
  }];
};

const checkTeacherMaxClassesPerDay: CheckFn = (spec, schedule) => {
  const teacherFilter = spec.params.teacher ? String(spec.params.teacher) : null;
  const maxClasses = Number(spec.params.maxClasses ?? NaN);
  if (!Number.isFinite(maxClasses)) return [];
  const teachers = teacherFilter ? [teacherFilter] : [...new Set(schedule.map((e) => e.teacher))];
  const violations: Violation[] = [];
  for (const teacher of teachers) {
    const byDay = new Map<string, Set<string>>();
    for (const e of schedule) {
      if (e.teacher !== teacher) continue;
      if (!byDay.has(e.day)) byDay.set(e.day, new Set());
      byDay.get(e.day)!.add(e.class);
    }
    for (const [day, classes] of byDay) {
      if (classes.size > maxClasses) {
        const entries = schedule.filter((e) => e.teacher === teacher && e.day === day);
        violations.push({
          constraintId: spec.id,
          kind: spec.kind,
          message: `${teacher} dạy ${classes.size} lớp khác nhau ngày ${day} (tối đa ${maxClasses}).`,
          offendingEntries: entries,
        });
      }
    }
  }
  return violations;
};

const checkTeacherPairNotSameSlot: CheckFn = (spec, schedule) => {
  const teachers = Array.isArray(spec.params.teachers)
    ? spec.params.teachers.map((value) => String(value))
    : [];
  if (teachers.length !== 2) return [];
  const scope = (spec.params.scope ?? {}) as { day?: string };
  const relevant = schedule.filter((entry) => {
    if (!teachers.includes(entry.teacher)) return false;
    if (scope.day && entry.day !== scope.day) return false;
    return true;
  });
  const bySlot = new Map<string, ScheduleEntry[]>();
  for (const entry of relevant) {
    const key = `${entry.day}::${entry.period}`;
    appendToGroup(bySlot, key, entry);
  }
  const violations: Violation[] = [];
  for (const entries of bySlot.values()) {
    const uniqTeachers = new Set(entries.map((entry) => entry.teacher));
    if (uniqTeachers.size > 1) {
      violations.push({
        constraintId: spec.id,
        kind: spec.kind,
        message: `${teachers[0]} và ${teachers[1]} cùng dạy một slot.`,
        offendingEntries: entries,
      });
    }
  }
  return violations;
};

const checkTeacherHomeroomFirstPeriod: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const klass = String(spec.params.class ?? '');
  const period = Number(spec.params.period ?? 1);
  const days = Array.isArray(spec.params.days) ? spec.params.days.map(String) : [];
  if (!teacher || !klass) return [];
  const targetDays = days.length > 0 ? days : [...new Set(schedule.map((e) => e.day))];
  const violations: Violation[] = [];
  for (const day of targetDays) {
    const ok = schedule.some(
      (e) =>
        e.teacher === teacher &&
        e.class === klass &&
        e.day === day &&
        toPeriod(e.period) === period
    );
    if (!ok) {
      violations.push({
        constraintId: spec.id,
        kind: spec.kind,
        message: `GVCN ${teacher} phải dạy lớp ${klass} tiết ${period} ngày ${day}.`,
        offendingEntries: schedule.filter((e) => e.class === klass && e.day === day),
      });
    }
  }
  return violations;
};

// THEN positive atoms (F-6, F-7): dùng bên trong `if_then.params.then[]`.
// "phải dạy" — flag nếu teacher không có entry khớp với (teacher, day[, period]).
// Trả offendingEntries = tất cả entries của teacher đó để user dễ debug.
const checkTeacherRequiredDay: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const day = String(spec.params.day ?? '');
  if (!teacher || !day) return [];
  const teacherEntries = schedule.filter((e) => e.teacher === teacher);
  const has = teacherEntries.some((e) => e.day === day);
  if (!has) {
    return [{
      constraintId: spec.id,
      kind: spec.kind,
      message: `Giáo viên ${teacher} phải dạy ngày ${day} nhưng không có tiết nào.`,
      offendingEntries: teacherEntries,
    }];
  }
  return [];
};

const checkTeacherRequiredSlot: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const day = String(spec.params.day ?? '');
  const period = toPeriod(String(spec.params.period ?? ''));
  if (!teacher || !day || period === null) return [];
  const teacherEntries = schedule.filter((e) => e.teacher === teacher);
  const has = teacherEntries.some(
    (e) => e.day === day && toPeriod(e.period) === period
  );
  if (!has) {
    return [{
      constraintId: spec.id,
      kind: spec.kind,
      message: `Giáo viên ${teacher} phải dạy ${day} tiết ${period} nhưng không xếp được.`,
      offendingEntries: teacherEntries,
    }];
  }
  return [];
};

const checkTeacherPairRequiredSameDay: CheckFn = (spec, schedule) => {
  const teachers = Array.isArray(spec.params.teachers) ? (spec.params.teachers as string[]) : [];
  const day = String(spec.params.day ?? '');
  if (teachers.length === 0 || !day) return [];
  const violations: Violation[] = [];
  for (const teacher of teachers) {
    const teacherEntries = schedule.filter((e) => e.teacher === teacher);
    const has = teacherEntries.some((e) => e.day === day);
    if (!has) {
      violations.push({
        constraintId: spec.id,
        kind: spec.kind,
        message: `Giáo viên ${teacher} (cặp bắt buộc) phải dạy ngày ${day} nhưng không có tiết nào.`,
        offendingEntries: teacherEntries,
      });
    }
  }
  return violations;
};

const checkTeacherPairRequiredSameSlot: CheckFn = (spec, schedule) => {
  const teachers = Array.isArray(spec.params.teachers) ? (spec.params.teachers as string[]) : [];
  const day = String(spec.params.day ?? '');
  const period = toPeriod(String(spec.params.period ?? ''));
  if (teachers.length === 0 || !day || period === null) return [];
  const violations: Violation[] = [];
  for (const teacher of teachers) {
    const teacherEntries = schedule.filter((e) => e.teacher === teacher);
    const has = teacherEntries.some(
      (e) => e.day === day && toPeriod(e.period) === period
    );
    if (!has) {
      violations.push({
        constraintId: spec.id,
        kind: spec.kind,
        message: `Giáo viên ${teacher} (cặp bắt buộc) phải dạy ${day} tiết ${period} nhưng không xếp được.`,
        offendingEntries: teacherEntries,
      });
    }
  }
  return violations;
};

const checkSubjectNotLastPeriod: CheckFn = (spec, schedule) => {
  const subject = String(spec.params.subject ?? '');
  const classes = Array.isArray(spec.params.classes) ? spec.params.classes.map(String) : null;
  if (!subject) return [];
  const violations: Violation[] = [];
  const byClassDay = new Map<string, ScheduleEntry[]>();
  for (const e of schedule) {
    if (e.subject !== subject) continue;
    if (classes && !classes.includes(e.class)) continue;
    const key = `${e.class}::${e.day}`;
    appendToGroup(byClassDay, key, e);
  }
  for (const [key, entries] of byClassDay) {
    const periods = entries.map((e) => toPeriod(e.period)).filter((p): p is number => p !== null);
    if (periods.length === 0) continue;
    const maxPeriod = Math.max(...periods);
    const onLast = entries.filter((e) => toPeriod(e.period) === maxPeriod);
    if (onLast.length > 0) {
      const [klass, day] = key.split('::');
      violations.push({
        constraintId: spec.id,
        kind: spec.kind,
        message: `Môn ${subject} không được xếp tiết cuối (${maxPeriod}) lớp ${klass} ngày ${day}.`,
        offendingEntries: onLast,
      });
    }
  }
  return violations;
};

const checkClassMaxHeavySubjectsPerDay: CheckFn = (spec, schedule) => {
  const heavy = new Set((Array.isArray(spec.params.subjects) ? spec.params.subjects : []).map(String));
  const maxHeavy = Number(spec.params.maxHeavy ?? NaN);
  const targetClass = spec.params.class ? String(spec.params.class) : null;
  if (heavy.size === 0 || !Number.isFinite(maxHeavy)) return [];
  const violations: Violation[] = [];
  const byClassDay = new Map<string, Set<string>>();
  for (const e of schedule) {
    if (!heavy.has(e.subject)) continue;
    if (targetClass && e.class !== targetClass) continue;
    const key = `${e.class}::${e.day}`;
    if (!byClassDay.has(key)) byClassDay.set(key, new Set());
    byClassDay.get(key)!.add(e.subject);
  }
  for (const [key, subjects] of byClassDay) {
    if (subjects.size > maxHeavy) {
      const [klass, day] = key.split('::');
      const entries = schedule.filter((e) => e.class === klass && e.day === day && heavy.has(e.subject));
      violations.push({
        constraintId: spec.id,
        kind: spec.kind,
        message: `Lớp ${klass} có ${subjects.size} môn nặng ngày ${day} (tối đa ${maxHeavy}).`,
        offendingEntries: entries,
      });
    }
  }
  return violations;
};



const checkClassMaxHeavySubjectsPerSession: CheckFn = (spec, schedule) => {
  const heavy = new Set((Array.isArray(spec.params.subjects) ? spec.params.subjects : []).map(String));
  const groups = Array.isArray(spec.params.subjectGroups)
    ? (spec.params.subjectGroups as string[][]).map((g) => g.map(String))
    : [[...heavy]];
  const maxHeavy = Number(spec.params.maxHeavyInSession ?? 2);
  const targetClass = spec.params.class ? String(spec.params.class) : null;
  if (heavy.size === 0 || !Number.isFinite(maxHeavy)) return [];
  const buckets = sessionPeriodBuckets(spec);
  const violations: Violation[] = [];
  const classes = targetClass ? [targetClass] : [...new Set(schedule.map((e) => e.class))];
  const days = [...new Set(schedule.map((e) => e.day))];
  for (const klass of classes) {
    for (const day of days) {
      const dayEntries = schedule.filter((e) => e.class === klass && e.day === day);
      if (!dayEntries.length) continue;
      for (const bucket of buckets) {
        if (!bucket.periods.length) continue;
        for (const group of groups) {
          const groupSet = new Set(group);
          const n = countHeavySubjectsInPeriods(dayEntries, groupSet, bucket.periods);
          if (n > maxHeavy) {
            const inSession = dayEntries.filter((e) => {
              const p = toPeriod(e.period);
              return p !== null && bucket.periods.includes(p) && groupSet.has(e.subject);
            });
            violations.push({
              constraintId: spec.id,
              kind: spec.kind,
              message: `Lớp ${klass} có ${n} môn nặng (${group.join(', ')}) trong buổi ngày ${day} (tối đa ${maxHeavy}); không nên dồn Toán/Văn/Anh cùng buổi.`,
              offendingEntries: inSession,
            });
          }
        }
      }
    }
  }
  return violations;
};
const checkClassFirstPeriodRequired: CheckFn = (spec, schedule) => {
  const klass = String(spec.params.class ?? '');
  if (!klass) return [];
  const violations: Violation[] = [];
  const byDay = new Map<string, ScheduleEntry[]>();
  for (const e of schedule) {
    if (e.class !== klass) continue;
    appendToGroup(byDay, e.day, e);
  }
  for (const [day, entries] of byDay) {
    const periods = entries.map((e) => toPeriod(e.period)).filter((p): p is number => p !== null);
    if (periods.length === 0) continue;
    const dayMin = Math.min(...periods);
    if (dayMin > 1) {
      violations.push({
        constraintId: spec.id,
        kind: spec.kind,
        message: `Lớp ${klass} không bắt đầu từ tiết 1 ngày ${day} (tiết đầu là ${dayMin}).`,
        offendingEntries: entries,
      });
    }
  }
  return violations;
};

const checkSubjectFlagCeremonySlot: CheckFn = (spec, schedule) => {
  const day = String(spec.params.day ?? '');
  const period = Number(spec.params.period ?? NaN);
  if (!day || !Number.isFinite(period)) return [];
  const offending = schedule.filter((e) => e.day === day && toPeriod(e.period) === period);
  if (!offending.length) return [];
  return [{
    constraintId: spec.id,
    kind: spec.kind,
    message: `Slot chào cờ/sinh hoạt ${day} tiết ${period} không được xếp lịch dạy.`,
    offendingEntries: offending,
  }];
};

const checkGlobalTeacherUtilizationBalance: CheckFn = (spec, schedule) => {
  const tolerance = Number(spec.params.tolerance ?? 1);
  const loads = new Map<string, number>();
  for (const e of schedule) {
    loads.set(e.teacher, (loads.get(e.teacher) ?? 0) + 1);
  }
  const values = [...loads.values()];
  if (values.length <= 1) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min <= tolerance) return [];
  const offenders = schedule.filter((e) => loads.get(e.teacher) === max || loads.get(e.teacher) === min);
  return [{
    constraintId: spec.id,
    kind: spec.kind,
    message: `Chênh lệch tải GV ${max - min} tiết (tolerance ${tolerance}).`,
    offendingEntries: offenders,
  }];
};

// ===== NEW GLOBAL CHECKERS =====

const checkPairSameSlot: CheckFn = (spec, schedule) => {
  const ids = (Array.isArray(spec.params.assignmentIds) ? spec.params.assignmentIds : []).map(String);
  if (ids.length !== 2) return [];
  const [a, b] = ids;
  const slotsA = new Set(schedule.filter((e) => String(e.assignmentId ?? '') === a).map((e) => `${e.day}::${e.period}`));
  const slotsB = new Set(schedule.filter((e) => String(e.assignmentId ?? '') === b).map((e) => `${e.day}::${e.period}`));
  // They should have exactly the same slots (co-teaching / parallel)
  const onlyA = [...slotsA].filter((s) => !slotsB.has(s));
  const onlyB = [...slotsB].filter((s) => !slotsA.has(s));
  if (onlyA.length === 0 && onlyB.length === 0) return [];
  const offending = schedule.filter((e) => ids.includes(String(e.assignmentId ?? '')));
  return [{ constraintId: spec.id, kind: spec.kind, message: `Hai assignment ${a} và ${b} không song song slot.`, offendingEntries: offending }];
};

const checkMutualExclusion: CheckFn = (spec, schedule) => {
  const ids = (Array.isArray(spec.params.assignmentIds) ? spec.params.assignmentIds : []).map(String);
  if (ids.length < 2) return [];
  const bySlot = new Map<string, string[]>();
  for (const e of schedule) {
    const aid = String(e.assignmentId ?? '');
    if (!ids.includes(aid)) continue;
    const key = `${e.day}::${e.period}`;
    if (!bySlot.has(key)) bySlot.set(key, []);
    bySlot.get(key)!.push(aid);
  }
  const violations: Violation[] = [];
  for (const [slot, list] of bySlot) {
    if (list.length > 1) {
      const [day, period] = slot.split('::');
      const entries = schedule.filter((e) => e.day === day && String(e.period) === period && ids.includes(String(e.assignmentId ?? '')));
      violations.push({ constraintId: spec.id, kind: spec.kind, message: `Các assignment {${list.join(', ')}} trùng slot ${day} tiết ${period}.`, offendingEntries: entries });
    }
  }
  return violations;
};

const checkerByKind: Partial<Record<ConstraintSpec['kind'], CheckFn>> = {
  teacher_block_day: checkTeacherBlockDay,
  teacher_block_period: checkTeacherBlockPeriod,
  teacher_block_slot: checkTeacherBlockSlot,
  teacher_max_per_day: checkTeacherMaxPerDay,
  teacher_max_consecutive: checkTeacherMaxConsecutive,
  teacher_max_working_days: checkTeacherMaxWorkingDays,
  teacher_min_per_day: checkTeacherMinPerDay,
  teacher_no_gaps: checkTeacherNoGaps,
  teacher_allowed_days: checkTeacherAllowedDays,
  teacher_allowed_periods: checkTeacherAllowedPeriods,
  teacher_min_working_days: checkTeacherMinWorkingDays,
  teacher_max_gaps: checkTeacherMaxGaps,
  teacher_min_consecutive: checkTeacherMinConsecutive,
  teacher_balanced_load: checkTeacherBalancedLoad,
  teacher_max_subjects_per_day: checkTeacherMaxSubjectsPerDay,
  teacher_max_consecutive_days: checkTeacherMaxConsecutiveDays,
  teacher_preferred_periods: checkTeacherPreferredPeriods,
  teacher_max_classes_per_day: checkTeacherMaxClassesPerDay,
  teacher_pair_not_same_slot: checkTeacherPairNotSameSlot,
  teacher_homeroom_first_period: checkTeacherHomeroomFirstPeriod,
  subject_pin_period: checkSubjectPinPeriod,
  subject_preferred_periods: checkSubjectPreferredPeriods,
  subject_not_last_period: checkSubjectNotLastPeriod,
  subject_consecutive: checkSubjectConsecutive,
  subject_max_consecutive: checkSubjectMaxConsecutive,
  subject_allowed_days: checkSubjectAllowedDays,
  subject_min_gap_days: checkSubjectMinGapDays,
  subject_daily_max_periods: checkSubjectDailyMaxPeriods,
  subject_block_period: checkSubjectBlockPeriod,
  subject_block_days: checkSubjectBlockDays,
  subject_not_consecutive: checkSubjectNotConsecutive,
  subject_min_days: checkSubjectMinDays,
  subject_spread_evenly: checkSubjectSpreadEvenly,
  subject_order_before: checkSubjectOrderBefore,
  subject_not_after_subject: checkSubjectNotAfterSubject,
  class_block_day: checkClassBlockDay,
  class_block_period: checkClassBlockPeriod,
  class_block_slot: checkClassBlockSlot,
  class_max_per_day: checkClassMaxPerDay,
  class_min_per_day: checkClassMinPerDay,
  class_no_gaps: checkClassNoGaps,
  class_no_double_subject_day: checkClassNoDoubleSubjectDay,
  class_subjects_not_same_day: checkClassSubjectsNotSameDay,
  class_fixed_period: checkClassFixedPeriod,
  class_allowed_days: checkClassAllowedDays,
  class_allowed_periods: checkClassAllowedPeriods,
  class_max_consecutive: checkClassMaxConsecutive,
  class_max_subjects_per_day: checkClassMaxSubjectsPerDay,
  class_balanced_load: checkClassBalancedLoad,
  class_subjects_same_day: checkClassSubjectsSameDay,
  class_min_working_days: checkClassMinWorkingDays,
  class_max_heavy_subjects_per_day: checkClassMaxHeavySubjectsPerDay,
  class_max_heavy_subjects_per_session: checkClassMaxHeavySubjectsPerSession,
  class_first_period_required: checkClassFirstPeriodRequired,
  subject_flag_ceremony_slot: checkSubjectFlagCeremonySlot,
  global_teacher_utilization_balance: checkGlobalTeacherUtilizationBalance,
  assignment_pin_slot: checkAssignmentPinSlot,
  assignment_block_slot: checkAssignmentBlockSlot,
  assignment_allowed_slots: checkAssignmentAllowedSlots,
  assignment_spread_days: checkAssignmentSpreadDays,
  weekly_periods_exact: checkWeeklyPeriodsExact,
  assignment_consecutive: checkAssignmentConsecutive,
  assignment_max_per_day: checkAssignmentMaxPerDay,
  assignment_same_day: checkAssignmentSameDay,
  assignment_not_same_day: checkAssignmentNotSameDay,
  pair_not_same_slot: checkPairNotSameSlot,
  pair_same_slot: checkPairSameSlot,
  mutual_exclusion: checkMutualExclusion,
  if_then: checkIfThen,
  session_limit: checkSessionLimit,
  subject_group_daily_limit: checkSubjectGroupDailyLimit,
  subject_session_max_periods: checkSubjectSessionMaxPeriods,
  teacher_required_day: checkTeacherRequiredDay,
  teacher_required_slot: checkTeacherRequiredSlot,
  teacher_pair_required_same_day: checkTeacherPairRequiredSameDay,
  teacher_pair_required_same_slot: checkTeacherPairRequiredSameSlot,
};

export function validateSchedule(
  schedule: ScheduleEntry[],
  constraintSpecs: ConstraintSpec[],
  ctx: DeterministicValidationContext = {}
): DeterministicValidationReport {
  const baseViolations = checkBaseConstraints(schedule, ctx);
  const specViolations: Violation[] = [];
  const hardSpecViolations: Violation[] = [];
  const softViolations: Violation[] = [];
  const uncheckedConstraintIds: string[] = [];
  const hardUncheckedConstraintIds: string[] = [];

  for (const spec of constraintSpecs) {
    if (!CHECKED_KINDS.has(spec.kind)) {
      uncheckedConstraintIds.push(spec.id);
      if (spec.severity === 'hard') hardUncheckedConstraintIds.push(spec.id);
      continue;
    }
    const checker = checkerByKind[spec.kind];
    if (!checker) {
      uncheckedConstraintIds.push(spec.id);
      if (spec.severity === 'hard') hardUncheckedConstraintIds.push(spec.id);
      continue;
    }
    const checkedViolations = checker(spec, schedule, ctx);
    specViolations.push(...checkedViolations);
    if (spec.severity === 'hard') {
      hardSpecViolations.push(...checkedViolations);
    } else if (spec.severity === 'soft') {
      softViolations.push(...checkedViolations);
    }
  }

  const violations = [...baseViolations, ...specViolations];
  const hardViolations = [...baseViolations, ...hardSpecViolations];

  // FAIL-CLOSED: một hard constraint không có checker (custom_dsl / kind lạ)
  // KHÔNG được mặc nhiên coi là đạt. (fix bug #4)
  const hardCoverageComplete = hardUncheckedConstraintIds.length === 0;

  return {
    ok: baseViolations.length === 0 && hardViolations.length === 0 && hardCoverageComplete,
    baseConstraintPass: baseViolations.length === 0,
    hardConstraintPass: hardViolations.length === 0 && hardCoverageComplete,
    softConstraintPass: softViolations.length === 0,
    hardCoverageComplete,
    violations,
    hardViolations,
    softViolations,
    uncheckedConstraintIds,
    hardUncheckedConstraintIds,
  };
}
