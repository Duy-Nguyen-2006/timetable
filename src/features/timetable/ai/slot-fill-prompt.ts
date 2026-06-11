/**
 * Slot-Fill Prompt (Section 6 + 15)
 *
 * Replaces the mega system prompt in analyze-constraint-service with:
 *  1. A small fixed system prompt (~15 lines) describing the slot-fill task.
 *  2. A dynamic user message that injects:
 *     - Resolved entities (Stage 1)
 *     - Top-k candidates (Stage 2)
 *     - Few-shot examples per candidate
 *     - Negative few-shots for disambiguation
 *
 * Total size: small fixed (~15 lines) + small dynamic (~5-10 kinds × ~5 lines each).
 * Compared to the old mega prompt (~80 kinds × few lines each), this is a
 * 60-80% reduction in token usage per call.
 */

import type { AgentInputPayload } from './types';
import type { ConstraintRetrieverCandidate, ConstraintResolverHints } from './constraint-retriever';
import { getConstraintMeta } from './constraint-registry';
import { buildTopKPromptSection } from './constraint-retriever';

export const SMALL_SYSTEM_PROMPT = `Bạn map MỘT atom ràng buộc tiếng Việt vào MỘT kind trong danh sách cung cấp.
Quy tắc:
- Chỉ chọn kind trong danh sách. Không có kind khớp → "custom" kèm IR.
- KHÔNG bịa giáo viên/lớp/môn ngoài entity đã resolve.
- CHỈ map; không tự suy số. Không thêm field ngoài schema của kind.
- "2 giáo viên không được cùng 1 tiết" → teacher_pair_not_same_slot (KHÔNG phải block tiết).
- Scope ngày/lớp đặt vào params.scope, áp cho toàn atom.
- Điều kiện đã hàm chứa trong ngữ nghĩa kind → KHÔNG bọc if_then thỡ.
Trả JSON đúng schema SlotFillResponse (atoms[].kind/params/confidence/missingParams).`;

/** Structured output schema for LLM Lượt-2. */
export type SlotFillAtom = {
  kind: string;
  params: Record<string, unknown>;
  confidence: 'high' | 'medium' | 'low';
  missingParams: string[];
};

export type SlotFillResponse = {
  atoms: SlotFillAtom[];
  /** If shape=if_then, condition is separate */
  condition?: {
    op: string;
    teachers?: string[];
    teacher?: string;
    day?: string;
    period?: number;
  };
};

/** JSON Schema for structured output validation */
export const SLOT_FILL_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    atoms: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string' },
          params: { type: 'object' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          missingParams: { type: 'array', items: { type: 'string' } },
        },
        required: ['kind', 'params', 'confidence'],
      },
    },
    condition: {
      type: 'object',
      properties: {
        op: { type: 'string' },
        teachers: { type: 'array', items: { type: 'string' } },
        teacher: { type: 'string' },
        day: { type: 'string' },
        period: { type: 'number' },
      },
    },
  },
  required: ['atoms'],
} as const;

/** Build the dynamic user message with resolved entities + top-k candidates. */
export function buildSlotFillUserMessage(
  rawText: string,
  hints: ConstraintResolverHints,
  candidates: ConstraintRetrieverCandidate[]
): string {
  const lines: string[] = [];
  lines.push(`## Câu ràng buộc gốc`);
  lines.push(`"${rawText}"`);
  lines.push(``);
  lines.push(`## Hints trích bằng code (Stage 1 — đã resolve)`);
  lines.push(`- normalized: ${hints.normalizedText}`);
  if (hints.resolvedTeachers.length > 0) {
    lines.push(`- giáo viên resolved: ${hints.resolvedTeachers.join(', ')}`);
  }
  if (hints.resolvedSubjects.length > 0) {
    lines.push(`- môn resolved: ${hints.resolvedSubjects.join(', ')}`);
  }
  if (hints.resolvedClasses.length > 0) {
    lines.push(`- lớp resolved: ${hints.resolvedClasses.join(', ')}`);
  }
  if (hints.extractedNumber !== null) {
    lines.push(`- số trích được: ${hints.extractedNumber}`);
  }
  if (hints.extractedPeriods.length > 0) {
    lines.push(`- tiết trích được: ${hints.extractedPeriods.join(', ')}`);
  }
  if (hints.extractedDays.length > 0) {
    lines.push(`- ngày trích được: ${hints.extractedDays.join(', ')}`);
  }
  if (hints.inferredScope) {
    lines.push(`- scope gợi ý: ${hints.inferredScope}`);
  }
  lines.push(`- keywords: ${[
    hints.mentionsBlock ? 'block' : '',
    hints.mentionsMax ? 'max' : '',
    hints.mentionsMin ? 'min' : '',
    hints.mentionsConsecutive ? 'consecutive' : '',
    hints.mentionsOnly ? 'only' : '',
    hints.mentionsPreferred ? 'preferred' : '',
    hints.mentionsIfThen ? 'if-then' : '',
  ].filter(Boolean).join(', ') || '(không có)'}`);
  lines.push(``);
  lines.push(`## Top-k ứng viên (Stage 2 — retriever)`);
  lines.push(buildTopKPromptSection(candidates, hints.inferredScope));
  lines.push(``);
  lines.push(`## Lưu ý cuối cùng`);
  lines.push(`- Nếu câu có 2 môn trở lên (vd "Toán và Văn"), PHẢI trả đủ một spec cho từng môn.`);
  lines.push(`- Nếu câu có "1 người" / "ngày bất kỳ" / "cùng ngày" mà chưa rõ áp dụng cho ai → trả "clarify".`);
  lines.push(`- Nếu câu if-then → trả kind: "if_then" với params.if và params.then[] (KHÔNG trả needs_clarification).`);

  // Add mandatory few-shot examples (§4.3)
  lines.push(``);
  lines.push(`## Few-shot bắt buộc`);
  lines.push(``);
  lines.push(`# FS1 — If-then đa atom`);
  lines.push(`Input: "Nếu cô A dạy thứ 3 tiết 4 thì thứ 5 thầy B không dạy tiết 2 và thầy C phải dạy thứ 2"`);
  lines.push(`Output: {`);
  lines.push(`  "condition": {"op":"teacher_teaches_at_slot","teacher":"A","day":"thu3","period":4},`);
  lines.push(`  "atoms":[`);
  lines.push(`    {"kind":"teacher_block_slot","params":{"teacher":"B","day":"thu5","period":2},"confidence":"high","missingParams":[]},`);
  lines.push(`    {"kind":"teacher_required_day","params":{"teacher":"C","day":"thu2"},"confidence":"high","missingParams":[]}`);
  lines.push(`  ]}`);
  lines.push(``);
  lines.push(`# FS2 — Bẫy minh hoạ (PHẢI bỏ "tiết 2")`);
  lines.push(`Input: "Vào thứ 6, nếu Thúy và Yên đều có tiết dạy thì họ không được cùng 1 tiết, ví dụ cùng tiết 2"`);
  lines.push(`Output: {`);
  lines.push(`  "atoms":[`);
  lines.push(`    {"kind":"teacher_pair_not_same_slot",`);
  lines.push(`     "params":{"teachers":["Thúy","Yên"],"scope":{"day":"thu6"}},`);
  lines.push(`     "confidence":"high","missingParams":[]}`);
  lines.push(`  ]}`);
  lines.push(`# Lưu ý: KHÔNG có field period. "tiết 2" là minh hoạ.`);
  lines.push(``);
  lines.push(`# FS3 — Phủ định + typo`);
  lines.push(`Input: "thầy Sơn khogn day thu 3 tiet 5"`);
  lines.push(`Output: {`);
  lines.push(`  "atoms":[`);
  lines.push(`    {"kind":"teacher_block_slot","params":{"teacher":"Sơn","day":"thu3","period":5},"confidence":"high","missingParams":[]}`);
  lines.push(`  ]}`);

  return lines.join('\n');
}

/** Build the full prompt pair (system + user) for slot-fill. */
export function buildSlotFillPrompt(
  rawText: string,
  hints: ConstraintResolverHints,
  candidates: ConstraintRetrieverCandidate[],
  options?: { previousAttempts?: Array<{ displayText: string; source: string; confidence: string }> }
): { system: string; user: string } {
  const user = buildSlotFillUserMessage(rawText, hints, candidates);
  if (options?.previousAttempts?.length) {
    return {
      system: SMALL_SYSTEM_PROMPT,
      user: user + `\n\n## Lưu ý: KHÔNG lặp lại các cách hiểu sau\n` + options.previousAttempts.map((a) => `- "${a.displayText}" (${a.source}, ${a.confidence})`).join('\n'),
    };
  }
  return { system: SMALL_SYSTEM_PROMPT, user };
}
