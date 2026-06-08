import type {
  ConditionExpr,
  DeterministicValidationContext,
  ScheduleEntry,
  Violation,
} from './constraint-spec';

/**
 * O(1) append into a grouped map. Replaces the O(n) spread
 * `[...(map.get(k) ?? []), value]` pattern that allocated a fresh
 * array on every insert (turning group-by loops into O(n²)).
 */
export function appendToGroup<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const arr = map.get(key);
  if (arr) {
    arr.push(value);
  } else {
    map.set(key, [value]);
  }
}

export function toPeriod(value: number | string): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value));
  return Number.isFinite(n) ? n : null;
}

export function slotKey(entry: ScheduleEntry): string {
  return `${entry.day}::${entry.period}`;
}

export function pushViolation(
  list: Violation[],
  constraintId: string,
  kind: Violation['kind'],
  message: string,
  offendingEntries: ScheduleEntry[]
): void {
  list.push({ constraintId, kind, message, offendingEntries });
}

export function evaluateCondition(condition: ConditionExpr, schedule: ScheduleEntry[]): boolean {
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
    case 'teacher_pair_teaches_same_day':
      return condition.teachers.every((teacher) =>
        schedule.some((entry) => entry.teacher === teacher && entry.day === condition.day)
      );
    case 'teacher_pair_teaches_same_slot':
      return condition.teachers.every((teacher) =>
        schedule.some(
          (entry) =>
            entry.teacher === teacher &&
            entry.day === condition.day &&
            toPeriod(entry.period) === condition.period
        )
      );
    case 'class_teacher_at_slot':
      return schedule.some(
        (entry) =>
          entry.class === condition.class &&
          entry.subject === condition.subject &&
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

export function checkBaseConstraints(
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

    appendToGroup(teacherSlotMap, teacherKey, entry);
    appendToGroup(classSlotMap, classKey, entry);
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
