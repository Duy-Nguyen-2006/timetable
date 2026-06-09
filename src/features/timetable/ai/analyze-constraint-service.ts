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
import { SOLVER_ENCODABLE_KIND_LIST } from './constraint-registry';
import {
  BUILT_IN_CONSTRAINT_DEFINITIONS,
} from './constraint-registry';

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
  confidence: z.enum(['high', 'medium', 'low']),
  clarificationQuestions: z.array(z.string()).nullable().optional().transform((value) => value ?? []),
  assumptions: z.array(z.string()).nullable().optional().transform((value) => value ?? []),
  unresolvedQuestions: z.array(z.string()).nullable().optional().transform((value) => value ?? []),
});

type AnalyzeChatMessage = { role: 'system' | 'user'; content: string };

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

async function invokeAnalyzeChat(
  config: AIProviderConfig,
  messages: AnalyzeChatMessage[]
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

// ─── System Prompt ─────────══─────────────────────────────────────────────────

function buildSystemPrompt(agentInput: AgentInputPayload): string {
  const contextBlock = buildContextBlock(agentInput);
  const builtInRef = buildBuiltInKindReference();

  return `Bạn là AI chuyên phân tích ràng buộc thời khóa biểu tiếng Việt cho trường học.

## QUAN TRỌNG: Bạn chỉ phân tích 1 ràng buộc duy nhất
Bạn nhận được ĐÚNG 1 câu ràng buộc từ người dùng. Phân tích câu đó thôi, KHÔNG phân tích nhiều câu cùng lúc.

## QUAN TRỌNG: Kiểm tra entity trước khi phân tích
TRƯỚC KHI phân tích, bạn PHẢI kiểm tra từng entity (giáo viên, lớp, môn, ngày, tiết) có trong danh sách context không.

### Quy tắc kiểm tra entity:
1. **Giáo viên**: Tên giáo viên PHẢI khớp chính xác (không phân biệt hoa/thường, bỏ dấu) với danh sách giáo viên từ context.
   - Ví dụ: User nhập "Cô Lan" nhưng context chỉ có ["Sơn", "Hương", "Hiếu", "Thủy"]
   - → PHẢI trả status: "needs_clarification" với câu hỏi: "Giáo viên 'Lan' không có trong danh sách giáo viên hiện tại. Bạn có muốn thêm giáo viên này vào danh sách trước, hay chọn giáo viên khác?"
   - KHÔNG được tự ý map "Lan" thành "Sơn" hay bất kỳ ai khác.

2. **Lớp**: Tên lớp PHẢI khớp chính xác với danh sách lớp từ context.
   - Nếu không khớp → trả needs_clarification: "Lớp 'X' không có trong danh sách lớp hiện tại."

3. **Môn học**: Tên môn PHẢI khớp chính xác với danh sách môn từ context.
   - Nếu không khớp → trả needs_clarification: "Môn 'X' không có trong danh sách môn hiện tại."

4. **Ngày**: PHẢI khớp với danh sách ngày từ context (Thứ 2, Thứ 3, ..., Thứ 7, Chủ nhật).
   - Nếu không khớp → trả needs_clarification: "Ngày 'X' không có trong danh sách ngày học."

5. **Tiết**: PHẢI nằm trong phạm vi số tiết cho phép từ context.
   - Nếu không khớp → trả needs_clarification: "Tiết 'X' không hợp lệ. Số tiết tối đa là Y."

## Bước 1: Chuẩn hóa ý định (LUÔN thực hiện)
Chuyển câu gốc thành câu tiếng Việt rõ ràng, chuẩn, dễ hiểu. Ví dụ:
- "Sơn bận việc nhà hay đi muộn nên ko dạy tiết 1" → "Giáo viên Sơn không dạy tiết 1."
- "Cô Thúy hay đi muộn tiết đầu" → "Giáo viên Thúy không dạy tiết 1."
- "Nếu Hiếu dạy thứ 2 thì Hương không dạy thứ 3" → "Nếu Giáo viên Hiếu dạy Thứ 2 thì Giáo viên Hương không dạy Thứ 3."
- "Toán không nên xếp 3 tiết liên tiếp cho bất kỳ lớp nào" → "Môn Toán không xếp quá 2 tiết liên tiếp cho mỗi lớp."
- "Nếu Dung dạy thứ 2 thì Sơn phải dạy thứ 4" → "Nếu Giáo viên Dung dạy Thứ 2 thì Giáo viên Sơn phải dạy Thứ 4."

Quy tắc chuẩn hóa:
- LUÔN dùng danh sách giáo viên/lớp/môn từ context để canonical hóa tên entity.
- KHÔNG được invent giáo viên/lớp/môn ngoài danh sách context.
- Nếu tên không khớp chính xác, trả về "needs_clarification" với câu hỏi gợi ý.
- Nếu câu mơ hồ về entity (ví dụ: "thầy ấy", "lớp kia"), trả về "needs_clarification".

## Bước 2: Map sang built-in (ưu tiên, NHẤT ĐỊNH phải thử cho if-then cơ bản)
Sau khi chuẩn hóa, CỐ GẮNG map sang built-in spec nếu phù hợp.

### Quy tắc BẮT BUỘC cho if-then tiếng Việt:
Câu có dạng "Nếu <điều kiện> thì <kết quả>" PHẢI map sang kind "if_then" với:
- params.if: object mô tả điều kiện (teacher_teaches_on_day / teacher_teaches_at_slot / class_teacher_at_slot, có thể AND/OR/NOT).
- params.then: mảng các action (teacher_block_day / teacher_block_period / teacher_block_slot / teacher_required_day / teacher_required_slot).

Ví dụ BẮT BUỘC phải trả built-in if_then:
- "Nếu Dung dạy thứ 2 thì Sơn phải dạy thứ 4" -> kind: "if_then", if: {op: "teacher_teaches_on_day", teacher: "Dung", day: "monday"}, then: [{kind: "teacher_required_day", params: {teacher: "Sơn", day: "wednesday"}}].
- "Nếu Hiếu và Dung dạy thứ 3 tiết 2 thì Thủy không dạy thứ 5" -> if: {op: "and", args: [...]}, then: [{kind: "teacher_block_day", params: {teacher: "Thủy", day: "friday"}}].

Danh sách built-in kinds:
${builtInRef}

Quy tắc map built-in:
- Nếu người dùng liệt kê nhiều môn trong cùng một ràng buộc (ví dụ: "Toán, Văn"), PHẢI trả đủ một spec cho từng môn, không được bỏ sót môn nào.
- Nếu câu có thể diễn đạt bằng built-in -> trả về specs[] với kind và params chính xác.
- Nếu built-in KHÔNG đủ diễn đạt -> chuyển sang Bước 3.
- KHÔNG được trả "needs_clarification" / "điều kiện chưa xác định" cho câu if-then rõ ràng — PHẢI map sang if_then.

## Bước 3: Semantic/Custom (fallback chính thức)
Nếu built-in không đủ, trả về semantic representation:
- type: "if_then" cho ràng buộc điều kiện
- type: "all_of" cho tập hợp ràng buộc
- type: "unsupported_precise_text" nếu chỉ có thể diễn đạt bằng text

## Bước 4: Thiếu thông tin
Nếu câu thiếu entity quan trọng (giáo viên/lớp/môn/ngày/tiết không rõ), trả về:
- status: "needs_clarification"
- clarificationQuestions: danh sách câu hỏi tiếng Việt cụ thể

## Quy tắc chung
1. LUÔN trả về normalizedText tiếng Việt rõ ràng cho GUI hiển thị.
2. KHÔNG lặp lại cách hiểu cũ nếu user bấm "Phân tích lại" (previousAttempts).
3. Nếu status = "mapped_builtin" → specs[] PHẢI có ít nhất 1 phần tử.
4. Nếu status = "semantic_only" → semantic PHẢI có dữ liệu.
5. Nếu status = "needs_clarification" → clarificationQuestions PHẢI có ít nhất 1 câu hỏi.
6. Nếu status = "unsupported" → normalizedText PHẢI giải thích lý do.
7. Confidence: "high" nếu chắc chắn, "medium" nếu có thể đúng, "low" nếu không chắc.
8. CHỈ phân tích 1 câu ràng buộc, KHÔNG phân tích nhiều câu.

${contextBlock}

## Output JSON Schema
{
  "status": "mapped_builtin" | "semantic_only" | "needs_clarification" | "unsupported",
  "normalizedText": "Câu tiếng Việt chuẩn hóa cho GUI",
  "specs": [{ "kind": "built_in_kind", "params": { ... } }],
  "semantic": { "type": "if_then|all_of|unsupported_precise_text", ... },
  "confidence": "high" | "medium" | "low",
  "clarificationQuestions": ["Câu hỏi 1?", "Câu hỏi 2?"],
  "assumptions": ["Giả định 1", "Giả định 2"],
  "unresolvedQuestions": ["Vấn đề chưa giải quyết"]
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
  }
): Promise<AnalyzeConstraintResult> {
  const systemPrompt = buildSystemPrompt(agentInput);

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
    const response = await invokeAnalyzeChat(config, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ]);
    const content = response.content;

    if (!content?.trim()) {
      return {
        status: 'needs_clarification',
        normalizedText: rawText,
        specs: [],
        confidence: 'low',
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
    const specs: ConstraintSpec[] = (validated.specs ?? []).map((s, i) => ({
      id: `ai_spec_${i}`,
      original: rawText,
      severity: constraintType === 'required' ? 'hard' : 'soft',
      kind: (s.kind as ConstraintKind) || 'custom_dsl',
      params: s.params || {},
      weight: constraintType === 'preferred' ? weight : undefined,
    }));

    // Fallback safety net: nếu LLM không map được built-in mà deterministic parser
    // tìm ra built-in hợp lệ, dùng kết quả deterministic thay vì để user kẹt.
    let resolvedStatus: AnalyzeConstraintStatus = validated.status;
    let resolvedSpecs = specs;
    let resolvedConfidence: 'high' | 'medium' | 'low' = validated.confidence;
    let resolvedNormalizedText = validated.normalizedText;
    if (specs.length === 0 || validated.status !== 'mapped_builtin' || subjectCoverageMissing(rawText, specs, agentInput).length > 0) {
      const deterministic = mergedDeterministicFallbackSpecs(rawText, constraintType, weight, agentInput);
      if (deterministic.length > 0) {
        resolvedStatus = 'mapped_builtin';
        resolvedSpecs = deterministic;
        resolvedConfidence = 'high';
        resolvedNormalizedText = deterministic.map((s) => humanizeConstraintSpec(s)).join('\n');
      }
    }

    return {
      status: resolvedStatus,
      normalizedText: resolvedNormalizedText,
      specs: resolvedSpecs,
      semantic: validated.semantic as SemanticConstraint | undefined,
      confidence: resolvedConfidence,
      clarificationQuestions: validated.clarificationQuestions ?? [],
      assumptions: validated.assumptions ?? [],
      unresolvedQuestions: validated.unresolvedQuestions ?? [],
      rawResponse: content,
      usageTokens: response.usage?.total_tokens,
    };
  } catch (error) {
    console.error('Analyze constraint failed:', error);
    // Catch-path safety net: nếu LLM nổ nhưng deterministic parser vẫn ra
    // built-in hợp lệ, ưu tiên trả kết quả deterministic thay vì báo lỗi.
    const deterministic = mergedDeterministicFallbackSpecs(rawText, constraintType, weight, agentInput);
    if (deterministic.length > 0) {
      return {
        status: 'mapped_builtin',
        normalizedText: deterministic.map((s) => humanizeConstraintSpec(s)).join('\n'),
        specs: deterministic,
        confidence: 'high',
        clarificationQuestions: [],
        assumptions: [
          `AI phân tích lỗi nhưng rule parser nội bộ tìm được built-in hợp lệ. Lỗi gốc: ${
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
  if (result.status === 'mapped_builtin' && result.specs.length > 0) {
    return result.specs;
  }

  // For semantic_only, wrap in custom_dsl
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
