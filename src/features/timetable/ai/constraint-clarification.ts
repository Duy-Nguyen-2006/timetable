import type { ConstraintClarificationQuestion } from './constraint-review-types';

/** Câu hỏi làm rõ khi parser/LLM chỉ hiểu một phần (custom_dsl, needs_review). */
export function buildClarificationQuestions(original: string): ConstraintClarificationQuestion[] {
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

  if (questions.length === 0) {
    questions.push({
      id: 'general_meaning',
      prompt: 'Hệ thống chưa chắc chắn cách hiểu câu này. Bạn muốn nhấn mạnh điều gì nhất?',
      options: [
        'Giới hạn theo từng lớp, từng ngày',
        'Giới hạn theo giáo viên / môn học',
        'Chỉ là gợi ý ưu tiên, không bắt buộc',
      ],
    });
  }

  return questions;
}
