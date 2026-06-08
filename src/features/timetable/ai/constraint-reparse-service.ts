/**
 * Reparse Rejected Constraint Service
 *
 * When a user rejects a parsed interpretation, this service re-parses the constraint
 * using AI with the rejected interpretation as context. It tries two internal strategies:
 * 1. Try to fit the intent into built-in constraints
 * 2. If built-in is not suitable, produce a clear semantic/code-ready interpretation
 */

import { z } from 'zod';

import type { AgentInputPayload, AIProviderConfig } from './types';
import type { ConstraintSpec } from './constraint-spec';
import type { ReparseResult, SemanticCandidate } from './semantic-constraint';
import { humanizeConstraintSpec } from './constraint-humanizer';
import { invokeChat, type ChatPayload } from './chat-client';
import { parseModelJson } from './parse-model-json';

const reparseResponseSchema = z.object({
  status: z.enum(['candidate', 'unsupported', 'needs_retry']),
  displayText: z.string(),
  candidate: z.object({
    source: z.enum(['built_in', 'semantic']),
    confidence: z.enum(['high', 'medium', 'low']),
    specs: z
      .array(
        z.object({
          kind: z.string(),
          params: z.record(z.string(), z.unknown()),
        })
      )
      .optional(),
    semantic: z
      .object({
        type: z.string(),
        if: z.record(z.string(), z.unknown()).optional(),
        then: z.array(z.record(z.string(), z.unknown())).optional(),
        constraints: z.array(z.record(z.string(), z.unknown())).optional(),
        reason: z.string().optional(),
        assumptions: z.array(z.string()).optional(),
      })
      .optional(),
    assumptions: z.array(z.string()),
    unresolvedQuestions: z.array(z.string()),
  }),
});

export type ReparseRejectedConstraintRequest = {
  rawConstraint: {
    id: string;
    text: string;
    type: 'required' | 'preferred';
    weight?: number;
  };
  rejectedDraft: {
    summary: string;
    displayText: string;
    spec?: ConstraintSpec;
  };
  previousAttempts: Array<{
    summary: string;
    displayText: string;
    source: 'built_in' | 'semantic';
    confidence: 'high' | 'medium' | 'low';
  }>;
  context: {
    teachers: string[];
    classes: string[];
    subjects: string[];
    days: Array<{ id: string; label: string }>;
    periods: Array<{ day?: string; session?: string; period: number }>;
    assignments: Array<{
      id: string;
      teacher: string;
      class: string;
      subject: string;
      weeklyPeriods: number;
    }>;
  };
};

function buildReparsePrompt(request: ReparseRejectedConstraintRequest): string {
  const { rawConstraint, rejectedDraft, previousAttempts, context } = request;

  const teacherList = context.teachers.join(', ') || '(chưa có giáo viên)';
  const classList = context.classes.join(', ') || '(chưa có lớp)';
  const subjectList = context.subjects.join(', ') || '(chưa có môn)';
  const dayList = context.days.map((d) => d.label).join(', ') || '(chưa có ngày)';

  const prevAttemptsText =
    previousAttempts.length > 0
      ? previousAttempts
          .map(
            (a, i) =>
              `  ${i + 1}. "${a.displayText}" (${a.source}, confidence: ${a.confidence})`
          )
          .join('\n')
      : '  (không có)';

  return `You are a constraint parsing assistant for a Vietnamese school timetable system.

## Task
The previous interpretation was rejected by the user. Do not repeat it.
Your job is to produce a NEW precise Vietnamese interpretation.

## Previous Rejected Interpretation
"${rejectedDraft.displayText}"

## Previous Attempts (do NOT repeat these)
${prevAttemptsText}

## Raw User Input
"${rawConstraint.text}"

## Context
- Teachers: ${teacherList}
- Classes: ${classList}
- Subjects: ${subjectList}
- Days: ${dayList}
- Constraint type: ${rawConstraint.type}${rawConstraint.weight ? `, weight: ${rawConstraint.weight}` : ''}

## Policy
1. First try to express the user's intent using the supported built-in constraint kinds.
2. If that is not possible, produce a semantic logic representation that is precise enough for code generation.
3. NEVER invent missing teacher/class/subject names.
4. NEVER hide assumptions - if you make assumptions, fold them into the display text.
5. If the sentence is ambiguous, rewrite the interpretation with the assumption made explicit.
6. If exact support is impossible, return status: "unsupported".
7. The displayText must be a plain Vietnamese sentence that a non-technical user can understand.

## Response Format
Return a JSON object with:
{
  "status": "candidate" | "unsupported" | "needs_retry",
  "displayText": "Vietnamese sentence that the user can approve",
  "candidate": {
    "source": "built_in" | "semantic",
    "confidence": "high" | "medium" | "low",
    "specs": [{ "kind": "...", "params": {...} }],  // if built_in
    "semantic": { "type": "if_then", "if": {...}, "then": [...] },  // if semantic
    "assumptions": ["list of assumptions made"],
    "unresolvedQuestions": ["questions that still need answering"]
  }
}

## Examples

Raw: "Cô Lan không được dạy vào sáng thứ 2"
Response:
{
  "status": "candidate",
  "displayText": "Cô Lan không dạy vào sáng thứ 2.",
  "candidate": {
    "source": "built_in",
    "confidence": "high",
    "specs": [{ "kind": "teacher_block_day", "params": { "teacher": "Lan", "day": "monday" } }],
    "assumptions": ["Cô Lan refers to teacher named Lan"],
    "unresolvedQuestions": []
  }
}

Raw: "Vào ngày thứ 2, tiết 1, nếu cô Hương không dạy, thì đến thứ 5, tiết 3, thầy Thủy phải dạy tiết đó và tiết 4"
Response:
{
  "status": "candidate",
  "displayText": "Nếu thứ 2 tiết 1 giáo viên Hương không có tiết dạy, thì thứ 5 tiết 3 và tiết 4 giáo viên Thủy phải có tiết dạy.",
  "candidate": {
    "source": "semantic",
    "confidence": "high",
    "semantic": {
      "type": "if_then",
      "if": { "op": "teacher_not_teaching_at_slot", "teacher": "Hương", "day": "monday", "period": 1 },
      "then": [
        { "op": "teacher_required_slot", "teacher": "Thủy", "day": "thursday", "period": 3 },
        { "op": "teacher_required_slot", "teacher": "Thủy", "day": "thursday", "period": 4 }
      ]
    },
    "assumptions": ["Hương and Thủy are teacher names", "thứ 2 = monday", "thứ 5 = thursday"],
    "unresolvedQuestions": []
  }
}`;
}

function specToConstraintSpec(
  raw: ReparseRejectedConstraintRequest['rawConstraint'],
  specData: { kind: string; params: Record<string, unknown> }
): ConstraintSpec {
  return {
    id: `reparse_${raw.id}`,
    original: raw.text,
    severity: raw.type === 'required' ? 'hard' : 'soft',
    kind: specData.kind as ConstraintSpec['kind'],
    params: specData.params,
    weight: raw.weight,
  };
}

export async function reparseRejectedConstraint(
  request: ReparseRejectedConstraintRequest,
  config: AIProviderConfig
): Promise<ReparseResult> {
  const prompt = buildReparsePrompt(request);

  const payload: ChatPayload = {
    baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
    apiKey: config.apiKey,
    model: config.model || 'anthropic/claude-3.5-sonnet',
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
    max_tokens: 2000,
  };

  try {
    const response = await invokeChat(payload);
    const content = response.content;

    if (!content) {
      return {
        status: 'needs_retry',
        displayText: request.rejectedDraft.displayText,
        candidate: {
          source: 'semantic',
          confidence: 'low',
          assumptions: [],
          unresolvedQuestions: ['AI không trả về nội dung. Vui lòng thử lại.'],
        },
      };
    }

    const parsedJson = parseModelJson(content);
    const validated = reparseResponseSchema.parse(parsedJson);

    const candidate: SemanticCandidate = {
      source: validated.candidate.source,
      confidence: validated.candidate.confidence,
      specs: validated.candidate.specs?.map((s) =>
        specToConstraintSpec(request.rawConstraint, s)
      ),
      semantic: validated.candidate.semantic as ReparseResult['candidate']['semantic'],
      assumptions: validated.candidate.assumptions,
      unresolvedQuestions: validated.candidate.unresolvedQuestions,
    };

    return {
      status: validated.status,
      displayText: validated.displayText,
      candidate,
    };
  } catch (error) {
    console.error('Reparse failed:', error);
    return {
      status: 'needs_retry',
      displayText: request.rejectedDraft.displayText,
      candidate: {
        source: 'semantic',
        confidence: 'low',
        assumptions: [],
        unresolvedQuestions: [
          error instanceof Error ? error.message : 'Unknown error during reparse',
        ],
      },
    };
  }
}
