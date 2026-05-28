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

  const byClassDay = new Map<string, ScheduleEntry[]>();
  for (const entry of target) {
    const key = `${entry.class}::${entry.day}`;
    byClassDay.set(key, [...(byClassDay.get(key) ?? []), entry]);
  }

  for (const entries of byClassDay.values()) {
    if (entries.length < length) continue;
    const periods = entries
      .map((entry) => toPeriod(entry.period))
      .filter((period): period is number => period !== null)
      .sort((a, b) => a - b);
    const totalPeriodsForSubject = periods.length;
    // Lưu ý: KHÔNG kiểm tra (total % length) vì một ngày có thể có 1 block
    // đúng độ dài + lẻ 1 tiết ở ngày khác, không vi phạm subject_consecutive.
    // (fix bug #13 — trước đây false-positive khi total=3, length=2.)

    // Đếm số streak liên tiếp đủ dài length
    let runsOfCorrectLength = 0;
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

    // Cần ít nhất floor(total / length) block đủ độ dài.
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
  const violations: Violation[] = [];
  const byDaySubject = new Map<string, ScheduleEntry[]>();

  for (const entry of schedule) {
    if (entry.class !== klass) continue;
    if (subjectFilter && entry.subject !== subjectFilter) continue;
    const key = `${entry.day}::${entry.subject}`;
    byDaySubject.set(key, [...(byDaySubject.get(key) ?? []), entry]);
  }

  for (const [key, entries] of byDaySubject.entries()) {
    if (entries.length <= 1) continue;
    const [day, subject] = key.split('::');
    violations.push({
      constraintId: spec.id,
      kind: spec.kind,
      message: `Lớp ${klass} học môn ${subject} ${entries.length} lần trong ngày ${day}.`,
      offendingEntries: entries,
    });
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

const checkerByKind: Partial<Record<ConstraintSpec['kind'], CheckFn>> = {
  teacher_block_day: checkTeacherBlockDay,
  teacher_block_period: checkTeacherBlockPeriod,
  teacher_block_slot: checkTeacherBlockSlot,
  teacher_max_per_day: checkTeacherMaxPerDay,
  teacher_max_consecutive: checkTeacherMaxConsecutive,
  subject_pin_period: checkSubjectPinPeriod,
  subject_consecutive: checkSubjectConsecutive,
  class_no_double_subject_day: checkClassNoDoubleSubjectDay,
  weekly_periods_exact: checkWeeklyPeriodsExact,
  pair_not_same_slot: checkPairNotSameSlot,
  if_then: checkIfThen,
};

export function validateSchedule(
  schedule: ScheduleEntry[],
  constraintSpecs: ConstraintSpec[],
  ctx: DeterministicValidationContext = {}
): DeterministicValidationReport {
  const baseViolations = checkBaseConstraints(schedule, ctx);
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
    specViolations.push(...checker(spec, schedule, ctx));
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

  return {
    ok: violations.length === 0,
    baseConstraintPass: baseViolations.length === 0,
    hardConstraintPass: hardViolations.length === 0,
    softConstraintPass: softViolations.length === 0,
    violations,
    hardViolations,
    softViolations,
    uncheckedConstraintIds,
  };
}