import type { AgentInputPayload } from './types';
import type { ConstraintSpec } from './constraint-spec';
import { CONSTRAINT_REGISTRY, SOLVER_ENCODABLE_KINDS, getConstraintMeta } from './constraint-registry';
import { buildClarificationQuestions } from './constraint-clarification';
import { humanizeDraft } from './constraint-humanizer';
import { matchTeacherLabels, normalizeConstraintText, splitThenClause } from './translator-text';
import type {
  ConstraintParseIssue,
  ConstraintParseStatus,
  ParsedConstraintDraft,
} from './constraint-review-types';

const ROOM_KEYWORDS =
  /\b(phong hoc|phong bo mon|suc chua phong|phong a|phong b|room)\b/u;

export function isRoomConstraintText(text: string): boolean {
  const normalized = normalizeConstraintText(text);
  return ROOM_KEYWORDS.test(normalized) || /\bphong\s+[a-z0-9]/iu.test(text);
}

function collectEntityLabels(input: AgentInputPayload): {
  teachers: string[];
  subjects: string[];
  classes: string[];
} {
  const teachers = new Set<string>();
  const subjects = new Set<string>();
  const classes = new Set<string>();
  for (const a of input.assignments) {
    teachers.add(a.teacher.label);
    subjects.add(a.subject.label);
    classes.add(a.class.label);
  }
  return {
    teachers: [...teachers],
    subjects: [...subjects],
    classes: [...classes],
  };
}

function matchEntity(
  value: string,
  pool: string[]
): { kind: 'ok' } | { kind: 'unknown' } | { kind: 'ambiguous'; candidates: string[] } {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '__all__' || trimmed === 'all') return { kind: 'ok' };
  if (pool.includes(trimmed)) return { kind: 'ok' };
  const lower = trimmed.toLocaleLowerCase('vi');
  const candidates = pool.filter(
    (p) => p.toLocaleLowerCase('vi').includes(lower) || lower.includes(p.toLocaleLowerCase('vi'))
  );
  if (candidates.length === 1) return { kind: 'ok' };
  if (candidates.length > 1) return { kind: 'ambiguous', candidates };
  return { kind: 'unknown' };
}

function validateSpecEntities(
  spec: ConstraintSpec,
  entities: ReturnType<typeof collectEntityLabels>
): ConstraintParseIssue[] {
  const issues: ConstraintParseIssue[] = [];
  const checks: Array<{ field: string; value: unknown; pool: string[]; label: string }> = [
    { field: 'teacher', value: spec.params.teacher, pool: entities.teachers, label: 'giáo viên' },
    { field: 'subject', value: spec.params.subject, pool: entities.subjects, label: 'môn' },
    { field: 'class', value: spec.params.class, pool: entities.classes, label: 'lớp' },
  ];
  for (const { field, value, pool, label } of checks) {
    if (typeof value !== 'string' || !value.trim()) continue;
    const result = matchEntity(value, pool);
    if (result.kind === 'unknown') {
      issues.push({
        code: 'unknown_entity',
        field,
        message: `Không tìm thấy ${label} “${value}” trong phân công.`,
      });
    } else if (result.kind === 'ambiguous') {
      issues.push({
        code: 'multiple_entity_matches',
        field,
        message: `“${value}” trùng nhiều ${label}.`,
        candidates: result.candidates,
      });
    }
  }
  return issues;
}

/** Detect when an if_then spec drops teacher entities that the user mentioned in the
 *  original THEN clause. Example: "Nếu A và B dạy X thì C, D, E không dạy Y" — if the
 *  spec only contains 1 then entry while the user listed 3 teachers, flag entity loss. */
function detectIfThenEntityLoss(
  spec: ConstraintSpec,
  originalText: string,
  input: AgentInputPayload
): ConstraintParseIssue | null {
  if (spec.kind !== 'if_then') return null;
  if (!/(nếu|neu)/iu.test(originalText) || !/(thì|thi)/iu.test(originalText)) return null;

  const thenClauseRaw = originalText.split(/thì|thi/iu)[1] ?? '';
  if (!thenClauseRaw) return null;
  const entities = collectEntityLabels(input);

  // Collect teachers actually captured in spec.then (across all entries).
  const capturedThenTeachers = new Set<string>();
  const thenList = Array.isArray(spec.params.then) ? (spec.params.then as ConstraintSpec[]) : [];
  for (const entry of thenList) {
    const t = entry?.params?.teacher;
    if (typeof t === 'string' && t.trim()) capturedThenTeachers.add(t.trim());
  }

  // Use union of THEN sub-clause teachers so we never miss a comma-separated mention.
  const mentionedThenTeachers = new Set<string>();
  for (const sub of splitThenClause(thenClauseRaw)) {
    for (const t of matchTeacherLabels(sub, entities.teachers)) mentionedThenTeachers.add(t);
  }
  if (mentionedThenTeachers.size === 0) return null;

  const lost = [...mentionedThenTeachers].filter((t) => !capturedThenTeachers.has(t));
  if (lost.length === 0) return null;

  return {
    code: 'possible_entity_loss',
    field: 'then',
    message: `Có thể thiếu giáo viên trong phần THEN — câu gốc nhắc đến ${lost.length} giáo viên (${lost.join(', ')}) mà hệ thống chưa ghi nhận.`,
    candidates: lost,
  };
}

function validateSpecShape(spec: ConstraintSpec): ConstraintParseIssue[] {
  const issues: ConstraintParseIssue[] = [];
  const meta = getConstraintMeta(spec.kind);
  if (!meta) {
    issues.push({ code: 'unsupported_kind', message: `Loại ràng buộc không hỗ trợ: ${spec.kind}.` });
    return issues;
  }
  for (const key of meta.requiredParams) {
    const val = spec.params[key];
    if (val === undefined || val === null || val === '') {
      issues.push({
        code: 'missing_required_param',
        field: key,
        message: `Thiếu tham số bắt buộc “${key}”.`,
      });
    }
  }
  if (spec.severity === 'hard' && !SOLVER_ENCODABLE_KINDS.has(spec.kind)) {
    issues.push({
      code: 'hard_unchecked',
      message: `Ràng buộc bắt buộc “${spec.kind}” chưa mã hoá được vào solver.`,
    });
  }
  return issues;
}

export function validateConstraintSpecs(
  input: AgentInputPayload,
  specs: ConstraintSpec[],
  options?: {
    rawText?: string;
    source?: 'rule' | 'translator' | 'manual' | 'template' | 'ai_reparse';
    confidence?: 'high' | 'medium' | 'low';
  }
): {
  issues: ConstraintParseIssue[];
  status: ConstraintParseStatus;
  confidence?: 'high' | 'medium' | 'low';
  clarificationQuestions?: Array<{ id: string; prompt: string; options: string[] }>;
} {
  const rawText = options?.rawText ?? specs[0]?.original ?? '';
  if (isRoomConstraintText(rawText)) {
    return {
      status: 'ignored',
      issues: [
        {
          code: 'room_constraint_ignored',
          message: 'Ràng buộc phòng học được bỏ qua theo phạm vi sản phẩm.',
        },
      ],
    };
  }

  const issues: ConstraintParseIssue[] = [];
  const entities = collectEntityLabels(input);

  if (!specs.length) {
    return {
      status: 'unparsed',
      issues: [{ code: 'low_confidence', message: 'Không tạo được ràng buộc có cấu trúc.' }],
      confidence: 'low',
    };
  }

  let recomputedConfidence = options?.confidence;
  for (const spec of specs) {
    issues.push(...validateSpecShape(spec));
    issues.push(...validateSpecEntities(spec, entities));
    const loss = detectIfThenEntityLoss(spec, rawText, input);
    if (loss) {
      issues.push(loss);
      recomputedConfidence = 'low';
    }
  }

  const hasHardUnchecked = issues.some((i) => i.code === 'hard_unchecked');
  const hasCustomDslHard = specs.some((s) => s.kind === 'custom_dsl' && s.severity === 'hard');
  const hasEntityProblem = issues.some(
    (i) => i.code === 'unknown_entity' || i.code === 'multiple_entity_matches'
  );
  const hasMissing = issues.some((i) => i.code === 'missing_required_param');
  const hasEntityLoss = issues.some((i) => i.code === 'possible_entity_loss');

  if (hasCustomDslHard || hasHardUnchecked) {
    return { status: 'unsupported', issues, confidence: recomputedConfidence };
  }
  if (hasEntityProblem) {
    return { status: 'ambiguous', issues, confidence: recomputedConfidence };
  }
  if (hasMissing) {
    return { status: 'needs_review', issues, confidence: recomputedConfidence };
  }
  if (recomputedConfidence === 'low' || hasEntityLoss) {
    if (!hasEntityLoss) {
      issues.push({ code: 'low_confidence', message: 'Độ tin cậy phân tích thấp.' });
    }
    return { status: 'needs_review', issues, confidence: 'low' };
  }
  if (options?.source === 'translator') {
    issues.push({ code: 'llm_fallback_used', message: 'Đã dùng mô hình dịch ràng buộc.' });
    return { status: 'needs_review', issues, confidence: recomputedConfidence };
  }
  if (options?.source === 'ai_reparse') {
    return { status: 'parsed', issues, confidence: recomputedConfidence ?? 'high' };
  }

  const needsClarification =
    hasCustomDslHard ||
    specs.some((s) => s.kind === 'custom_dsl');

  if (needsClarification) {
    issues.push({
      code: 'needs_user_clarification',
      message: 'Hệ thống cần bạn làm rõ ý nghĩa trước khi duyệt.',
    });
    return {
      status: 'needs_review',
      issues,
      confidence: recomputedConfidence,
      clarificationQuestions: buildClarificationQuestions(rawText),
    };
  }

  return { status: 'parsed', issues, confidence: recomputedConfidence };
}

export function buildDraftFromSpecs(
  draftId: string,
  raw: { id: string; text: string; type: 'required' | 'preferred' },
  specs: ConstraintSpec[],
  input: AgentInputPayload,
  meta: {
    source: ParsedConstraintDraft['source'];
    confidence: ParsedConstraintDraft['confidence'];
    explanation?: string;
  }
): ParsedConstraintDraft {
  const { issues, status, confidence: recomputedConfidence } = validateConstraintSpecs(input, specs, {
    rawText: raw.text,
    source: meta.source,
    confidence: meta.confidence,
  });
  const clarificationQuestions =
    status === 'needs_review' ? buildClarificationQuestions(raw.text) : undefined;

  const draftSummary = humanizeDraft({
    id: draftId,
    rawConstraintId: raw.id,
    original: raw.text,
    proposedSpecs: specs,
    status,
    confidence: recomputedConfidence ?? meta.confidence,
    explanation: meta.explanation ?? '',
    issues,
    source: meta.source,
  });

  return {
    id: draftId,
    rawConstraintId: raw.id,
    original: raw.text,
    proposedSpecs: specs,
    status,
    confidence: recomputedConfidence ?? meta.confidence,
    explanation: meta.explanation ?? '',
    issues,
    clarificationQuestions,
    source: meta.source,
    displayText: draftSummary,
  };
}

export function isKnownConstraintKind(kind: string): boolean {
  return CONSTRAINT_REGISTRY.some((m) => m.kind === kind);
}
