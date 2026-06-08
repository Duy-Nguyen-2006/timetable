import { humanizeConstraintSpec } from './constraint-humanizer';
import type { ConstraintSpec } from './constraint-spec';
import { __translatorInternal } from './translator';
import { normalizeConstraintText } from './translator-text';
import type { AgentInputPayload } from './types';

function specsForOriginalText(input: AgentInputPayload, originalText: string): ConstraintSpec[] {
  const slice: AgentInputPayload = {
    ...input,
    constraints: [{ type: 'required', text: originalText }],
  };
  const raw = __translatorInternal.fallbackFromRuleParser(slice);
  const sanitized = __translatorInternal.sanitizeSpecs(slice, raw);
  const trimmed = originalText.trim();
  return sanitized.filter(
    (spec) => spec.original === originalText || spec.original.trim() === trimmed
  );
}

/** Vietnamese display from deterministic rule parser (built-in / if_then), or null if not structured. */
export function canonicalDisplayFromRuleParser(
  input: AgentInputPayload,
  originalText: string
): string | null {
  const specs = specsForOriginalText(input, originalText);
  if (!specs.length) return null;
  if (specs.some((spec) => spec.kind === 'custom_dsl')) return null;
  if (specs.some((spec) => spec.notes?.includes('UNPARSED_THEN') && spec.kind === 'if_then')) {
    const thenList = specs[0]?.params?.then;
    if (!Array.isArray(thenList) || thenList.length === 0) return null;
  }
  return specs.map((spec) => humanizeConstraintSpec(spec)).join('\n');
}

export function isNearVerbatimConstraintEcho(original: string, candidate: string): boolean {
  const source = normalizeConstraintText(original);
  const normalized = normalizeConstraintText(candidate.replace(/[.!?]+$/u, '').trim());
  if (!source || !normalized) return false;
  if (source === normalized) return true;
  const hasGiáoViên = /\bgiao vien\b/u.test(normalized);
  return !hasGiáoViên && normalized.length <= source.length + 8 && source.length >= 12;
}

export function preferCanonicalNormalizedText(
  agentInput: AgentInputPayload,
  originalText: string,
  modelText: string
): string {
  const canonical = canonicalDisplayFromRuleParser(agentInput, originalText);
  if (!canonical) return modelText;
  if (isNearVerbatimConstraintEcho(originalText, modelText)) return canonical;
  if (/nếu|neu/iu.test(originalText) && /thì|thi/iu.test(originalText) && !/\bgiáo viên\b/iu.test(modelText)) {
    return canonical;
  }
  return modelText;
}
