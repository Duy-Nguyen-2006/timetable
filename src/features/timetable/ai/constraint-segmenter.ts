import { normalizeConstraintText } from './translator-text';
import type { ConstraintSegment } from './segment-types';

const ILLUSTRATION_RE = /\s*(?:,?\s*)(ví dụ|chẳng hạn|kiểu như|như là)\s+(.+)$/iu;

function normalizeDayToken(raw: string): string | undefined {
  const normalized = normalizeConstraintText(raw);
  const match = normalized.match(/\bthu\s*(2|3|4|5|6|7)\b/u);
  return match ? `thu${match[1]}` : undefined;
}

function splitAtoms(text: string): string[] {
  return text
    .split(/\s+(?:và|va|đồng\s+thời|dong\s+thoi)\s+/iu)
    .map((part) => part.trim().replace(/^[,;]\s*/u, ''))
    .filter(Boolean);
}

export function segmentConstraint(rawText: string): ConstraintSegment {
  const illustrationMatch = rawText.match(ILLUSTRATION_RE);
  const droppedIllustrations = illustrationMatch ? [illustrationMatch[0].replace(/^[,\s]+/u, '').trim()] : [];
  const withoutIllustration = illustrationMatch ? rawText.slice(0, illustrationMatch.index).trim() : rawText.trim();
  const normalized = withoutIllustration.replace(/\s+/gu, ' ').trim();
  const scopeDay = normalizeDayToken(normalized.match(/\bvào\s+thứ\s*\d\b/iu)?.[0] ?? normalized);
  const ifThenMatch = normalized.match(/(?:^|[,;]\s*)nếu\s+(.+?)\s+thì\s+(.+)$/iu);

  if (ifThenMatch) {
    return {
      normalizedVi: normalized,
      scope: scopeDay ? { day: scopeDay } : undefined,
      shape: 'if_then',
      ifClause: ifThenMatch[1].trim(),
      atoms: splitAtoms(ifThenMatch[2]),
      droppedIllustrations,
    };
  }

  return {
    normalizedVi: normalized,
    scope: scopeDay ? { day: scopeDay } : undefined,
    shape: 'simple',
    atoms: splitAtoms(normalized),
    droppedIllustrations,
  };
}
