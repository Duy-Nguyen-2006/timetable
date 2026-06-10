/**
 * Constraint Retriever — Retrieve-then-Fill Architecture (Stage 2)
 *
 * This module provides a lightweight, deterministic search over the constraint catalog.
 * It is the "Retrieve" step in the Retrieve-then-Fill pipeline:
 *   Stage 1 (Resolver): match entity + extract hints (code)
 *   Stage 2 (Retriever): top-k kinds in scope (this module)
 *   Stage 3 (Slot-fill): LLM picks from top-k + fills params (prompt)
 *
 * No LLM is called in this module. All search is lexical + precomputed embeddings.
 * Embeddings are precomputed offline (scripts/offline/compute-embeddings.ts) and
 * stored as static float arrays per kind.
 *
 * Design decisions:
 * - Embedding is lightweight: 384-dim vectors, cosine similarity in-memory.
 * - No vector DB; catalog is ~80 rows, fits in RAM.
 * - Lexical fast-path uses regex triggers before embedding.
 * - Retriever returns top-k candidates with schema + few-shot for the LLM prompt.
 */

import type { BuiltInConstraintScope, ConstraintKind } from './constraint-registry';
import { BUILT_IN_CONSTRAINT_DEFINITIONS, getConstraintMeta } from './constraint-registry';
import { normalizeConstraintText } from './translator-text';
import { analyzeSemanticDirection } from './semantic-direction';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ConstraintRetrieverCandidate = {
  kind: ConstraintKind;
  scope: BuiltInConstraintScope;
  /** Combined lexical/embedding score used by the ambiguity gate. */
  score?: number;
  /** Precomputed embedding vector (384-dim). null = purely lexical kind. */
  embedding: number[] | null;
  /** Regex patterns that trigger this kind (lexical fast-path). */
  triggers: RegExp[];
  /** Vietnamese synonyms / keywords for this kind. */
  synonyms: string[];
  /** Few-shot examples for the LLM prompt. */
  fewShots: ConstraintFewShot[];
  /** Negative few-shots: examples that look like this kind but map elsewhere. */
  negativeFewShots: ConstraintNegativeFewShot[];
  /** Required param names for validation. */
  requiredParams: string[];
};

export type ConstraintFewShot = {
  text: string;
  /** Resolved params — LLM sees only the text + schema, not the answer. */
  params: Record<string, unknown>;
};

/** Negative few-shot: example that LOOKS similar but is a different kind. */
export type ConstraintNegativeFewShot = {
  /** A user-style sentence that looks similar to the positive few-shots. */
  text: string;
  /** The kind that this sentence ACTUALLY maps to (so the LLM doesn't pick `kind`). */
  actuallyMapsTo: ConstraintKind;
  /** Short Vietnamese reason for the disambiguation. */
  reason: string;
};

/** Hints extracted by Stage 1 (Resolver). */
export type ConstraintResolverHints = {
  /** Normalized user text. */
  normalizedText: string;
  /** Entity resolved by Stage 1. */
  resolvedTeacher: string | null;
  resolvedTeachers: string[];
  resolvedSubject: string | null;
  resolvedSubjects: string[];
  resolvedClass: string | null;
  resolvedClasses: string[];
  /** Numeric hints extracted by code. */
  extractedNumber: number | null;
  extractedPeriods: number[];
  extractedDays: string[];
  /** Scope inferred from entity match. */
  inferredScope: BuiltInConstraintScope | null;
  /** Whether the text mentions specific constraint keywords. */
  mentionsBlock: boolean;
  mentionsMax: boolean;
  mentionsMin: boolean;
  mentionsConsecutive: boolean;
  mentionsOnly: boolean;
  mentionsPreferred: boolean;
  mentionsIfThen: boolean;
};

// ─── Expanded Catalog ─────────────────────────────────────────────────────────
// Each kind has: triggers (regex), synonyms (keyword list), fewShots, embedding.
// Embeddings are 384-dim vectors precomputed offline. Placeholder zeros are used
// here; run `scripts/offline/compute-embeddings.ts` to populate real vectors.

type CatalogEntry = Omit<ConstraintRetrieverCandidate, 'embedding'> & { embedding: number[] | null };
const SCOPE = {
  teacher: 'teacher' as BuiltInConstraintScope,
  subject: 'subject' as BuiltInConstraintScope,
  class: 'class' as BuiltInConstraintScope,
  assignment: 'assignment' as BuiltInConstraintScope,
  global: 'global' as BuiltInConstraintScope,
};

function e(v: number[] | null): number[] | null { return v; }

const CATALOG: CatalogEntry[] = [
  // ── TEACHER CONSTRAINTS ────────────────────────────────────────────────────
  {
    kind: 'teacher_block_day',
    scope: SCOPE.teacher,
    triggers: [
      /khong\s+day\s+th[uứ]\s*\d|ko\s+day\s+th[uứ]\s*\d|khong\s+day\s+thứ\s*\d|cấm\s+day\s+thứ|nghi\s+thứ/iu,
      /thầy\s+\S+\s+không?\s+dạy\s+thứ|thầy\s+\S+\s+ko\s*dạy\s+thứ|cô\s+\S+\s+không?\s+dạy\s+thứ|cô\s+\S+\s+ko\s*dạy\s+thứ/iu,
    ],
    synonyms: ['không dạy thứ', 'ko dạy thứ', 'nghỉ thứ', 'cấm dạy ngày', 'không dạy ngày', 'off thứ'],
    fewShots: [
      { text: 'Thầy Sơn không dạy thứ 2.', params: { teacher: 'Sơn', day: 'monday' } },
      { text: 'Cô Thúy nghỉ thứ 5.', params: { teacher: 'Thúy', day: 'friday' } },
    ],
    negativeFewShots: [],
    requiredParams: ['teacher', 'day'],
    embedding: e(null),
  },
  {
    kind: 'teacher_block_period',
    scope: SCOPE.teacher,
    triggers: [
      /khong\s+day\s+ti[ê]?t\s*\d|ko\s+day\s+ti[ê]?t\s*\d|không?\s*dạy\s+tiết\s*\d|cấm\s+dạy\s+tiết|nghi\s+tiết/iu,
      /thầy\s+\S+\s+không?\s+dạy\s+tiết|thầy\s+\S+\s+ko\s*dạy\s+tiết|cô\s+\S+\s+không?\s+dạy\s+tiết|cô\s+\S+\s+ko\s*dạy\s+tiết/iu,
      /đi\s+muộn\s+tiết|muộn\s+tiết\s*\d/i,
    ],
    synonyms: ['không dạy tiết', 'ko dạy tiết', 'nghỉ tiết', 'cấm dạy tiết', 'không dạy buổi sáng', 'off tiết', 'đi muộn'],
    fewShots: [
      { text: 'Thầy Sơn không dạy tiết 1.', params: { teacher: 'Sơn', period: 1 } },
      { text: 'Cô Thúy đi muộn tiết đầu.', params: { teacher: 'Thúy', period: 1 } },
    ],
    negativeFewShots: [
      { text: 'Thầy Sơn phải có tiết 1', actuallyMapsTo: 'teacher_required_period', reason: '"Phải có" là bắt buộc at-least, không phải block' },
      { text: 'Thầy Sơn chỉ dạy tiết 1', actuallyMapsTo: 'teacher_allowed_periods', reason: '"Chỉ dạy" là allowed-only, không phải block' },
    ],
    requiredParams: ['teacher', 'period'],
    embedding: e(null),
  },
  {
    kind: 'teacher_required_period',
    scope: SCOPE.teacher,
    triggers: [
      // Core "phải có" family — must NOT match "không dạy" or "chỉ dạy".
      /ph[ảa]i\s+c[óo]\s+(ít\s+nh[ấa]t\s+)?(1\s+)?ti[êe]?t\s*\d+/iu,
      /ph[ảa]i\s+d[ạa]y\s+(ít\s+nh[ấa]t\s+)?(1\s+)?ti[êe]?t\s*\d+/iu,
      /ph[ảa]i\s+đ[ượu][ợo]c\s+(x[ếe]p\s+)?(ít\s+nh[ấa]t\s+)?(1\s+)?ti[êe]?t\s*\d+/iu,
      // "cần có" / "cần dạy"
      /c[ầa]n\s+c[óo]\s+(ít\s+nh[ấa]t\s+)?(1\s+)?ti[êe]?t\s*\d+/iu,
      /c[ầa]n\s+d[ạa]y\s+(ít\s+nh[ấa]t\s+)?(1\s+)?ti[êe]?t\s*\d+/iu,
      // "ít nhất N tiết" / "tối thiểu N tiết"
      /[íi]t\s+nh[ấa]t\s+\d+\s+ti[êe]?t\s*\d+/iu,
      /t[ốo]i\s+thi[ểe]u\s+\d+\s+ti[êe]?t\s*\d+/iu,
      // "bắt buộc có/dạy"
      /b[ắa]t\s+bu[ộo]c\s+(c[óo]|d[ạa]y)\s+(ít\s+nh[ấa]t\s+)?(1\s+)?ti[êe]?t\s*\d+/iu,
      // Subject prefix: "thầy X phải có" / "cô X phải có"
      /(th[ầa]y|c[ôo])\s+\S+\s+ph[ảa]i\s+c[óo]\s+(ít\s+nh[ấa]t\s+)?ti[êe]?t\s*\d+/iu,
      /(th[ầa]y|c[ôo])\s+\S+\s+c[ầa]n\s+c[óo]\s+ti[êe]?t/iu,
      /(th[ầa]y|c[ôo])\s+\S+\s+b[ắa]t\s+bu[ộo]c\s+(c[óo]|d[ạa]y)\s+ti[êe]?t/iu,
      // Generic "có tiết N" (when context is require)
      /ph[ảa]i\s+c[óo]\s+m[ộo]t\s+ti[êe]?t\s*\d+/iu,
      // "nhất định phải" idiom
      /nh[ấa]t\s+đ[ịi]nh\s+ph[ảa]i\s+(c[óo]|d[ạa]y)\s+ti[êe]?t/iu,
    ],
    synonyms: [
      'phải có tiết',
      'cần có tiết',
      'cần dạy tiết',
      'ít nhất một tiết',
      'bắt buộc có tiết',
      'bắt buộc dạy tiết',
      'phải dạy tiết',
      'phải được xếp tiết',
      'tối thiểu tiết',
      'nhất định phải có tiết',
    ],
    fewShots: [
      { text: 'Cô Thủy phải có tiết 4', params: { teacher: 'Thủy', period: 4, minCount: 1 } },
      { text: 'Thầy Sơn cần có tiết 1', params: { teacher: 'Sơn', period: 1, minCount: 1 } },
      { text: 'Cô Thủy có ít nhất 1 tiết 4 trong tuần', params: { teacher: 'Thủy', period: 4, minCount: 1 } },
      { text: 'Bắt buộc cô Thủy có tiết 4', params: { teacher: 'Thủy', period: 4, minCount: 1 } },
      { text: 'Cô Thủy phải được xếp ít nhất một tiết 4', params: { teacher: 'Thủy', period: 4, minCount: 1 } },
      { text: 'Cô Hương tối thiểu 2 tiết 5 trong tuần', params: { teacher: 'Hương', period: 5, minCount: 2 } },
    ],
    negativeFewShots: [
      { text: 'Cô Thủy không dạy tiết 4', actuallyMapsTo: 'teacher_block_period', reason: '"Không dạy" là block/cấm, không phải require' },
      { text: 'Cô Thủy nghỉ tiết 4', actuallyMapsTo: 'teacher_block_period', reason: '"Nghỉ" là block, không phải at-least require' },
      { text: 'Cô Thủy chỉ dạy tiết 4', actuallyMapsTo: 'teacher_allowed_periods', reason: '"Chỉ dạy" là allowed-only (whitelist), không phải at-least' },
      { text: 'Cô Thủy chỉ được dạy tiết 4', actuallyMapsTo: 'teacher_allowed_periods', reason: '"Chỉ được dạy" là whitelist, không phải at-least' },
      { text: 'Cô Thủy nên dạy tiết 4', actuallyMapsTo: 'teacher_preferred_periods', reason: '"Nên" là preference/soft, không phải hard require' },
      { text: 'Cô Thủy ưu tiên tiết 4', actuallyMapsTo: 'teacher_preferred_periods', reason: '"Ưu tiên" là preference/soft, không phải hard require' },
      { text: 'Cô Thủy thích dạy tiết 4', actuallyMapsTo: 'teacher_preferred_periods', reason: '"Thích" là preference/soft, không phải hard require' },
      { text: 'Cô Thủy dạy tối đa 4 tiết mỗi ngày', actuallyMapsTo: 'teacher_max_per_day', reason: '"Tối đa" là max-per-day, không phải at-least' },
    ],
    requiredParams: ['teacher', 'period', 'minCount'],
    embedding: e(null),
  },
  {
    kind: 'teacher_block_slot',
    scope: SCOPE.teacher,
    triggers: [
      /khong\s+day\s+th[uứ]\s*\d\s+ti[ê]?t\s*\d|ko\s+day\s+th[uứ]\s*\d\s+ti[ê]?t\s*\d/iu,
      /thầy\s+\S+\s+không?\s+dạy\s+thứ\s+\d+\s+tiết\s*\d|thầy\s+\S+\s+ko\s*dạy\s+thứ\s+\d+\s+tiết/iu,
    ],
    synonyms: ['không dạy thứ N tiết M', 'ko dạy ngày tiết', 'cấm dạy slot'],
    fewShots: [
      { text: 'Thầy Sơn không dạy thứ 2 tiết 1.', params: { teacher: 'Sơn', day: 'monday', period: 1 } },
    ],
    negativeFewShots: [],
    requiredParams: ['teacher', 'day', 'period'],
    embedding: e(null),
  },
  {
    kind: 'teacher_max_per_day',
    scope: SCOPE.teacher,
    triggers: [
      /t[ốo]i\s*đa\s*\d+\s*ti[ê]?t\s*(mỗi|mot|trong|1)?\s*ngày|không?\s*quá\s*\d+\s*ti[ê]?t\s*(mỗi|mot|trong|1)?\s*ngày/iu,
      /t[ốo]i\s*đa\s*\d+\s*tiết|không?\s*quá\s*\d+\s*tiết/iu,
      /giới\s*hạn\s*\d+\s*tiết|giới\s*hạn\s*\d+\s*tiết/iu,
    ],
    synonyms: ['tối đa N tiết mỗi ngày', 'không quá N tiết ngày', 'giới hạn tiết', 'dạy ít thôi', 'ít tiết thôi'],
    fewShots: [
      { text: 'Thầy Sơn dạy tối đa 4 tiết mỗi ngày.', params: { teacher: 'Sơn', maxPerDay: 4 } },
      { text: 'Giáo viên Dung không quá 3 tiết một ngày.', params: { teacher: 'Dung', maxPerDay: 3 } },
    ],
    negativeFewShots: [
      { text: 'Thầy Sơn không dạy quá 3 tiết liên tiếp', actuallyMapsTo: 'teacher_max_consecutive', reason: 'Có "liên tiếp" → giới hạn tiết liên tiếp, không phải tổng tiết/ngày' },
      { text: 'Thầy Sơn dạy tối đa 3 lớp mỗi ngày', actuallyMapsTo: 'teacher_max_classes_per_day', reason: '"lớp" chứ không phải "tiết" → giới hạn số lớp, không phải tổng tiết' },
    ],
    requiredParams: ['teacher', 'maxPerDay'],
    embedding: e(null),
  },
  {
    kind: 'teacher_max_consecutive',
    scope: SCOPE.teacher,
    triggers: [
      /t[ốo]i\s*đa\s*\d+\s*ti[ê]?t\s*liên\s*tiếp|không?\s*quá\s*\d+\s*ti[ê]?t\s*liên\s*tiếp/iu,
      /giới\s*hạn\s*\d+\s*tiết\s*liên\s*tiếp/iu,
    ],
    synonyms: ['tối đa N tiết liên tiếp', 'không quá N tiết liên tiếp', 'liên tiếp tối đa'],
    fewShots: [
      { text: 'Thầy Sơn không dạy quá 3 tiết liên tiếp.', params: { teacher: 'Sơn', maxConsecutive: 3 } },
    ],
    negativeFewShots: [
      { text: 'Thầy Sơn dạy tối đa 4 tiết mỗi ngày', actuallyMapsTo: 'teacher_max_per_day', reason: 'Không có "liên tiếp" → tổng tiết/ngày, không phải streak' },
      { text: 'Thầy Sơn dạy tối đa 5 ngày liên tiếp', actuallyMapsTo: 'teacher_max_consecutive_days', reason: '"ngày liên tiếp" chứ không phải "tiết liên tiếp"' },
    ],
    requiredParams: ['teacher', 'maxConsecutive'],
    embedding: e(null),
  },
  {
    kind: 'teacher_max_working_days',
    scope: SCOPE.teacher,
    triggers: [
      /t[ốo]i\s*đa\s*\d+\s*ngày(\/tuần)?\s*(dạy|làm việc)|không?\s*quá\s*\d+\s*ngày(\/tuần)?\s*(dạy|làm việc)/iu,
    ],
    synonyms: ['tối đa N ngày dạy', 'không quá N ngày', 'dạy ít ngày thôi'],
    fewShots: [
      { text: 'Cô Hương dạy tối đa 4 ngày/tuần.', params: { teacher: 'Hương', maxDays: 4 } },
    ],
    negativeFewShots: [],
    requiredParams: ['teacher', 'maxDays'],
    embedding: e(null),
  },
  {
    kind: 'teacher_min_per_day',
    scope: SCOPE.teacher,
    triggers: [
      /ít\s*nhất\s*\d+\s*ti[ê]?t\s*(mỗi|mot|trong|1)?\s*ngày|phải\s*dạy\s*t[ốo]i\s*thiểu\s*\d+\s*tiết/iu,
    ],
    synonyms: ['ít nhất N tiết mỗi ngày', 'dạy ít nhất N tiết', 'tối thiểu N tiết'],
    fewShots: [
      { text: 'Thầy Sơn dạy ít nhất 2 tiết mỗi ngày.', params: { teacher: 'Sơn', minPerDay: 2 } },
    ],
    negativeFewShots: [],
    requiredParams: ['teacher', 'minPerDay'],
    embedding: e(null),
  },
  {
    kind: 'teacher_no_gaps',
    scope: SCOPE.teacher,
    triggers: [
      /không?\s*(có|có\s*)?tiết\s*trống|không?\s*(có|có\s*)?gap|không?\s*(có|có\s*)?lỗ\s*hổng/iu,
      /liền\s*mạch|liên\s*tục\s*(dạy|làm)/iu,
    ],
    synonyms: ['không có tiết trống', 'no gaps', 'liền mạch', 'không gap'],
    fewShots: [
      { text: 'Thầy Sơn không có tiết trống giữa các tiết dạy.', params: { teacher: 'Sơn' } },
    ],
    negativeFewShots: [],
    requiredParams: ['teacher'],
    embedding: e(null),
  },
  {
    kind: 'teacher_allowed_days',
    scope: SCOPE.teacher,
    triggers: [
      /chỉ\s+(dạy|đi|đến|ở|đi làm)\s+(thứ|ngày)|chỉ\s+dạy\s+các?\s+ngày/iu,
      /rảnh\s+(thứ|ngày)|ưu\s*tiên\s+(thứ|ngày)\s*(dạy|nghỉ)/iu,
    ],
    synonyms: ['chỉ dạy thứ', 'chỉ dạy ngày', 'rảnh thứ', 'dạy thứ nào', 'cố định ngày'],
    fewShots: [
      { text: 'Thầy Sơn chỉ dạy Thứ 3 và Thứ 5.', params: { teacher: 'Sơn', days: ['tuesday', 'thursday'] } },
    ],
    negativeFewShots: [],
    requiredParams: ['teacher', 'days'],
    embedding: e(null),
  },
  {
    kind: 'teacher_allowed_periods',
    scope: SCOPE.teacher,
    triggers: [
      /chỉ\s+dạy\s+(tiết|các?\s+tiết)|chỉ\s+(rảnh|được)\s+tiết/iu,
      /chỉ\s+được\s+dạy\s+(tiết|các?\s+tiết)/iu,
      /(thầy|cô)\s+\S+\s+chỉ\s+dạy\s+tiết/iu,
    ],
    synonyms: ['chỉ dạy tiết', 'chỉ rảnh tiết', 'chỉ được dạy tiết', 'whitelist tiết'],
    fewShots: [
      { text: 'Cô Thúy chỉ dạy các tiết 2, 3, 4.', params: { teacher: 'Thúy', periods: [2, 3, 4] } },
      { text: 'Thầy Sơn chỉ được dạy tiết 4.', params: { teacher: 'Sơn', periods: [4] } },
    ],
    negativeFewShots: [
      { text: 'Cô Thúy phải có tiết 4', actuallyMapsTo: 'teacher_required_period', reason: '"Phải có" là at-least require, không phải whitelist only' },
      { text: 'Cô Thúy không dạy tiết 4', actuallyMapsTo: 'teacher_block_period', reason: '"Không dạy" là block tiết cụ thể, không phải whitelist' },
    ],
    requiredParams: ['teacher', 'periods'],
    embedding: e(null),
  },
  {
    kind: 'teacher_min_working_days',
    scope: SCOPE.teacher,
    triggers: [
      /dạy\s*ít\s*nhất\s*\d+\s*ngày|dạy\s*t[ốo]i\s*thiểu\s*\d+\s*ngày/iu,
    ],
    synonyms: ['dạy ít nhất N ngày', 'tối thiểu N ngày dạy'],
    fewShots: [
      { text: 'Thầy Sơn dạy ít nhất 4 ngày/tuần.', params: { teacher: 'Sơn', minDays: 4 } },
    ],
    negativeFewShots: [],
    requiredParams: ['teacher', 'minDays'],
    embedding: e(null),
  },
  {
    kind: 'teacher_max_gaps',
    scope: SCOPE.teacher,
    triggers: [
      /t[ốo]i\s*đa\s*\d+\s*tiết\s*trống|không?\s*quá\s*\d+\s*gap/iu,
    ],
    synonyms: ['tối đa N tiết trống', 'không quá N gap'],
    fewShots: [
      { text: 'Thầy Sơn tối đa 1 tiết trống mỗi ngày.', params: { teacher: 'Sơn', maxGaps: 1 } },
    ],
    negativeFewShots: [],
    requiredParams: ['teacher', 'maxGaps'],
    embedding: e(null),
  },
  {
    kind: 'teacher_min_consecutive',
    scope: SCOPE.teacher,
    triggers: [
      /ít\s*nhất\s*\d+\s*tiết\s*liền|dạy\s*ít\s*nhất\s*\d+\s*tiết\s*liên/iu,
    ],
    synonyms: ['ít nhất N tiết liền', 'liên tiếp ít nhất N'],
    fewShots: [
      { text: 'Thầy Sơn mỗi khi dạy phải ít nhất 2 tiết liền.', params: { teacher: 'Sơn', minConsecutive: 2 } },
    ],
    negativeFewShots: [],
    requiredParams: ['teacher', 'minConsecutive'],
    embedding: e(null),
  },
  {
    kind: 'teacher_balanced_load',
    scope: SCOPE.teacher,
    triggers: [
      /cân\s*bằng\s*tải\s*(giáo\s*viên|GV)?|cân\s*bằng\s*số\s*tiết/iu,
      /tải\s*dạy\s*(đều|như\s*nhau)/iu,
    ],
    synonyms: ['cân bằng tải', 'tải đều', 'tải như nhau'],
    fewShots: [
      { text: 'Cân bằng tải giáo viên (dung sai 1).', params: { teacher: undefined, tolerance: 1 } },
    ],
    negativeFewShots: [],
    requiredParams: ['tolerance'],
    embedding: e(null),
  },
  {
    kind: 'teacher_max_subjects_per_day',
    scope: SCOPE.teacher,
    triggers: [
      /t[ốo]i\s*đa\s*\d+\s*môn\s*(mỗi|mot|trong|1)?\s*ngày|không?\s*quá\s*\d+\s*môn\s*(mỗi|mot|trong|1)?\s*ngày/iu,
    ],
    synonyms: ['tối đa N môn mỗi ngày', 'không quá N môn ngày', 'ít môn'],
    fewShots: [
      { text: 'Thầy Sơn dạy tối đa 3 môn mỗi ngày.', params: { teacher: 'Sơn', max: 3 } },
    ],
    negativeFewShots: [],
    requiredParams: ['teacher', 'max'],
    embedding: e(null),
  },
  {
    kind: 'teacher_max_consecutive_days',
    scope: SCOPE.teacher,
    triggers: [
      /t[ốo]i\s*đa\s*\d+\s*ngày\s*liên\s*tiếp|không?\s*quá\s*\d+\s*ngày\s*liên\s*tiếp/iu,
    ],
    synonyms: ['tối đa N ngày liên tiếp', 'không quá N ngày liên tiếp'],
    fewShots: [
      { text: 'Thầy Sơn dạy tối đa 5 ngày liên tiếp.', params: { teacher: 'Sơn', maxDays: 5 } },
    ],
    negativeFewShots: [],
    requiredParams: ['teacher', 'maxDays'],
    embedding: e(null),
  },
  {
    kind: 'teacher_min_off_days',
    scope: SCOPE.teacher,
    triggers: [
      /nghỉ\s*t[ốo]i\s*thiểu\s*\d+\s*ngày|được\s*nghỉ\s*ít\s*nhất\s*\d+\s*ngày/iu,
    ],
    synonyms: ['nghỉ tối thiểu N ngày', 'được nghỉ ít nhất N'],
    fewShots: [
      { text: 'Thầy Sơn được nghỉ tối thiểu 2 ngày/tuần.', params: { teacher: 'Sơn', minOffDays: 2 } },
    ],
    negativeFewShots: [],
    requiredParams: ['teacher', 'minOffDays'],
    embedding: e(null),
  },
  {
    kind: 'teacher_preferred_periods',
    scope: SCOPE.teacher,
    triggers: [
      /ưu\s*tiên\s+(dạy|tiết|xếp)\s*(tiết|các?\s+tiết)|thích\s+dạy\s+tiết/iu,
    ],
    synonyms: ['ưu tiên dạy tiết', 'thích tiết', 'muốn dạy tiết'],
    fewShots: [
      { text: 'Ưu tiên xếp thầy Sơn vào các tiết 2, 3.', params: { teacher: 'Sơn', periods: [2, 3] } },
    ],
    negativeFewShots: [],
    requiredParams: ['teacher', 'periods'],
    embedding: e(null),
  },
  {
    kind: 'teacher_max_classes_per_day',
    scope: SCOPE.teacher,
    triggers: [
      /t[ốo]i\s*đa\s*\d+\s*lớp\s*(mỗi|mot|trong|1)?\s*ngày|không?\s*quá\s*\d+\s*lớp\s*(mỗi|mot|trong|1)?\s*ngày/iu,
    ],
    synonyms: ['tối đa N lớp mỗi ngày', 'không quá N lớp ngày', 'dạy ít lớp'],
    fewShots: [
      { text: 'Thầy Sơn dạy tối đa 3 lớp mỗi ngày.', params: { teacher: 'Sơn', maxClasses: 3 } },
    ],
    negativeFewShots: [],
    requiredParams: ['teacher', 'maxClasses'],
    embedding: e(null),
  },
  {
    kind: 'teacher_pair_not_same_slot',
    scope: SCOPE.teacher,
    triggers: [
      /hai\s+(giáo\s*viên|GV|thầy|cô)\s+\S+\s+và\s+\S+\s+không?\s+dạy\s+cùng\s+(tiết|slot)|không?\s+trùng\s+tiết/iu,
      /cặp\s+\S+\s+không?\s+trùng/iu,
    ],
    synonyms: ['hai GV không trùng tiết', 'cặp không trùng', 'không cùng tiết'],
    fewShots: [
      { text: 'Hai giáo viên Sơn và Thúy không dạy cùng một tiết.', params: { teachers: ['Sơn', 'Thúy'] } },
    ],
    negativeFewShots: [],
    requiredParams: ['teachers'],
    embedding: e(null),
  },
  {
    kind: 'teacher_pair_not_same_day',
    scope: SCOPE.teacher,
    triggers: [
      /hai\s+(giáo\s*viên|GV|thầy|cô)\s+\S+\s+và\s+\S+\s+không?\s+dạy\s+cùng\s+(ngày|thứ)|không?\s+cùng\s+ngày/iu,
    ],
    synonyms: ['hai GV không cùng ngày', 'cặp không cùng thứ', 'không cùng ngày'],
    fewShots: [
      { text: 'Hai giáo viên Sơn và Thúy không dạy cùng một ngày.', params: { teachers: ['Sơn', 'Thúy'] } },
    ],
    negativeFewShots: [],
    requiredParams: ['teachers'],
    embedding: e(null),
  },
  {
    kind: 'teacher_homeroom_first_period',
    scope: SCOPE.teacher,
    triggers: [
      /chủ\s*nhiệm\s+(dạy\s+)?tiết\s*1|dạy\s+tiết\s*1\s+lớp\s+chủ\s*nhiệm/iu,
    ],
    synonyms: ['chủ nhiệm tiết 1', 'dạy tiết 1 lớp CN'],
    fewShots: [
      { text: 'Thầy Sơn (chủ nhiệm lớp 6A) dạy tiết 1.', params: { teacher: 'Sơn', class: '6A' } },
    ],
    negativeFewShots: [],
    requiredParams: ['teacher', 'class'],
    embedding: e(null),
  },

  // ── SUBJECT CONSTRAINTS ─────────────────────────────────────────────────────
  {
    kind: 'subject_pin_period',
    scope: SCOPE.subject,
    triggers: [
      /chỉ\s+được?\s+xếp\s+(vào\s+)?tiết|cố\s*định\s+(vào\s+)?tiết|pin\s+period/iu,
      /xếp\s+(môn\s+)?\S+\s+vào\s+tiết|xếp\s+\S+\s+cố\s*định/iu,
    ],
    synonyms: ['chỉ được xếp vào tiết', 'cố định tiết', 'pin period', 'xếp đúng tiết'],
    fewShots: [
      { text: 'Môn Toán chỉ được xếp vào tiết 1 và 2.', params: { subject: 'Toán', periods: [1, 2] } },
    ],
    negativeFewShots: [],
    requiredParams: ['subject', 'periods'],
    embedding: e(null),
  },
  {
    kind: 'subject_preferred_periods',
    scope: SCOPE.subject,
    triggers: [
      /ưu\s*tiên\s+xếp\s+(môn\s+)?\S+\s+vào\s+(tiết|các?\s+tiết)|thích\s+xếp\s+\S+\s+tiết/iu,
    ],
    synonyms: ['ưu tiên xếp môn vào tiết', 'thích tiết nào'],
    fewShots: [
      { text: 'Ưu tiên xếp môn Văn vào các tiết 3, 4.', params: { subject: 'Văn', periods: [3, 4] } },
    ],
    negativeFewShots: [],
    requiredParams: ['subject', 'periods'],
    embedding: e(null),
  },
  {
    kind: 'subject_not_last_period',
    scope: SCOPE.subject,
    triggers: [
      /không?\s*(xếp|đặt|học)\s+(môn\s+)?\S+\s+vào\s+tiết\s*(cuối|cuối\s*cùng)|môn\s+\S+\s+không?\s+tiết\s*cuối/iu,
    ],
    synonyms: ['không tiết cuối', 'tránh tiết cuối', 'môn không cuối ngày'],
    fewShots: [
      { text: 'Môn Văn không xếp vào tiết cuối cùng của ngày.', params: { subject: 'Văn' } },
    ],
    negativeFewShots: [],
    requiredParams: ['subject'],
    embedding: e(null),
  },
  {
    kind: 'subject_consecutive',
    scope: SCOPE.subject,
    triggers: [
      /nên\s+(có|xếp|có\s*cụm)\s+\d+\s*tiết\s*liên\s*tiếp|cần\s+xếp\s+\S+\s+liền/iu,
      /xếp\s+(môn\s+)?\S+\s+thành\s+cụm\s*liên\s*tiếp/iu,
    ],
    synonyms: ['nên có cụm liên tiếp', 'xếp liền', 'cụm tiết', 'liên tiếp'],
    fewShots: [
      { text: 'Môn Văn nên có các cụm 2 tiết liên tiếp trong tuần.', params: { subject: 'Văn', length: 2 } },
    ],
    negativeFewShots: [],
    requiredParams: ['subject'],
    embedding: e(null),
  },
  {
    kind: 'subject_max_consecutive',
    scope: SCOPE.subject,
    triggers: [
      /không?\s*(được\s+)?(\d+\s*tiết|quá\s*\d+)\s*liên\s*tiếp|t[ốo]i\s*đa\s*\d+\s*tiết\s*liên\s*tiếp/iu,
      /không?\s*xếp\s+\d+\s*tiết\s*liên\s*tiếp/iu,
    ],
    synonyms: ['không N tiết liên tiếp', 'tối đa N tiết liên tiếp', 'giới hạn liên tiếp'],
    fewShots: [
      { text: 'Môn Văn không được 3 tiết liên tiếp.', params: { subject: 'Văn', max: 2, maxConsecutive: 2 } },
      { text: 'Môn Toán tối đa 2 tiết liên tiếp trong cùng một ngày.', params: { subject: 'Toán', max: 2, maxConsecutive: 2 } },
    ],
    negativeFewShots: [],
    requiredParams: ['subject', 'max'],
    embedding: e(null),
  },
  {
    kind: 'subject_allowed_days',
    scope: SCOPE.subject,
    triggers: [
      /môn\s+\S+\s+chỉ\s+(được\s+)?xếp\s+vào|chỉ\s+xếp\s+(môn\s+)?\S+\s+vào\s+thứ/iu,
    ],
    synonyms: ['môn chỉ xếp vào ngày', 'môn chỉ dạy thứ'],
    fewShots: [
      { text: 'Môn Toán chỉ được xếp vào Thứ 3 và Thứ 5.', params: { subject: 'Toán', days: ['tuesday', 'thursday'] } },
    ],
    negativeFewShots: [],
    requiredParams: ['subject', 'days'],
    embedding: e(null),
  },
  {
    kind: 'subject_min_gap_days',
    scope: SCOPE.subject,
    triggers: [
      /cách\s+nhau\s+ít\s*nhất\s*\d+\s*ngày|giãn\s*\d+\s*ngày/iu,
    ],
    synonyms: ['cách nhau N ngày', 'giãn cách', 'ngày giãn'],
    fewShots: [
      { text: 'Môn Toán cách nhau ít nhất 2 ngày.', params: { subject: 'Toán', minGap: 2 } },
    ],
    negativeFewShots: [],
    requiredParams: ['subject', 'minGap'],
    embedding: e(null),
  },
  {
    kind: 'subject_daily_max_periods',
    scope: SCOPE.subject,
    triggers: [
      /môn\s+\S+\s+t[ốo]i\s*đa\s*\d+\s*tiết\/ngày|môn\s+\S+\s+không?\s*quá\s*\d+\s*tiết\s*(1|mỗi|một)\s*ngày/iu,
    ],
    synonyms: ['môn tối đa N tiết ngày', 'không quá N tiết ngày'],
    fewShots: [
      { text: 'Môn Toán tối đa 2 tiết/ngày.', params: { subject: 'Toán', max: 2 } },
    ],
    negativeFewShots: [],
    requiredParams: ['subject', 'max'],
    embedding: e(null),
  },
  {
    kind: 'subject_block_period',
    scope: SCOPE.subject,
    triggers: [
      /môn\s+\S+\s+không?\s*(được\s+)?(xếp\s+)?vào\s+tiết|môn\s+\S+\s+không?\s*dạy\s+tiết/iu,
      /cấm\s+xếp\s+\S+\s+tiết/iu,
    ],
    synonyms: ['môn không xếp vào tiết', 'môn cấm tiết', 'môn không dạy tiết'],
    fewShots: [
      { text: 'Môn Văn không được xếp vào tiết 5.', params: { subject: 'Văn', periods: [5] } },
    ],
    negativeFewShots: [],
    requiredParams: ['subject', 'periods'],
    embedding: e(null),
  },
  {
    kind: 'subject_block_days',
    scope: SCOPE.subject,
    triggers: [
      /môn\s+\S+\s+không?\s*(được\s+)?(xếp\s+)?vào\s+(thứ|ngày)|môn\s+\S+\s+cấm\s+(thứ|ngày)/iu,
    ],
    synonyms: ['môn không xếp vào ngày', 'môn cấm thứ'],
    fewShots: [
      { text: 'Môn Văn không được xếp vào Thứ 2.', params: { subject: 'Văn', days: ['monday'] } },
    ],
    negativeFewShots: [],
    requiredParams: ['subject', 'days'],
    embedding: e(null),
  },
  {
    kind: 'subject_not_consecutive',
    scope: SCOPE.subject,
    triggers: [
      /môn\s+\S+\s+không?\s*(được\s+)?xếp\s+(các\s+)?tiết\s*liên\s*tiếp|không?\s*liên\s*tiếp/iu,
    ],
    synonyms: ['môn không liên tiếp', 'không xếp liền'],
    fewShots: [
      { text: 'Môn Toán không được xếp vào các tiết liên tiếp.', params: { subject: 'Toán' } },
    ],
    negativeFewShots: [],
    requiredParams: ['subject'],
    embedding: e(null),
  },
  {
    kind: 'subject_min_days',
    scope: SCOPE.subject,
    triggers: [
      /môn\s+\S+\s+phải\s+(được\s+)?rải\s+ít\s*nhất\s*\d+\s*ngày/iu,
    ],
    synonyms: ['môn phải rải N ngày', 'rải ít nhất N ngày'],
    fewShots: [
      { text: 'Môn Toán phải được rải ít nhất 3 ngày.', params: { subject: 'Toán', minDays: 3 } },
    ],
    negativeFewShots: [],
    requiredParams: ['subject', 'minDays'],
    embedding: e(null),
  },
  {
    kind: 'subject_spread_evenly',
    scope: SCOPE.subject,
    triggers: [
      /môn\s+\S+\s+(được\s+)?phân\s*bổ\s*đều|rải\s*đều\s+(môn\s+)?\S+/iu,
    ],
    synonyms: ['phân bổ đều', 'rải đều', 'đều trong tuần'],
    fewShots: [
      { text: 'Môn Toán được phân bổ đều trong tuần.', params: { subject: 'Toán' } },
    ],
    negativeFewShots: [],
    requiredParams: ['subject'],
    embedding: e(null),
  },
  {
    kind: 'subject_order_before',
    scope: SCOPE.subject,
    triggers: [
      /môn\s+\S+\s+phải\s+xếp\s+trước\s+môn\s+\S+|xếp\s+\S+\s+trước\s+\S+/iu,
    ],
    synonyms: ['xếp trước', 'thứ tự môn', 'A trước B'],
    fewShots: [
      { text: 'Môn Toán phải xếp trước môn Văn.', params: { subjectA: 'Toán', subjectB: 'Văn' } },
    ],
    negativeFewShots: [],
    requiredParams: ['subjectA', 'subjectB'],
    embedding: e(null),
  },
  {
    kind: 'subject_not_after_subject',
    scope: SCOPE.subject,
    triggers: [
      /môn\s+\S+\s+không?\s*(được\s+)?xếp\s+sau\s+môn\s+\S+/iu,
    ],
    synonyms: ['không xếp sau', 'A không sau B'],
    fewShots: [
      { text: 'Môn Toán không được xếp sau môn Văn.', params: { subjectA: 'Toán', subjectB: 'Văn' } },
    ],
    negativeFewShots: [],
    requiredParams: ['subjectA', 'subjectB'],
    embedding: e(null),
  },

  // ── CLASS CONSTRAINTS ────────────────────────────────────────────────────────
  {
    kind: 'class_block_day',
    scope: SCOPE.class,
    triggers: [
      /lớp\s+\S+\s+không?\s*(học|dạy)\s+(thứ|ngày)|lớp\s+\S+\s+cấm\s+(thứ|ngày)/iu,
    ],
    synonyms: ['lớp không học thứ', 'lớp cấm ngày', 'lớp nghỉ thứ'],
    fewShots: [
      { text: 'Lớp 6A không học vào Thứ 2.', params: { class: '6A', day: 'monday' } },
    ],
    negativeFewShots: [],
    requiredParams: ['class', 'day'],
    embedding: e(null),
  },
  {
    kind: 'class_block_period',
    scope: SCOPE.class,
    triggers: [
      /lớp\s+\S+\s+không?\s*học\s+tiết|lớp\s+\S+\s+cấm\s+tiết|lớp\s+\S+\s+nghỉ\s+tiết/iu,
    ],
    synonyms: ['lớp không học tiết', 'lớp cấm tiết', 'lớp nghỉ tiết'],
    fewShots: [
      { text: 'Lớp 6A không học tiết 5.', params: { class: '6A', period: 5 } },
    ],
    negativeFewShots: [
      { text: 'Lớp 6A phải có tiết 1', actuallyMapsTo: 'class_required_period', reason: '"Phải có" là require at-least, không phải block' },
    ],
    requiredParams: ['class', 'period'],
    embedding: e(null),
  },
  {
    kind: 'class_required_period',
    scope: SCOPE.class,
    triggers: [
      // "lớp X phải có tiết N" / "phải học"
      /l[ớo]p\s+\S+\s+ph[ảa]i\s+c[óo]\s+(ít\s+nh[ấa]t\s+)?(1\s+)?ti[êe]?t\s*\d+/iu,
      /l[ớo]p\s+\S+\s+ph[ảa]i\s+h[ọo]c\s+(ít\s+nh[ấa]t\s+)?(1\s+)?ti[êe]?t\s*\d+/iu,
      // "lớp X cần có tiết N" / "cần học"
      /l[ớo]p\s+\S+\s+c[ầa]n\s+c[óo]\s+(ít\s+nh[ấa]t\s+)?ti[êe]?t\s*\d+/iu,
      /l[ớo]p\s+\S+\s+c[ầa]n\s+h[ọo]c\s+(ít\s+nh[ấa]t\s+)?ti[êe]?t\s*\d+/iu,
      // "lớp X bắt buộc có/học tiết"
      /l[ớo]p\s+\S+\s+b[ắa]t\s+bu[ộo]c\s+(c[óo]|h[ọo]c)\s+(ít\s+nh[ấa]t\s+)?ti[êe]?t/iu,
      // "lớp X phải được xếp tiết"
      /l[ớo]p\s+\S+\s+ph[ảa]i\s+đ[ượu][ợo]c\s+(x[ếe]p\s+)?ti[êe]?t\s*\d+/iu,
      // "phải có ít nhất 1 tiết N" with class-only context
      /\d+[A-Z]\s+ph[ảa]i\s+c[óo]\s+ti[êe]?t\s*\d+/iu,
      // "ít nhất N tiết" with class
      /l[ớo]p\s+\S+\s+c[óo]\s+[íi]t\s+nh[ấa]t\s+\d+\s+ti[êe]?t\s*\d+/iu,
      /l[ớo]p\s+\S+\s+t[ốo]i\s+thi[ểe]u\s+\d+\s+ti[êe]?t\s*\d+/iu,
    ],
    synonyms: [
      'lớp phải có tiết',
      'lớp cần có tiết',
      'lớp cần học tiết',
      'lớp bắt buộc tiết',
      'lớp ít nhất tiết',
      'lớp phải học tiết',
      'phải được xếp tiết',
    ],
    fewShots: [
      { text: 'Lớp 6A phải có tiết 1', params: { class: '6A', period: 1, minCount: 1 } },
      { text: '6A cần có ít nhất 1 tiết 5 trong tuần', params: { class: '6A', period: 5, minCount: 1 } },
      { text: 'Lớp 6B bắt buộc học tiết 2', params: { class: '6B', period: 2, minCount: 1 } },
      { text: '7C cần tối thiểu 2 tiết 4 trong tuần', params: { class: '7C', period: 4, minCount: 2 } },
    ],
    negativeFewShots: [
      { text: 'Lớp 6A không học tiết 1', actuallyMapsTo: 'class_block_period', reason: '"Không học" là block, không phải require' },
      { text: 'Lớp 6A nghỉ tiết 1', actuallyMapsTo: 'class_block_period', reason: '"Nghỉ" là block, không phải at-least' },
      { text: 'Lớp 6A chỉ học tiết 1', actuallyMapsTo: 'class_allowed_periods', reason: '"Chỉ học" là allowed-only whitelist, không phải at-least' },
      { text: 'Lớp 6A chỉ được học tiết 1', actuallyMapsTo: 'class_allowed_periods', reason: '"Chỉ được học" là whitelist, không phải at-least' },
      { text: 'Lớp 6A nên học tiết 1', actuallyMapsTo: 'class_block_period', reason: '"Nên" là preference, không hard require; nếu không có hard encoder thì rơi về block default' },
      { text: 'Lớp 6A học tối đa 5 tiết mỗi ngày', actuallyMapsTo: 'class_max_per_day', reason: '"Tối đa" là max-per-day, không phải at-least' },
    ],
    requiredParams: ['class', 'period', 'minCount'],
    embedding: e(null),
  },
  {
    kind: 'class_block_slot',
    scope: SCOPE.class,
    triggers: [
      /lớp\s+\S+\s+không?\s*học\s+thứ\s*\d+\s+tiết|lớp\s+\S+\s+cấm\s+thứ.*tiết/iu,
    ],
    synonyms: ['lớp không học slot', 'lớp cấm ngày tiết'],
    fewShots: [
      { text: 'Lớp 6A không học Thứ 2 tiết 1.', params: { class: '6A', day: 'monday', period: 1 } },
    ],
    negativeFewShots: [],
    requiredParams: ['class', 'day', 'period'],
    embedding: e(null),
  },
  {
    kind: 'subject_required_period',
    scope: SCOPE.subject,
    triggers: [
      // "Môn X phải có tiết N" / "phải dạy"
      /m[ôo]n\s+\S+\s+ph[ảa]i\s+c[óo]\s+(ít\s+nh[ấa]t\s+)?(1\s+)?ti[êe]?t\s*\d+/iu,
      /m[ôo]n\s+\S+\s+ph[ảa]i\s+d[ạa]y\s+(ít\s+nh[ấa]t\s+)?ti[êe]?t\s*\d+/iu,
      // "Môn X cần có tiết"
      /m[ôo]n\s+\S+\s+c[ầa]n\s+c[óo]\s+(ít\s+nh[ấa]t\s+)?ti[êe]?t\s*\d+/iu,
      // "Môn X bắt buộc có/dạy tiết"
      /m[ôo]n\s+\S+\s+b[ắa]t\s+bu[ộo]c\s+(c[óo]|d[ạa]y)\s+(ít\s+nh[ấa]t\s+)?ti[êe]?t/iu,
      // "Môn X có ít nhất N tiết Y"
      /m[ôo]n\s+\S+\s+c[óo]\s+[íi]t\s+nh[ấa]t\s+\d+\s+ti[êe]?t\s*\d+/iu,
      // "Môn X tối thiểu N tiết"
      /m[ôo]n\s+\S+\s+t[ốo]i\s+thi[ểe]u\s+\d+\s+ti[êe]?t\s*\d+/iu,
      // "Môn X phải được xếp tiết"
      /m[ôo]n\s+\S+\s+ph[ảa]i\s+đ[ượu][ợo]c\s+(x[ếe]p\s+)?ti[êe]?t\s*\d+/iu,
      // Bare subject with require marker (semantic direction: require)
      /ph[ảa]i\s+c[óo]\s+m[ôo]n\s+\S+\s+(ít\s+nh[ấa]t\s+)?ti[êe]?t/iu,
    ],
    synonyms: [
      'môn phải có tiết',
      'môn cần có tiết',
      'môn bắt buộc có tiết',
      'môn bắt buộc dạy tiết',
      'môn ít nhất tiết',
      'môn phải dạy tiết',
      'môn tối thiểu tiết',
      'phải có môn tiết',
    ],
    fewShots: [
      // Subject + class specified (deterministic case)
      { text: 'Môn Toán lớp 6A phải có tiết 1', params: { subject: 'Toán', class: '6A', period: 1, minCount: 1 } },
      { text: 'Môn Văn của 6B cần có ít nhất 1 tiết 4 trong tuần', params: { subject: 'Văn', class: '6B', period: 4, minCount: 1 } },
      { text: 'Môn Toán lớp 7A bắt buộc dạy tiết 2', params: { subject: 'Toán', class: '7A', period: 2, minCount: 1 } },
    ],
    negativeFewShots: [
      // Subject-only: NOT silently mapping to subject_required_period — needs clarification
      { text: 'Môn Toán phải có tiết 4', actuallyMapsTo: 'class_required_period', reason: 'Subject only without class → ASK CLARIFICATION: per-class hay global? Do not silently pick.' },
      { text: 'Toán phải có tiết 4', actuallyMapsTo: 'class_required_period', reason: 'Subject only without class → ASK CLARIFICATION: per-class hay global? Do not silently pick.' },
      { text: 'Môn Toán không xếp vào tiết 5', actuallyMapsTo: 'subject_block_period', reason: '"Không xếp" là block, không phải require' },
      { text: 'Môn Văn chỉ dạy tiết 4', actuallyMapsTo: 'subject_pin_period', reason: '"Chỉ dạy" là pin/whitelist, không phải at-least' },
      { text: 'Môn Văn nên dạy tiết 4', actuallyMapsTo: 'subject_preferred_periods', reason: '"Nên" là preference/soft, không phải hard require' },
      { text: 'Môn Toán tối đa 2 tiết/ngày', actuallyMapsTo: 'subject_daily_max_periods', reason: '"Tối đa" là max-per-day, không phải at-least' },
    ],
    requiredParams: ['subject', 'period', 'minCount'],
    embedding: e(null),
  },
  {
    kind: 'class_max_per_day',
    scope: SCOPE.class,
    triggers: [
      /lớp\s+\S+\s+(học\s+)?t[ốo]i\s*đa\s*\d+\s*tiết\s*(mỗi|mot|trong|1)?\s*ngày/iu,
    ],
    synonyms: ['lớp tối đa N tiết ngày', 'lớp học ít thôi'],
    fewShots: [
      { text: 'Lớp 6A học tối đa 5 tiết mỗi ngày.', params: { class: '6A', max: 5 } },
    ],
    negativeFewShots: [],
    requiredParams: ['class', 'max'],
    embedding: e(null),
  },
  {
    kind: 'class_min_per_day',
    scope: SCOPE.class,
    triggers: [
      /lớp\s+\S+\s+(học\s+)?ít\s*nhất\s*\d+\s*tiết\s*(mỗi|mot|trong|1)?\s*ngày/iu,
    ],
    synonyms: ['lớp ít nhất N tiết ngày'],
    fewShots: [
      { text: 'Lớp 6A học ít nhất 3 tiết mỗi ngày.', params: { class: '6A', min: 3 } },
    ],
    negativeFewShots: [],
    requiredParams: ['class', 'min'],
    embedding: e(null),
  },
  {
    kind: 'class_no_gaps',
    scope: SCOPE.class,
    triggers: [
      /lớp\s+\S+\s+không?\s*(có|có\s*)?tiết\s*trống|lớp\s+\S+\s+liền\s*mạch/iu,
    ],
    synonyms: ['lớp không tiết trống', 'lớp liền mạch'],
    fewShots: [
      { text: 'Lớp 6A không có tiết trống giữa các tiết học.', params: { class: '6A' } },
    ],
    negativeFewShots: [],
    requiredParams: ['class'],
    embedding: e(null),
  },
  {
    kind: 'class_no_double_subject_day',
    scope: SCOPE.class,
    triggers: [
      /lớp\s+\S+\s+không?\s*(được\s+)?học\s+\d+\s*môn\s*(trong|1)\s*ngày/iu,
    ],
    synonyms: ['lớp không học N môn ngày', 'giới hạn môn ngày'],
    fewShots: [
      { text: 'Lớp 6A không học quá 4 môn trong một ngày.', params: { class: '6A', subject: undefined, max: 4 } },
    ],
    negativeFewShots: [],
    requiredParams: ['class', 'subject'],
    embedding: e(null),
  },
  {
    kind: 'class_subjects_not_same_day',
    scope: SCOPE.class,
    triggers: [
      /lớp\s+\S+\s+không?\s*được?\s*(có|học)\s+\S+\s+và\s+\S+\s+(trong|cùng)\s*(1|một)\s*ngày|không?\s*học\s+cùng\s*ngày/iu,
    ],
    synonyms: ['môn không cùng ngày', 'không cùng ngày', 'khác ngày'],
    fewShots: [
      { text: 'Mỗi lớp, mỗi ngày: không xếp hai môn trong danh sách vào cùng một ngày.', params: { subjects: [] } },
    ],
    negativeFewShots: [],
    requiredParams: ['subjects'],
    embedding: e(null),
  },
  {
    kind: 'class_fixed_period',
    scope: SCOPE.class,
    triggers: [
      /lớp\s+\S+\s+cố\s*định\s+(vào\s+)?(thứ|tiết)|xếp\s+lớp\s+\S+\s+cố\s*định/iu,
    ],
    synonyms: ['lớp cố định tiết', 'xếp cố định', 'cố định ngày tiết'],
    fewShots: [
      { text: 'Lớp 6A cố định vào Thứ 2 tiết 1.', params: { class: '6A', day: 'monday', period: 1 } },
    ],
    negativeFewShots: [],
    requiredParams: ['class', 'day', 'period'],
    embedding: e(null),
  },
  {
    kind: 'class_allowed_days',
    scope: SCOPE.class,
    triggers: [
      /lớp\s+\S+\s+chỉ\s+học\s+(thứ|ngày)|lớp\s+\S+\s+rảnh\s+(thứ|ngày)/iu,
    ],
    synonyms: ['lớp chỉ học thứ', 'lớp rảnh thứ'],
    fewShots: [
      { text: 'Lớp 6A chỉ học vào Thứ 3 và Thứ 5.', params: { class: '6A', days: ['tuesday', 'thursday'] } },
    ],
    negativeFewShots: [],
    requiredParams: ['class', 'days'],
    embedding: e(null),
  },
  {
    kind: 'class_allowed_periods',
    scope: SCOPE.class,
    triggers: [
      /lớp\s+\S+\s+chỉ\s+học\s+(tiết|các?\s+tiết)|lớp\s+\S+\s+rảnh\s+tiết/iu,
      /lớp\s+\S+\s+chỉ\s+được\s+học\s+tiết/iu,
    ],
    synonyms: ['lớp chỉ học tiết', 'lớp rảnh tiết', 'lớp chỉ được học tiết'],
    fewShots: [
      { text: 'Lớp 6A chỉ học các tiết 2, 3, 4.', params: { class: '6A', periods: [2, 3, 4] } },
    ],
    negativeFewShots: [
      { text: 'Lớp 6A phải có tiết 1', actuallyMapsTo: 'class_required_period', reason: '"Phải có" là require at-least, không phải whitelist only' },
      { text: 'Lớp 6A không học tiết 1', actuallyMapsTo: 'class_block_period', reason: '"Không học" là block tiết cụ thể, không phải whitelist' },
    ],
    requiredParams: ['class', 'periods'],
    embedding: e(null),
  },
  {
    kind: 'class_max_consecutive',
    scope: SCOPE.class,
    triggers: [
      /lớp\s+\S+\s+(học\s+)?t[ốo]i\s*đa\s*\d+\s*tiết\s*liên\s*tiếp/iu,
    ],
    synonyms: ['lớp tối đa N tiết liên tiếp'],
    fewShots: [
      { text: 'Lớp 6A tối đa 3 tiết liên tiếp.', params: { class: '6A', maxConsecutive: 3 } },
    ],
    negativeFewShots: [],
    requiredParams: ['class', 'maxConsecutive'],
    embedding: e(null),
  },
  {
    kind: 'class_max_subjects_per_day',
    scope: SCOPE.class,
    triggers: [
      /lớp\s+\S+\s+(học\s+)?t[ốo]i\s*đa\s*\d+\s*môn\s*(mỗi|mot|trong|1)?\s*ngày/iu,
    ],
    synonyms: ['lớp tối đa N môn ngày'],
    fewShots: [
      { text: 'Lớp 6A học tối đa 4 môn mỗi ngày.', params: { class: '6A', max: 4 } },
    ],
    negativeFewShots: [],
    requiredParams: ['class', 'max'],
    embedding: e(null),
  },
  {
    kind: 'class_balanced_load',
    scope: SCOPE.class,
    triggers: [
      /cân\s*bằng\s*tải\s*lớp|lớp\s+cân\s*bằng/iu,
    ],
    synonyms: ['cân bằng tải lớp'],
    fewShots: [
      { text: 'Cân bằng tải lớp (dung sai 1).', params: { class: undefined, tolerance: 1 } },
    ],
    negativeFewShots: [],
    requiredParams: ['tolerance'],
    embedding: e(null),
  },
  {
    kind: 'class_subjects_same_day',
    scope: SCOPE.class,
    triggers: [
      /lớp\s+\S+\s+học\s+\S+\s+và\s+\S+\s+(cùng|trong)\s*(1|một)\s*ngày/iu,
    ],
    synonyms: ['môn cùng ngày', 'học cùng ngày'],
    fewShots: [
      { text: 'Lớp 6A học Toán và Văn cùng một ngày.', params: { class: '6A', subjects: ['Toán', 'Văn'] } },
    ],
    negativeFewShots: [],
    requiredParams: ['class', 'subjects'],
    embedding: e(null),
  },
  {
    kind: 'class_min_working_days',
    scope: SCOPE.class,
    triggers: [
      /lớp\s+\S+\s+học\s*ít\s*nhất\s*\d+\s*ngày/iu,
    ],
    synonyms: ['lớp học ít nhất N ngày'],
    fewShots: [
      { text: 'Lớp 6A học ít nhất 4 ngày/tuần.', params: { class: '6A', minDays: 4 } },
    ],
    negativeFewShots: [],
    requiredParams: ['class', 'minDays'],
    embedding: e(null),
  },
  {
    kind: 'class_max_heavy_subjects_per_day',
    scope: SCOPE.class,
    triggers: [
      /lớp\s+\S+\s+(t[ốo]i\s*đa|không?\s*quá)\s*\d+\s*môn\s*nặng\s*(mỗi|mot|trong|1)?\s*ngày/iu,
    ],
    synonyms: ['môn nặng tối đa N', 'giới hạn môn nặng'],
    fewShots: [
      { text: 'Lớp 6A: mỗi ngày tối đa 2 môn nặng.', params: { class: '6A', subjects: [], maxHeavy: 2 } },
    ],
    negativeFewShots: [],
    requiredParams: ['subjects', 'maxHeavy'],
    embedding: e(null),
  },
  {
    kind: 'class_max_heavy_subjects_per_session',
    scope: SCOPE.class,
    triggers: [
      /môn\s*nặng\s*(trong|1)\s*buổi|t[ốo]i\s*đa\s*\d+\s*môn\s*nặng\s*buổi/iu,
    ],
    synonyms: ['môn nặng buổi', 'nặng trong buổi'],
    fewShots: [
      { text: 'Mỗi lớp, mỗi ngày, trong cùng một buổi: không dồn quá 2 môn nặng.', params: { subjects: [], maxHeavyInSession: 2, sessionIds: [] } },
    ],
    negativeFewShots: [],
    requiredParams: ['subjects', 'maxHeavyInSession', 'sessionIds'],
    embedding: e(null),
  },
  {
    kind: 'class_first_period_required',
    scope: SCOPE.class,
    triggers: [
      /lớp\s+\S+\s+phải\s+(có|dạy)\s+tiết\s*1|lớp\s+\S+\s+bắt\s*buộc\s+tiết\s*1/iu,
    ],
    synonyms: ['lớp phải có tiết 1', 'bắt buộc tiết 1'],
    fewShots: [
      { text: 'Lớp 6A phải có tiết 1 trong mỗi ngày có học.', params: { class: '6A' } },
    ],
    negativeFewShots: [],
    requiredParams: ['class'],
    embedding: e(null),
  },

  // ── GLOBAL / ASSIGNMENT / PAIR / SESSION ──────────────────────────────────
  {
    kind: 'subject_flag_ceremony_slot',
    scope: SCOPE.global,
    triggers: [
      /chào\s*cờ|sinh\s*hoạt\s*cố\s*định|flag\s*ceremony/iu,
    ],
    synonyms: ['chào cờ', 'sinh hoạt cố định'],
    fewShots: [
      { text: 'Chào cờ cố định: Thứ 2, tiết 1.', params: { day: 'monday', period: 1 } },
    ],
    negativeFewShots: [],
    requiredParams: ['day', 'period'],
    embedding: e(null),
  },
  {
    kind: 'global_teacher_utilization_balance',
    scope: SCOPE.global,
    triggers: [
      /cân\s*bằng\s*tải\s*(toàn\s*trường|giáo\s*viên\s*toàn\s*trường)|cân\s*bằng\s*GV/iu,
    ],
    synonyms: ['cân bằng tải toàn trường', 'cân bằng GV toàn trường'],
    fewShots: [
      { text: 'Cân bằng tải giáo viên toàn trường (dung sai 1).', params: { tolerance: 1 } },
    ],
    negativeFewShots: [],
    requiredParams: ['tolerance'],
    embedding: e(null),
  },
  {
    kind: 'assignment_pin_slot',
    scope: SCOPE.assignment,
    triggers: [
      /phân\s*công\s+\S+\s+cố\s*định|cố\s*định\s+phân\s*công|pin\s+slot/iu,
    ],
    synonyms: ['cố định phân công', 'pin slot', 'gán cố định'],
    fewShots: [
      { text: 'Phân công Sơn dạy Toán 6A cố định Thứ 2 tiết 1.', params: { assignmentId: '', day: 'monday', period: 1 } },
    ],
    negativeFewShots: [],
    requiredParams: ['assignmentId', 'day', 'period'],
    embedding: e(null),
  },
  {
    kind: 'assignment_block_slot',
    scope: SCOPE.assignment,
    triggers: [
      /phân\s*công\s+\S+\s+không?\s*(được\s+)?(xếp|dạy)\s+thứ|block\s+slot/iu,
    ],
    synonyms: ['cấm phân công slot', 'không xếp phân công'],
    fewShots: [
      { text: 'Phân công Sơn dạy Toán 6A không được xếp Thứ 2 tiết 1.', params: { assignmentId: '', day: 'monday', period: 1 } },
    ],
    negativeFewShots: [],
    requiredParams: ['assignmentId', 'day', 'period'],
    embedding: e(null),
  },
  {
    kind: 'assignment_allowed_slots',
    scope: SCOPE.assignment,
    triggers: [
      /phân\s*công\s+\S+\s+chỉ\s+(được\s+)?xếp|allowed\s*slots/iu,
    ],
    synonyms: ['phân công chỉ xếp', 'allowed slots'],
    fewShots: [
      { text: 'Phân công Sơn dạy Toán 6A chỉ được xếp vào Thứ 3 và Thứ 5.', params: { assignmentId: '', slots: [] } },
    ],
    negativeFewShots: [],
    requiredParams: ['assignmentId', 'slots'],
    embedding: e(null),
  },
  {
    kind: 'assignment_spread_days',
    scope: SCOPE.assignment,
    triggers: [
      /phân\s*công\s+\S+\s+rải\s*ít\s*nhất\s*\d+\s*ngày|spread\s*days/iu,
    ],
    synonyms: ['rải phân công', 'spread days'],
    fewShots: [
      { text: 'Phân công Sơn dạy Toán 6A rải ít nhất 3 ngày.', params: { assignmentId: '', minDays: 3 } },
    ],
    negativeFewShots: [],
    requiredParams: ['assignmentId', 'minDays'],
    embedding: e(null),
  },
  {
    kind: 'weekly_periods_exact',
    scope: SCOPE.assignment,
    triggers: [
      /chính\s*xác\s*\d+\s*tiết|đúng\s*\d+\s*tiết\/tuần|đúng\s*\d+\s*tiết\s*mỗi\s*tuần/iu,
    ],
    synonyms: ['đúng N tiết', 'chính xác N tiết', 'tiết chuẩn'],
    fewShots: [
      { text: 'Phân công Sơn dạy Toán 6A đúng 3 tiết/tuần.', params: { assignmentId: '', count: 3 } },
    ],
    negativeFewShots: [],
    requiredParams: ['assignmentId', 'count'],
    embedding: e(null),
  },
  {
    kind: 'assignment_consecutive',
    scope: SCOPE.assignment,
    triggers: [
      /phân\s*công\s+\S+\s+cụm\s*\d+\s*tiết|assignment\s+consecutive/iu,
    ],
    synonyms: ['phân công cụm liên tiếp', 'consecutive'],
    fewShots: [
      { text: 'Phân công Sơn dạy Toán 6A cụm 2 tiết liên tiếp.', params: { assignmentId: '', length: 2 } },
    ],
    negativeFewShots: [],
    requiredParams: ['assignmentId', 'length'],
    embedding: e(null),
  },
  {
    kind: 'assignment_max_per_day',
    scope: SCOPE.assignment,
    triggers: [
      /phân\s*công\s+\S+\s+t[ốo]i\s*đa\s*\d+\s*tiết\/ngày/iu,
    ],
    synonyms: ['phân công tối đa N tiết ngày'],
    fewShots: [
      { text: 'Phân công Sơn dạy Toán 6A tối đa 1 tiết/ngày.', params: { assignmentId: '', max: 1 } },
    ],
    negativeFewShots: [],
    requiredParams: ['assignmentId', 'max'],
    embedding: e(null),
  },
  {
    kind: 'assignment_same_day',
    scope: SCOPE.assignment,
    triggers: [
      /phân\s*công\s+\S+\s+(và\s+\S+\s+)?cùng\s*ngày|cùng\s*ngày\s+nhau/iu,
    ],
    synonyms: ['phân công cùng ngày', 'cùng ngày'],
    fewShots: [
      { text: 'Phân công Sơn dạy Toán 6A và Hương dạy Văn 6B cùng ngày.', params: { assignmentIds: [] } },
    ],
    negativeFewShots: [],
    requiredParams: ['assignmentIds'],
    embedding: e(null),
  },
  {
    kind: 'assignment_not_same_day',
    scope: SCOPE.assignment,
    triggers: [
      /phân\s*công\s+\S+\s+không?\s*cùng\s*ngày|cấm\s+cùng\s*ngày/iu,
    ],
    synonyms: ['phân công không cùng ngày', 'khác ngày'],
    fewShots: [
      { text: 'Phân công Sơn dạy Toán 6A và Hương dạy Văn 6B không cùng ngày.', params: { assignmentIds: [] } },
    ],
    negativeFewShots: [],
    requiredParams: ['assignmentIds'],
    embedding: e(null),
  },
  {
    kind: 'if_then',
    scope: SCOPE.global,
    triggers: [
      /nếu[\s\S]+thì|neu[\s\S]+thi/iu,
    ],
    synonyms: ['nếu thì', 'nếu mà thì', 'khi nào thì', 'nếu điều kiện'],
    fewShots: [
      { text: 'Nếu Giáo viên Dung dạy Thứ 2 thì Giáo viên Sơn phải dạy Thứ 4.', params: {} },
      { text: 'Nếu Hiếu dạy thứ 2 tiết 2 thì Thủy không dạy thứ 5.', params: {} },
    ],
    negativeFewShots: [],
    requiredParams: ['if', 'then'],
    embedding: e(null),
  },
  {
    kind: 'pair_not_same_slot',
    scope: SCOPE.assignment,
    triggers: [
      /kh[ôo]ng(?:\s+đ[ượu][ợo]c)?\s*tr[ùu]ng\s*ti[ếe]t|tr[ùu]ng\s*ti[ếe]t|kh[ôo]ng(?:\s+đ[ượu][ợo]c)?\s*c[ùu]ng\s*ti[ếe]t/iu,
      /to[áa]n\s+\S+\s+v[àa]\s+v[ăa]n\s+\S+\s+kh[ôo]ng(?:\s+đ[ượu][ợo]c)?\s*tr[ùu]ng\s*ti[ếe]t/iu,
    ],
    synonyms: ['không trùng tiết', 'không được trùng tiết', 'trùng tiết', 'không cùng slot'],
    fewShots: [
      { text: 'Toán 6A và Văn 6A không được trùng tiết.', params: { assignmentIds: [] } },
    ],
    negativeFewShots: [],
    requiredParams: ['assignmentIds'],
    embedding: e(null),
  },
  {
    kind: 'pair_same_slot',
    scope: SCOPE.assignment,
    triggers: [
      /phải\s+cùng\s*tiết|cùng\s*tiết|cùng\s*slot/iu,
    ],
    synonyms: ['cùng tiết', 'cùng slot', 'phải cùng slot'],
    fewShots: [
      { text: 'Sinh hoạt 6A và Sinh hoạt 6B phải cùng tiết.', params: { assignmentIds: [] } },
    ],
    negativeFewShots: [],
    requiredParams: ['assignmentIds'],
    embedding: e(null),
  },
  {
    kind: 'mutual_exclusion',
    scope: SCOPE.assignment,
    triggers: [
      /nhóm\s*phân\s*công\s*(không\s*)?trùng\s*slot|mutual\s*exclusion|loại\s*trừ\s*nhau/iu,
    ],
    synonyms: ['mutual exclusion', 'loại trừ nhau', 'không trùng slot nhóm'],
    fewShots: [
      { text: 'Trong nhóm phân công này, không được có 2 phân công trùng slot.', params: { assignmentIds: [] } },
    ],
    negativeFewShots: [],
    requiredParams: ['assignmentIds'],
    embedding: e(null),
  },
  {
    kind: 'session_limit',
    scope: SCOPE.assignment,
    triggers: [
      /buổi\s+(sáng|chiều)\s+t[ốo]i\s*đa\s*\d+\s*tiết|giới\s*hạn\s*buổi/iu,
    ],
    synonyms: ['giới hạn buổi', 'buổi sáng tối đa', 'buổi chiều tối đa'],
    fewShots: [
      { text: 'Giáo viên Sơn buổi sáng tối đa 3 tiết.', params: { teacher: 'Sơn', maxPeriods: 3, session: 'morning' } },
    ],
    negativeFewShots: [],
    requiredParams: ['teacher', 'maxPeriods', 'session'],
    embedding: e(null),
  },
  {
    kind: 'subject_group',
    scope: SCOPE.subject,
    triggers: [
      /nhóm\s*môn\s+\S+\s+gom\s*:|môn\s+\S+\s+gom\s*:/iu,
    ],
    synonyms: ['nhóm môn', 'gom môn'],
    fewShots: [
      { text: 'Môn Khoa học tự nhiên gồm: Lý, Hóa, Sinh.', params: { subjects: ['Lý', 'Hóa', 'Sinh'] } },
    ],
    negativeFewShots: [],
    requiredParams: ['subjects'],
    embedding: e(null),
  },
  {
    kind: 'subject_group_daily_limit',
    scope: SCOPE.subject,
    triggers: [
      /mỗi\s*lớp\s+không?\s*được?\s*co\s*qua\s*\d+\s*môn\s+\S+\s*trong\s*cùng\s*1\s*ngày/iu,
    ],
    synonyms: ['nhóm môn giới hạn ngày', 'giới hạn môn nặng ngày'],
    fewShots: [
      { text: 'Mỗi lớp không được có quá 2 môn KHTN trong cùng 1 ngày.', params: { subjects: [], max: 2 } },
    ],
    negativeFewShots: [],
    requiredParams: ['subjects', 'max'],
    embedding: e(null),
  },
  {
    kind: 'subject_session_max_periods',
    scope: SCOPE.subject,
    triggers: [
      /môn\s+\S+\s+buổi\s+(sáng|chiều)\s+t[ốo]i\s*đa\s*\d+\s*tiết/iu,
    ],
    synonyms: ['môn buổi tối đa', 'giới hạn buổi môn'],
    fewShots: [
      { text: 'Môn Toán buổi sáng tối đa 3 tiết.', params: { subject: 'Toán', session: 'morning', max: 3 } },
    ],
    negativeFewShots: [],
    requiredParams: ['subject', 'session', 'max'],
    embedding: e(null),
  },
  // THEN positive atoms (F-6, F-7)
  {
    kind: 'teacher_required_day',
    scope: SCOPE.teacher,
    triggers: [
      /phải\s+dạy\s+thứ|phải\s+dạy\s+ngày/iu,
    ],
    synonyms: ['phải dạy thứ', 'bắt buộc dạy ngày'],
    fewShots: [
      { text: 'Giáo viên Sơn phải dạy Thứ 4.', params: { teacher: 'Sơn', day: 'wednesday' } },
    ],
    negativeFewShots: [],
    requiredParams: ['teacher', 'day'],
    embedding: e(null),
  },
  {
    kind: 'teacher_required_slot',
    scope: SCOPE.teacher,
    triggers: [
      /phải\s+dạy\s+thứ\s*\d+\s+tiết|bắt\s*buộc\s+dạy\s+slot/iu,
    ],
    synonyms: ['phải dạy slot', 'bắt buộc dạy thứ tiết'],
    fewShots: [
      { text: 'Giáo viên Sơn phải dạy Thứ 4 tiết 1.', params: { teacher: 'Sơn', day: 'wednesday', period: 1 } },
    ],
    negativeFewShots: [],
    requiredParams: ['teacher', 'day', 'period'],
    embedding: e(null),
  },
  {
    kind: 'teacher_pair_required_same_day',
    scope: SCOPE.teacher,
    triggers: [
      /phải\s+cùng\s*dạy\s+thứ|hai\s+GV\s+phải\s+cùng\s*ngày/iu,
    ],
    synonyms: ['phải cùng ngày', 'cùng dạy thứ'],
    fewShots: [
      { text: 'Giáo viên Sơn và Thúy phải cùng dạy Thứ 3.', params: { teachers: ['Sơn', 'Thúy'], day: 'tuesday' } },
    ],
    negativeFewShots: [],
    requiredParams: ['teachers', 'day'],
    embedding: e(null),
  },
  {
    kind: 'teacher_pair_required_same_slot',
    scope: SCOPE.teacher,
    triggers: [
      /phải\s+cùng\s*dạy\s+thứ\s*\d+\s+tiết|hai\s+GV\s+phải\s+cùng\s*slot/iu,
    ],
    synonyms: ['phải cùng slot', 'cùng dạy thứ tiết'],
    fewShots: [
      { text: 'Giáo viên Sơn và Thúy phải cùng dạy Thứ 3 tiết 1.', params: { teachers: ['Sơn', 'Thúy'], day: 'tuesday', period: 1 } },
    ],
    negativeFewShots: [],
    requiredParams: ['teachers', 'day', 'period'],
    embedding: e(null),
  },
];

// Build a lookup map from kind -> catalog entry
const CATALOG_BY_KIND = new Map<ConstraintKind, CatalogEntry>(
  CATALOG.map((entry) => [entry.kind, entry])
);

// ─── Retrieval Functions ────────────────────────────────────────────────────────

/** Simple tokenizer for Vietnamese text. */
function tokenize(text: string): string[] {
  return text
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .split(/[^\p{L}\p{M}\p{N}_]+/u)
    .filter(Boolean);
}

/** Cosine similarity between two vectors. */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Lexical match score: how many synonym tokens appear in the text. */
function lexicalScore(normalizedText: string, entry: CatalogEntry): number {
  const tokens = new Set(tokenize(normalizedText));
  let score = 0;
  for (const synonym of entry.synonyms) {
    const synTokens = tokenize(synonym);
    for (const t of synTokens) {
      if (tokens.has(t)) score++;
    }
  }
  // Bonus for trigger regex match
  for (const trigger of entry.triggers) {
    if (trigger.test(normalizedText)) score += 3;
  }
  return score;
}

/** Retrieve top-k candidates within a scope (or all scopes if scope is null). */
export function retrieveTopK(
  hints: ConstraintResolverHints,
  scope: BuiltInConstraintScope | null,
  k = 5
): ConstraintRetrieverCandidate[] {
  const text = hints.normalizedText;
  if (!text) return [];

  // Build a candidate list filtered by scope
  const candidates = scope
    ? CATALOG.filter((e) => e.scope === scope)
    : CATALOG;

  // Semantic direction analysis for scoring boosts
  const semanticAnalysis = analyzeSemanticDirection(text);

  // Score each candidate
  const scored = candidates.map((entry) => {
    let score = lexicalScore(text, entry);

    // Scope-inference bonus: if we already inferred the scope and it matches, boost
    if (scope === null && hints.inferredScope && entry.scope === hints.inferredScope) {
      score += 2;
    }

    // Keyword bonus: boost kinds matching the detected keywords
    if (hints.mentionsBlock && semanticAnalysis.direction === 'block') {
      if (entry.triggers.some((tr) => tr.test(text))) score += 2;
    }
    if (hints.mentionsMax && /(t[ốo]i\s*đa|không?\s*quá|giới\s*hạn)/iu.test(text)) {
      if (entry.kind.includes('max') || entry.kind.includes('limit')) score += 2;
    }
    if (hints.mentionsConsecutive && /(liên\s*tiếp|liên\s*tục)/iu.test(text)) {
      if (entry.kind.includes('consecutive')) score += 2;
    }
    if (hints.mentionsIfThen && /(nếu|neu)[\s\S]+(thì|thi)/iu.test(text)) {
      if (entry.kind === 'if_then') score += 5;
    }

    // Semantic direction bonus: strongly favor kinds matching the detected direction.
    // This MUST outweigh generic lexical overlap on shared tokens like 'tiết'/'dạy'/'có'
    // so that a require direction cannot be silently flipped into a block/only kind
    // (or vice versa) due to incidental token overlap.
    if (semanticAnalysis.direction !== 'unknown' && semanticAnalysis.direction !== 'contradictory') {
      if (semanticAnalysis.direction === 'require' && entry.kind.includes('required')) {
        score += 10;
      } else if (semanticAnalysis.direction === 'block' && entry.kind.includes('block')) {
        score += 10;
      } else if (semanticAnalysis.direction === 'only' && entry.kind.includes('allowed')) {
        score += 10;
      } else if (semanticAnalysis.direction === 'prefer' && entry.kind.includes('preferred')) {
        score += 10;
      }
    }

    // Anti-flip penalty: when direction is clearly detected, demote any kind that
    // contradicts the direction. This prevents "phải có" → block/only, "không dạy" →
    // require, and "chỉ dạy" → require/allowed_only_without_chỉ.
    if (semanticAnalysis.direction === 'require') {
      if (entry.kind.includes('block') || entry.kind.includes('allowed') || entry.kind.includes('preferred')) {
        score -= 8;
      }
    } else if (semanticAnalysis.direction === 'block') {
      if (entry.kind.includes('required') || entry.kind.includes('allowed') || entry.kind.includes('preferred')) {
        score -= 8;
      }
    } else if (semanticAnalysis.direction === 'only') {
      if (entry.kind.includes('required') || entry.kind.includes('block') || entry.kind.includes('preferred')) {
        score -= 8;
      }
    } else if (semanticAnalysis.direction === 'prefer') {
      if (entry.kind.includes('required') || entry.kind.includes('block') || entry.kind.includes('allowed')) {
        score -= 8;
      }
    }

    return { entry, score };
  });

  // Sort by score desc, then return top-k
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map(({ entry, score }) => ({
    kind: entry.kind,
    scope: entry.scope,
    score,
    embedding: entry.embedding,
    triggers: entry.triggers,
    synonyms: entry.synonyms,
    fewShots: entry.fewShots,
    negativeFewShots: entry.negativeFewShots,
    requiredParams: entry.requiredParams,
  }));
}

/** Build the LLM prompt context for a single kind candidate. */
export function buildKindContext(
  candidate: ConstraintRetrieverCandidate,
  meta: ReturnType<typeof getConstraintMeta>
): string {
  const params = meta?.requiredParams?.join(', ') ?? candidate.requiredParams.join(', ');
  const examples = candidate.fewShots
    .map((fs) => `  Ví dụ: "${fs.text}" → params: ${JSON.stringify(fs.params)}`)
    .join('\n');
  const negativeExamples = candidate.negativeFewShots
    .map((nfs) => `  KHÔNG phải ${candidate.kind}: "${nfs.text}" (thực ra là ${nfs.actuallyMapsTo} vì ${nfs.reason})`)
    .join('\n');
  const negBlock = negativeExamples ? `\n${negativeExamples}` : '';
  return `- ${candidate.kind} [${candidate.scope}]: params = [${params}]
${examples}${negBlock}`;
}

/** Build the dynamic prompt section: top-k kinds with their few-shots. */
export function buildTopKPromptSection(
  candidates: ConstraintRetrieverCandidate[],
  scope: BuiltInConstraintScope | null
): string {
  if (candidates.length === 0) return '  (no candidate)';
  return candidates.map((c) => buildKindContext(c, getConstraintMeta(c.kind))).join('\n');
}

// ─── Precompute Embeddings Script ──────────────────────────────────────────────
// Run: npx ts-node scripts/offline/compute-embeddings.ts
// This regenerates CATALOG with real vectors.
// For now, embeddings are null (lexical-only mode).

/**
 * Compute cosine similarity between text embedding and a catalog embedding.
 * Uses simple TF-IDF-like vectors as placeholder until real embeddings are precomputed.
 */
export function computeTextEmbedding(text: string): number[] {
  // Simple TF-IDF-like 384-dim vector (placeholder).
  // In production, call the embedding API offline and cache in CATALOG.
  const tokens = tokenize(text);
  const dim = 384;
  const vec = new Array<number>(dim).fill(0);
  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
    }
    const idx = hash % dim;
    vec[idx] += 1;
  }
  // Normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < dim; i++) vec[i] /= norm;
  }
  return vec;
}

/** Embedding-based top-k rerank (used when text embedding is available). */
export function retrieveTopKWithEmbedding(
  hints: ConstraintResolverHints,
  scope: BuiltInConstraintScope | null,
  k = 5
): ConstraintRetrieverCandidate[] {
  const candidates = scope
    ? CATALOG.filter((e) => e.scope === scope)
    : CATALOG;

  const textVec = computeTextEmbedding(hints.normalizedText);

  const scored = candidates.map((entry) => {
    let score = lexicalScore(hints.normalizedText, entry);

    // If entry has a real embedding, add cosine similarity
    if (entry.embedding && entry.embedding.length === textVec.length) {
      const sim = cosineSimilarity(textVec, entry.embedding);
      score += sim * 5; // Weight embedding score
    }

    if (scope === null && hints.inferredScope && entry.scope === hints.inferredScope) {
      score += 2;
    }
    if (hints.mentionsIfThen && /(nếu|neu)[\s\S]+(thì|thi)/iu.test(hints.normalizedText)) {
      if (entry.kind === 'if_then') score += 5;
    }

    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((c) => ({
    kind: c.entry.kind,
    scope: c.entry.scope,
    score: c.score,
    embedding: c.entry.embedding,
    triggers: c.entry.triggers,
    synonyms: c.entry.synonyms,
    fewShots: c.entry.fewShots,
    negativeFewShots: c.entry.negativeFewShots,
    requiredParams: c.entry.requiredParams,
  }));
}
