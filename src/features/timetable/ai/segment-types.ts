/**
 * segment-types.ts — Segment DTO (output of LLM Lượt-1)
 *
 * The LLM normalizes + segments the raw Vietnamese constraint text.
 * This is the FIRST stage where illustration spans are dropped.
 */

export type ConstraintSegment = {
  /** Câu đã chuẩn hoá ngữ pháp/chính tả (tiếng Việt sạch). */
  normalizedVi: string;
  
  /** Scope áp cho toàn bộ ràng buộc (nếu có). */
  scope?: { day?: string; class?: string };
  
  /** Cấu trúc logic. */
  shape: 'simple' | 'if_then';
  
  /** Vế điều kiện (chỉ khi shape='if_then'). Văn bản thô, chưa map kind. */
  ifClause?: string;
  
  /** Danh sách atom (vế THEN, hoặc 1 atom cho simple). Đã tách theo "và". */
  atoms: string[];
  
  /** Các cụm đã bị loại vì là minh hoạ ("ví dụ…"). Lưu để audit/clarify. */
  droppedIllustrations: string[];
};
