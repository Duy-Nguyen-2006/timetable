import type {
  ConstraintSpec,
  ConditionExpr,
  DeterministicValidationContext,
  DeterministicValidationReport,
  ScheduleEntry,
  Violation,
} from './constraint-spec';

type CheckFn = (
  spec: ConstraintSpec,
  schedule: ScheduleEntry[],
  ctx: DeterministicValidationContext
) => Violation[];

function toPeriod(value: number | string): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value));
  return Number.isFinite(n) ? n : null;
}

function slotKey(entry: ScheduleEntry): string {
  return `${entry.day}::${entry.period}`;
}

function pushViolation(
  list: Violation[],
  constraintId: string,
  kind: Violation['kind'],
  message: string,
  offendingEntries: ScheduleEntry[]
): void {
  list.push({ constraintId, kind, message, offendingEntries });
}

function evaluateCondition(condition: ConditionExpr, schedule: ScheduleEntry[]): boolean {
  switch (condition.op) {
    case 'teacher_teaches_on_day':
      return schedule.some(
        (entry) => entry.teacher === condition.teacher && entry.day === condition.day
      );
    case 'teacher_teaches_at_slot':
      return schedule.some(
        (entry) =>
          entry.teacher === condition.teacher &&
          entry.day === condition.day &&
          toPeriod(entry.period) === condition.period
      );
    case 'and':
      return condition.args.every((arg) => evaluateCondition(arg, schedule));
    case 'or':
      return condition.args.some((arg) => evaluateCondition(arg, schedule));
    case 'not':
      return !evaluateCondition(condition.arg, schedule);
    default:
      return false;
  }
}

function checkBaseConstraints(
  schedule: ScheduleEntry[],
  ctx: DeterministicValidationContext
): Violation[] {
  const violations: Violation[] = [];
  const teacherSlotMap = new Map<string, ScheduleEntry[]>();
  const classSlotMap = new Map<string, ScheduleEntry[]>();

  const assignmentById = new Map((ctx.assignments ?? []).map((assignment) => [assignment.id, assignment]));

  for (const entry of schedule) {
    if (ctx.assignments?.length) {
      const assignmentId = entry.assignmentId ? String(entry.assignmentId) : '';

      if (!assignmentId) {
        pushViolation(
          violations,
          'base_missing_assignment_id',
          'base_constraint',
          `Schedule entry thiếu assignmentId: ${entry.class}/${entry.subject}/${entry.teacher}`,
          [entry]
        );
        continue;
      }

      const assignment = assignmentById.get(assignmentId);
      if (!assignment) {
        pushViolation(
          violations,
          'base_unknown_assignment_id',
          'base_constraint',
          `Schedule entry có assignmentId không tồn tại: ${assignmentId}`,
          [entry]
        );
        continue;
      }

      if (
        entry.class !== assignment.class ||
        entry.subject !== assignment.subject ||
        entry.teacher !== assignment.teacher
      ) {
        pushViolation(
          violations,
          'base_assignment_tuple_mismatch',
          'base_constraint',
          `assignmentId ${assignmentId} không khớp class/subject/teacher.`,
          [entry]
        );
      }
    }

    const teacherKey = `${entry.teacher}::${slotKey(entry)}`;
    const classKey = `${entry.class}::${slotKey(entry)}`;

    teacherSlotMap.set(teacherKey, [...(teacherSlotMap.get(teacherKey) ?? []), entry]);
    classSlotMap.set(classKey, [...(classSlotMap.get(classKey) ?? []), entry]);
  }

  for (const entries of teacherSlotMap.values()) {
    if (entries.length > 1) {
      pushViolation(
        violations,
        'base_teacher_clash',
        'base_constraint',
        `Teacher clash tại ${entries[0].day}/${entries[0].period} cho ${entries[0].teacher}.`,
        entries
      );
    }
  }

  for (const entries of classSlotMap.values()) {
    if (entries.length > 1) {
      pushViolation(
        violations,
        'base_class_clash',
        'base_constraint',
        `Class clash tại ${entries[0].day}/${entries[0].period} cho lớp ${entries[0].class}.`,
        entries
      );
    }
  }

  if (ctx.assignments?.length) {
    for (const assignment of ctx.assignments) {
      const count = schedule.filter(
        (entry) => String(entry.assignmentId ?? '') === assignment.id
      ).length;

      if (count !== assignment.weeklyPeriods) {
        pushViolation(
          violations,
          `base_weekly_${assignment.id}`,
          'base_constraint',
          `Weekly periods mismatch for ${assignment.id}: expected ${assignment.weeklyPeriods}, got ${count}.`,
          schedule.filter(
            (entry) => String(entry.assignmentId ?? '') === assignment.id
          )
        );
      }
    }
  }

  return violations;
}

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
    byDay.set(entry.day, [...(byDay.get(entry.day) ?? []), entry]);
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
    byDay.set(entry.day, [...(byDay.get(entry.day) ?? []), entry]);
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
    byClass.set(entry.class, [...(byClass.get(entry.class) ?? []), entry]);
  }

  for (const entries of byClass.values()) {
    if (entries.length < length) continue;
    const totalPeriodsForSubject = entries.length;
    // Rule A: subject_consecutive chỉ yêu cầu floor(total / length) block liên tiếp.
    // Nếu total % length != 0, phần dư được phép xếp lẻ ở cùng ngày hoặc ngày khác;
    // KHÔNG báo violation chỉ vì có tiết lẻ và không yêu cầu total chia hết cho length.

    // Đếm số streak liên tiếp đủ dài length trong từng ngày, không nối streak qua ngày khác.
    let runsOfCorrectLength = 0;
    const byDay = new Map<string, ScheduleEntry[]>();
    for (const entry of entries) {
      byDay.set(entry.day, [...(byDay.get(entry.day) ?? []), entry]);
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
        message: `Môn ${subject} cần các block liên tiếp độ dài ${length}.`,
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
    byDaySubject.set(key, [...(byDaySubject.get(key) ?? []), entry]);
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
    subjectMap.set(entry.subject, [...(subjectMap.get(entry.subject) ?? []), entry]);
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
    byClassDay.set(key, [...(byClassDay.get(key) ?? []), entry]);
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
    bySlot.set(key, [...(bySlot.get(key) ?? []), entry]);
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
    const nestedSpec: ConstraintSpec = {
      id: `${spec.id}:then:${index + 1}`,
      original: spec.original,
      severity: spec.severity,
      kind: (thenItem.kind ?? 'custom_dsl') as ConstraintSpec['kind'],
      params: thenItem.params ?? {},
      notes: spec.notes,
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

const checkResourceCapacity: CheckFn = (spec, schedule) => {
  const subject = String(spec.params.subject ?? '');
  const capacity = Number(spec.params.capacity ?? 1);
  const violations: Violation[] = [];
  const bySlot = new Map<string, ScheduleEntry[]>();

  for (const entry of schedule) {
    if (entry.subject !== subject) continue;
    const key = `${entry.day}::${entry.period}`;
    bySlot.set(key, [...(bySlot.get(key) ?? []), entry]);
  }

  for (const [key, entries] of bySlot.entries()) {
    if (entries.length <= capacity) continue;
    const [day, period] = key.split('::');
    violations.push({
      constraintId: spec.id,
      kind: spec.kind,
      message: `Phòng ${subject} vượt quá dung lượng: ${entries.length} lớp trong ngày ${day} tiết ${period} (tối đa ${capacity}).`,
      offendingEntries: entries,
    });
  }
  return violations;
};

const checkSubjectGroup: CheckFn = () => [];

function resolveSubjectGroupSubjects(groupName: string, ctx: DeterministicValidationContext): Set<string> {
  const subjects = new Set<string>();
  for (const spec of ctx.constraintSpecs ?? []) {
    if (spec.kind !== 'subject_group') continue;
    const params = spec.params ?? {};
    const name = String(params.name ?? '');
    if (name !== groupName) continue;
    for (const subject of (params.subjects as unknown[]) ?? []) {
      if (typeof subject === 'string' && subject.trim()) subjects.add(subject);
    }
  }
  return subjects;
}

const checkSessionLimit: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const maxPeriods = Number(spec.params.maxPeriods ?? 1);
  const violations: Violation[] = [];

  if (!teacher) return [];

  const byDay = new Map<string, ScheduleEntry[]>();
  for (const entry of schedule) {
    if (entry.teacher !== teacher) continue;
    byDay.set(entry.day, [...(byDay.get(entry.day) ?? []), entry]);
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

const checkSubjectGroupDailyLimit: CheckFn = (spec, schedule, ctx) => {
  const groupName = String(spec.params.groupName ?? '');
  const maxPerDay = Number(spec.params.maxPerDay ?? 1);
  const targetClass = spec.params.class ? String(spec.params.class) : null;
  const violations: Violation[] = [];
  const groupSubjects = resolveSubjectGroupSubjects(groupName, ctx);

  const filtered = schedule.filter((entry) => {
    if (targetClass && entry.class !== targetClass) return false;
    if (groupSubjects.size > 0 && !groupSubjects.has(entry.subject)) return false;
    return true;
  });

  const byClassDaySubject = new Map<string, Set<string>>();
  const byClassDayEntries = new Map<string, ScheduleEntry[]>();
  for (const entry of filtered) {
    const key = `${entry.class}::${entry.day}`;
    if (!byClassDaySubject.has(key)) byClassDaySubject.set(key, new Set());
    byClassDaySubject.get(key)!.add(entry.subject);
    byClassDayEntries.set(key, [...(byClassDayEntries.get(key) ?? []), entry]);
  }

  for (const [key, subjects] of byClassDaySubject.entries()) {
    if (subjects.size <= maxPerDay) continue;
    const [className, day] = key.split('::');
    const entries = byClassDayEntries.get(key) ?? [];
    violations.push({
      constraintId: spec.id,
      kind: spec.kind,
      message: `Lớp ${className}: nhóm môn ${groupName} vượt quá giới hạn: ${subjects.size} môn khác nhau trong ngày ${day} (tối đa ${maxPerDay}).`,
      offendingEntries: entries,
    });
  }
  return violations;
};

const checkSubjectSpreadEvenly: CheckFn = (spec, schedule) => {
  const subject = String(spec.params.subject ?? '');
  const maxGap = Number(spec.params.maxGap ?? 2);
  const targetClasses = (spec.params.classes as string[] | undefined) ?? [...new Set(schedule.map((e) => e.class))];
  const violations: Violation[] = [];
  const allDays = [...new Set(schedule.map((e) => e.day))];

  for (const cls of targetClasses) {
    const entries = schedule.filter((e) => e.class === cls && e.subject === subject);
    if (entries.length === 0) continue;
    const daysWithSubject = new Set(entries.map((e) => e.day));
    for (let i = 0; i < allDays.length; i++) {
      const windowDays = allDays.slice(i, i + maxGap + 1);
      if (windowDays.length <= maxGap) continue;
      const hasAny = windowDays.some((d) => daysWithSubject.has(d));
      if (!hasAny) {
        pushViolation(violations, spec.id, spec.kind,
          `${subject} lớp ${cls} không có tiết nào trong ${windowDays.length} ngày liên tiếp (${windowDays.join(', ')}), vượt maxGap=${maxGap}.`,
          entries);
      }
    }
  }
  return violations;
};

const checkTeacherMaxConsecutiveGlobal: CheckFn = (spec, schedule) => {
  const teacher = spec.params.teacher ? String(spec.params.teacher) : null;
  const maxConsec = Number(spec.params.maxConsecutive ?? 4);
  const violations: Violation[] = [];
  const allDays = [...new Set(schedule.map((e) => e.day))];
  const allPeriods = [...new Set(schedule.map((e) => toPeriod(e.period)))].filter((p) => p !== null).sort((a, b) => a! - b!) as number[];

  const allSlots: Array<{ day: string; period: number }> = [];
  for (const d of allDays) {
    for (const p of allPeriods) {
      allSlots.push({ day: d, period: p });
    }
  }

  const teachers = teacher ? [teacher] : [...new Set(schedule.map((e) => e.teacher))];
  for (const t of teachers) {
    const tEntries = schedule.filter((e) => e.teacher === t);
    const tSlotSet = new Set(tEntries.map((e) => `${e.day}::${toPeriod(e.period)}`));
    let consecutive = 0;
    let startIdx = 0;
    for (let i = 0; i < allSlots.length; i++) {
      const key = `${allSlots[i].day}::${allSlots[i].period}`;
      if (tSlotSet.has(key)) {
        consecutive++;
        if (consecutive > maxConsec) {
          const offending = tEntries.filter((e) => {
            const idx = allSlots.findIndex((s) => s.day === e.day && s.period === toPeriod(e.period));
            return idx >= startIdx && idx <= i;
          });
          pushViolation(violations, spec.id, spec.kind,
            `GV ${t} dạy ${consecutive} tiết liên tiếp xuyên buổi (tối đa ${maxConsec}).`,
            offending);
          break;
        }
      } else {
        consecutive = 0;
        startIdx = i + 1;
      }
    }
  }
  return violations;
};

const checkSubjectNotAtPeriod: CheckFn = (spec, schedule) => {
  const subject = String(spec.params.subject ?? '');
  const forbiddenPeriods = new Set(((spec.params.periods as (number | string)[]) ?? []).map(Number));
  const targetClasses = spec.params.classes as string[] | undefined;
  const violations: Violation[] = [];

  for (const entry of schedule) {
    if (entry.subject !== subject) continue;
    if (targetClasses && !targetClasses.includes(entry.class)) continue;
    const p = toPeriod(entry.period);
    if (p !== null && forbiddenPeriods.has(p)) {
      pushViolation(violations, spec.id, spec.kind,
        `${subject} lớp ${entry.class} xếp tiết ${p} ngày ${entry.day} (tiết cấm).`,
        [entry]);
    }
  }
  return violations;
};

const checkTeacherPreferCompact: CheckFn = (spec, schedule) => {
  const teacher = spec.params.teacher ? String(spec.params.teacher) : null;
  const violations: Violation[] = [];
  const teachers = teacher ? [teacher] : [...new Set(schedule.map((e) => e.teacher))];
  const allDays = [...new Set(schedule.map((e) => e.day))];

  for (const t of teachers) {
    const tEntries = schedule.filter((e) => e.teacher === t);
    for (const d of allDays) {
      const dayEntries = tEntries.filter((e) => e.day === d);
      if (dayEntries.length < 2) continue;
      const periods = dayEntries.map((e) => toPeriod(e.period)).filter((p) => p !== null).sort((a, b) => a! - b!) as number[];
      if (periods.length < 2) continue;
      const minP = periods[0];
      const maxP = periods[periods.length - 1];
      const gaps = (maxP - minP + 1) - periods.length;
      if (gaps > 0) {
        pushViolation(violations, spec.id, spec.kind,
          `GV ${t} ngày ${d} có ${gaps} tiết trống giữa các tiết dạy (không compact).`,
          dayEntries);
      }
    }
  }
  return violations;
};

const checkClassBalancedDailyLoad: CheckFn = (spec, schedule) => {
  const targetClass = spec.params.class ? String(spec.params.class) : null;
  const maxDiff = Number(spec.params.maxDiff ?? 1);
  const violations: Violation[] = [];
  const classes = targetClass ? [targetClass] : [...new Set(schedule.map((e) => e.class))];
  const allDays = [...new Set(schedule.map((e) => e.day))];

  for (const cls of classes) {
    const clsEntries = schedule.filter((e) => e.class === cls);
    const dayCounts = allDays.map((d) => ({
      day: d,
      count: clsEntries.filter((e) => e.day === d).length,
    }));
    for (let i = 0; i < dayCounts.length; i++) {
      for (let j = i + 1; j < dayCounts.length; j++) {
        const diff = Math.abs(dayCounts[i].count - dayCounts[j].count);
        if (diff > maxDiff) {
          pushViolation(violations, spec.id, spec.kind,
            `Lớp ${cls}: chênh lệch số tiết giữa ${dayCounts[i].day} (${dayCounts[i].count}) và ${dayCounts[j].day} (${dayCounts[j].count}) = ${diff} > ${maxDiff}.`,
            clsEntries.filter((e) => e.day === dayCounts[i].day || e.day === dayCounts[j].day));
        }
      }
    }
  }
  return violations;
};

const checkTeacherFixedSlot: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const day = String(spec.params.day ?? '');
  const period = Number(spec.params.period ?? 0);
  const subject = spec.params.subject ? String(spec.params.subject) : null;
  const violations: Violation[] = [];

  const matching = schedule.filter((e) => {
    if (e.teacher !== teacher) return false;
    if (e.day !== day) return false;
    if (toPeriod(e.period) !== period) return false;
    if (subject && e.subject !== subject) return false;
    return true;
  });

  if (matching.length === 0) {
    pushViolation(violations, spec.id, spec.kind,
      `GV ${teacher} không có tiết${subject ? ` môn ${subject}` : ''} vào ${day} tiết ${period} (yêu cầu cố định).`,
      []);
  }
  return violations;
};

const checkSubjectNotConsecutiveDays: CheckFn = (spec, schedule) => {
  const subject = String(spec.params.subject ?? '');
  const targetClasses = (spec.params.classes as string[] | undefined) ?? [...new Set(schedule.map((e) => e.class))];
  const violations: Violation[] = [];
  const allDays = [...new Set(schedule.map((e) => e.day))];

  for (const cls of targetClasses) {
    const entries = schedule.filter((e) => e.class === cls && e.subject === subject);
    if (entries.length === 0) continue;
    const daysWithSubject = new Set(entries.map((e) => e.day));
    for (let i = 0; i < allDays.length - 1; i++) {
      if (daysWithSubject.has(allDays[i]) && daysWithSubject.has(allDays[i + 1])) {
        const offending = entries.filter((e) => e.day === allDays[i] || e.day === allDays[i + 1]);
        pushViolation(violations, spec.id, spec.kind,
          `${subject} lớp ${cls} xếp 2 ngày liên tiếp: ${allDays[i]} và ${allDays[i + 1]}.`,
          offending);
      }
    }
  }
  return violations;
};

const checkMultiSchoolAvailability: CheckFn = (spec, schedule) => {
  const teacher = String(spec.params.teacher ?? '');
  const availableDays = new Set((spec.params.availableDays as string[]) ?? []);
  const violations: Violation[] = [];

  for (const entry of schedule) {
    if (entry.teacher !== teacher) continue;
    if (!availableDays.has(entry.day)) {
      pushViolation(violations, spec.id, spec.kind,
        `GV ${teacher} dạy ngày ${entry.day} nhưng không available (chỉ dạy: ${[...availableDays].join(', ')}).`,
        [entry]);
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
  subject_pin_period: checkSubjectPinPeriod,
  subject_consecutive: checkSubjectConsecutive,
  class_no_double_subject_day: checkClassNoDoubleSubjectDay,
  class_subjects_not_same_day: checkClassSubjectsNotSameDay,
  teacher_max_working_days: checkTeacherMaxWorkingDays,
  subject_max_consecutive: checkSubjectMaxConsecutive,
  weekly_periods_exact: checkWeeklyPeriodsExact,
  pair_not_same_slot: checkPairNotSameSlot,
  if_then: checkIfThen,
  resource_capacity: checkResourceCapacity,
  session_limit: checkSessionLimit,
  subject_group: checkSubjectGroup,
  subject_group_daily_limit: checkSubjectGroupDailyLimit,
  subject_spread_evenly: checkSubjectSpreadEvenly,
  teacher_max_consecutive_global: checkTeacherMaxConsecutiveGlobal,
  subject_not_at_period: checkSubjectNotAtPeriod,
  teacher_prefer_compact: checkTeacherPreferCompact,
  class_balanced_daily_load: checkClassBalancedDailyLoad,
  teacher_fixed_slot: checkTeacherFixedSlot,
  subject_not_consecutive_days: checkSubjectNotConsecutiveDays,
  multi_school_availability: checkMultiSchoolAvailability,
};

export function validateSchedule(
  schedule: ScheduleEntry[],
  constraintSpecs: ConstraintSpec[],
  ctx: DeterministicValidationContext = {}
): DeterministicValidationReport {
  const validationCtx: DeterministicValidationContext = { ...ctx, constraintSpecs };
  const baseViolations = checkBaseConstraints(schedule, validationCtx);
  const specViolations: Violation[] = [];
  const uncheckedConstraintIds: string[] = [];

  for (const spec of constraintSpecs) {
    if (spec.kind === 'custom_dsl') {
      uncheckedConstraintIds.push(spec.id);
      continue;
    }
    const checker = checkerByKind[spec.kind];
    if (!checker) {
      uncheckedConstraintIds.push(spec.id);
      continue;
    }
    specViolations.push(...checker(spec, schedule, validationCtx));
  }

  const violations = [...baseViolations, ...specViolations];
  const hardConstraintIds = new Set(
    constraintSpecs.filter((spec) => spec.severity === 'hard').map((spec) => spec.id)
  );
  const softConstraintIds = new Set(
    constraintSpecs.filter((spec) => spec.severity === 'soft').map((spec) => spec.id)
  );

  const hardViolations = violations.filter(
    (violation) =>
      violation.kind === 'base_constraint' || hardConstraintIds.has(violation.constraintId)
  );
  const softViolations = violations.filter((violation) => softConstraintIds.has(violation.constraintId));

  // FAIL-CLOSED: một hard constraint không có checker (custom_dsl / kind lạ)
  // KHÔNG được mặc nhiên coi là đạt. (fix bug #4)
  const hardUncheckedConstraintIds = uncheckedConstraintIds.filter((id) =>
    hardConstraintIds.has(id)
  );
  const hardCoverageComplete = hardUncheckedConstraintIds.length === 0;

  return {
    ok: violations.length === 0 && hardCoverageComplete,
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
