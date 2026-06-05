import { randomUUID } from 'node:crypto';

import type { AgentInputPayload, AIProviderConfig, ConstraintItemInput } from './types';
import type { ConstraintSpec } from './constraint-spec';
import { __translatorInternal, runTranslatorTurn } from './translator';
import { buildDraftFromSpecs } from './constraint-draft-validator';
import { humanizeDraft } from './constraint-humanizer';
import type { ParsedConstraintDraft, RawConstraintInput } from './constraint-review-types';
import { inferRuleParseConfidence } from './rule-parse-confidence';

function toRawInputs(constraints: ConstraintItemInput[]): RawConstraintInput[] {
  const now = new Date().toISOString();
  return constraints.map((c) => ({
    id: randomUUID(),
    text: c.text,
    type: c.type,
    weight: c.weight,
    createdAt: now,
  }));
}

function specsForConstraintText(input: AgentInputPayload, text: string, type: 'required' | 'preferred', weight?: number): ConstraintSpec[] {
  const slice: AgentInputPayload = {
    ...input,
    constraints: [{ type, text, weight }],
  };
  const raw = __translatorInternal.fallbackFromRuleParser(slice);
  return __translatorInternal.sanitizeSpecs(slice, raw).filter((s) => s.original === text || s.original.trim() === text.trim());
}

function mergeRuleIssues(
  base: ParsedConstraintDraft['issues'],
  ruleIssues: ParsedConstraintDraft['issues']
): ParsedConstraintDraft['issues'] {
  const seen = new Set(base.map((i) => i.code + i.message));
  const merged = [...base];
  for (const issue of ruleIssues) {
    const key = issue.code + issue.message;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(issue);
    }
  }
  return merged;
}

function buildDraft(
  input: AgentInputPayload,
  raw: RawConstraintInput,
  specs: ConstraintSpec[],
  source: ParsedConstraintDraft['source'],
  confidence: ParsedConstraintDraft['confidence'],
  extraIssues: ParsedConstraintDraft['issues'] = []
): ParsedConstraintDraft {
  const draft = buildDraftFromSpecs(`draft_${raw.id}`, raw, specs, input, {
    source,
    confidence,
    explanation: humanizeDraft({
      id: '',
      rawConstraintId: raw.id,
      original: raw.text,
      proposedSpecs: specs,
      status: 'parsed',
      confidence,
      explanation: '',
      issues: [],
      source,
    }),
  });
  return {
    ...draft,
    issues: mergeRuleIssues(draft.issues, extraIssues),
  };
}

function needsTranslator(rule: ReturnType<typeof inferRuleParseConfidence>, raw: RawConstraintInput): boolean {
  if (rule.confidence === 'high' && rule.specs.length > 0 && !rule.specs.some((s) => s.kind === 'custom_dsl')) {
    return false;
  }
  if (raw.type === 'preferred' && rule.specs.length > 0 && rule.confidence !== 'low') {
    return false;
  }
  return rule.confidence === 'low' || rule.specs.length === 0 || rule.specs.some((s) => s.kind === 'custom_dsl');
}

/**
 * Parse user constraints into review drafts (rule first, translator for unresolved).
 * Does not run the solver.
 */
/** Parse với raw id ổn định (khớp ConstraintItem.id trên UI). */
export async function parseConstraintDraftsWithRaws(
  input: AgentInputPayload,
  raws: RawConstraintInput[],
  config: AIProviderConfig
): Promise<ParsedConstraintDraft[]> {
  if (!raws.length) return [];

  const drafts: ParsedConstraintDraft[] = [];
  const pendingForLlm: RawConstraintInput[] = [];

  for (const raw of raws) {
    const specs = specsForConstraintText(input, raw.text, raw.type, raw.weight);
    const rule = inferRuleParseConfidence(raw.text, specs);

    if (!needsTranslator(rule, raw)) {
      drafts.push(buildDraft(input, raw, rule.specs, 'rule', rule.confidence, rule.issues));
      continue;
    }
    pendingForLlm.push(raw);
  }

  if (pendingForLlm.length === 0) {
    return drafts;
  }

  const llmInput: AgentInputPayload = {
    ...input,
    constraints: pendingForLlm.map((r) => ({
      type: r.type,
      text: r.text,
      weight: r.weight,
    })),
  };

  let translatorSpecs: ConstraintSpec[] = [];
  try {
    const turn = await runTranslatorTurn(config, llmInput);
    translatorSpecs = turn.constraintSpecs;
  } catch {
    translatorSpecs = [];
  }

  for (const raw of pendingForLlm) {
    const fromLlm = translatorSpecs.filter(
      (s) => s.original === raw.text || s.original.trim() === raw.text.trim()
    );
    const ruleSpecs = specsForConstraintText(input, raw.text, raw.type, raw.weight);
    const rule = inferRuleParseConfidence(raw.text, ruleSpecs);
    const specs = fromLlm.length > 0 ? fromLlm : ruleSpecs;
    const source: ParsedConstraintDraft['source'] = fromLlm.length > 0 ? 'translator' : 'rule';
    const confidence: ParsedConstraintDraft['confidence'] =
      fromLlm.length > 0 ? 'medium' : rule.confidence;
    drafts.push(buildDraft(input, raw, specs, source, confidence, rule.issues));
  }

  return drafts;
}

export async function parseConstraintDrafts(
  input: AgentInputPayload,
  config: AIProviderConfig
): Promise<ParsedConstraintDraft[]> {
  const raws = toRawInputs(input.constraints);
  return parseConstraintDraftsWithRaws(input, raws, config);
}

export function rawConstraintsFromInput(constraints: ConstraintItemInput[]): RawConstraintInput[] {
  return toRawInputs(constraints);
}
