import type { ConstraintKind } from './constraint-spec';
import type { ClarificationOption } from './constraint-clarification-types';
import type { ConstraintClarificationQuestion } from './constraint-review-types';
import { humanizeConstraintSpec } from './constraint-humanizer';
import { mentionsIfThenMarker } from './semantic-direction';
import { normalizeConstraintText } from './translator-text';

export type ClarificationContext = {
  teachers?: string[];
  classes?: string[];
  subjects?: string[];
};

const ESCAPE_OPTION_ID = 'none_fit';

function option(
  id: string,
  labelVi: string,
  extra?: Partial<ClarificationOption>
): ClarificationOption {
  return { id, labelVi, ...extra };
}

function withEscapeOptions(
  questions: ConstraintClarificationQuestion[]
): ConstraintClarificationQuestion[] {
  return questions.map((question) => ({
    ...question,
    allowFreeText: question.allowFreeText ?? true,
    options: [
      ...question.options,
      ...(question.options.some((o) => o.id === ESCAPE_OPTION_ID)
        ? []
        : [
            option('none_fit', 'Không cái nào đúng — để tôi nói rõ hơn'),
          ]),
    ],
  }));
}

function levenshteinDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, index) => index);
  for (let i = 1; i <= b.length; i += 1) {
    let previous = rows[0];
    rows[0] = i;
    for (let j = 1; j <= a.length; j += 1) {
      const temp = rows[j];
      rows[j] =
        b[i - 1] === a[j - 1] ? previous : Math.min(previous + 1, rows[j] + 1, rows[j - 1] + 1);
      previous = temp;
    }
  }
  return rows[a.length];
}

function extractNameTokens(text: string): string[] {
  const rawTokens = text.match(/[\p{L}][\p{L}\p{N}]*/gu) ?? [];
  const stopwords = new Set([
    'nếu', 'neu', 'thì', 'thi', 'và', 'va', 'cùng', 'cung', 'ngày', 'ngay', 'tiết', 'tiet',
    'dạy', 'day', 'không', 'khong', 'được', 'duoc', 'một', 'mot', 'người', 'nguoi', 'trong',
    'thứ', 'thu', 'cô', 'co', 'thầy', 'thay', 'giáo', 'giao', 'vien', 'lớp', 'lop', 'môn', 'mon',
  ]);
  return [...new Set(rawTokens.filter((token) => token.length >= 2 && !stopwords.has(token.toLowerCase())))];
}

function findNearMatchEntities(
  text: string,
  labels: string[]
): Array<{ typed: string; nearest: string }> {
  if (!labels.length) return [];
  const results: Array<{ typed: string; nearest: string }> = [];

  for (const token of extractNameTokens(text)) {
    const normalizedToken = normalizeConstraintText(token);
    if (!normalizedToken || normalizedToken.length < 2) continue;
    if (labels.includes(token)) continue;

    const spellingVariants = labels.filter(
      (label) => normalizeConstraintText(label) === normalizedToken && label !== token
    );
    if (spellingVariants.length === 1) {
      results.push({ typed: token, nearest: spellingVariants[0] });
      continue;
    }

    const fuzzyMatches = labels.filter((label) => {
      const firstToken = normalizeConstraintText(label).split(/\s+/u)[0];
      if (!firstToken || firstToken.length < 2) return false;
      const maxDistance = Math.max(firstToken.length, normalizedToken.length) <= 4 ? 1 : 2;
      return levenshteinDistance(normalizedToken, firstToken) <= maxDistance;
    });

    if (fuzzyMatches.length === 1) {
      results.push({ typed: token, nearest: fuzzyMatches[0] });
    }
  }

  return results.filter(
    (item, index, list) =>
      list.findIndex((other) => other.typed === item.typed && other.nearest === item.nearest) === index
  );
}

function buildEntityNearMatchQuestions(
  original: string,
  context?: ClarificationContext
): ConstraintClarificationQuestion[] {
  const questions: ConstraintClarificationQuestion[] = [];
  const checks: Array<{ kind: 'teacher' | 'class' | 'subject'; labels: string[] }> = [
    { kind: 'teacher', labels: context?.teachers ?? [] },
    { kind: 'class', labels: context?.classes ?? [] },
    { kind: 'subject', labels: context?.subjects ?? [] },
  ];

  for (const { kind, labels } of checks) {
    for (const match of findNearMatchEntities(original, labels)) {
      const entityLabel = kind === 'teacher' ? 'giáo viên' : kind === 'class' ? 'lớp' : 'môn học';
      questions.push({
        id: `near_match_${kind}_${match.typed}`,
        prompt: `Bạn gõ «${match.typed}» — danh sách ${entityLabel} gần nhất là «${match.nearest}».`,
        allowFreeText: true,
        options: [
          option(`use_${kind}_${match.nearest}`, `Dùng «${match.nearest}»`, {
            recommended: true,
            exampleVi: `Thay «${match.typed}» bằng «${match.nearest}» trong câu ràng buộc.`,
          }),
          option(`other_${kind}_${match.typed}`, 'Đây là tên khác', {
            exampleVi: 'Chọn tên đúng từ danh sách hoặc mô tả lại bằng lời của bạn.',
          }),
        ],
      });
    }
  }

  return questions;
}

function buildAtLeastOneVsBothQuestion(): ConstraintClarificationQuestion {
  return {
    id: 'at_least_one_vs_both',
    prompt: '«một người» nên hiểu thế nào?',
    allowFreeText: true,
    options: [
      option('at_least_one', 'Ít nhất một trong hai người không dạy (người còn lại vẫn được)', {
        recommended: true,
        exampleVi:
          'Ví dụ: nếu cả hai cùng dạy thứ 3 thì Hiếu dạy tiết 4, Thủy thì không (hoặc ngược lại).',
      }),
      option('both_blocked', 'Cả hai đều không dạy tiết 4 hôm đó', {
        exampleVi: 'Ví dụ: nếu cả hai cùng dạy thứ 3 thì không ai trong hai người dạy tiết 4.',
      }),
      option('specific_person', 'Chỉ một người cụ thể (chọn ở bước sửa)', {
        exampleVi: 'Ví dụ: chỉ Hiếu không được dạy tiết 4 khi cả hai cùng dạy.',
      }),
    ],
  };
}

/**
 * buildClarificationQuestions — suggest-first clarification
 *
 * Every clarification is a concrete choice with a recommended default,
 * everyday examples, and an escape option for free-text feedback.
 */
export function buildClarificationQuestions(
  original: string,
  candidates?: ReadonlyArray<{ kind: string; params: Record<string, unknown> }>,
  context?: ClarificationContext
): ConstraintClarificationQuestion[] {
  const raw = original.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  const questions: ConstraintClarificationQuestion[] = [];

  const entityQuestions = buildEntityNearMatchQuestions(original, context);
  questions.push(...entityQuestions);

  const mentionsIfThen = mentionsIfThenMarker(original);
  const mentionsOnePerson = /(một người|mot nguoi|một trong|mot trong|1 người|1 nguoi)/u.test(raw);
  if (mentionsIfThen && mentionsOnePerson) {
    questions.push(buildAtLeastOneVsBothQuestion());
    return withEscapeOptions(questions);
  }

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
        option(
          'max2_heavy',
          'Mỗi lớp, mỗi buổi (sáng hoặc chiều): tối đa 2 môn nặng (Toán, Văn, Anh, …), còn lại xen kẽ môn khác',
          { recommended: true }
        ),
        option('max1_heavy', 'Mỗi lớp, mỗi buổi: tối đa 1 môn nặng'),
        option('other_session', 'Khác (mô tả thêm bằng lời của bạn)'),
      ],
    });
  }

  if (mentionsHeavy && mentionsSameDay) {
    questions.push({
      id: 'heavy_same_day_scope',
      prompt: '«Tiết/môn nặng không xếp cùng một ngày» — bạn muốn nói điều gì?',
      options: [
        option(
          'no_two_heavy_same_day',
          'Cùng một lớp, cùng một ngày: không xếp hai môn nặng (Toán, Văn, …) vào cùng ngày đó',
          { recommended: true }
        ),
        option('max_one_heavy_per_day', 'Cùng một lớp, khác ngày: mỗi ngày chỉ nên có tối đa một môn nặng'),
        option('global_cap', 'Toàn trường: mỗi lớp mỗi ngày không quá N môn nặng'),
      ],
    });
  } else if (mentionsSameDay && mentionsClass) {
    questions.push({
      id: 'same_day_class_scope',
      prompt: '«Không cùng một ngày ở cùng một lớp» — bạn muốn giới hạn gì?',
      options: [
        option(
          'different_subjects_same_day',
          'Không xếp hai môn khác nhau vào cùng một ngày trong cùng một lớp',
          { recommended: true }
        ),
        option('same_subject_once', 'Không xếp cùng một môn hai lần trong cùng một ngày (tối đa 1 lần/ngày)'),
        option('other_same_day', 'Khác (mô tả thêm bằng lời của bạn)'),
      ],
    });
  } else if (mentionsSameDay && !mentionsClass) {
    questions.push({
      id: 'same_day_without_class',
      prompt: 'Ràng buộc nói «cùng ngày» nhưng chưa rõ áp dụng cho lớp nào?',
      options: [
        option('per_class', 'Áp dụng cho từng lớp: mỗi lớp mỗi ngày tuân theo ràng buộc', {
          recommended: true,
        }),
        option('whole_school', 'Áp dụng cho toàn trường (mọi lớp)'),
      ],
    });
  }

  if (mentionsSubject && /(không\s*nên|khong\s*nen|ưu\s*tiên|uu\s*tien)/u.test(raw) && questions.length === 0) {
    questions.push({
      id: 'soft_vs_hard',
      prompt: 'Đây là ràng buộc bắt buộc hay chỉ ưu tiên (nên có)?',
      options: [
        option('soft', 'Chỉ ưu tiên (nên có)', { recommended: true }),
        option('hard', 'Bắt buộc'),
      ],
    });
  }

  if (questions.length === 0 && candidates && candidates.length >= 2) {
    questions.push({
      id: 'pick_specific_interpretation',
      prompt: 'Câu này có thể hiểu theo nhiều cách. Bạn muốn chọn cách nào?',
      options: candidates.slice(0, 4).map((candidate, index) => {
        const spec = {
          id: `clarify_candidate_${index}`,
          original,
          severity: 'hard' as const,
          kind: candidate.kind as ConstraintKind,
          params: candidate.params,
        };
        return option(`candidate_${index}`, humanizeConstraintSpec(spec), {
          recommended: index === 0,
          specDraft: spec,
        });
      }),
    });
  }

  if (questions.length === 0) {
    questions.push({
      id: 'pick_domain',
      prompt: 'Câu này chưa rõ phạm vi. Bạn muốn áp dụng cho đối tượng nào?',
      options: [
        option('scope_teacher', 'Theo từng giáo viên (GV dạy/nghỉ theo điều kiện)', { recommended: true }),
        option('scope_class', 'Theo từng lớp (lớp học/nghỉ theo điều kiện)'),
        option('scope_subject', 'Theo từng môn học (môn được/không được theo điều kiện)'),
        option('scope_other', 'Khác (mô tả thêm bằng lời của bạn)'),
      ],
    });
  }

  return withEscapeOptions(questions);
}