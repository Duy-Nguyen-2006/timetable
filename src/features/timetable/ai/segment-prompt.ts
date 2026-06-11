/**
 * segment-prompt.ts — LLM Lượt-1: Normalize + Segment
 *
 * The LLM's ONLY job at this stage:
 * 1) Fix grammar/typos, rewrite in clean Vietnamese (normalizedVi)
 * 2) Identify scope (day/class) if the sentence starts with "vào thứ…", "ở lớp…"
 * 3) Determine shape: 'if_then' if "nếu … thì …"; else 'simple'
 * 4) Split THEN-clause into atoms by "và"/"đồng thời"
 * 5) DROP illustration spans starting with "ví dụ", "chẳng hạn", "kiểu như", "như là"
 *    Put them in droppedIllustrations, NOT in atoms.
 *
 * CRITICAL: This stage does NOT map to ConstraintKind. That's Lượt-2's job.
 */

export const SEGMENT_SYSTEM_PROMPT = `Bạn là TIỀN XỬ LÝ ràng buộc thời khoá biểu tiếng Việt. KHÔNG map sang mã kỹ thuật.
Nhiệm vụ:
1) Sửa lỗi chính tả/ngữ pháp, viết lại câu thành tiếng Việt chuẩn (normalizedVi).
2) Xác định scope chung (ngày/lớp) nếu câu mở đầu bằng "vào thứ …", "ở lớp …".
3) Xác định shape: 'if_then' nếu có "nếu … thì …"; ngược lại 'simple'.
4) Tách vế THEN thành các atom theo "và"/"đồng thời". Mỗi atom là 1 ý ràng buộc.
5) LOẠI các cụm minh hoạ: bắt đầu bằng "ví dụ", "chẳng hạn", "kiểu như", "như là".
   Đưa chúng vào droppedIllustrations, KHÔNG để trong atoms.
Chỉ trả JSON đúng schema ConstraintSegment. Không giải thích.`;

export function buildSegmentPrompt(rawText: string, illustrationSpans?: string[]): { system: string; user: string } {
  const illustrationNote = illustrationSpans?.length
    ? `\n\nLưu ý: các cụm sau đây được đánh dấu là minh hoạ — hãy loại chúng vào droppedIllustrations: ${illustrationSpans.map(s => `"${s}"`).join(', ')}`
    : '';
  
  return {
    system: SEGMENT_SYSTEM_PROMPT,
    user: `## Câu ràng buộc cần tiền xử lý\n"${rawText}"${illustrationNote}\n\nTrả JSON đúng schema ConstraintSegment.`,
  };
}
