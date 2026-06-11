import { findDisambiguationMatch, type DisambiguationDirection } from './disambiguation-table';

/**
 * semantic-direction.ts — Unified Semantic Direction Analyzer
 *
 * Extracts semantic direction from Vietnamese constraint text. This module
 * is used by ALL parser paths (built-in-suggestion, constraint-retriever,
 * ir-first-parser, negative-guard, shadow-mode) to ensure consistent
 * semantic interpretation across the entire pipeline.
 *
 * Design:
 *   - Pure function (no side effects)
 *   - Pattern-based (no LLM)
 *   - Deterministic
 *   - Handles Vietnamese canonical phrases (accented + unaccented)
 *
 * Semantic direction taxonomy:
 *   - 'require': positive intent (phải có, cần có, ít nhất, bắt buộc)
 *   - 'block': negative intent (không, cấm, nghỉ, tránh)
 *   - 'only': set-restricting positive (chỉ, chỉ dạy, chỉ học, chỉ được)
 *   - 'prefer': soft preference (nên, ưu tiên, thích, muốn)
 *   - 'unknown': no clear direction markers detected
 *   - 'contradictory': both positive and negative markers present
 */

export type SemanticDirection = 'require' | 'block' | 'only' | 'prefer' | 'unknown' | 'contradictory';

export type SemanticAnalysis = {
  /** Primary semantic direction detected. */
  direction: SemanticDirection;
  /** Confidence score (0-1) based on marker strength and context. */
  confidence: number;
  /** Matched markers (for debugging/logging). */
  matched: {
    require: string[];
    block: string[];
    only: string[];
    prefer: string[];
  };
  /** Whether multiple conflicting directions were detected. */
  hasConflict: boolean;
  /** Caller should surface clarification instead of auto-picking direction. */
  needsClarification?: boolean;
  /** Human-readable explanation of the decision. */
  explanation: string;
};

// ─── Marker Patterns ─────────────────────────────────────────────────────

/**
 * Unicode-aware word boundary lookarounds.
 * `\b` in JS regex is ASCII-only and breaks for Vietnamese diacritics
 * (e.g., "nghỉ" — the \b between "ú" and "n" fails). We use
 * lookarounds on Unicode letters/marks so boundaries work for VI text.
 */
const WORD_BOUNDARY = {
  start: '(?<![\\p{L}\\p{M}\\d_])',
  end: '(?![\\p{L}\\p{M}\\d_])',
};
const BOUNDED = (inner: string): string =>
  `${WORD_BOUNDARY.start}${inner}${WORD_BOUNDARY.end}`;

/** REQUIRE markers: positive intent, at-least semantics. */
export const REQUIRE_PATTERNS = [
  { pattern: new RegExp(BOUNDED('ph[ảa]i\\s+c[óo]'), 'iu'), marker: 'phải có', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('phai\\s+co'), 'iu'), marker: 'phai co', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('c[ầa]n\\s+c[óo]'), 'iu'), marker: 'cần có', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('can\\s+co'), 'iu'), marker: 'can co', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('[íi]t\\s+nh[ấa]t'), 'iu'), marker: 'ít nhất', weight: 0.95 },
  { pattern: new RegExp(BOUNDED('it\\s+nhat'), 'iu'), marker: 'it nhat', weight: 0.95 },
  { pattern: new RegExp(BOUNDED('c[óo]\\s+[íi]t\\s+nh[ấa]t'), 'iu'), marker: 'có ít nhất', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('co\\s+it\\s+nhat'), 'iu'), marker: 'co it nhat', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('b[ắa]t\\s+bu[ộo]c\\s+(c[óo]|ph[ảa]i)'), 'iu'), marker: 'bắt buộc', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('bat\\s+buoc\\s+(co|phai)'), 'iu'), marker: 'bat buoc', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('b[ắa]t\\s+bu[ộo]c'), 'iu'), marker: 'bắt buộc', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('ph[ảa]i\\s+đ[ượu][ợo]c'), 'iu'), marker: 'phải được', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('phai\\s+duoc'), 'iu'), marker: 'phai duoc', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('nh[ấa]t\\s+đ[ịi]nh\\s+ph[ảa]i'), 'iu'), marker: 'nhất định phải', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('nhat\\s+dinh\\s+phai'), 'iu'), marker: 'nhat dinh phai', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('t[ốo]i\\s+thi[ểe]u'), 'iu'), marker: 'tối thiểu', weight: 0.9 },
  { pattern: new RegExp(BOUNDED('toi\\s+thieu'), 'iu'), marker: 'toi thieu', weight: 0.9 },
] as const;

/** BLOCK markers: negative intent, forbid semantics. */
export const BLOCK_PATTERNS = [
  { pattern: new RegExp(BOUNDED('kh[ôo]ng\\s+c[óo]'), 'iu'), marker: 'không có', weight: 0.95 },
  { pattern: new RegExp(BOUNDED('khong\\s+co'), 'iu'), marker: 'khong co', weight: 0.95 },
  { pattern: new RegExp(BOUNDED('kh[ôo]ng\\s+(d[ạa]y|h[ọo]c|đ[ượu][ợo]c|x[ếe]p)'), 'iu'), marker: 'không', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('khong\\s+(day|hoc|duoc|xep)'), 'iu'), marker: 'khong', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('ko\\s+(d[ạa]y|h[ọo]c|đ[ượu][ợo]c)'), 'iu'), marker: 'ko', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('c[ấa]m'), 'iu'), marker: 'cấm', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('cam'), 'iu'), marker: 'cam', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('ngh[ỉi]'), 'iu'), marker: 'nghỉ', weight: 0.95 },
  { pattern: new RegExp(BOUNDED('nghi'), 'iu'), marker: 'nghi', weight: 0.95 },
  { pattern: new RegExp(BOUNDED('đ[ừu]ng'), 'iu'), marker: 'đừng', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('dung'), 'iu'), marker: 'dung', weight: 0.8 },
  { pattern: new RegExp(BOUNDED('tr[áa]nh'), 'iu'), marker: 'tránh', weight: 0.9 },
  { pattern: new RegExp(BOUNDED('tranh'), 'iu'), marker: 'tranh', weight: 0.9 },
  { pattern: new RegExp(BOUNDED('n[ée]'), 'iu'), marker: 'né', weight: 0.85 },
  { pattern: new RegExp(BOUNDED('ne'), 'iu'), marker: 'ne', weight: 0.85 },
  { pattern: new RegExp(BOUNDED('d[ừu]ng'), 'iu'), marker: 'dừng', weight: 0.9 },
] as const;

/** ONLY markers: positive set-restricting (whitelist) semantics. */
const ONLY_PATTERNS = [
  { pattern: new RegExp(BOUNDED('ch[ỉi]\\s+(d[ạa]y|h[ọo]c|đ[ượu][ợo]c|x[ếe]p|r[ảa]nh)'), 'iu'), marker: 'chỉ', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('chi\\s+(day|hoc|duoc|xep|ranh)'), 'iu'), marker: 'chi', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('ch[ỉi]\\s+đ[ượu][ợo]c\\s+(d[ạa]y|h[ọo]c|x[ếe]p)'), 'iu'), marker: 'chỉ được', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('chi\\s+duoc\\s+(day|hoc|xep)'), 'iu'), marker: 'chi duoc', weight: 1.0 },
  { pattern: new RegExp(BOUNDED('c[ốo]\\s+đ[ịi]nh'), 'iu'), marker: 'cố định', weight: 0.95 },
  { pattern: new RegExp(BOUNDED('co\\s+dinh'), 'iu'), marker: 'co dinh', weight: 0.95 },
  { pattern: new RegExp(BOUNDED('whitelist'), 'iu'), marker: 'whitelist', weight: 1.0 },
] as const;

/** PREFER markers: soft preference, not hard constraint. */
const PREFER_PATTERNS = [
  { pattern: new RegExp(BOUNDED('n[êe]n'), 'iu'), marker: 'nên', weight: 0.9 },
  { pattern: new RegExp(BOUNDED('nen'), 'iu'), marker: 'nen', weight: 0.9 },
  { pattern: new RegExp(BOUNDED('[ưu]u\\s+ti[êe]n'), 'iu'), marker: 'ưu tiên', weight: 0.95 },
  { pattern: new RegExp(BOUNDED('uu\\s+tien'), 'iu'), marker: 'uu tien', weight: 0.95 },
  { pattern: new RegExp(BOUNDED('th[íi]ch'), 'iu'), marker: 'thích', weight: 0.9 },
  { pattern: new RegExp(BOUNDED('thich'), 'iu'), marker: 'thich', weight: 0.9 },
  { pattern: new RegExp(BOUNDED('mu[ốo]n'), 'iu'), marker: 'muốn', weight: 0.85 },
  { pattern: new RegExp(BOUNDED('muon'), 'iu'), marker: 'muon', weight: 0.85 },
  { pattern: new RegExp(BOUNDED('prefer'), 'iu'), marker: 'prefer', weight: 0.95 },
] as const;

// ─── Analyzer ─────────────────────────────────────────────────────────────

const NEGATED_BLOCK_CONTEXT = /(?:khong|không)\s+phai|chang\s+phai|khong\s+can\s+phai|khong\s+phai\s+la/iu;

function accentFold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function isNegatedBlockMarker(text: string, marker: string): boolean {
  const markerKey = accentFold(marker);
  if (!/(nghi|cam|tranh)/iu.test(markerKey)) return false;
  return NEGATED_BLOCK_CONTEXT.test(accentFold(text));
}

function matchPatterns(text: string, patterns: readonly { pattern: RegExp; marker: string; weight: number }[]): { markers: string[]; score: number } {
  const markers: string[] = [];
  let score = 0;
  for (const p of patterns) {
    if (p.pattern.test(text) && !isNegatedBlockMarker(text, p.marker)) {
      markers.push(p.marker);
      score = Math.max(score, p.weight);
    }
  }
  return { markers, score };
}

/**
 * Analyze the semantic direction of a Vietnamese constraint text.
 *
 * @param text raw user input (Vietnamese)
 * @returns semantic analysis with direction + confidence
 */
export function analyzeSemanticDirection(text: string): SemanticAnalysis {
  const normalized = text.normalize('NFC').replace(/\s+/g, ' ').trim();

  const requireMatch = matchPatterns(normalized, REQUIRE_PATTERNS);
  const blockMatch = matchPatterns(normalized, BLOCK_PATTERNS);
  const onlyMatch = matchPatterns(normalized, ONLY_PATTERNS);
  const preferMatch = matchPatterns(normalized, PREFER_PATTERNS);

  const matched = {
    require: requireMatch.markers,
    block: blockMatch.markers,
    only: onlyMatch.markers,
    prefer: preferMatch.markers,
  };

  const scores = {
    require: requireMatch.score,
    block: blockMatch.score,
    only: onlyMatch.score,
    prefer: preferMatch.score,
  };

  // Conflict detection: if both require and block are present, mark contradictory
  const hasRequire = requireMatch.markers.length > 0;
  const hasBlock = blockMatch.markers.length > 0;
  const hasOnly = onlyMatch.markers.length > 0;
  const hasPrefer = preferMatch.markers.length > 0;

  if (hasRequire && hasBlock) {
    return {
      direction: 'contradictory',
      confidence: 0,
      matched,
      hasConflict: true,
      explanation: `Câu vừa chứa mỏ neo yêu cầu (${requireMatch.markers.join(', ')}) vừa chứa mỏ neo phủ định (${blockMatch.markers.join(', ')}) — không thể tự quyết định nghĩa.`,
    };
  }

  // Require + only together is genuinely ambiguous — ask user instead of guessing.
  if (hasRequire && hasOnly) {
    return {
      direction: 'unknown',
      confidence: 0.3,
      matched,
      hasConflict: true,
      needsClarification: true,
      explanation: `Câu có cả "phải có" và "chỉ" — cần làm rõ ý định (require vs only).`,
    };
  }

  // Prefer "only" over "block" when both are present (e.g., "chỉ dạy không dạy" is rare)
  if (hasOnly && hasBlock) {
    if (scores.only >= scores.block) {
      return {
        direction: 'only',
        confidence: scores.only * 0.9,
        matched,
        hasConflict: true,
        explanation: `Câu có cả "chỉ" và "không" — chọn only vì điểm cao hơn (${scores.only} vs ${scores.block}).`,
      };
    } else {
      return {
        direction: 'block',
        confidence: scores.block * 0.9,
        matched,
        hasConflict: true,
        explanation: `Câu có cả "chỉ" và "không" — chọn block vì điểm cao hơn (${scores.block} vs ${scores.only}).`,
      };
    }
  }

  // Single direction detected
  if (hasRequire) {
    return {
      direction: 'require',
      confidence: scores.require,
      matched,
      hasConflict: false,
      explanation: `Câu chứa mỏ neo yêu cầu: ${requireMatch.markers.join(', ')}`,
    };
  }

  if (hasBlock) {
    return {
      direction: 'block',
      confidence: scores.block,
      matched,
      hasConflict: false,
      explanation: `Câu chứa mỏ neo phủ định: ${blockMatch.markers.join(', ')}`,
    };
  }

  if (hasOnly) {
    return {
      direction: 'only',
      confidence: scores.only,
      matched,
      hasConflict: false,
      explanation: `Câu chứa mỏ neo giới hạn: ${onlyMatch.markers.join(', ')}`,
    };
  }

  if (hasPrefer) {
    return {
      direction: 'prefer',
      confidence: scores.prefer,
      matched,
      hasConflict: false,
      explanation: `Câu chứa mỏ neo ưu tiên: ${preferMatch.markers.join(', ')}`,
    };
  }

  // No direction detected
  return {
    direction: 'unknown',
    confidence: 0,
    matched,
    hasConflict: false,
    explanation: 'Không phát hiện mỏ neo ngữ nghĩa rõ ràng',
  };
}

/**
 * Check if a text contains a require marker (convenience wrapper).
 */
export function hasRequireMarker(text: string): boolean {
  return analyzeSemanticDirection(text).matched.require.length > 0;
}

/**
 * Check if a text contains a block marker (convenience wrapper).
 */
export function hasBlockMarker(text: string): boolean {
  return analyzeSemanticDirection(text).matched.block.length > 0;
}

/**
 * Check if a text contains an only marker (convenience wrapper).
 */
export function hasOnlyMarker(text: string): boolean {
  return analyzeSemanticDirection(text).matched.only.length > 0;
}

/**
 * Check if a text contains a prefer marker (convenience wrapper).
 */
export function hasPreferMarker(text: string): boolean {
  return analyzeSemanticDirection(text).matched.prefer.length > 0;
}

/**
 * Check if a text has contradictory markers (convenience wrapper).
 */
export function hasContradiction(text: string): boolean {
  return analyzeSemanticDirection(text).direction === 'contradictory';
}

function normalizeForMentions(text: string): string {
  return text
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Shared mention flags for resolver / retriever (single source of truth). */
export function mentionsMaxMarker(text: string): boolean {
  const normalized = normalizeForMentions(text);
  return /\b(toi\s*da|khong\s*qua|khong\s*hon|gioi\s*han|qua\s*\d|khong\s*day\s*qua|day\s*qua)\b/iu.test(normalized);
}

export function mentionsMinMarker(text: string): boolean {
  const normalized = normalizeForMentions(text);
  return /\b(it\s*nhat|toi\s*thieu)\b/iu.test(normalized);
}

export function mentionsConsecutiveMarker(text: string): boolean {
  const normalized = normalizeForMentions(text);
  return /\b(lien\s*tiep|lien\s*tuc)\b/iu.test(normalized);
}

export function mentionsIfThenMarker(text: string): boolean {
  const normalized = normalizeForMentions(text);
  return /\b(neu)\b/iu.test(normalized) && /\b(thi)\b/iu.test(normalized);
}

function mapDisambiguationDirection(direction: DisambiguationDirection): SemanticDirection {
  if (direction === 'soft_prefer') return 'prefer';
  return direction;
}

/**
 * Resolve semantic direction with disambiguation table first, then regex markers.
 * Surfaces needsClarification when direction is genuinely ambiguous.
 */
export function resolveSemanticDirection(text: string): SemanticAnalysis {
  const markerAnalysis = analyzeSemanticDirection(text);
  if (markerAnalysis.needsClarification) return markerAnalysis;

  const negatedBlockPhrase = NEGATED_BLOCK_CONTEXT.test(accentFold(text));
  const disambig = findDisambiguationMatch(text);
  if (disambig.length > 0 && !negatedBlockPhrase) {
    const match = disambig[0];
    if (match.contradictory) {
      return {
        direction: 'contradictory',
        confidence: 0,
        matched: markerAnalysis.matched,
        hasConflict: true,
        needsClarification: true,
        explanation: `Disambiguation ${match.row.id}: câu vừa positive vừa negative — cần làm rõ.`,
      };
    }
    const direction =
      match.direction === 'positive'
        ? mapDisambiguationDirection(match.row.positiveDirection)
        : match.direction === 'negative'
          ? mapDisambiguationDirection(match.row.negativeDirection)
          : 'prefer';
    return {
      direction,
      confidence: 0.95,
      matched: markerAnalysis.matched,
      hasConflict: false,
      explanation: `Disambiguation ${match.row.id} → ${match.recommendedKind}`,
    };
  }

  if (markerAnalysis.hasConflict && markerAnalysis.direction !== 'contradictory') {
    return {
      ...markerAnalysis,
      direction: 'unknown',
      confidence: 0.3,
      needsClarification: true,
      explanation: `${markerAnalysis.explanation} — cần làm rõ hướng ngữ nghĩa.`,
    };
  }
  return markerAnalysis;
}
