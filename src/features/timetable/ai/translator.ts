import { z } from 'zod';

import { parseConstraint } from '@/lib/constraint-parser';

import type { ConstraintSpec, ConditionExpr } from './constraint-spec';
import { parseModelJson } from './parse-model-json';
import { SOLVER_ENCODABLE_KINDS } from './constraint-registry';
import type { AgentInputPayload, AIProviderConfig, ChatUsage, TranslatorTurnResult } from './types';
import { invokeChat, type ChatPayload } from './chat-client';
import { buildTranslatorPeriods, buildTranslatorPeriodsByDay, periodsForSession } from './translator-periods';
import {
  applyConstraintWeight,
  includesLabel,
  extractDayId,
  extractFirstNumber,
  extractConsecutiveBanCount,
  extractPeriodNumber,
  extractAssignmentMatch,
  inferWeeklyAssignmentId,
  isAutoBaseConstraintText,
  isResourceCapacityText,
  isSessionLimitText,
  isSubjectSessionMaxPeriodsText,
  isSubjectGroupDailyLimitText,
  isSubjectGroupText,
  markAutoBaseSpec,
  matchTeacherLabels,
  normalizeConstraintText,
  parseGlobalClassSubjectDailyLimit,
  shouldMarkWeeklyAutoBase,
  splitFallbackConstraintText,
  splitThenClause,
} from './translator-text';

type ChatInvoke = (payload: ChatPayload) => Promise<{ content?: string; usage?: ChatUsage }>;

const constraintSpecSchema = z.object({
  id: z.string(),
  original: z.string(),
  severity: z.enum(['hard', 'soft', 'info']),
  kind: z.enum([
    'teacher_block_day',
    'teacher_block_period',
    'teacher_block_slot',
    'teacher_max_per_day',
    'teacher_max_consecutive',
    'teacher_max_working_days',
    'teacher_min_per_day',
    'teacher_no_gaps',
    'teacher_allowed_days',
    'teacher_allowed_periods',
    'teacher_min_working_days',
    'teacher_max_gaps',
    'teacher_min_consecutive',
    'teacher_balanced_load',
    'teacher_max_subjects_per_day',
    'teacher_max_consecutive_days',
    'teacher_preferred_periods',
    'teacher_max_classes_per_day',
    'teacher_pair_not_same_slot',
    'teacher_homeroom_first_period',
    'subject_pin_period',
    'subject_preferred_periods',
    'subject_not_last_period',
    'subject_consecutive',
    'subject_max_consecutive',
    'subject_allowed_days',
    'subject_min_gap_days',
    'subject_daily_max_periods',
    'subject_block_period',
    'subject_block_days',
    'subject_not_consecutive',
    'subject_min_days',
    'subject_spread_evenly',
    'subject_order_before',
    'subject_not_after_subject',
    'class_block_day',
    'class_block_period',
    'class_block_slot',
    'class_max_per_day',
    'class_min_per_day',
    'class_no_gaps',
    'class_no_double_subject_day',
    'class_subjects_not_same_day',
    'class_fixed_period',
    'class_allowed_days',
    'class_allowed_periods',
    'class_max_consecutive',
    'class_max_subjects_per_day',
    'class_balanced_load',
    'class_subjects_same_day',
    'class_min_working_days',
    'class_max_heavy_subjects_per_day',
    'class_max_heavy_subjects_per_session',
    'class_first_period_required',
    'subject_flag_ceremony_slot',
    'global_teacher_utilization_balance',
    'assignment_pin_slot',
    'assignment_block_slot',
    'assignment_allowed_slots',
    'assignment_spread_days',
    'weekly_periods_exact',
    'assignment_consecutive',
    'assignment_max_per_day',
    'assignment_same_day',
    'assignment_not_same_day',
    'if_then',
    'pair_not_same_slot',
    'pair_same_slot',
    'mutual_exclusion',
    'session_limit',
    'subject_group',
    'subject_group_daily_limit',
    'subject_session_max_periods',
    'teacher_required_day',
    'teacher_required_slot',
    'teacher_pair_required_same_day',
    'teacher_pair_required_same_slot',
    'custom_dsl',
  ]),
  params: z.record(z.string(), z.unknown()),
  tags: z.array(z.enum(['auto_base', 'user_required', 'user_preferred'])).optional(),
  notes: z.string().optional(),
  weight: z.number().optional(),
  pythonPredicate: z.string().optional(),
});

const translatorResponseSchema = z.object({
  constraintSpecs: z.array(constraintSpecSchema),
});

const defaultInvokeChat: ChatInvoke = (payload) => invokeChat(payload);

function fallbackFromRuleParser(input: AgentInputPayload): ConstraintSpec[] {
  const teacherLabels = [...new Set(input.assignments.map((assignment) => assignment.teacher.label))];
  const classLabels = [...new Set(input.assignments.map((assignment) => assignment.class.label))];
  const subjectLabels = [...new Set(input.assignments.map((assignment) => assignment.subject.label))];
  const dayIds = Object.fromEntries(input.days.map((day) => [day.id, day.id]));
  const sessionIds = Object.fromEntries(input.sessions.map((session) => [session.id, session.id]));

  let nextId = 1;
  const weightByText = new Map(input.constraints.map((constraint) => [constraint.text, constraint.weight]));
  const specs = input.constraints.flatMap((rawConstraint) => {
    const clauses = splitFallbackConstraintText(rawConstraint.text);
    return clauses.flatMap<ConstraintSpec>((clause) => {
      const constraint = { ...rawConstraint, text: clause };
      const id = `c${nextId++}`;
      const withWeight = (spec: ConstraintSpec): ConstraintSpec => applyConstraintWeight(spec, constraint.weight);
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

      // === IF clause parsing (F-1 polarity, F-2 N-teacher, F-3 OR, F-4 class/subject, F-5 teacher-pair) ===
      const ifSubClauseTexts = ifClauseRaw
        .split(/\s+hoặc\s+|\s+hoac\s+/iu)
        .map((s) => s.trim())
        .filter(Boolean);
      const ifOrBranches: ConditionExpr[] = [];

      for (const subText of ifSubClauseTexts) {
        const subTeachers = matchTeacherLabels(subText, teacherLabels);
        const subClasses = classLabels.filter((c) => includesLabel(subText, c));
        const subSubjects = subjectLabels.filter((s) => includesLabel(subText, s));
        const subDay = extractDayId(subText, input.days);
        const subPeriod = extractPeriodNumber(subText);
        const isNegative = /không|khong/iu.test(subText);
        const wrapNot = (atom: ConditionExpr): ConditionExpr =>
          isNegative ? { op: 'not', arg: atom } : atom;

        // F-5: teacher pair cùng dạy (same-day hoặc same-slot).
        if (subTeachers.length >= 2 && /cùng\s*dạy|cung\s*day/iu.test(subText) && subDay) {
          const pair: [string, string] = [subTeachers[0], subTeachers[1]];
          if (subPeriod !== null) {
            ifOrBranches.push(
              wrapNot({ op: 'teacher_pair_teaches_same_slot', teachers: pair, day: subDay, period: subPeriod })
            );
          } else {
            ifOrBranches.push(
              wrapNot({ op: 'teacher_pair_teaches_same_day', teachers: pair, day: subDay })
            );
          }
          continue;
        }

        // F-4: class × subject × slot (lớp X học môn Y tiết Z ngày W).
        if (subClasses[0] && subSubjects[0] && subDay && subPeriod !== null) {
          ifOrBranches.push(
            wrapNot({
              op: 'class_teacher_at_slot',
              class: subClasses[0],
              subject: subSubjects[0],
              day: subDay,
              period: subPeriod,
            })
          );
          continue;
        }

        // F-2 + F-1: 1+ teacher → AND of atoms, wrap NOT nếu có "không".
        if (subTeachers.length > 0 && subDay) {
          const teacherAtoms: ConditionExpr[] = subTeachers.map((teacher) =>
            subPeriod !== null
              ? { op: 'teacher_teaches_at_slot', teacher, day: subDay, period: subPeriod }
              : { op: 'teacher_teaches_on_day', teacher, day: subDay }
          );
          const teacherCondition: ConditionExpr =
            teacherAtoms.length > 1 ? { op: 'and', args: teacherAtoms } : teacherAtoms[0];
          ifOrBranches.push(wrapNot(teacherCondition));
        }
      }

      const condition: ConditionExpr | null =
        ifOrBranches.length === 0
          ? null
          : ifOrBranches.length === 1
            ? ifOrBranches[0]
            : { op: 'or', args: ifOrBranches };

      // === THEN clause parsing (F-6 positive, F-7 2+ teacher required, F-8 assignment, F-9 soft weight) ===
      const thenSubClauses = splitThenClause(thenClauseRaw);
      const thenSpecsRaw: Array<{ kind: string; params: Record<string, unknown> }> = [];

      for (const subClause of thenSubClauses) {
        const subTeachers = matchTeacherLabels(subClause, teacherLabels);
        const subDay = extractDayId(subClause, input.days);
        const subPeriod = extractPeriodNumber(subClause);

        // F-7: 2+ GV "phải dạy cùng tiết/ngày" → positive pair.
        if (
          subTeachers.length >= 2 &&
          /cùng\s*(tiết|tiet)|cung\s*(tiet|tiet)|cùng\s*ngày|cung\s*ngay/iu.test(subClause) &&
          /(phải|phai)/iu.test(subClause)
        ) {
          const pair: [string, string] = [subTeachers[0], subTeachers[1]];
          if (subPeriod !== null && subDay) {
            thenSpecsRaw.push({
              kind: 'teacher_pair_required_same_slot',
              params: { teachers: pair, day: subDay, period: subPeriod },
            });
          } else if (subDay) {
            thenSpecsRaw.push({
              kind: 'teacher_pair_required_same_day',
              params: { teachers: pair, day: subDay },
            });
          }
          continue;
        }

        // Existing: 2+ GV "không cùng tiết" (giữ test VAL-T1-* cũ).
        if (/(không|khong).*(cùng|trùng).*(tiết|tiet)/iu.test(subClause) && subTeachers.length >= 2) {
          thenSpecsRaw.push({
            kind: 'pair_not_same_slot',
            params: {
              teachers: subTeachers.slice(0, 2),
              ...(subDay ? { scope: { day: subDay } } : {}),
            },
          });
          continue;
        }

        // F-8: assignment-level "phải xếp" — yêu cầu subject HOẶC class xuất hiện trong sub-clause
        // để tránh match nhầm chỉ dựa trên teacher (vd: "Dung phải dạy thứ 4 tiết 2" → teacher-only,
        // thuộc về F-6 chứ không phải assignment pin).
        const subjectInText = subjectLabels.some((s) => includesLabel(subClause, s));
        const classInText = classLabels.some((c) => includesLabel(subClause, c));
        if ((subjectInText || classInText) && subDay && subPeriod !== null) {
          const assignmentId = extractAssignmentMatch(subClause, input.assignments);
          if (assignmentId) {
            thenSpecsRaw.push({
              kind: 'assignment_pin_slot',
              params: { assignmentId, day: subDay, period: subPeriod },
            });
            continue;
          }
        }

        const isNegative = /(không|khong)/iu.test(subClause);
        const isPositive = !isNegative && /(dạy|day)/iu.test(subClause);

        // F-6: positive "phải dạy" — cần ít nhất 1 teacher để áp dụng.
        if (isPositive && subDay && subTeachers.length > 0) {
          for (const teacher of subTeachers) {
            if (subPeriod !== null) {
              thenSpecsRaw.push({
                kind: 'teacher_required_slot',
                params: { teacher, day: subDay, period: subPeriod },
              });
            } else {
              thenSpecsRaw.push({
                kind: 'teacher_required_day',
                params: { teacher, day: subDay },
              });
            }
          }
          continue;
        }

        // Existing: negative "không dạy" — cần ít nhất 1 teacher.
        if (isNegative && subDay && subTeachers.length > 0) {
          for (const teacher of subTeachers) {
            if (subPeriod !== null) {
              thenSpecsRaw.push({
                kind: 'teacher_block_slot',
                params: { teacher, day: subDay, period: subPeriod },
              });
            } else {
              thenSpecsRaw.push({
                kind: 'teacher_block_day',
                params: { teacher, day: subDay },
              });
            }
          }
        }
      }

      // F-9: propagate weight cho soft IF/THEN — gắn vào params.weight để humanizer / future solver dùng.
      if (constraint.type === 'preferred' && Number.isFinite(constraint.weight) && (constraint.weight as number) > 0) {
        const w = constraint.weight as number;
        for (const item of thenSpecsRaw) {
          if (!('weight' in item.params)) {
            item.params = { ...item.params, weight: w };
          }
        }
      }

      // Claim if_then khi đã build được condition — kể cả khi THEN rỗng (vd: "Dung nghỉ" unparseable).
      // Tránh rơi vào `pair_same_slot` hay block khác ở fallback, vốn sẽ phát ra kind sai.
      if (condition) {
        return {
          id,
          original: constraint.text,
          severity,
          kind: 'if_then',
          params: {
            if: condition,
            then: thenSpecsRaw,
          },
          ...(thenSpecsRaw.length === 0 ? { notes: 'fallback_parser:UNPARSED_THEN' } : {}),
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

    if (parsed.kind === 'teacher_block_periods' && parsed.teacherLabels[0] && parsed.periods.length > 0) {
      return parsed.periods.map((period, idx) => ({
        id: parsed.periods.length === 1 ? id : `${id}_${idx + 1}`,
        original: constraint.text,
        severity,
        kind: 'teacher_block_period' as const,
        params: { teacher: parsed.teacherLabels[0], period },
      }) satisfies ConstraintSpec);
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

    if (parsed.kind === 'teacher_prefer_periods' && parsed.teacherLabels[0] && parsed.periods.length > 0) {
      return withWeight({
        id,
        original: constraint.text,
        severity: severity === 'hard' ? 'soft' : severity,
        kind: 'teacher_preferred_periods',
        params: { teacher: parsed.teacherLabels[0], periods: parsed.periods },
      } satisfies ConstraintSpec);
    }

    if (parsed.kind === 'teacher_max_classes_per_day') {
      const teacher = parsed.teacherLabels === '*' ? undefined : parsed.teacherLabels[0];
      return {
        id,
        original: constraint.text,
        severity,
        kind: 'teacher_max_classes_per_day',
        params: { ...(teacher ? { teacher } : {}), maxClasses: parsed.max },
      } satisfies ConstraintSpec;
    }

    if (parsed.kind === 'teacher_pair_not_same_slot' && parsed.teacherLabels.length >= 2) {
      const day = parsed.dayIds[0];
      return {
        id,
        original: constraint.text,
        severity,
        kind: 'teacher_pair_not_same_slot',
        params: {
          teachers: parsed.teacherLabels.slice(0, 2),
          ...(day ? { scope: { day } } : {}),
        },
      } satisfies ConstraintSpec;
    }

    if (
      parsed.kind === 'teacher_homeroom_first_period' &&
      parsed.teacherLabels[0] &&
      parsed.classLabels[0]
    ) {
      return {
        id,
        original: constraint.text,
        severity,
        kind: 'teacher_homeroom_first_period',
        params: {
          teacher: parsed.teacherLabels[0],
          class: parsed.classLabels[0],
          days: parsed.dayIds,
          period: parsed.period,
        },
      } satisfies ConstraintSpec;
    }

    if (parsed.kind === 'subject_not_last_period' && parsed.subjectLabels[0]) {
      const classes = parsed.classFilter ?? classLabels.filter((label) => includesLabel(constraint.text, label));
      return {
        id,
        original: constraint.text,
        severity,
        kind: 'subject_not_last_period',
        params: {
          subject: parsed.subjectLabels[0],
          ...(classes.length ? { classes } : {}),
        },
      } satisfies ConstraintSpec;
    }

    if (parsed.kind === 'class_max_heavy_subjects_per_session' && parsed.subjectLabels.length > 0) {
      const klass = parsed.classLabels === '*' ? undefined : parsed.classLabels[0];
      const sessionPeriodsBySession: Record<string, number[]> = {};
      for (const sessionId of parsed.sessionIds) {
        sessionPeriodsBySession[sessionId] = periodsForSession(input, sessionId);
      }
      const sessionPeriods = parsed.sessionIds.flatMap((sessionId) => periodsForSession(input, sessionId));
      const parsedSeverity = parsed.softHint ? 'soft' : severity;
      return withWeight({
        id,
        original: constraint.text,
        severity: parsedSeverity,
        kind: 'class_max_heavy_subjects_per_session',
        params: {
          subjects: parsed.subjectLabels,
          maxHeavyInSession: parsed.maxHeavyInSession,
          sessionIds: parsed.sessionIds,
          sessionPeriods,
          sessionPeriodsBySession,
          ...(parsed.subjectGroups ? { subjectGroups: parsed.subjectGroups } : {}),
          ...(klass ? { class: klass } : {}),
        },
      } satisfies ConstraintSpec);
    }

    if (parsed.kind === 'class_max_heavy_subjects_per_day' && parsed.subjectLabels.length > 0) {
      const klass = parsed.classLabels === '*' ? undefined : parsed.classLabels[0];
      return {
        id,
        original: constraint.text,
        severity,
        kind: 'class_max_heavy_subjects_per_day',
        params: {
          subjects: parsed.subjectLabels,
          maxHeavy: parsed.maxHeavy,
          ...(klass ? { class: klass } : {}),
        },
      } satisfies ConstraintSpec;
    }

    if (parsed.kind === 'class_subjects_not_same_day' && parsed.subjectLabels.length >= 2) {
      const klass = parsed.classLabels === '*' ? undefined : parsed.classLabels[0];
      const parsedSeverity = parsed.softHint ? 'soft' : severity;
      return withWeight({
        id,
        original: constraint.text,
        severity: parsedSeverity,
        kind: 'class_subjects_not_same_day',
        params: {
          subjects: parsed.subjectLabels,
          maxSubjectsPerDay: parsed.maxSubjectsPerDay,
          ...(klass ? { class: klass } : {}),
        },
      } satisfies ConstraintSpec);
    }

    if (parsed.kind === 'class_first_period_required') {
      const targets =
        parsed.classLabels === '*'
          ? classLabels
          : parsed.classLabels.length > 0
            ? parsed.classLabels
            : classLabels;
      return targets.map((klass, idx) => ({
        id: targets.length === 1 ? id : `${id}_${idx + 1}`,
        original: constraint.text,
        severity,
        kind: 'class_first_period_required',
        params: { class: klass },
      }) satisfies ConstraintSpec);
    }

    if (parsed.kind === 'subject_flag_ceremony_slot') {
      return {
        id,
        original: constraint.text,
        severity,
        kind: 'subject_flag_ceremony_slot',
        params: { day: parsed.dayIds[0], period: parsed.period },
      } satisfies ConstraintSpec;
    }

    if (parsed.kind === 'global_teacher_utilization_balance') {
      return withWeight({
        id,
        original: constraint.text,
        severity: severity === 'hard' ? 'soft' : severity,
        kind: 'global_teacher_utilization_balance',
        params: { tolerance: parsed.tolerance },
      } satisfies ConstraintSpec);
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
      return withWeight({
        id,
        original: constraint.text,
        severity: severity === 'hard' ? 'soft' : severity,
        kind: 'subject_preferred_periods',
        params: {
          subject: parsed.subjectLabels[0],
          periods: parsed.periods,
          ...(classes.length ? { classes } : {}),
        },
      } satisfies ConstraintSpec);
    }

    if (parsed.kind === 'subject_prefer_sessions' && parsed.subjectLabels[0] && parsed.sessionIds.length > 0) {
      const classes = classLabels.filter((label) => includesLabel(constraint.text, label));
      const allowedPeriods = parsed.sessionIds.flatMap((sessionId) => periodsForSession(input, sessionId));
      if (allowedPeriods.length > 0) {
        return withWeight({
          id,
          original: constraint.text,
          severity: severity === 'hard' ? 'soft' : severity,
          kind: 'subject_preferred_periods',
          params: {
            subject: parsed.subjectLabels[0],
            periods: allowedPeriods,
            ...(classes.length ? { classes } : {}),
          },
        } satisfies ConstraintSpec);
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
        severity: 'info',
        kind: 'custom_dsl',
        params: {
          ignoredReason: 'room_constraints_ignored',
          naturalLanguage: constraint.text,
        },
        tags: ['auto_base'],
        notes: 'ignored:room_constraint',
      } satisfies ConstraintSpec;
    }

    if (/(liên\s*tiếp|lien\s*tiep)/iu.test(constraint.text) && /(không|khong|không xếp|khong xep)/iu.test(constraint.text)) {
      const maxConsecutive = extractConsecutiveBanCount(constraint.text);
      if (maxConsecutive !== null && maxConsecutive >= 2) {
        const effectiveMax = maxConsecutive - 1;
        const klass = classLabels.find((label) => includesLabel(constraint.text, label));
        const subject = subjectLabels.find((label) => includesLabel(constraint.text, label));
        if (subject) {
          return {
            id,
            original: constraint.text,
            severity,
            kind: 'subject_max_consecutive',
            params: {
              subject,
              max: effectiveMax,
              maxConsecutive: effectiveMax,
              ...(klass ? { classes: [klass] } : {}),
            },
          } satisfies ConstraintSpec;
        }
        const uniqueSubjects = [...new Set(input.assignments.map((a) => a.subject.label))];
        const targets = uniqueSubjects;
        return targets.map((subj, idx) => ({
          id: targets.length === 1 ? id : `${id}_${idx + 1}`,
          original: constraint.text,
          severity,
          kind: 'subject_max_consecutive',
          params: {
            subject: subj,
            max: effectiveMax,
            maxConsecutive: effectiveMax,
            ...(klass ? { classes: [klass] } : {}),
          },
        }) satisfies ConstraintSpec);
      }
    }

    const subjectSessionMax = isSubjectSessionMaxPeriodsText(constraint.text);
    if (subjectSessionMax) {
      const subject = subjectLabels.find((label) => includesLabel(constraint.text, label));
      const klass = classLabels.find((label) => includesLabel(constraint.text, label));
      const sessionPeriods = subjectSessionMax.session === 'all'
        ? null
        : periodsForSession(input, subjectSessionMax.session === 'morning' ? input.sessions[0]?.id ?? '' : input.sessions[1]?.id ?? '');
      return {
        id,
        original: constraint.text,
        severity,
        kind: 'subject_session_max_periods',
        params: {
          ...(subject ? { subject } : {}),
          ...(klass ? { class: klass } : {}),
          session: subjectSessionMax.session,
          maxPeriods: subjectSessionMax.maxPeriods,
          ...(sessionPeriods ? { sessionPeriods } : {}),
        },
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
        params: subjectGroup,
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

    // class_block_day: "lớp 10A không học thứ 2"
    if (/(không\s*học|khong\s*hoc)/u.test(constraint.text) && !/(môn|mon|tiết|tiet)/u.test(constraint.text)) {
      const klass = classLabels.find((label) => includesLabel(constraint.text, label));
      const day = extractDayId(constraint.text, input.days);
      if (klass && day) {
        return { id, original: constraint.text, severity, kind: 'class_block_day', params: { class: klass, day } } satisfies ConstraintSpec;
      }
    }

    // class_block_period: "lớp 10A không học tiết 1"
    if (/(không\s*học|khong\s*hoc).*(tiết|tiet)/u.test(constraint.text)) {
      const klass = classLabels.find((label) => includesLabel(constraint.text, label));
      const period = extractPeriodNumber(constraint.text) ?? extractFirstNumber(constraint.text);
      const day = extractDayId(constraint.text, input.days);
      if (klass && period !== null) {
        if (day) {
          return { id, original: constraint.text, severity, kind: 'class_block_slot', params: { class: klass, day, period } } satisfies ConstraintSpec;
        }
        return { id, original: constraint.text, severity, kind: 'class_block_period', params: { class: klass, period } } satisfies ConstraintSpec;
      }
    }

    // class_max_per_day / subject_daily_max_periods: "lớp 10A học tối đa 6 tiết/ngày" | "môn Toán tối đa 2 tiết/ngày"
    if (/(tối\s*đa|toi\s*da|max).*(tiết|tiet).*(ngày|ngay)/u.test(constraint.text)) {
      const klass = classLabels.find((label) => includesLabel(constraint.text, label));
      const subject = subjectLabels.find((label) => includesLabel(constraint.text, label));
      const maxPerDay = extractFirstNumber(constraint.text);
      if (maxPerDay !== null) {
        if (klass && !subject) {
          return { id, original: constraint.text, severity, kind: 'class_max_per_day', params: { class: klass, maxPerDay } } satisfies ConstraintSpec;
        }
        if (subject) {
          const classes = classLabels.filter((label) => includesLabel(constraint.text, label));
          return { id, original: constraint.text, severity, kind: 'subject_daily_max_periods', params: { subject, maxPerDay, ...(classes.length ? { classes } : {}) } } satisfies ConstraintSpec;
        }
      }
    }

    // class_min_per_day / teacher_min_per_day: "lớp 10A học ít nhất 4 tiết/ngày" | "giáo viên A dạy ít nhất 2 tiết/ngày"
    if (/(ít\s*nhất|it\s*nhat|tối\s*thiểu|toi\s*thieu|min).*(tiết|tiet).*(ngày|ngay)/u.test(constraint.text)) {
      const klass = classLabels.find((label) => includesLabel(constraint.text, label));
      const teacher = teacherLabels.find((label) => includesLabel(constraint.text, label));
      const minPerDay = extractFirstNumber(constraint.text);
      if (minPerDay !== null) {
        if (klass) {
          return { id, original: constraint.text, severity, kind: 'class_min_per_day', params: { class: klass, minPerDay } } satisfies ConstraintSpec;
        }
        if (teacher) {
          return { id, original: constraint.text, severity, kind: 'teacher_min_per_day', params: { teacher, minPerDay } } satisfies ConstraintSpec;
        }
      }
    }

    // class_no_gaps / teacher_no_gaps: "lớp 10A không có tiết trống" | "giáo viên A không có tiết trống"
    if (/(không\s*có|khong\s*co).*(tiết\s*trống|tiet\s*trong|trống|trong)/u.test(constraint.text)) {
      const klass = classLabels.find((label) => includesLabel(constraint.text, label));
      const teacher = teacherLabels.find((label) => includesLabel(constraint.text, label));
      if (klass) {
        return { id, original: constraint.text, severity, kind: 'class_no_gaps', params: { class: klass } } satisfies ConstraintSpec;
      }
      if (teacher) {
        return { id, original: constraint.text, severity, kind: 'teacher_no_gaps', params: { teacher } } satisfies ConstraintSpec;
      }
    }

    // teacher_allowed_days: "giáo viên A chỉ dạy thứ 2, thứ 4"
    if (/(chỉ\s*dạy|chi\s*day).*(thứ|thu)/u.test(constraint.text)) {
      const teacher = teacherLabels.find((label) => includesLabel(constraint.text, label));
      if (teacher) {
        const days = input.days.map((d) => d.id).filter((dayId) => includesLabel(constraint.text, dayId) || new RegExp(`thứ\\s*${dayId}|thu\\s*${dayId}`, 'iu').test(constraint.text));
        const extractedDay = extractDayId(constraint.text, input.days);
        const allDays = extractedDay ? [extractedDay] : days;
        if (allDays.length > 0) {
          return { id, original: constraint.text, severity, kind: 'teacher_allowed_days', params: { teacher, days: allDays } } satisfies ConstraintSpec;
        }
      }
    }

    // teacher_allowed_periods: "giáo viên A chỉ dạy tiết 1-4"
    if (/(chỉ\s*dạy|chi\s*day).*(tiết|tiet)/u.test(constraint.text)) {
      const teacher = teacherLabels.find((label) => includesLabel(constraint.text, label));
      if (teacher) {
        const rangeMatch = constraint.text.match(/tiết\s*(\d+)\s*[-–]\s*(\d+)/iu);
        if (rangeMatch) {
          const from = Number(rangeMatch[1]);
          const to = Number(rangeMatch[2]);
          const periods = Array.from({ length: to - from + 1 }, (_, i) => from + i);
          return { id, original: constraint.text, severity, kind: 'teacher_allowed_periods', params: { teacher, periods } } satisfies ConstraintSpec;
        }
        const period = extractPeriodNumber(constraint.text);
        if (period !== null) {
          return { id, original: constraint.text, severity, kind: 'teacher_allowed_periods', params: { teacher, periods: [period] } } satisfies ConstraintSpec;
        }
      }
    }

    // subject_allowed_days: "môn Thể dục chỉ học thứ 3 hoặc thứ 5"
    if (/(chỉ\s*học|chi\s*hoc|chỉ\s*xếp|chi\s*xep).*(thứ|thu)/u.test(constraint.text)) {
      const subject = subjectLabels.find((label) => includesLabel(constraint.text, label));
      if (subject) {
        const extractedDay = extractDayId(constraint.text, input.days);
        if (extractedDay) {
          return { id, original: constraint.text, severity, kind: 'subject_allowed_days', params: { subject, days: [extractedDay] } } satisfies ConstraintSpec;
        }
      }
    }

    // subject_min_gap_days: "hai buổi học cùng môn cách nhau ít nhất 1 ngày"
    if (/(cách\s*nhau|cach\s*nhau).*(ngày|ngay)/u.test(constraint.text)) {
      const subject = subjectLabels.find((label) => includesLabel(constraint.text, label));
      const minGapDays = extractFirstNumber(constraint.text) ?? 1;
      if (subject) {
        const classes = classLabels.filter((label) => includesLabel(constraint.text, label));
        return { id, original: constraint.text, severity, kind: 'subject_min_gap_days', params: { subject, minGapDays, ...(classes.length ? { classes } : {}) } } satisfies ConstraintSpec;
      }
    }

    // assignment_pin_slot: "Toán lớp 10A phải xếp thứ 2 tiết 1"
    if (/(phải\s*xếp|phai\s*xep|cố\s*định|co\s*dinh|pin)/u.test(constraint.text)) {
      const teacher = teacherLabels.find((label) => includesLabel(constraint.text, label));
      const subject = subjectLabels.find((label) => includesLabel(constraint.text, label));
      const klass = classLabels.find((label) => includesLabel(constraint.text, label));
      const day = extractDayId(constraint.text, input.days);
      const period = extractPeriodNumber(constraint.text);
      if ((teacher || subject || klass) && day && period !== null) {
        const matchedAssignment = input.assignments.find((a) => {
          if (teacher && a.teacher.label !== teacher) return false;
          if (subject && a.subject.label !== subject) return false;
          if (klass && a.class.label !== klass) return false;
          return true;
        });
        if (matchedAssignment) {
          return { id, original: constraint.text, severity, kind: 'assignment_pin_slot', params: { assignmentId: matchedAssignment.id, day, period } } satisfies ConstraintSpec;
        }
      }
    }

    // assignment_spread_days: "4 tiết Toán phải rải ra ít nhất 3 ngày"
    if (/(rải|rai|trải|trai).*(ngày|ngay)/u.test(constraint.text)) {
      const subject = subjectLabels.find((label) => includesLabel(constraint.text, label));
      const klass = classLabels.find((label) => includesLabel(constraint.text, label));
      const minDays = extractFirstNumber(constraint.text);
      if ((subject || klass) && minDays !== null) {
        const matchedAssignment = input.assignments.find((a) => {
          if (subject && a.subject.label !== subject) return false;
          if (klass && a.class.label !== klass) return false;
          return true;
        });
        if (matchedAssignment) {
          return { id, original: constraint.text, severity, kind: 'assignment_spread_days', params: { assignmentId: matchedAssignment.id, minDays } } satisfies ConstraintSpec;
        }
      }
    }

    // ===== NEW KINDS — common deterministic patterns =====

    // class_fixed_period: "Chào cờ sáng thứ 2 tiết 1 cho tất cả các lớp" | "lớp 6A sinh hoạt lớp thứ 6 tiết 1"
    if (/(chào\s*cờ|chao\s*co|sinh\s*hoạt|sinh\s*hoat|SHL|tiết\s*cố\s*định|co\s*định\s*tiết)/iu.test(constraint.text)) {
      const day = extractDayId(constraint.text, input.days);
      const period = extractPeriodNumber(constraint.text) ?? extractFirstNumber(constraint.text);
      const isAll = /(tất cả|tat ca|mọi|moi|all).*(lớp|lop)/iu.test(constraint.text);
      if (day && period !== null) {
        if (isAll) {
          return classLabels.map((klass, idx) => ({
            id: classLabels.length === 1 ? id : `${id}_${idx + 1}`,
            original: constraint.text,
            severity,
            kind: 'class_fixed_period',
            params: { class: klass, day, period },
          }) satisfies ConstraintSpec);
        }
        const klass = classLabels.find((label) => includesLabel(constraint.text, label));
        if (klass) {
          return { id, original: constraint.text, severity, kind: 'class_fixed_period', params: { class: klass, day, period } } satisfies ConstraintSpec;
        }
      }
    }

    // class_allowed_days: "lớp 10A chỉ học thứ 2, 3, 4"
    if (/(chỉ\s*học|chi\s*hoc).*(thứ|thu|lớp|lop)/u.test(constraint.text) && !/(tiết|tiet)/u.test(constraint.text)) {
      const klass = classLabels.find((label) => includesLabel(constraint.text, label));
      if (klass) {
        const days = input.days.map((d) => d.id).filter((dayId) => includesLabel(constraint.text, dayId) || new RegExp(`thứ\\s*${dayId}|thu\\s*${dayId}`, 'iu').test(constraint.text));
        const extracted = extractDayId(constraint.text, input.days);
        const allDays = extracted ? [extracted] : days;
        if (allDays.length > 0) {
          return { id, original: constraint.text, severity, kind: 'class_allowed_days', params: { class: klass, days: allDays } } satisfies ConstraintSpec;
        }
      }
    }

    // class_allowed_periods: "lớp 10A chỉ học tiết 1-5"
    if (/(chỉ\s*học|chi\s*hoc).*(tiết|tiet)/u.test(constraint.text)) {
      const klass = classLabels.find((label) => includesLabel(constraint.text, label));
      if (klass) {
        const rangeMatch = constraint.text.match(/tiết\s*(\d+)\s*[-–]\s*(\d+)/iu);
        if (rangeMatch) {
          const from = Number(rangeMatch[1]);
          const to = Number(rangeMatch[2]);
          const periods = Array.from({ length: to - from + 1 }, (_, i) => from + i);
          return { id, original: constraint.text, severity, kind: 'class_allowed_periods', params: { class: klass, periods } } satisfies ConstraintSpec;
        }
        const period = extractPeriodNumber(constraint.text);
        if (period !== null) {
          return { id, original: constraint.text, severity, kind: 'class_allowed_periods', params: { class: klass, periods: [period] } } satisfies ConstraintSpec;
        }
      }
    }

    // class_max_consecutive: "lớp 10A không quá 3 tiết liên tiếp"
    if (/(lớp|lop).*(tối\s*đa|toi\s*da|không\s*quá|khong\s*qua).*(liên\s*tiếp|lien\s*tiep)/u.test(constraint.text)) {
      const klass = classLabels.find((label) => includesLabel(constraint.text, label));
      const maxConsecutive = extractFirstNumber(constraint.text);
      if (klass && maxConsecutive !== null) {
        return { id, original: constraint.text, severity, kind: 'class_max_consecutive', params: { class: klass, maxConsecutive } } satisfies ConstraintSpec;
      }
    }

    // subject_block_period: "môn Toán không xếp tiết 1"
    if (/(không\s*xếp|khong\s*xep|không\s*dạy|khong\s*day).*(tiết|tiet)/u.test(constraint.text)) {
      const subject = subjectLabels.find((label) => includesLabel(constraint.text, label));
      const period = extractPeriodNumber(constraint.text) ?? extractFirstNumber(constraint.text);
      if (subject && period !== null) {
        const classes = classLabels.filter((label) => includesLabel(constraint.text, label));
        return { id, original: constraint.text, severity, kind: 'subject_block_period', params: { subject, periods: [period], ...(classes.length ? { classes } : {}) } } satisfies ConstraintSpec;
      }
    }

    // subject_block_days: "môn Thể dục không học thứ 7"
    if (/(không\s*học|khong\s*hoc|không\s*xếp|khong\s*xep).*(thứ|thu)/u.test(constraint.text) && /(môn|mon)/u.test(constraint.text)) {
      const subject = subjectLabels.find((label) => includesLabel(constraint.text, label));
      const day = extractDayId(constraint.text, input.days);
      if (subject && day) {
        const classes = classLabels.filter((label) => includesLabel(constraint.text, label));
        return { id, original: constraint.text, severity, kind: 'subject_block_days', params: { subject, days: [day], ...(classes.length ? { classes } : {}) } } satisfies ConstraintSpec;
      }
    }

    // subject_not_consecutive: "môn Thể dục không 2 tiết liền nhau"
    if (/(không|khong).*(2|hai).*?(liên\s*tiếp|lien\s*tiep|liền nhau|lien nhau)/u.test(constraint.text) && /(môn|mon)/u.test(constraint.text)) {
      const subject = subjectLabels.find((label) => includesLabel(constraint.text, label));
      if (subject) {
        const classes = classLabels.filter((label) => includesLabel(constraint.text, label));
        return { id, original: constraint.text, severity, kind: 'subject_not_consecutive', params: { subject, ...(classes.length ? { classes } : {}) } } satisfies ConstraintSpec;
      }
    }

    // subject_min_days: "môn Toán rải ít nhất 3 ngày"
    if (/(rải|rai).*(ít nhất|it nhat|min).*?(ngày|ngay)/u.test(constraint.text) && /(môn|mon)/u.test(constraint.text)) {
      const subject = subjectLabels.find((label) => includesLabel(constraint.text, label));
      const minDays = extractFirstNumber(constraint.text);
      if (subject && minDays !== null) {
        const classes = classLabels.filter((label) => includesLabel(constraint.text, label));
        return { id, original: constraint.text, severity, kind: 'subject_min_days', params: { subject, minDays, ...(classes.length ? { classes } : {}) } } satisfies ConstraintSpec;
      }
    }

    // teacher_min_working_days: "giáo viên A dạy ít nhất 4 ngày/tuần"
    if (/(giáo\s*viên|giao\s*vien).*(ít nhất|it nhat|tối thiểu|toi thieu).*(ngày|ngay)/u.test(constraint.text)) {
      const teacher = teacherLabels.find((label) => includesLabel(constraint.text, label));
      const minDays = extractFirstNumber(constraint.text);
      if (teacher && minDays !== null) {
        return { id, original: constraint.text, severity, kind: 'teacher_min_working_days', params: { teacher, minDays } } satisfies ConstraintSpec;
      }
    }

    // teacher_max_gaps: "giáo viên A tối đa 2 tiết trống/ngày"
    if (/(giáo\s*viên|giao\s*vien).*(tối\s*đa|toi\s*da|max).*(trống|trong)/u.test(constraint.text)) {
      const teacher = teacherLabels.find((label) => includesLabel(constraint.text, label));
      const maxGaps = extractFirstNumber(constraint.text);
      if (teacher && maxGaps !== null) {
        return { id, original: constraint.text, severity, kind: 'teacher_max_gaps', params: { teacher, maxGaps } } satisfies ConstraintSpec;
      }
    }

    // teacher_min_consecutive: "giáo viên A khi dạy thì ít nhất 2 tiết liền"
    if (/(giáo\s*viên|giao\s*vien).*(khi\s*dạy|khi\s*day).*(ít nhất|it nhat|min).*?(liên\s*tiếp|lien\s*tiep)/u.test(constraint.text)) {
      const teacher = teacherLabels.find((label) => includesLabel(constraint.text, label));
      const minConsecutive = extractFirstNumber(constraint.text);
      if (teacher && minConsecutive !== null) {
        return { id, original: constraint.text, severity, kind: 'teacher_min_consecutive', params: { teacher, minConsecutive } } satisfies ConstraintSpec;
      }
    }

    // pair_same_slot: "giáo viên A và B cùng dạy / song song"
    if (/(cùng\s*dạy|cung\s*day|song\s*song|dạy\s*song\s*song)/u.test(constraint.text)) {
      const teachers = teacherLabels.filter((label) => includesLabel(constraint.text, label)).slice(0, 2);
      if (teachers.length === 2) {
        const matched = input.assignments.filter((a) => teachers.includes(a.teacher.label));
        const assignmentIds = [...new Set(matched.map((a) => a.id))];
        if (assignmentIds.length === 2) {
          return { id, original: constraint.text, severity, kind: 'pair_same_slot', params: { assignmentIds } } satisfies ConstraintSpec;
        }
      }
    }

    // mutual_exclusion: "các môn Toán, Lý, Hóa không cùng tiết"
    if (/(không\s*cùng|khong\s*cung).*(tiết|tiet|slot)/u.test(constraint.text)) {
      const subs = subjectLabels.filter((label) => includesLabel(constraint.text, label));
      if (subs.length >= 2) {
        const matched = input.assignments.filter((a) => subs.includes(a.subject.label));
        const assignmentIds = [...new Set(matched.map((a) => a.id))];
        if (assignmentIds.length >= 2) {
          return { id, original: constraint.text, severity, kind: 'mutual_exclusion', params: { assignmentIds } } satisfies ConstraintSpec;
        }
      }
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

  return specs
    .map((spec) => applyConstraintWeight(spec, weightByText.get(spec.original)))
    .map(markHardUnencodable);
}


function markHardUnencodable(spec: ConstraintSpec): ConstraintSpec {
  if (spec.severity !== 'hard' || spec.kind === 'custom_dsl' || SOLVER_ENCODABLE_KINDS.has(spec.kind)) {
    return spec;
  }
  return {
    id: spec.id,
    original: spec.original,
    severity: 'hard',
    kind: 'custom_dsl',
    params: {
      naturalLanguage: spec.original,
      unsupportedKind: spec.kind,
      originalParams: spec.params,
    },
    weight: spec.weight,
    notes: `fallback_parser:SOLVER_UNENCODABLE:${spec.kind}`,
  };
}

function sanitizeSpecs(input: AgentInputPayload, specs: ConstraintSpec[]): ConstraintSpec[] {
  const validTeachers = new Set(input.assignments.map((assignment) => assignment.teacher.label));
  const validClasses = new Set(input.assignments.map((assignment) => assignment.class.label));
  const validSubjects = new Set(input.assignments.map((assignment) => assignment.subject.label));
  const validDays = new Set(input.days.map((day) => day.id));

  return specs.flatMap((spec, index) => {
    if (String(spec.kind) === 'resource_capacity') {
      return [];
    }

    const original = spec.original || input.constraints[index]?.text || '';
    const inputConstraint = input.constraints.find((constraint) => constraint.text === original) ?? input.constraints[index];
    const base = applyConstraintWeight(
      {
        ...spec,
        id: `c${index + 1}`,
        original,
        severity:
          spec.severity ?? (inputConstraint?.type === 'required' ? 'hard' : 'soft'),
        params: spec.params ?? {},
        tags: spec.tags ?? [],
        ...(spec.pythonPredicate ? { pythonPredicate: spec.pythonPredicate } : {}),
      },
      inputConstraint?.weight
    );

    const teacher = typeof base.params.teacher === 'string' ? base.params.teacher : null;
    const klass = typeof base.params.class === 'string' ? base.params.class : null;
    const subject = typeof base.params.subject === 'string' ? base.params.subject : null;
    const day = typeof base.params.day === 'string' ? base.params.day : null;
    const weeklyPeriods = Number(base.params.weeklyPeriods ?? NaN);
    const period = Number(base.params.period ?? NaN);

    if (base.notes === 'ignored:room_constraint') {
      return {
        ...base,
        severity: 'info',
        tags: [...new Set([...(base.tags ?? []), 'auto_base' as const])],
      };
    }

    if (base.kind === 'custom_dsl' && base.original.trim() && isAutoBaseConstraintText(base.original)) {
      return markAutoBaseSpec(base);
    }

    if (base.severity === 'hard' && base.kind !== 'custom_dsl' && !SOLVER_ENCODABLE_KINDS.has(base.kind)) {
      return markHardUnencodable(base);
    }

    if (base.kind === 'custom_dsl' && base.original.trim()) {
      const fallback = fallbackFromRuleParser({
        ...input,
        constraints: [
          {
            type: base.severity === 'hard' ? 'required' : 'preferred',
            text: base.original,
            weight: base.weight,
          },
        ],
      });
      const reparsed = fallback.filter((item) => item.kind !== 'custom_dsl');

      if (reparsed.length > 0) {
        return reparsed.map((item, itemIndex) => applyConstraintWeight({
          ...item,
          id: reparsed.length === 1 ? base.id : `${base.id}_${itemIndex + 1}`,
          original: base.original,
          severity: base.severity,
          tags: base.tags,
        }, base.weight));
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
            weight: base.weight,
          },
        ],
      }).filter((item) => item.kind !== 'custom_dsl');

      if (reparsed.length > 0) {
        return reparsed.map((item, itemIndex) => applyConstraintWeight({
          ...item,
          id: reparsed.length === 1 ? base.id : `${base.id}_${itemIndex + 1}`,
          original: base.original,
          severity: base.severity,
          tags: base.tags,
        }, base.weight));
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
            weight: base.weight,
          },
        ],
      }).filter((item) => item.kind !== 'custom_dsl');

      if (reparsed.length > 0) {
        return reparsed.map((item, itemIndex) => applyConstraintWeight({
          ...item,
          id: reparsed.length === 1 ? base.id : `${base.id}_${itemIndex + 1}`,
          original: base.original,
          severity: base.severity,
          tags: base.tags,
        }, base.weight));
      }
    }

    if (teacher && !validTeachers.has(teacher)) {
      return {
        ...base,
        kind: 'custom_dsl',
        params: { naturalLanguage: base.original },
        notes: `unknown_teacher:${teacher}`,
      };
    }
    if (klass && !validClasses.has(klass)) {
      return {
        ...base,
        kind: 'custom_dsl',
        params: { naturalLanguage: base.original },
        notes: `unknown_class:${klass}`,
      };
    }
    if (subject && !validSubjects.has(subject)) {
      return {
        ...base,
        kind: 'custom_dsl',
        params: { naturalLanguage: base.original },
        notes: `unknown_subject:${subject}`,
      };
    }
    if (day && !validDays.has(day)) {
      return {
        ...base,
        kind: 'custom_dsl',
        params: { naturalLanguage: base.original },
        notes: `unknown_day:${day}`,
      };
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
  if (input.constraints.length === 0) {
    return { constraintSpecs: [], rawResponse: '', usageTokens: 0 };
  }

  // Pre-parse với deterministic rule parser. Constraints parse được rõ ràng
  // (kind !== 'custom_dsl') không cần gửi LLM — tiết kiệm latency và token.
  const deterministicSpecs = fallbackFromRuleParser(input);
  const parsedOriginals = new Set<string>();
  for (const spec of deterministicSpecs) {
    if (spec.kind !== 'custom_dsl') parsedOriginals.add(spec.original);
  }
  const unparsedConstraints = input.constraints.filter((c) => !parsedOriginals.has(c.text));

  if (unparsedConstraints.length === 0 && input.constraints.length > 0) {
    const sanitized = sanitizeSpecs(input, deterministicSpecs);
    return { constraintSpecs: sanitized, rawResponse: '', usageTokens: 0 };
  }

  const llmInput: AgentInputPayload = { ...input, constraints: unparsedConstraints };

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

  const buildPayload = (decomposeHint: string | null) => {
    const userContent = JSON.stringify(
      {
        context,
        raw_constraints: llmInput.constraints.map((constraint) => ({
          text: constraint.text,
          severity_hint: constraint.type === 'required' ? 'hard' : 'soft',
        })),
        ...(decomposeHint ? { _meta: { decomposeHint } } : {}),
      },
      null,
      0
    );
    return {
      baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
      apiKey: config.apiKey,
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt + (decomposeHint ? `\n\n${decomposeHint}` : '') },
        { role: 'user', content: userContent },
      ],
      temperature: 0,
      max_tokens: 3500,
      cache_control: { enable: true },
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
                      enum: [
                        'teacher_block_day',
                        'teacher_block_period',
                        'teacher_block_slot',
                        'teacher_max_per_day',
                        'teacher_max_consecutive',
                        'teacher_max_working_days',
                        'teacher_min_per_day',
                        'teacher_no_gaps',
                        'teacher_allowed_days',
                        'teacher_allowed_periods',
                        'teacher_min_working_days',
                        'teacher_max_gaps',
                        'teacher_min_consecutive',
                        'teacher_balanced_load',
                        'teacher_max_subjects_per_day',
                        'teacher_max_consecutive_days',
                        'subject_pin_period',
                        'subject_consecutive',
                        'subject_max_consecutive',
                        'subject_allowed_days',
                        'subject_min_gap_days',
                        'subject_daily_max_periods',
                        'subject_block_period',
                        'subject_block_days',
                        'subject_not_consecutive',
                        'subject_min_days',
                        'subject_spread_evenly',
                        'subject_order_before',
                        'subject_not_after_subject',
                        'class_block_day',
                        'class_block_period',
                        'class_block_slot',
                        'class_max_per_day',
                        'class_min_per_day',
                        'class_no_gaps',
                        'class_no_double_subject_day',
                        'class_subjects_not_same_day',
                        'class_fixed_period',
                        'class_allowed_days',
                        'class_allowed_periods',
                        'class_max_consecutive',
                        'class_max_subjects_per_day',
                        'class_balanced_load',
                        'class_subjects_same_day',
                        'class_min_working_days',
                        'assignment_pin_slot',
                        'assignment_block_slot',
                        'assignment_allowed_slots',
                        'assignment_spread_days',
                        'weekly_periods_exact',
                        'assignment_consecutive',
                        'assignment_max_per_day',
                        'assignment_same_day',
                        'assignment_not_same_day',
                        'if_then',
                        'pair_not_same_slot',
                        'pair_same_slot',
                        'mutual_exclusion',
                        'session_limit',
                        'subject_group',
                        'subject_group_daily_limit',
                        'subject_session_max_periods',
                        'custom_dsl',
                      ],
                    },
                    params: { type: 'object', additionalProperties: true },
                    weight: { type: 'number' },
                    pythonPredicate: { type: 'string' },
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
  };

  const shouldDecompose = (specs: ConstraintSpec[]): boolean => {
    return specs.some(
      (spec) =>
        spec.kind === 'custom_dsl' &&
        spec.severity === 'hard' &&
        spec.original.length > 30
    );
  };

  try {
    const payload = buildPayload(null);
    const response = await invokeChat(payload);
    const parsedJson = parseModelJson(response.content);
    const validated = translatorResponseSchema.parse(parsedJson);

    if (shouldDecompose(validated.constraintSpecs)) {
      const decomposeHint =
        'QUAN TRỌNG: Ràng buộc trên dài hơn 30 ký tự và đang bị gán `kind: custom_dsl`. ' +
        'Hãy decompose (phân rã) thành nhiều `ConstraintSpec` đơn giản dùng các op: ' +
        '`if_then`, `and`, `or`, `not`, `teacher_teaches_at_slot`, `teacher_teaches_on_day`, ' +
        '`teacher_pair_teaches_same_slot`, `teacher_pair_teaches_same_day`, `class_teacher_at_slot`. ' +
        'Chỉ dùng `custom_dsl` khi KHÔNG thể biểu diễn bằng các op trên.';
      const retryPayload = buildPayload(decomposeHint);
      const retryResponse = await invokeChat(retryPayload);
      const retryParsed = parseModelJson(retryResponse.content);
      const retryValidated = translatorResponseSchema.parse(retryParsed);
      return mergeAndReturn(input, deterministicSpecs, unparsedConstraints, retryValidated, retryResponse);
    }

    return mergeAndReturn(input, deterministicSpecs, unparsedConstraints, validated, response);
  } catch {
    return {
      constraintSpecs: fallbackFromRuleParser(input),
      rawResponse: '',
      usageTokens: 0,
    };
  }
}

function mergeAndReturn(
  input: AgentInputPayload,
  deterministicSpecs: ConstraintSpec[],
  unparsedConstraints: Array<{ type: 'required' | 'preferred' | string; text: string; weight?: number }>,
  validated: { constraintSpecs: ConstraintSpec[] },
  response: { content?: string; usage?: { total_tokens?: number } }
): TranslatorTurnResult {
  const unparsedTexts = new Set(unparsedConstraints.map((c) => c.text));
  const deterministicParsed = deterministicSpecs.filter(
    (s) => s.kind !== 'custom_dsl' && !unparsedTexts.has(s.original)
  );
  const rawMerged = [...deterministicParsed, ...validated.constraintSpecs];
  const fixedMerged = fixIfThenOverrides(input, rawMerged);
  const merged = sanitizeSpecs(input, fixedMerged);
  return {
    constraintSpecs: merged,
    rawResponse: response.content ?? '',
    usageTokens: response.usage?.total_tokens,
  };
}

/** Re-parse "nếu...thì..." constraints that LLM incorrectly classified as non-if_then. */
function fixIfThenOverrides(input: AgentInputPayload, specs: ConstraintSpec[]): ConstraintSpec[] {
  const reparseNeeded = new Set<string>();
  for (const spec of specs) {
    if (spec.kind !== 'if_then' && /nếu|neu/iu.test(spec.original) && /thì|thi/iu.test(spec.original)) {
      reparseNeeded.add(spec.original);
    }
  }
  if (reparseNeeded.size === 0) return specs;

  const reparsed = fallbackFromRuleParser({
    ...input,
    constraints: input.constraints.filter((c) => reparseNeeded.has(c.text)),
  });

  const reparsedByOriginal = new Map(reparsed.filter((s) => s.kind === 'if_then').map((s) => [s.original, s]));
  if (reparsedByOriginal.size === 0) return specs;

  return specs.map((spec) => {
    const fixed = reparsedByOriginal.get(spec.original);
    return fixed ? { ...fixed, id: spec.id, severity: spec.severity, weight: spec.weight } : spec;
  });
}

export const __translatorInternal = {
  sanitizeSpecs,
  buildTranslatorPeriods,
  buildTranslatorPeriodsByDay,
  splitFallbackConstraintText,
  fallbackFromRuleParser,
};
