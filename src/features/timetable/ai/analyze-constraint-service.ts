/**
 * Unified Constraint Analyzer
 *
 * Replaces the separate reparse-constraint and normalize-custom-constraint flows.
 * AI acts as a "semantic normalizer" — it:
 *   1. Normalizes the user's intent into clear Vietnamese text (for GUI display)
 *   2. Tries to map to built-in specs (if possible)
 *   3. Falls back to semantic/custom representation (if built-in cannot express)
 *   4. Asks clarification questions if information is missing
 *
 * Architecture: AI-first, built-in as optimization, semantic/custom as fallback.
 *
 * Phase 0 hardening:
 *   - The deterministic fallback is ONLY used when the LLM call fails at the
 *     infrastructure layer (HTTP/timeout). It is NEVER used to override an
 *     LLM `needs_clarification` decision.
 *   - Every fallback result is capped at confidence `medium` and flagged
 *     `requiresConfirmation: true`. The user MUST confirm before solve.
 *   - The negative-guard runs after every parser and demotes silent-flip
 *     mismatches to `medium` + confirmation.
 */

import { z } from 'zod';

import { normalizeBaseURL, resolveProvider } from '@/lib/provider';
import { parseModelJson } from './parse-model-json';
import type { AgentInputPayload, AIProviderConfig } from './types';
import type { ConstraintSpec, ConstraintKind } from './constraint-spec';
import type { SemanticConstraint } from './semantic-constraint';
import { humanizeConstraintSpec } from './constraint-humanizer';
import { __translatorInternal } from './translator';
import { matchKnownEntities, suggestBuiltInConstraint } from './built-in-suggestion';
import { SOLVER_ENCODABLE_KIND_LIST, BUILT_IN_CONSTRAINT_DEFINITIONS, getConstraintMeta } from './constraint-registry';
import type { BuiltInConstraintScope } from './constraint-registry';
import { normalizeConstraintText, extractFirstNumber, extractPeriodNumber, extractDayId } from './translator-text';
import { retrieveTopK, buildTopKPromptSection, type ConstraintResolverHints } from './constraint-retriever';
import { evaluateNegativeGuardForSpecs } from './negative-guard';
import { analyzeSemanticDirection } from './semantic-direction';
import { semanticConstraintToSpecs } from './semantic-to-spec';
import { validateIR } from './constraint-ir';
import type { BoolExpr } from './constraint-ir';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AnalyzeConstraintStatus =
  | 'mapped_builtin'      // AI mapped to a built-in kind
  | 'semantic_only'       // AI understood but no built-in match; returns semantic/custom
  | 'needs_clarification' // AI needs more info from user
  | 'unsupported';        // Outside timetable domain

export type AnalyzeConstraintResult = {
  status: AnalyzeConstraintStatus;
  /** Canonical Vietnamese text for GUI display */
  normalizedText: string;
  /** Built-in specs if mapped; empty if semantic_only */
  specs: ConstraintSpec[];
  /** Semantic representation if no built-in match */
  semantic?: SemanticConstraint;
  /** Confidence level */
  confidence: 'high' | 'medium' | 'low';
  /**
   * Phase 0 invariant (B1.4): this flag, when true, FORCES the UI to
   * require explicit user confirmation before the spec can enter the
   * solver. It is set when the spec came from the deterministic fallback
   * (rule parser) or when the negative-guard detected a semantic flip.
   */
  requiresConfirmation: boolean;
  /** Why the guard downgraded (human-readable). Empty when guard is ok. */
  guardReasons: string[];
  /** Clarification questions if status is needs_clarification */
  clarificationQuestions: string[];
  /** Assumptions made by AI */
  assumptions: string[];
  /** Unresolved questions */
  unresolvedQuestions: string[];
  /** Raw LLM response for debugging */
  rawResponse?: string;
  /** Token usage */
  usageTokens?: number;
};

// ─── Zod Schema for LLM Response ─────────────────────────────────────────────

const semanticConditionSchema: z.ZodType<Record<string, unknown>> = z.lazy(() =>
  z.object({
    op: z.string(),
    teacher: z.string().optional(),
    teachers: z.array(z.string()).optional(),
    day: z.string().optional(),
    period: z.number().optional(),
    class: z.string().optional(),
    subject: z.string().optional(),
    args: z.array(semanticConditionSchema).optional(),
    arg: semanticConditionSchema.optional(),
  })
);

const semanticActionSchema = z.object({
  op: z.string(),
  teacher: z.string().optional(),
  teachers: z.array(z.string()).optional(),
  day: z.string().optional(),
  period: z.number().optional(),
  assignmentId: z.string().optional(),
});

const semanticSchema = z.object({
  type: z.enum(['if_then', 'all_of', 'unsupported_precise_text']),
  if: semanticConditionSchema.optional(),
  then: z.array(semanticActionSchema).optional(),
  constraints: z.array(z.lazy(() => semanticSchema)).optional(),
  text: z.string().optional(),
  reason: z.string().optional(),
});

const specSchema = z.object({
  kind: z.string(),
  params: z.record(z.string(), z.unknown()),
});

const analyzeResponseSchema = z.object({
  status: z.enum(['mapped_builtin', 'semantic_only', 'needs_clarification', 'unsupported']),
  normalizedText: z.string(),
  specs: z.array(specSchema).nullable().optional().transform((value) => value ?? []),
  semantic: semanticSchema.nullable().optional().transform((value) => value ?? undefined),
  expr: z.unknown().optional(),
  confidence: z.enum(['high', 'medium', 'low']),
  clarificationQuestions: z.array(z.string()).nullable().optional().transform((value) => value ?? []),
  assumptions: z.array(z.string()).nullable().optional().transform((value) => value ?? []),
  unresolvedQuestions: z.array(z.string()).nullable().optional().transform((value) => value ?? []),
});

type AnalyzeChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === 'string') return record.output_text;

  const output = Array.isArray(record.output) ? record.output : [];
  for (const item of output) {
    const itemRecord = item && typeof item === 'object' ? item as Record<string, unknown> : null;
    const content = Array.isArray(itemRecord?.content) ? itemRecord.content : [];
    const text = content
      .map((part) => {
        const partRecord = part && typeof part === 'object' ? part as Record<string, unknown> : null;
        return typeof partRecord?.text === 'string'
          ? partRecord.text
          : typeof partRecord?.output_text === 'string'
            ? partRecord.output_text
            : '';
      })
      .join('');
    if (text.trim()) return text;
  }

  const choices = Array.isArray(record.choices) ? record.choices : [];
  for (const choice of choices) {
    const choiceRecord = choice && typeof choice === 'object' ? choice as Record<string, unknown> : null;
    const message = choiceRecord?.message && typeof choiceRecord.message === 'object'
      ? choiceRecord.message as Record<string, unknown>
      : null;
    if (typeof message?.content === 'string') return message.content;
  }
  return '';
}

export async function invokeAnalyzeChat(
  config: AIProviderConfig,
  messages: AnalyzeChatMessage[],
  options?: { jsonSchema?: Record<string, unknown>; schemaName?: string }
): Promise<{ content?: string; usage?: { total_tokens?: number } }> {
  const baseURL = normalizeBaseURL((config.baseURL || 'https://openrouter.ai/api/v1').trim());
  const model = (config.model || 'anthropic/claude-3.5-sonnet').trim();
  const provider = resolveProvider(config.provider, baseURL, model);
  const url = provider === 'openai-responses'
    ? `${baseURL}/responses`
    : `${baseURL}/chat/completions`;
  const body = provider === 'openai-responses'
    ? {
        model,
        input: messages.map((message) => ({ role: message.role, content: message.content })),
        temperature: 0.1,
        max_output_tokens: 3000,
        text: { format: { type: 'json_object' } },
        store: false,
      }
    : {
        model,
        messages,
        temperature: 0.1,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
        stream: false,
      };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const error = parsed && typeof parsed === 'object' && 'error' in parsed
      ? JSON.stringify((parsed as { error: unknown }).error).slice(0, 400)
      : raw.slice(0, 400);
    throw new Error(`Provider rejected analyze request (HTTP ${response.status}): ${error}`);
  }
  return {
    content: extractText(parsed),
    usage: parsed && typeof parsed === 'object' && 'usage' in parsed
      ? (parsed as { usage?: { total_tokens?: number } }).usage
      : undefined,
  };
}

// ─── Built-in Kind Reference for Prompt ───────────────────────────────────────

function buildBuiltInKindReference(): string {
  const lines: string[] = [];
  for (const def of BUILT_IN_CONSTRAINT_DEFINITIONS) {
    lines.push(
      `- ${def.kind} [${def.scope}]: ${def.labelVi} | Ví dụ: ${def.exampleVi} | Params: ${def.paramsSchema.required.join(', ')}`
    );
  }
  return lines.join('\n');
}

// ─── Context Builder ──────────────────────────────────────────────────────────

function buildContextBlock(agentInput: AgentInputPayload): string {
  const teachers = [...new Set(agentInput.assignments.map((a) => a.teacher.label))];
  const classes = [...new Set(agentInput.assignments.map((a) => a.class.label))];
  const subjects = [...new Set(agentInput.assignments.map((a) => a.subject.label))];
  const days = agentInput.days.map((d) => `${d.label} (id: ${d.id})`);
  const assignments = agentInput.assignments.map(
    (a) =>
      `  - ${a.teacher.label} dạy ${a.subject.label} lớp ${a.class.label} (${a.weeklyPeriods} tiết/tuần, id: ${a.id})`
  );

  const sessionLines = agentInput.sessions.map((s) => {
    const count = agentInput.periodCounts[s.id] ?? 0;
    return `  - ${s.label} (id: ${s.id}): ${count} tiết`;
  });

  return `## Dữ liệu thời khóa biểu hiện tại

### Giáo viên (${teachers.length})
${teachers.length > 0 ? teachers.map((t) => `  - ${t}`).join('\n') : '  (chưa có)'}

### Lớp (${classes.length})
${classes.length > 0 ? classes.map((c) => `  - ${c}`).join('\n') : '  (chưa có)'}

### Môn học (${subjects.length})
${subjects.length > 0 ? subjects.map((s) => `  - ${s}`).join('\n') : '  (chưa có)'}

### Ngày học
${days.length > 0 ? days.map((d) => `  - ${d}`).join('\n') : '  (chưa có)'}

### Buổi học
${sessionLines.length > 0 ? sessionLines.join('\n') : '  (chưa có)'}

### Phân công
${assignments.length > 0 ? assignments.join('\n') : '  (chưa có)'}`;
}

function fallbackBuiltInSpecs(
  rawText: string,
  constraintType: 'required' | 'preferred',
  weight: number | undefined,
  agentInput: AgentInputPayload
): ConstraintSpec[] {
  const input: AgentInputPayload = {
    ...agentInput,
    constraints: [{ type: constraintType, text: rawText, weight }],
  };
  const parsed = __translatorInternal.fallbackFromRuleParser(input);
  return __translatorInternal
    .sanitizeSpecs(input, parsed)
    .filter((spec) => spec.kind !== 'custom_dsl');
}

function uniqueLabels(labels: string[]): string[] {
  return Array.from(new Set(labels)).filter(Boolean);
}

function deterministicSuggestionSpecs(
  rawText: string,
  constraintType: 'required' | 'preferred',
  weight: number | undefined,
  agentInput: AgentInputPayload
): ConstraintSpec[] {
  const suggestion = suggestBuiltInConstraint({
    userText: rawText,
    teachers: uniqueLabels(agentInput.assignments.map((assignment) => assignment.teacher.label)),
    subjects: uniqueLabels(agentInput.assignments.map((assignment) => assignment.subject.label)),
    classes: uniqueLabels(agentInput.assignments.map((assignment) => assignment.class.label)),
    assignments: agentInput.assignments,
    days: agentInput.days,
  });
  if (suggestion.decision !== 'suggest_built_in') return [];
  const specsDraft = suggestion.specsDraft?.length
    ? suggestion.specsDraft
    : [{ kind: suggestion.kind, paramsDraft: suggestion.paramsDraft }];
  return specsDraft.map((specDraft, index) => ({
    id: `det_spec_${index}`,
    original: rawText,
    severity: constraintType === 'required' ? 'hard' : 'soft',
    kind: specDraft.kind as ConstraintKind,
    params: { ...specDraft.paramsDraft },
    weight: constraintType === 'preferred' ? weight : undefined,
  }));
}

function subjectCoverageMissing(
  rawText: string,
  specs: ConstraintSpec[],
  agentInput: AgentInputPayload
): string[] {
  const mentionedSubjects = matchKnownEntities(
    rawText,
    uniqueLabels(agentInput.assignments.map((assignment) => assignment.subject.label))
  );
  if (mentionedSubjects.length <= 1) return [];
  const covered = new Set(
    specs
      .map((spec) => spec.params.subject)
      .filter((subject): subject is string => typeof subject === 'string')
  );
  return mentionedSubjects.filter((subject) => !covered.has(subject));
}

function mergedDeterministicFallbackSpecs(
  rawText: string,
  constraintType: 'required' | 'preferred',
  weight: number | undefined,
  agentInput: AgentInputPayload
): ConstraintSpec[] {
  const suggestionSpecs = deterministicSuggestionSpecs(rawText, constraintType, weight, agentInput);
  if (suggestionSpecs.length > 0) return suggestionSpecs;
  return fallbackBuiltInSpecs(rawText, constraintType, weight, agentInput);
}

function hasUnknownIfThenCondition(specs: ConstraintSpec[]): boolean {
  return specs.some((spec) => {
    if (spec.kind !== 'if_then') return false;
    const condition = spec.params.if;
    return !condition || typeof condition !== 'object' || !('op' in condition);
  });
}

function hasTechnicalOrUnknownText(text: string): boolean {
  return /\b[a-z]+(?:_[a-z]+)+\b/u.test(text) || text.includes('điều kiện chưa xác định');
}

function clarifyAmbiguousIfThen(rawText: string): AnalyzeConstraintResult {
  return {
    status: 'needs_clarification',
    normalizedText: 'AI chưa đủ thông tin để hiểu ràng buộc này một cách chắc chắn.',
    specs: [],
    confidence: 'low',
    requiresConfirmation: true,
    guardReasons: [],
    clarificationQuestions: [
      `Mình chưa rõ điều kiện trong câu “${rawText}”. “Hiếu và Thúy dạy cùng ngày” là cùng bất kỳ ngày nào hay một ngày cụ thể?`,
      '“1 người không được dạy tiết 4” nghĩa là nếu cả hai cùng dạy trong ngày đó thì chỉ một trong hai được dạy tiết 4, hay chọn cố định Hiếu/Thúy không dạy tiết 4?',
      'Ràng buộc này áp dụng cho tất cả lớp hay chỉ một lớp cụ thể?',
    ],
    assumptions: [],
    unresolvedQuestions: [
      'Thiếu điều kiện/ngữ cảnh để map chắc chắn sang ràng buộc máy hiểu.',
    ],
  };
}
// ─── Stage 1: Resolver (CODE) ─────────────────────────────────────────────────

function buildResolverHints(
  rawText: string,
  agentInput: AgentInputPayload
): ConstraintResolverHints {
  const normalized = normalizeConstraintText(rawText);
  const teachers = uniqueLabels(agentInput.assignments.map((a) => a.teacher.label));
  const subjects = uniqueLabels(agentInput.assignments.map((a) => a.subject.label));
  const classes = uniqueLabels(agentInput.assignments.map((a) => a.class.label));
  const resolvedTeachers = matchKnownEntities(rawText, teachers);
  const resolvedSubjects = matchKnownEntities(rawText, subjects);
  const resolvedClasses = matchKnownEntities(rawText, classes);
  const resolvedTeacher = resolvedTeachers[0] ?? null;
  const resolvedSubject = resolvedSubjects[0] ?? null;
  const resolvedClass = resolvedClasses[0] ?? null;

  let inferredScope: BuiltInConstraintScope | null = null;
  if (resolvedTeacher) inferredScope = 'teacher';
  else if (resolvedSubject) inferredScope = 'subject';
  else if (resolvedClass) inferredScope = 'class';

  return {
    normalizedText: normalized,
    resolvedTeacher,
    resolvedTeachers,
    resolvedSubject,
    resolvedSubjects,
    resolvedClass,
    resolvedClasses,
    extractedNumber: extractFirstNumber(rawText),
    extractedPeriods: [],
    extractedDays: agentInput.days
      .map((d) => (normalized.includes(d.id) || normalized.includes(d.label.toLowerCase()) ? d.id : null))
      .filter(Boolean) as string[],
    inferredScope,
    // M3.2: Use shared semantic-direction analyzer instead of duplicated regex
    mentionsBlock: analyzeSemanticDirection(rawText).matched.block.length > 0,
    mentionsMax: /tối\s*đa|tối\s*da|quá|không.*quá|khong.*qua/iu.test(normalized),
    mentionsMin: /ít\s*nhất|tối\s*thiểu/iu.test(normalized),
    mentionsConsecutive: /liên\s*tiếp|liên\s*tục/iu.test(normalized),
    mentionsOnly: analyzeSemanticDirection(rawText).matched.only.length > 0,
    mentionsPreferred: analyzeSemanticDirection(rawText).matched.prefer.length > 0,
    mentionsIfThen: /nếu.*thì|neu.*thi/iu.test(normalized),
  };
}

// ─── Small System Prompt (Retrieve-then-Fill) ─────────────────────────────────

function buildSmallSystemPrompt(
  agentInput: AgentInputPayload,
  hints: ConstraintResolverHints,
  topKCandidates: ReturnType<typeof retrieveTopK>
): string {
  const contextBlock = buildContextBlock(agentInput);
  const topKSection = buildTopKPromptSection(topKCandidates, hints.inferredScope);

  return `Bạn map MỘT câu ràng buộc tiếng Việt vào MỘT trong các kind được cung cấp.
Chỉ chọn từ danh sách kind dưới đây. Nếu không kind nào khớp → trả status "semantic_only" kèm semantic.
KHÔNG bịa giáo viên/lớp/môn ngoài entity đã resolve.
Dùng các "extracted hints" cho param; chỉ map, không tự suy số.
Output JSON: { status, specs, semantic?, expr?, confidence, clarificationQuestions[] }

## Semantic ops (khi status = semantic_only)
Condition ops: teacher_teaching_at_slot, teacher_not_teaching_at_slot, teacher_teaching_on_day, teacher_not_teaching_on_day, class_has_subject_at_slot, and, or, not
Action ops: teacher_block_slot, teacher_required_slot, teacher_block_day, teacher_required_day

## IR expr (tuỳ chọn, khi custom)
Ví dụ if-then: { "implies": [{ "teaches": { "teacher": "Sơn", "day": "monday", "period": 1 } }, { "not": { "teaches": { "teacher": "Hương", "day": "tuesday", "period": 3 } } }] }

## Top-k kind candidates (theo scope "${hints.inferredScope ?? 'all'}"):
${topKSection}

## Entity đã resolve:
- Giáo viên: ${hints.resolvedTeachers.join(', ') || '(chưa xác định)'}
- Môn: ${hints.resolvedSubjects.join(', ') || '(chưa xác định)'}
- Lớp: ${hints.resolvedClasses.join(', ') || '(chưa xác định)'}
- Số extracted: ${hints.extractedNumber ?? '(chưa có)'}
- Tiết extracted: ${hints.extractedDays.join(', ') || '(chưa có)'}

${contextBlock}

## Output JSON Schema
{
  "status": "mapped_builtin" | "semantic_only" | "needs_clarification" | "unsupported",
  "normalizedText": "Câu tiếng Việt chuẩn hóa cho GUI",
  "specs": [{ "kind": "built_in_kind", "params": { ... } }],
  "semantic": { "type": "if_then", "if": { "op": "teacher_teaching_at_slot", "teacher": "...", "day": "...", "period": 1 }, "then": [{ "op": "teacher_block_slot", "teacher": "...", "day": "...", "period": 3 }] },
  "expr": { "implies": [{ "teaches": { "teacher": "...", "day": "...", "period": 1 } }, { "not": { "teaches": { "teacher": "...", "day": "...", "period": 3 } } }] },
  "confidence": "high" | "medium" | "low",
  "clarificationQuestions": ["Câu hỏi 1?"],
  "assumptions": [],
  "unresolvedQuestions": []
}`;
}

// ─── Analyze Constraint ──────────────────────────────────────────────────────

export async function analyzeConstraint(
  rawText: string,
  constraintType: 'required' | 'preferred',
  weight: number | undefined,
  agentInput: AgentInputPayload,
  config: AIProviderConfig,
  options?: {
    previousAttempts?: Array<{
      displayText: string;
      source: 'built_in' | 'semantic';
      confidence: 'high' | 'medium' | 'low';
    }>;
    conversationMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  }
): Promise<AnalyzeConstraintResult> {
  // Stage 1: Build resolver hints (CODE — no LLM)
  const hints = buildResolverHints(rawText, agentInput);
  // Stage 2: Retrieve top-k candidates (CODE)
  const topKCandidates = retrieveTopK(hints, hints.inferredScope, 5);
  // Stage 3: LLM slot-fill with small prompt
  const systemPrompt = buildSmallSystemPrompt(agentInput, hints, topKCandidates);

  let userMessage = `## Ràng buộc cần phân tích
- Nội dung: "${rawText}"
- Loại: ${constraintType === 'required' ? 'Bắt buộc' : 'Ưu tiên'}${weight ? `\n- Trọng số: ${weight}` : ''}`;

  if (options?.previousAttempts?.length) {
    userMessage += `\n\n## Các lần phân tích trước (KHÔNG lặp lại)\n`;
    for (const attempt of options.previousAttempts) {
      userMessage += `- "${attempt.displayText}" (nguồn: ${attempt.source}, confidence: ${attempt.confidence})\n`;
    }
    userMessage += `\nHãy phân tích lại từ đầu với cách hiểu khác.`;
  }

  try {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];
    if (options?.conversationMessages?.length) {
      messages.push(...options.conversationMessages);
    }
    const response = await invokeAnalyzeChat(config, messages);
    const content = response.content;

    if (!content?.trim()) {
      return {
        status: 'needs_clarification',
        normalizedText: rawText,
        specs: [],
        confidence: 'low',
        requiresConfirmation: true,
        guardReasons: [],
        clarificationQuestions: ['AI không trả về nội dung. Vui lòng thử lại.'],
        assumptions: [],
        unresolvedQuestions: ['AI không trả về nội dung.'],
        rawResponse: content,
        usageTokens: response.usage?.total_tokens,
      };
    }

    const parsedJson = parseModelJson(content);
    const validated = analyzeResponseSchema.parse(parsedJson);

    // Build specs from LLM response
    let specs: ConstraintSpec[] = (validated.specs ?? []).map((s, i) => ({
      id: `ai_spec_${i}`,
      original: rawText,
      severity: constraintType === 'required' ? 'hard' : 'soft',
      kind: (s.kind as ConstraintKind) || 'custom_dsl',
      params: s.params || {},
      weight: constraintType === 'preferred' ? weight : undefined,
    }));

    const semantic = validated.semantic as SemanticConstraint | undefined;
    if (validated.status === 'semantic_only' && semantic) {
      const converted = semanticConstraintToSpecs(semantic, {
        rawText,
        constraintType,
        weight,
        agentInput,
      });
      if (converted.length > 0) {
        specs = converted;
      }
    }

    if (specs.length === 0 && validated.expr && typeof validated.expr === 'object') {
      const expr = validated.expr as BoolExpr;
      const shapeOk = validateIR({
        id: 'ai_expr_probe',
        severity: constraintType === 'required' ? 'hard' : 'soft',
        original: rawText,
        expr,
      }).length === 0;
      if (shapeOk) {
        specs = [
          {
            id: 'ai_custom_0',
            original: rawText,
            severity: constraintType === 'required' ? 'hard' : 'soft',
            kind: 'custom_dsl',
            params: {
              normalizedText: validated.normalizedText,
              semantic,
              expr,
            },
            weight: constraintType === 'preferred' ? weight : undefined,
          },
        ];
      }
    }

    // Run negative-guard over the LLM-emitted specs FIRST. This catches silent
    // semantic flips (require→block, block→allowed) regardless of confidence.
    const guardResult = evaluateNegativeGuardForSpecs(specs, rawText);

    // Phase 0.1: deterministic fallback is ONLY permitted when the LLM call
    // actually FAILED (we are in the catch block). Here, the LLM returned a
    // parsed response, so we MUST NOT silently override a needs_clarification
    // or low-confidence LLM answer with the rule parser's guess. The previous
    // behaviour ("auto-map with confidence='high' if rule parser found a kind")
    // was the root cause of bug "Thủy phải có tiết 4" being silently inverted.
    let resolvedStatus: AnalyzeConstraintStatus = validated.status;
    let resolvedSpecs = specs;
    let resolvedConfidence: 'high' | 'medium' | 'low' = validated.confidence;
    let resolvedNormalizedText = validated.normalizedText;
    let resolvedClarificationQuestions = validated.clarificationQuestions ?? [];

    if (
      validated.status === 'semantic_only' &&
      specs.length > 0 &&
      specs[0].kind === 'if_then'
    ) {
      resolvedStatus = 'mapped_builtin';
      resolvedSpecs = specs;
    } else if (
      validated.status === 'semantic_only' &&
      constraintType === 'required' &&
      semantic &&
      specs.length === 0
    ) {
      resolvedStatus = 'needs_clarification';
      resolvedSpecs = [];
      resolvedConfidence = 'low';
      resolvedClarificationQuestions = [
        'Hệ thống hiểu ý bạn nhưng chưa chuyển được thành luật máy thực thi. Hãy chọn mẫu có sẵn hoặc viết lại câu rõ hơn (nêu rõ giáo viên, ngày, tiết).',
        ...(validated.clarificationQuestions ?? []),
      ];
    }
    // Phase 0 invariant (B1.4): needs_clarification, unsupported, and
    // semantic_only ALWAYS require user confirmation (the user must
    // respond to clarification / review the humanized semantic text /
    // see the unsupported message). mapped_builtin defaults to false
    // and the guard can override. Confidence is for routing only,
    // never for skipping confirmation.
    let resolvedRequiresConfirmation =
      resolvedStatus === 'needs_clarification' ||
      resolvedStatus === 'unsupported' ||
      resolvedStatus === 'semantic_only';
    const guardReasons: string[] = [];

    // Apply guard demotions: any demoted spec caps confidence at `medium` and
    // forces confirmation. Hard reasons (e.g. conflicting markers) force
    // needs_clarification outright.
    if (guardResult.hardReasons.length > 0) {
      resolvedStatus = 'needs_clarification';
      resolvedConfidence = 'low';
      resolvedSpecs = [];
      resolvedRequiresConfirmation = true;
      guardReasons.push(...guardResult.hardReasons);
    } else if (guardResult.anyDemote) {
      resolvedConfidence =
        resolvedConfidence === 'high' ? 'medium' : resolvedConfidence;
      resolvedRequiresConfirmation = true;
      for (const decision of guardResult.decisions) {
        if (decision.kind === 'demote_to_medium_with_confirmation') {
          guardReasons.push(decision.reason);
        }
      }
    }

    if (
      resolvedStatus !== 'needs_clarification' &&
      (hasUnknownIfThenCondition(resolvedSpecs) || hasTechnicalOrUnknownText(resolvedNormalizedText))
    ) {
      return {
        ...clarifyAmbiguousIfThen(rawText),
        requiresConfirmation: true,
        guardReasons,
        rawResponse: content,
        usageTokens: response.usage?.total_tokens,
      };
    }

    return {
      status: resolvedStatus,
      normalizedText: resolvedNormalizedText,
      specs: resolvedSpecs,
      semantic,
      confidence: resolvedConfidence,
      requiresConfirmation: resolvedRequiresConfirmation,
      guardReasons,
      clarificationQuestions: resolvedClarificationQuestions,
      assumptions: validated.assumptions ?? [],
      unresolvedQuestions: validated.unresolvedQuestions ?? [],
      rawResponse: content,
      usageTokens: response.usage?.total_tokens,
    };
  } catch (error) {
    console.error('Analyze constraint failed:', error);
    // Phase 0.1: the LLM call threw an error. We MAY consult the deterministic
    // parser as a last-resort recovery (so the user is not blocked by transient
    // network/HTTP issues). However, every fallback spec is hard-capped at
    // confidence `medium` and REQUIRES explicit user confirmation. This is the
    // ONLY place where the rule parser may produce an auto-mapped result.
    const deterministic = mergedDeterministicFallbackSpecs(rawText, constraintType, weight, agentInput);
    if (deterministic.length > 0) {
      // Run the negative-guard on fallback specs too — the rule parser is
      // exactly where silent flips originate.
      const guardResult = evaluateNegativeGuardForSpecs(deterministic, rawText);
      const guardReasons: string[] = [];
      let requiresConfirmation = true;
      let confidence: 'high' | 'medium' | 'low' = 'medium';
      if (guardResult.hardReasons.length > 0) {
        guardReasons.push(...guardResult.hardReasons);
        return {
          status: 'needs_clarification',
          normalizedText: deterministic.map((s) => humanizeConstraintSpec(s)).join('\n'),
          specs: [],
          confidence: 'low',
          requiresConfirmation: true,
          guardReasons,
          clarificationQuestions: guardResult.hardReasons,
          assumptions: [
            `AI phân tích lỗi nhưng rule parser tìm được kind; guard phát hiện xung đột ngữ nghĩa. Lỗi gốc: ${
              error instanceof Error ? error.message : 'unknown'
            }`,
          ],
          unresolvedQuestions: [],
        };
      }
      if (guardResult.anyDemote) {
        for (const decision of guardResult.decisions) {
          if (decision.kind === 'demote_to_medium_with_confirmation') {
            guardReasons.push(decision.reason);
          }
        }
      }
      return {
        status: 'mapped_builtin',
        normalizedText: deterministic.map((s) => humanizeConstraintSpec(s)).join('\n'),
        specs: deterministic,
        confidence,
        requiresConfirmation,
        guardReasons,
        clarificationQuestions: [],
        assumptions: [
          `AI phân tích lỗi; rule parser tìm được built-in nhưng BẮT BUỘC xác nhận lại. Lỗi gốc: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        ],
        unresolvedQuestions: [],
      };
    }
    return {
      status: 'needs_clarification',
      normalizedText: rawText,
      specs: [],
      confidence: 'low',
      requiresConfirmation: true,
      guardReasons: [],
      clarificationQuestions: [
        error instanceof Error ? error.message : 'Lỗi khi phân tích ràng buộc.',
      ],
      assumptions: [],
      unresolvedQuestions: [
        error instanceof Error ? error.message : 'Lỗi khi phân tích ràng buộc.',
      ],
    };
  }
}

// ─── Helper: Build ConstraintSpec from analyze result ─────────────────────────

export function buildSpecsFromAnalyzeResult(
  result: AnalyzeConstraintResult,
  rawText: string,
  constraintType: 'required' | 'preferred',
  weight?: number
): ConstraintSpec[] {
  if (result.specs.length > 0) {
    return result.specs;
  }

  if (result.semantic) {
    const converted = semanticConstraintToSpecs(result.semantic, {
      rawText,
      constraintType,
      weight,
    });
    if (converted.length > 0) {
      return converted;
    }
  }

  if (result.status === 'semantic_only' && result.semantic) {
    return [
      {
        id: `ai_custom_0`,
        original: rawText,
        severity: constraintType === 'required' ? 'hard' : 'soft',
        kind: 'custom_dsl',
        params: {
          normalizedText: result.normalizedText,
          semantic: result.semantic,
        },
        weight: constraintType === 'preferred' ? weight : undefined,
      },
    ];
  }

  return [];
}
