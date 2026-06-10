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
const REQUIRE_PATTERNS = [
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
const BLOCK_PATTERNS = [
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

function matchPatterns(text: string, patterns: readonly { pattern: RegExp; marker: string; weight: number }[]): { markers: string[]; score: number } {
  const markers: string[] = [];
  let score = 0;
  for (const p of patterns) {
    if (p.pattern.test(text)) {
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

  // Prefer "require" over "only" when both are present (e.g., "phải có chỉ tiết 4")
  // This is a rare edge case; in practice the user will clarify.
  if (hasRequire && hasOnly) {
    // If require score is higher, pick require. Otherwise pick only.
    if (scores.require >= scores.only) {
      return {
        direction: 'require',
        confidence: scores.require * 0.9, // penalize ambiguity
        matched,
        hasConflict: true,
        explanation: `Câu có cả "phải có" và "chỉ" — chọn require vì điểm cao hơn (${scores.require} vs ${scores.only}).`,
      };
    } else {
      return {
        direction: 'only',
        confidence: scores.only * 0.9,
        matched,
        hasConflict: true,
        explanation: `Câu có cả "phải có" và "chỉ" — chọn only vì điểm cao hơn (${scores.only} vs ${scores.require}).`,
      };
    }
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
