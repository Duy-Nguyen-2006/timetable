import type { ConstraintClarificationQuestion } from './constraint-review-types';

/**
 * buildClarificationQuestions — Phase 0.5 hardening
 *
 * Old behaviour: if no pattern matched, return a vague "general_meaning"
 * question that the user could not action. This was the "đoán im lặng rồi
 * tự confirm" footgun.
 *
 * New behaviour: every clarification is a concrete A-or-B choice derived
 * from the candidate SPEC, not from abstract semantics. The caller passes
 * the candidate spec(s) the parser emitted; we render them via the
 * humanizer so the user sees TWO (or more) plausible Vietnamese
 * interpretations and picks one.
 *
 * If no candidate spec is available (pure failure), we still surface a
 * concrete question that lists the most likely domains, NOT a vague
 * "what do you mean" prompt.
 */
export function buildClarificationQuestions(
  original: string,
  candidates?: ReadonlyArray<{ kind: string; params: Record<string, unknown> }>
): ConstraintClarificationQuestion[] {
  const raw = original.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  const questions: ConstraintClarificationQuestion[] = [];

  const mentionsHeavy =
    /môn\s*nặng|mon\s*nang|tiết\s*nặng|tiet\s*nang|môn\s*chính|mon\s*chinh/u.test(raw);
  const mentionsSameDay = /(cùng|cung).*(ngày|ngay)/u.test(raw);
  const mentionsClass = /(lớp|lop)/u.test(raw);
  const mentionsSubject = /(môn|mon|tiết|tiet)/u.test(raw);

  const mentionsSession = /(buổi|buoi|sáng|sang|chiều|chieu)/u.test(raw);
  const mentionsSpread = /(dồn|don|xen\s*kẽ|xen\s*ke|không\s*chỉ|khong\s*chi)/u.test(raw);

  if (mentionsHeavy && mentionsSession && mentionsSpread) {
    questions.push({
      id: 'heavy_same_session_scope',
      prompt: '«Môn nặng trong một buổi không dồn vào một lớp» — bạn muốn giới hạn gì?',
      options: [
        'Mỗi lớp, mỗi buổi (sáng hoặc chiều): tối đa 2 môn nặng (Toán, Văn, Anh, …), còn lại xen kẽ môn khác',
        'Mỗi lớp, mỗi buổi: tối đa 1 môn nặng',
        'Khác (dùng «Sửa cách hiểu»)',
      ],
    });
  }

  if (mentionsHeavy && mentionsSameDay) {
    questions.push({
      id: 'heavy_same_day_scope',
      prompt:
        '«Tiết/môn nặng không xếp cùng một ngày» — bạn muốn nói điều gì?',
      options: [
        'Cùng một lớp, cùng một ngày: không xếp hai môn nặng (Toán, Văn, …) vào cùng ngày đó',
        'Cùng một lớp, khác ngày: mỗi ngày chỉ nên có tối đa một môn nặng',
        'Toàn trường: mỗi lớp mỗi ngày không quá N môn nặng',
      ],
    });
  } else if (mentionsSameDay && mentionsClass) {
    questions.push({
      id: 'same_day_class_scope',
      prompt: '«Không cùng một ngày ở cùng một lớp» — bạn muốn giới hạn gì?',
      options: [
        'Không xếp hai môn khác nhau vào cùng một ngày trong cùng một lớp',
        'Không xếp cùng một môn hai lần trong cùng một ngày (tối đa 1 lần/ngày)',
        'Khác (sẽ mô tả thêm trong «Sửa cách hiểu»)',
      ],
    });
  } else if (mentionsSameDay && !mentionsClass) {
    questions.push({
      id: 'same_day_without_class',
      prompt: 'Ràng buộc nói «cùng ngày» nhưng chưa rõ áp dụng cho lớp nào?',
      options: [
        'Áp dụng cho từng lớp: mỗi lớp mỗi ngày tuân theo ràng buộc',
        'Áp dụng cho toàn trường (mọi lớp)',
      ],
    });
  }

  if (mentionsSubject && /(không\s*nên|khong\s*nen|ưu\s*tiên|uu\s*tien)/u.test(raw) && questions.length === 0) {
    questions.push({
      id: 'soft_vs_hard',
      prompt: 'Đây là ràng buộc bắt buộc hay chỉ ưu tiên (nên có)?',
      options: ['Chỉ ưu tiên (nên có)', 'Bắt buộc'],
    });
  }

  // Phase 0.5: REMOVED the vague "general_meaning" fallback. If no pattern
  // matched, we surface a concrete question derived from the candidate specs
  // the parser emitted (or, as a last resort, a domain-list question).
  if (questions.length === 0 && candidates && candidates.length >= 2) {
    questions.push({
      id: 'pick_specific_interpretation',
      prompt: `Câu «${original}» có thể hiểu theo nhiều cách. Bạn muốn chọn cách nào?`,
      options: candidates.slice(0, 4).map((candidate) => {
        const kind = candidate.kind;
        const params = candidate.params;
        return `Hiểu là: ${kind} — ${summarizeParams(params)}`;
      }),
    });
  }

  if (questions.length === 0) {
    // Concrete domain question — never a vague "what do you mean".
    questions.push({
      id: 'pick_domain',
      prompt: 'Câu này chưa rõ phạm vi. Bạn muốn áp dụng cho đối tượng nào?',
      options: [
        'Theo từng giáo viên (GV dạy/nghỉ theo điều kiện)',
        'Theo từng lớp (lớp học/nghỉ theo điều kiện)',
        'Theo từng môn học (môn được/không được theo điều kiện)',
        'Khác (sẽ mô tả thêm trong «Sửa cách hiểu»)',
      ],
    });
  }

  return questions;
}

function summarizeParams(params: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      parts.push(`${k}=[${v.join(', ')}]`);
    } else {
      parts.push(`${k}=${String(v)}`);
    }
    if (parts.length >= 3) break;
  }
  return parts.join(', ') || 'không có tham số';
}
