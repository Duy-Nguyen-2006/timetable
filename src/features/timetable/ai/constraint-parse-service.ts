import { randomUUID } from 'node:crypto';

import type { AgentInputPayload, AIProviderConfig, ConstraintItemInput } from './types';
import type { ConstraintSpec } from './constraint-spec';
import { __translatorInternal, runTranslatorTurn } from './translator';
import { buildDraftFromSpecs } from './constraint-draft-validator';
import { humanizeDraft } from './constraint-humanizer';
import type { ParsedConstraintDraft, RawConstraintInput } from './constraint-review-types';
import { inferRuleParseConfidence } from './rule-parse-confidence';
import {
  normalizeConstraintSpecsForSolving,
  type SpecNormalizationIssue,
} from './constraint-spec-normalizer';

/** Convert normalization issues into parse issues the draft validator understands. */
function normalizationIssuesToParseIssues(
  issues: SpecNormalizationIssue[]
): { code: string; message: string }[] {
  return issues.map((issue) => ({ code: issue.code, message: issue.message }));
}

function applyNormalizationOrFail(
  input: AgentInputPayload,
  raw: RawConstraintInput,
  specs: ConstraintSpec[]
): { specs: ConstraintSpec[]; issues: SpecNormalizationIssue[] } {
  const result = normalizeConstraintSpecsForSolving(input, specs);
  if (result.issues.length) {
    // surface as parse issues so the draft lands in needs_review, not green-confirm.
  }
  return { specs: result.specs, issues: result.issues };
}

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

/**
 * Determine if the rule parser result is trustworthy enough to skip LLM.
 * Only returns true for simple, unambiguous constraints that the rule parser
 * handles with HIGH confidence and no custom_dsl fallback.
 */
function ruleParserIsSufficient(rule: ReturnType<typeof inferRuleParseConfidence>): boolean {
  return (
    rule.confidence === 'high' &&
    rule.specs.length > 0 &&
    !rule.specs.some((s) => s.kind === 'custom_dsl')
  );
}

/**
 * Parse user constraints into review drafts.
 *
 * Architecture: LLM-first with rule-parser as fast-path cache.
 * 1. Rule parser runs first as a FAST PATH — if confidence is HIGH and no
 *    custom_dsl, we use the result directly (saves latency + tokens).
 * 2. All other constraints are sent to the LLM translator with their ORIGINAL
 *    unsplit text — the LLM has the full context to understand semantics.
 * 3. If LLM fails or returns empty, rule parser result serves as fallback.
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

  // Phase 1: Rule parser fast-path — only for HIGH confidence, unambiguous constraints
  for (const raw of raws) {
    const specs = specsForConstraintText(input, raw.text, raw.type, raw.weight);
    const rule = inferRuleParseConfidence(raw.text, specs);
    const { specs: normalizedSpecs, issues: normIssues } = applyNormalizationOrFail(
      input,
      raw,
      rule.specs
    );

    if (ruleParserIsSufficient(rule) && normIssues.length === 0) {
      // High confidence, simple pattern — use rule parser directly
      drafts.push(buildDraft(input, raw, normalizedSpecs, 'rule', 'high', [
        ...normalizationIssuesToParseIssues(normIssues),
      ]));
      continue;
    }
    // Everything else goes to LLM (or falls back to rule parser after).
    pendingForLlm.push(raw);
  }

  if (pendingForLlm.length === 0) {
    return drafts;
  }

  // Phase 2: LLM translator — receives original unsplit text
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

  // Phase 3: Build drafts — prefer LLM results, fallback to rule parser
  for (const raw of pendingForLlm) {
    const fromLlm = translatorSpecs.filter(
      (s) => s.original === raw.text || s.original.trim() === raw.text.trim()
    );
    const ruleSpecs = specsForConstraintText(input, raw.text, raw.type, raw.weight);
    const rule = inferRuleParseConfidence(raw.text, ruleSpecs);
    // Apply normalizer to BOTH LLM and rule-parsed specs so the path
    // doesn't leak "mọi môn" / missing-subject no-op into the draft.
    const fromLlmNormalized = normalizeConstraintSpecsForSolving(
      input,
      fromLlm.length > 0 ? fromLlm : []
    );
    const ruleNormalized = normalizeConstraintSpecsForSolving(input, ruleSpecs);
    const combinedIssues: SpecNormalizationIssue[] = [
      ...fromLlmNormalized.issues,
      ...ruleNormalized.issues,
    ];
    const extraIssues = [
      ...normalizationIssuesToParseIssues(combinedIssues),
      ...rule.issues,
    ];

    if (fromLlm.length > 0 && !fromLlm.every((s) => s.kind === 'custom_dsl') && fromLlmNormalized.specs.length > 0) {
      // LLM produced meaningful results — use them
      drafts.push(buildDraft(input, raw, fromLlmNormalized.specs, 'translator', 'medium', extraIssues));
    } else {
      // LLM failed, only produced custom_dsl, or normalizer dropped the LLM specs
      // (e.g. malformed max). Fall back to rule parser.
      const specs = fromLlmNormalized.specs.length > 0 ? fromLlmNormalized.specs : ruleNormalized.specs;
      const source: ParsedConstraintDraft['source'] = fromLlmNormalized.specs.length > 0 ? 'translator' : 'rule';
      const confidence: ParsedConstraintDraft['confidence'] =
        fromLlmNormalized.specs.length > 0 ? 'medium' : rule.confidence;
      drafts.push(buildDraft(input, raw, specs, source, confidence, extraIssues));
    }
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
