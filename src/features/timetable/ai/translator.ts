import { z } from 'zod';

import { parseConstraint } from '@/lib/constraint-parser';

import type { ConstraintSpec } from './constraint-spec';
import type { AgentInputPayload, AIProviderConfig, ChatUsage, TranslatorTurnResult } from './types';

type ChatInvoke = (payload: Record<string, unknown>) => Promise<{ content?: string; usage?: ChatUsage }>;

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
    'subject_pin_period',
    'subject_consecutive',
    'class_no_double_subject_day',
    'weekly_periods_exact',
    'if_then',
    'pair_not_same_slot',
    'custom_dsl',
  ]),
  params: z.record(z.string(), z.unknown()),
  tags: z.array(z.enum(['auto_base', 'user_required', 'user_preferred'])).optional(),
  notes: z.string().optional(),
});

const translatorResponseSchema = z.object({
  constraintSpecs: z.array(constraintSpecSchema),
});

function defaultInvokeChat(payload: Record<string, unknown>): Promise<{ content?: string; usage?: ChatUsage }> {
  return fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(async (response) => {
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) {
      throw new Error(body?.error || `Chat API failed with status ${response.status}`);
    }
    return { content: String(body.content ?? ''), usage: body.usage as ChatUsage | undefined };
  });
}

function includesLabel(text: string, label: string): boolean {
  return text.toLocaleLowerCase('vi').includes(label.toLocaleLowerCase('vi'));
}

function extractFirstNumber(text: string): number | null {
  const matched = text.match(/\b(\d+)\b/u);
  if (!matched) return null;
  const value = Number(matched[1]);
  return Number.isFinite(value) ? value : null;
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

function fallbackFromRuleParser(input: AgentInputPayload): ConstraintSpec[] {
  const teacherLabels = [...new Set(input.assignments.map((assignment) => assignment.teacher.label))];
  const classLabels = [...new Set(input.assignments.map((assignment) => assignment.class.label))];
  const subjectLabels = [...new Set(input.assignments.map((assignment) => assignment.subject.label))];
  const dayIds = Object.fromEntries(input.days.map((day) => [day.id, day.id]));
  const sessionIds = Object.fromEntries(input.sessions.map((session) => [session.id, session.id]));

  return input.constraints.map((constraint, index) => {
    const id = `c${index + 1}`;
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
      } else if (/(không|khong).*(dạy|day)/iu.test(thenClauseRaw) && thenTeachers[0] && thenDay && thenPeriod !== null) {
        thenSpecs.push({
          kind: 'teacher_block_slot',
          params: { teacher: thenTeachers[0], day: thenDay, period: thenPeriod },
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

    if (/không\s*học|khong\s*hoc/u.test(constraint.text) && /(2|hai).*(lần|lan|tiết|tiet).*(ngày|ngay)/u.test(constraint.text)) {
      const klass = classLabels.find((label) => includesLabel(constraint.text, label));
      if (klass) {
        const subject = subjectLabels.find((label) => includesLabel(constraint.text, label));
        return {
          id,
          original: constraint.text,
          severity,
          kind: 'class_no_double_subject_day',
          params: {
            class: klass,
            ...(subject ? { subject } : {}),
          },
        } satisfies ConstraintSpec;
      }
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

    return {
      id,
      original: constraint.text,
      severity,
      kind: 'custom_dsl',
      params: {
        naturalLanguage: constraint.text,
      },
      notes: 'fallback_parser',
    } satisfies ConstraintSpec;
  });
}

function sanitizeSpecs(input: AgentInputPayload, specs: ConstraintSpec[]): ConstraintSpec[] {
  const validTeachers = new Set(input.assignments.map((assignment) => assignment.teacher.label));
  const validClasses = new Set(input.assignments.map((assignment) => assignment.class.label));
  const validSubjects = new Set(input.assignments.map((assignment) => assignment.subject.label));
  const validDays = new Set(input.days.map((day) => day.id));

  return specs.map((spec, index) => {
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
  const systemPrompt = await loadTranslatorSystemPrompt();
  const context = {
    teachers: [...new Set(input.assignments.map((assignment) => assignment.teacher.label))],
    classes: [...new Set(input.assignments.map((assignment) => assignment.class.label))],
    subjects: [...new Set(input.assignments.map((assignment) => assignment.subject.label))],
    days: input.days,
    periods: [...new Set(Object.values(input.periodCounts))],
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
                      'subject_pin_period',
                      'subject_consecutive',
                      'class_no_double_subject_day',
                      'weekly_periods_exact',
                      'if_then',
                      'pair_not_same_slot',
                      'custom_dsl',
                    ],
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
    const parsedJson = JSON.parse(response.content ?? '{}');
    const validated = translatorResponseSchema.parse(parsedJson);
    const sanitized = sanitizeSpecs(input, validated.constraintSpecs);
    return {
      constraintSpecs: sanitized,
      rawResponse: response.content,
      usageTokens: response.usage?.total_tokens,
    };
  } catch {
    return {
      constraintSpecs: fallbackFromRuleParser(input),
      rawResponse: '',
      usageTokens: 0,
    };
  }
}

export const __translatorInternal = {
  sanitizeSpecs,
  fallbackFromRuleParser,
};
