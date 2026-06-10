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

export const SMALL_SYSTEM_PROMPT = `Bạn map MỘT câu ràng buộc tiếng Việt vào MỘT trong các kind được cung cấp.
Chỉ chọn từ danh sách kind dưới đây. Nếu không kind nào khớp → trả "custom" kèm IR.
KHÔNG bịa giáo viên/lớp/môn ngoài entity đã resolve.
Dùng các "extracted hints" cho param; chỉ map, không tự suy số.
Output JSON: { kind | "custom", params, confidence, missingParams[] }`;

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
