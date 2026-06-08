/**
 * Semantic reparse when user rejects an interpretation.
 * Rule/regex is assumed failed — AI normalizes intent to built-in specs; no regex fallback.
 */

import { z } from 'zod';

import type { AgentInputPayload, AIProviderConfig } from './types';
import type { ConstraintSpec } from './constraint-spec';
import { SOLVER_ENCODABLE_KINDS } from './constraint-registry';
import type { ReparseResult, SemanticCandidate } from './semantic-constraint';
import { invokeChat, type ChatPayload } from './chat-client';
import { parseModelJson } from './parse-model-json';
import { validateReparseCandidateSpecs } from './reparse-candidate-validator';

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

const BUILTIN_KIND_HINTS = [
  'teacher_block_day — params: teacher, day',
  'teacher_block_period — params: teacher, period (one spec per period)',
  'teacher_block_slot — params: teacher, day, period',
  'teacher_preferred_periods — params: teacher, periods[] (soft)',
  'teacher_max_per_day — params: teacher, maxPerDay',
  'teacher_allowed_days — params: teacher, days[]',
  'if_then — params: if, then[]',
].join('\n');

function buildReparsePrompt(request: ReparseRejectedConstraintRequest): string {
  const { rawConstraint, rejectedDraft, previousAttempts, context } = request;

  const teacherList = [...new Set(context.teachers)].join(', ') || '(chưa có giáo viên)';
  const classList = [...new Set(context.classes)].join(', ') || '(chưa có lớp)';
  const subjectList = [...new Set(context.subjects)].join(', ') || '(chưa có môn)';
  const dayList =
    context.days.map((d) => `${d.label} (id: ${d.id})`).join(', ') || '(chưa có ngày)';

  const prevAttemptsText =
    previousAttempts.length > 0
      ? previousAttempts
          .map(
            (a, i) =>
              `  ${i + 1}. "${a.displayText}" (${a.source}, confidence: ${a.confidence})`
          )
          .join('\n')
      : '  (không có)';

  const encodableList = [...SOLVER_ENCODABLE_KINDS].slice(0, 40).join(', ');

  return `You are a Vietnamese school timetable constraint normalizer.

## Critical context
The user clicked "Not correct" — rule/regex or first-pass parsing FAILED.
Do NOT repeat the rejected interpretation. Normalize RAW text into built-in specs.

## Rejected (do NOT repeat)
"${rejectedDraft.displayText}"

## Previous attempts (do NOT repeat)
${prevAttemptsText}

## Raw user input
"${rawConstraint.text}"

## Valid entities (never invent)
- Teachers: ${teacherList}
- Classes: ${classList}
- Subjects: ${subjectList}
- Days: ${dayList}
- Type: ${rawConstraint.type}${rawConstraint.weight ? `, weight: ${rawConstraint.weight}` : ''}

## Built-in kinds (prefer)
${BUILTIN_KIND_HINTS}
Encodable kinds include: ${encodableList}, ...

## Rules
1. Prefer source "built_in" with non-empty specs[].
2. Do NOT use custom_dsl unless truly impossible.
3. "tránh"/"né"/"đi muộn" + teacher + periods → teacher_block_period (required) or teacher_preferred_periods (preferred); one spec per period.
4. "Cô X"/"Thầy Y" → teacher label from Teachers list.
5. displayText: clear Vietnamese for user approval.

## JSON response
{ "status": "candidate"|"unsupported"|"needs_retry", "displayText": "...", "candidate": { "source": "built_in", "confidence": "high"|"medium"|"low", "specs": [...], "assumptions": [], "unresolvedQuestions": [] } }

## Example
Raw: "Cô Thúy ... tránh tiết 1 với 2"
→ specs: teacher_block_period Thúy period 1; teacher_block_period Thúy period 2`;
}

export async function reparseRejectedConstraint(
  request: ReparseRejectedConstraintRequest,
  config: AIProviderConfig,
  agentInput: AgentInputPayload
): Promise<ReparseResult> {
  const prompt = buildReparsePrompt(request);

  const payload: ChatPayload = {
    baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
    apiKey: config.apiKey,
    model: config.model || 'anthropic/claude-3.5-sonnet',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 2500,
    response_format: { type: 'json_object' },
  };

  try {
    const response = await invokeChat(payload);
    const content = response.content;

    if (!content?.trim()) {
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

    if (validated.status === 'unsupported') {
      return {
        status: 'unsupported',
        displayText: validated.displayText,
        candidate: {
          source: validated.candidate.source,
          confidence: validated.candidate.confidence,
          semantic: validated.candidate.semantic as SemanticCandidate['semantic'],
          assumptions: validated.candidate.assumptions,
          unresolvedQuestions: validated.candidate.unresolvedQuestions,
        },
      };
    }

    const specInputs = validated.candidate.specs;
    if (validated.candidate.source === 'built_in' && specInputs?.length) {
      const check = validateReparseCandidateSpecs(agentInput, request.rawConstraint, specInputs);
      if (check.ok) {
        return {
          status: 'candidate',
          displayText: validated.displayText,
          candidate: {
            source: 'built_in',
            confidence: validated.candidate.confidence,
            specs: check.specs,
            assumptions: validated.candidate.assumptions,
            unresolvedQuestions: validated.candidate.unresolvedQuestions,
          },
        };
      }

      return {
        status: check.status === 'unsupported' ? 'unsupported' : 'needs_retry',
        displayText: validated.displayText,
        candidate: {
          source: 'built_in',
          confidence: 'low',
          assumptions: validated.candidate.assumptions,
          unresolvedQuestions: [
            ...validated.candidate.unresolvedQuestions,
            ...check.issues.map((i) => i.message),
          ],
        },
      };
    }

    if (request.rawConstraint.type === 'required') {
      return {
        status: 'needs_retry',
        displayText: validated.displayText,
        candidate: {
          source: 'semantic',
          confidence: 'low',
          semantic: validated.candidate.semantic as SemanticCandidate['semantic'],
          assumptions: validated.candidate.assumptions,
          unresolvedQuestions: [
            'Ràng buộc bắt buộc cần specs built-in — chưa chuẩn hóa được.',
            ...validated.candidate.unresolvedQuestions,
          ],
        },
      };
    }

    return {
      status: validated.status,
      displayText: validated.displayText,
      candidate: {
        source: validated.candidate.source,
        confidence: validated.candidate.confidence,
        semantic: validated.candidate.semantic as SemanticCandidate['semantic'],
        assumptions: validated.candidate.assumptions,
        unresolvedQuestions: validated.candidate.unresolvedQuestions,
      },
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
          error instanceof Error ? error.message : 'Lỗi khi diễn giải lại',
        ],
      },
    };
  }
}
