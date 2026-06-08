import { z } from 'zod';

import { invokeChat, type ChatPayload } from './chat-client';
import { parseModelJson } from './parse-model-json';
import { normalizeConstraintText } from './translator-text';
import type { AgentInputPayload, AIProviderConfig, ChatUsage, NormalizedAssignment } from './types';

export type CustomConstraintSeverity = 'hard' | 'soft';
export type CustomNormalizationStatus = 'normalized' | 'needs_clarification' | 'unsupported';

export type CustomConstraintNormalizationInput = {
  severity: CustomConstraintSeverity;
  originalText: string;
  teachers: string[];
  subjects: string[];
  classes: string[];
  assignments: NormalizedAssignment[];
  days: Array<{ id: string; label: string }>;
};

export type CustomConstraintNormalizationResult = {
  status: CustomNormalizationStatus;
  normalizedText: string;
  detectedEntities: {
    teachers: string[];
    subjects: string[];
    classes: string[];
    assignments: string[];
    days: string[];
    periods: number[];
  };
  confidence: number;
  needsClarification: boolean;
  clarificationQuestions: string[];
  rawResponse?: string;
  usageTokens?: number;
};

type CustomNormalizationChatInvoke = (
  payload: ChatPayload
) => Promise<{ content?: string; usage?: ChatUsage }>;

const modelResponseSchema = z.object({
  status: z.enum(['normalized', 'needs_clarification', 'unsupported']).optional(),
  normalizedText: z.string(),
  detectedEntities: z.object({
    teachers: z.array(z.string()).default([]),
    subjects: z.array(z.string()).default([]),
    classes: z.array(z.string()).default([]),
    assignments: z.array(z.string()).default([]),
    days: z.array(z.string()).default([]),
    periods: z.array(z.number()).default([]),
  }),
  confidence: z.number(),
  needsClarification: z.boolean(),
  clarificationQuestions: z.array(z.string()).default([]),
});

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function sentenceCase(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  const first = compact.charAt(0).toLocaleUpperCase('vi');
  const rest = compact.slice(1);
  return /[.!?]$/u.test(compact) ? `${first}${rest}` : `${first}${rest}.`;
}

function includesNormalized(text: string, value: string): boolean {
  const normalizedValue = normalizeConstraintText(value);
  if (!normalizedValue) return false;
  return new RegExp(`(?:^|\\s)${normalizedValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'u').test(text);
}

function detectPeriods(text: string): number[] {
  const found: number[] = [];
  const pattern = /(?:tiết|tiet|period)\s*(\d+)/giu;
  for (const match of text.matchAll(pattern)) {
    const period = Number(match[1]);
    if (Number.isFinite(period)) found.push(period);
  }
  return Array.from(new Set(found));
}

function detectKnownEntities(input: CustomConstraintNormalizationInput): CustomConstraintNormalizationResult['detectedEntities'] {
  const normalized = normalizeConstraintText(input.originalText);
  const teachers = input.teachers.filter((label) => includesNormalized(normalized, label));
  const subjects = input.subjects.filter((label) => includesNormalized(normalized, label));
  const classes = input.classes.filter((label) => includesNormalized(normalized, label));
  const days = input.days
    .filter((day) => includesNormalized(normalized, day.id) || includesNormalized(normalized, day.label))
    .map((day) => day.id);
  const assignments = input.assignments
    .filter((assignment) => (
      teachers.includes(assignment.teacher.label) &&
      subjects.includes(assignment.subject.label) &&
      classes.includes(assignment.class.label)
    ))
    .map((assignment) => assignment.id);

  return {
    teachers,
    subjects,
    classes,
    assignments,
    days: unique(days),
    periods: detectPeriods(input.originalText),
  };
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function deterministicNormalize(input: CustomConstraintNormalizationInput): CustomConstraintNormalizationResult {
  const normalizedText = sentenceCase(input.originalText);
  const detectedEntities = detectKnownEntities(input);
  const normalized = normalizeConstraintText(input.originalText);
  const hasConcreteEntity =
    detectedEntities.teachers.length > 0 ||
    detectedEntities.subjects.length > 0 ||
    detectedEntities.classes.length > 0 ||
    detectedEntities.assignments.length > 0;

  if (!normalizedText) {
    return {
      status: 'needs_clarification',
      normalizedText: '',
      detectedEntities,
      confidence: 0,
      needsClarification: true,
      clarificationQuestions: ['Vui lòng nhập nội dung ràng buộc custom.'],
    };
  }

  if (/\b(phong|phòng|san|sân|thiet bi|thiết bị|may chieu|máy chiếu)\b/u.test(normalized)) {
    return {
      status: 'unsupported',
      normalizedText,
      detectedEntities,
      confidence: 0.4,
      needsClarification: true,
      clarificationQuestions: ['Ràng buộc này liên quan tới tài nguyên chưa có trong dữ liệu thời khóa biểu.'],
    };
  }

  if (!hasConcreteEntity) {
    return {
      status: 'needs_clarification',
      normalizedText,
      detectedEntities,
      confidence: 0.35,
      needsClarification: true,
      clarificationQuestions: ['Ràng buộc này áp dụng cho giáo viên, lớp, môn hoặc phân công nào?'],
    };
  }

  if (/\b(hop ly|hợp lý|can doi|cân đối|dep|đẹp|it|ít|nhieu|nhiều)\b/u.test(normalized)) {
    return {
      status: 'needs_clarification',
      normalizedText,
      detectedEntities,
      confidence: 0.5,
      needsClarification: true,
      clarificationQuestions: ['Vui lòng đổi yêu cầu định tính thành giới hạn cụ thể để hệ thống kiểm tra được.'],
    };
  }

  return {
    status: 'normalized',
    normalizedText,
    detectedEntities,
    confidence: 0.68,
    needsClarification: false,
    clarificationQuestions: [],
  };
}

function buildPrompt(input: CustomConstraintNormalizationInput): string {
  const assignments = input.assignments.map((assignment) => ({
    id: assignment.id,
    teacher: assignment.teacher.label,
    subject: assignment.subject.label,
    class: assignment.class.label,
    weeklyPeriods: assignment.weeklyPeriods,
  }));

  return JSON.stringify({
    task: 'Normalize a Vietnamese custom timetable constraint without converting it into built-in specs.',
    rules: [
      'Preserve meaning and original intent.',
      'Do not output built-in kind names or solver specs.',
      'Use only provided teachers, subjects, classes, assignment ids, day ids, and period numbers mentioned by the user.',
      'Ask clarification when an entity, day, period, or quantity is ambiguous.',
      'Return unsupported when the statement cannot be made precise with the timetable data.',
    ],
    input: {
      severity: input.severity,
      originalText: input.originalText,
    },
    context: {
      teachers: input.teachers,
      subjects: input.subjects,
      classes: input.classes,
      days: input.days,
      assignments,
    },
    responseShape: {
      status: 'normalized | needs_clarification | unsupported',
      normalizedText: 'Clear Vietnamese sentence for user review',
      detectedEntities: {
        teachers: ['known teacher labels'],
        subjects: ['known subject labels'],
        classes: ['known class labels'],
        assignments: ['known assignment ids'],
        days: ['known day ids'],
        periods: ['numbers'],
      },
      confidence: 'number from 0 to 1',
      needsClarification: 'boolean',
      clarificationQuestions: ['Vietnamese questions'],
    },
  });
}

function filterKnown(values: string[], allowed: string[]): string[] {
  const allowedSet = new Set(allowed);
  return unique(values).filter((value) => allowedSet.has(value));
}

function sanitizeModelResult(
  parsed: z.infer<typeof modelResponseSchema>,
  input: CustomConstraintNormalizationInput,
  fallback: CustomConstraintNormalizationResult
): CustomConstraintNormalizationResult {
  const allowedDayIds = input.days.map((day) => day.id);
  const allowedAssignmentIds = input.assignments.map((assignment) => assignment.id);
  const detectedEntities: CustomConstraintNormalizationResult['detectedEntities'] = {
    teachers: filterKnown(parsed.detectedEntities.teachers, input.teachers),
    subjects: filterKnown(parsed.detectedEntities.subjects, input.subjects),
    classes: filterKnown(parsed.detectedEntities.classes, input.classes),
    assignments: filterKnown(parsed.detectedEntities.assignments, allowedAssignmentIds),
    days: filterKnown(parsed.detectedEntities.days, allowedDayIds),
    periods: Array.from(new Set(parsed.detectedEntities.periods.filter((period) => Number.isFinite(period)))),
  };
  const clarificationQuestions = unique(parsed.clarificationQuestions);
  const needsClarification = parsed.needsClarification || clarificationQuestions.length > 0;
  const status = parsed.status ?? (needsClarification ? 'needs_clarification' : 'normalized');

  return {
    status,
    normalizedText: sentenceCase(parsed.normalizedText) || fallback.normalizedText,
    detectedEntities,
    confidence: clampConfidence(parsed.confidence),
    needsClarification,
    clarificationQuestions,
  };
}

export function buildCustomNormalizationInput(
  severity: CustomConstraintSeverity,
  originalText: string,
  agentInput: AgentInputPayload
): CustomConstraintNormalizationInput {
  return {
    severity,
    originalText,
    teachers: unique(agentInput.assignments.map((assignment) => assignment.teacher.label)),
    subjects: unique(agentInput.assignments.map((assignment) => assignment.subject.label)),
    classes: unique(agentInput.assignments.map((assignment) => assignment.class.label)),
    assignments: agentInput.assignments,
    days: agentInput.days,
  };
}

export async function normalizeCustomConstraint(
  input: CustomConstraintNormalizationInput,
  config: AIProviderConfig,
  chatInvoke: CustomNormalizationChatInvoke = invokeChat
): Promise<CustomConstraintNormalizationResult> {
  const fallback = deterministicNormalize(input);
  if (fallback.status === 'unsupported' || fallback.normalizedText === '') {
    return fallback;
  }

  const payload: ChatPayload = {
    baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
    apiKey: config.apiKey,
    model: config.model,
    messages: [
      {
        role: 'user',
        content: buildPrompt(input),
      },
    ],
    temperature: 0,
    max_tokens: 1200,
    response_format: { type: 'json_object' },
  };

  try {
    const response = await chatInvoke(payload);
    const parsed = modelResponseSchema.parse(parseModelJson(response.content));
    return {
      ...sanitizeModelResult(parsed, input, fallback),
      rawResponse: response.content,
      usageTokens: response.usage?.total_tokens,
    };
  } catch {
    return fallback;
  }
}

export const __customNormalizationInternal = {
  deterministicNormalize,
  detectKnownEntities,
};
