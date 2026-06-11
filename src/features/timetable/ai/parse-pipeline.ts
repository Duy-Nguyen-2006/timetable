/**
 * End-to-End Parse Pipeline (Section 15)
 *
 * Wires Stages 1–5 of the Retrieve-then-Fill pipeline:
 *   1. Resolver (code) → hints
 *   2. Retriever (code) → top-k kinds
 *   3. Ambiguity gate (code) → clarify or proceed
 *   4. Slot-fill (LLM, small prompt) → spec
 *   5. Back-translation check (code) → confirm or re-prompt
 *
 * After slot-fill, the humanizer renders the canonical GUI text deterministically.
 *
 * This module is the integration layer; the actual LLM call is invoked via
 * the existing `invokeAnalyzeChat` from `analyze-constraint-service.ts` to
 * keep network/format compatibility.
 */

import { resolveConstraintHints, type ResolverHints } from './constraint-resolver';
import { retrieveTopK, type ConstraintRetrieverCandidate } from './constraint-retriever';
import { evaluateAmbiguity, runAmbiguityGate, type AmbiguityGateResult } from './ambiguity-gate';
import { buildSlotFillPrompt } from './slot-fill-prompt';
import { segmentConstraint } from './constraint-segmenter';
import { parseSlotFillJson, sanitizeSlotFillResponse } from './slot-fill-parser';
import { voteSlotFillResponses } from './self-consistency';
import { backTranslateBatch, type BackTranslationCheck } from './back-translation-check';
import { logRetrievalMiss } from './synonym-miss-log';
import type { AgentInputPayload, AIProviderConfig } from './types';
import type { ConstraintSpec, ConstraintKind } from './constraint-spec';
import type { SlotFillResponse } from './slot-fill-types';
import { BUILT_IN_CONSTRAINT_KINDS, type BuiltInConstraintScope } from './constraint-registry';
import { invokeAnalyzeChat } from './analyze-constraint-service';
import { parseIRFirstWithGuard } from './ir-first-parser';
import { buildTranslatorPeriodsByDay } from './translator-periods';
import { classifyDivergence, getDefaultShadowLogger } from './shadow-mode';
import { getParserMode, isIRFirstAuthoritative } from './parser-mode';
import { buildInterpretationConfirm } from './constraint-clarification-builder';
import type { InterpretationCardDTO } from './constraint-clarification-types';

export type ParsePipelineInput = {
  rawText: string;
  agentInput: AgentInputPayload;
  config: AIProviderConfig;
  previousAttempts?: Array<{ displayText: string; source: string; confidence: string }>;
};

export type ParsePipelineStage = 'resolver' | 'retriever' | 'ambiguity' | 'slot_fill' | 'back_translation' | 'done';

export type ParsePipelineResult = {
  /** Final decision. */
  status: 'mapped_builtin' | 'custom_dsl' | 'needs_clarification' | 'unsupported';
  /** Resolved hints (Stage 1). */
  hints: ResolverHints;
  /** Top-k candidates (Stage 2). */
  candidates: ConstraintRetrieverCandidate[];
  /** Ambiguity gate verdict (Stage 3). */
  ambiguityGate: AmbiguityGateResult;
  /** Specs produced by slot-fill (Stage 3 LLM). */
  specs: ConstraintSpec[];
  /** Canonical GUI text (Stage 5, from humanizer). */
  normalizedText: string;
  /** Back-translation check (Stage 4). */
  backTranslation: ReturnType<typeof backTranslateBatch>;
  /** Confidence: high / medium / low. */
  confidence: 'high' | 'medium' | 'low';
  /** Whether user confirmation is required before solver. */
  requiresConfirmation: boolean;
  /** Per-stage diagnostics. */
  diagnostics: Array<{ stage: ParsePipelineStage; message: string }>;
  /** Token usage. */
  usageTokens?: number;
  /** Raw LLM response for debugging. */
  rawResponse?: string;
  clarificationReasonCode?: 'confirm_interpretation' | 'unsupported_semantics' | 'ambiguous_entity';
  interpretationCard?: InterpretationCardDTO;
};

// M1.1: Use centralized BUILT_IN_CONSTRAINT_KINDS from registry instead of hardcoded list
// This prevents drift when new kinds are added to the registry

function dayAliasToId(day: string | undefined, agentInput: AgentInputPayload): string | undefined {
  if (!day) return undefined;
  if (agentInput.days.some((item) => item.id === day)) return day;
  const indexByThu: Record<string, number> = { thu2: 0, thu3: 1, thu4: 2, thu5: 3, thu6: 4, thu7: 5 };
  const index = indexByThu[day];
  return index === undefined ? day : agentInput.days[index]?.id ?? day;
}

function normalizeKeywordTypos(text: string): string {
  return text
    .replace(/\bkhogn\b/giu, 'khong')
    .replace(/\bko\b|\bk\b/giu, 'khong')
    .replace(/\bday\b/giu, 'day')
    .replace(/\btiet\b/giu, 'tiet')
    .replace(/\bthu\b/giu, 'thu');
}

function extractPeriod(text: string): number | undefined {
  const normalized = normalizeKeywordTypos(text.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/đ/giu, 'd'));
  const match = normalized.match(/\btiet\s*(\d+)\b/iu);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function extractThuAlias(text: string): string | undefined {
  const match = normalizeKeywordTypos(text).match(/\bthu\s*(2|3|4|5|6|7)\b/iu)
    ?? text.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/đ/giu, 'd').match(/\bthu\s*(2|3|4|5|6|7)\b/iu);
  return match ? `thu${match[1]}` : undefined;
}

function deterministicSlotFill(
  rawText: string,
  agentInput: AgentInputPayload,
  hints: ResolverHints
): SlotFillResponse | null {
  const segment = segmentConstraint(rawText);
  const normalized = normalizeKeywordTypos(hints.normalizedText || rawText);
  const repairedRaw = normalizeKeywordTypos(rawText);
  const day = dayAliasToId(hints.extractedDays[0] ?? extractThuAlias(rawText) ?? segment.scope?.day, agentInput);
  const period = extractPeriod(repairedRaw);

  if (
    hints.resolvedTeachers.length >= 2 &&
    /\b(cung|same)\b/iu.test(normalized) &&
    /\b(1\s*)?tiet\b/iu.test(normalized) &&
    /khong\s+duoc|khong/iu.test(normalized)
  ) {
    return {
      atoms: [{
        kind: 'teacher_pair_not_same_slot',
        params: {
          teachers: hints.resolvedTeachers.slice(0, 2),
          ...(day ? { scope: { day } } : {}),
        },
        confidence: 'high',
        missingParams: [],
      }],
    };
  }

  if (segment.shape === 'if_then' && segment.ifClause) {
    const teachers = Array.from(new Set(agentInput.assignments.map((item) => item.teacher.label)));
    const conditionTeacher = teachers.find((teacher) => segment.ifClause && new RegExp(`(?:^|\\s)${teacher}(?:\\s|$)`, 'iu').test(segment.ifClause));
    const conditionDay = dayAliasToId(extractThuAlias(segment.ifClause), agentInput);
    const conditionPeriod = extractPeriod(segment.ifClause);
    const atoms = segment.atoms.map((atomText) => {
      const normalizedAtom = normalizeKeywordTypos(atomText.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/đ/giu, 'd'));
      const atomTeacher = teachers.find((teacher) => new RegExp(`(?:^|\\s)${teacher}(?:\\s|$)`, 'iu').test(atomText));
      const atomDay = dayAliasToId(extractThuAlias(atomText), agentInput);
      const atomPeriod = extractPeriod(atomText);
      if (/khong\s+day|khong/iu.test(normalizedAtom) && atomTeacher && atomDay && atomPeriod) {
        return { kind: 'teacher_block_slot', params: { teacher: atomTeacher, day: atomDay, period: atomPeriod }, confidence: 'high' as const, missingParams: [] };
      }
      if (/phai\s+day|phai/iu.test(normalizedAtom) && atomTeacher && atomDay) {
        return { kind: 'teacher_required_day', params: { teacher: atomTeacher, day: atomDay }, confidence: 'high' as const, missingParams: [] };
      }
      return { kind: 'custom', params: {}, confidence: 'low' as const, missingParams: [] };
    });
    if (conditionTeacher && conditionDay && conditionPeriod && atoms.length > 0) {
      return {
        condition: {
          op: 'teacher_teaches_at_slot',
          teacher: conditionTeacher,
          day: conditionDay,
          period: conditionPeriod,
        },
        atoms,
      };
    }
  }

  if (
    hints.resolvedTeacher &&
    day &&
    (/(?:khong|ko|k)\s+day/iu.test(repairedRaw) || /khong\s+day/iu.test(normalized))
  ) {
    return {
      atoms: [{
        kind: period ? 'teacher_block_slot' : 'teacher_block_day',
        params: {
          teacher: hints.resolvedTeacher,
          day,
          ...(period ? { period } : {}),
        },
        confidence: 'high',
        missingParams: [],
      }],
    };
  }

  return null;
}

function slotFillToSpecs(rawText: string, slotFill: SlotFillResponse): ConstraintSpec[] {
  const atoms = slotFill.atoms.map((atom, index): ConstraintSpec => ({
    id: `slot_${Date.now()}_${index}`,
    original: rawText,
    severity: 'hard',
    kind: atom.kind === 'custom' ? 'custom_dsl' : atom.kind as ConstraintKind,
    params: atom.params,
  }));
  if (slotFill.condition && atoms.length > 0) {
    return [{
      id: `slot_${Date.now()}_if`,
      original: rawText,
      severity: 'hard',
      kind: 'if_then',
      params: { if: slotFill.condition, then: atoms },
    }];
  }
  return atoms;
}

/** Run the end-to-end parse pipeline. */
export async function runParsePipeline(input: ParsePipelineInput): Promise<ParsePipelineResult> {
  const diagnostics: Array<{ stage: ParsePipelineStage; message: string }> = [];
  const { rawText, agentInput, config, previousAttempts } = input;
  const segment = segmentConstraint(rawText);

  // ── Stage 1: Resolver (code) ────────────────────────────────────────────
  const teacherLabels = Array.from(new Set(agentInput.assignments.map((a) => a.teacher.label)));
  const subjectLabels = Array.from(new Set(agentInput.assignments.map((a) => a.subject.label)));
  const classLabels = Array.from(new Set(agentInput.assignments.map((a) => a.class.label)));
  const hints = resolveConstraintHints({
    userText: rawText,
    teachers: teacherLabels,
    subjects: subjectLabels,
    classes: classLabels,
    assignments: agentInput.assignments,
    days: agentInput.days,
  });
  diagnostics.push({ stage: 'resolver', message: `scope=${hints.inferredScope} teachers=${hints.resolvedTeachers.length} subjects=${hints.resolvedSubjects.length}` });

  // Entity disambiguation gate (Section 13.5)
  if (hints.ambiguousEntity) {
    return {
      status: 'needs_clarification',
      hints,
      candidates: [],
      ambiguityGate: { status: 'ambiguous', options: [], delta: 0, reason: `Entity ${hints.ambiguousEntity.kind} ambiguous: ${hints.ambiguousEntity.candidates.join(', ')}` },
      specs: [],
      normalizedText: rawText,
      backTranslation: { score: 0, needsConfirmation: true, perSpec: [] },
      confidence: 'low',
      requiresConfirmation: true,
      diagnostics,
    };
  }

  // ── Stage 2: Retriever (code) ───────────────────────────────────────────
  const scope: BuiltInConstraintScope | null = hints.inferredScope;
  const candidates = retrieveTopK(hints, scope, 5);
  diagnostics.push({ stage: 'retriever', message: `top candidates: ${candidates.map((c) => c.kind).join(', ')}` });

  // Log synonym miss for telemetry
  const topScore = candidates.length > 0 ? 5 : 0; // crude proxy
  logRetrievalMiss(rawText, hints.normalizedText, candidates, topScore, scope);

  // ── Stage 3: Ambiguity gate (code) ─────────────────────────────────────
  const { gate: ambiguityGate } = runAmbiguityGate(hints, scope);
  diagnostics.push({ stage: 'ambiguity', message: `gate=${ambiguityGate.status}` });

  // ── Stage 4: Slot-fill (LLM) ───────────────────────────────────────────
  const prompt = buildSlotFillPrompt(rawText, hints, candidates, { previousAttempts });
  let response: { content?: string; usage?: { total_tokens?: number } } = { content: '' };
  let slotFillResponse: SlotFillResponse | null = null;
  const slotFillCalls = segment.shape === 'if_then' || segment.atoms.length > 1 ? 3 : 1;
  const slotFillResponses: SlotFillResponse[] = [];
  try {
    for (let index = 0; index < slotFillCalls; index += 1) {
      response = await invokeAnalyzeChat(config, [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ]);
      slotFillResponses.push(parseSlotFillJson(response.content));
    }
    const vote = voteSlotFillResponses(slotFillResponses);
    slotFillResponse = vote.accepted ? vote.winner ?? null : null;
    if (!vote.accepted) {
      diagnostics.push({ stage: 'slot_fill', message: `self_consistency=diverged calls=${vote.calls}` });
    } else {
      diagnostics.push({ stage: 'slot_fill', message: `self_consistency=accepted calls=${vote.calls}` });
    }
  } catch (err) {
    diagnostics.push({ stage: 'slot_fill', message: `error: ${err instanceof Error ? err.message : String(err)}` });
  }
  if (!slotFillResponse) {
    slotFillResponse = deterministicSlotFill(rawText, agentInput, hints);
    if (slotFillResponse) diagnostics.push({ stage: 'slot_fill', message: 'deterministic_fallback=yes' });
  }
  if (slotFillResponse) slotFillResponse = sanitizeSlotFillResponse(slotFillResponse);
  diagnostics.push({ stage: 'slot_fill', message: `parsed=${slotFillResponse ? 'yes' : 'no'}` });

  // Parse slot-fill response
  const specs: ConstraintSpec[] = slotFillResponse ? slotFillToSpecs(rawText, slotFillResponse) : [];
  let normalizedText = rawText;
  let confidence: 'high' | 'medium' | 'low' = slotFillResponse?.atoms.every((atom) => atom.confidence === 'high' && atom.missingParams.length === 0 && atom.kind !== 'custom')
    ? 'high'
    : slotFillResponse ? 'low' : 'medium';

  // ── Stage 5: Back-translation check (code) ──────────────────────────────
  const backTranslation = backTranslateBatch(specs, rawText);
  const mustConfirmInterpretation = segment.shape === 'if_then' || segment.atoms.length > 1;
  const hasCustom = specs.some((spec) => spec.kind === 'custom_dsl');
  const requiresConfirmation = backTranslation.needsConfirmation || specs.length === 0 || mustConfirmInterpretation || confidence !== 'high' || hasCustom;

  diagnostics.push({
    stage: 'back_translation',
    message: `score=${backTranslation.score.toFixed(2)} needsConfirm=${requiresConfirmation}`,
  });
  diagnostics.push({ stage: 'done', message: `status=${specs.length > 0 ? 'mapped' : 'unmapped'}` });

  const legacyStatus = specs.length > 0 ? (specs[0].kind === 'custom_dsl' ? 'semantic_only' : 'mapped_builtin') : 'needs_clarification';
  const parserMode = getParserMode();
  const runIrFirst = parserMode !== 'legacy';
  const periodsByDay = buildTranslatorPeriodsByDay(agentInput);
  const allActivePeriods = Object.values(periodsByDay).flat();
  const maxPeriods = allActivePeriods.length > 0 ? Math.max(...allActivePeriods) : 5;
  const irFirstResult = runIrFirst ? parseIRFirstWithGuard(rawText, hints, { maxPeriods }) : undefined;

  if (runIrFirst && irFirstResult) {
    const shadowNew = irFirstResult.kind === 'ir'
      ? { specs: [irFirstResult.spec], status: 'mapped_builtin' as const }
      : irFirstResult.kind === 'needs_clarification'
        ? { specs: [], status: 'needs_clarification' as const }
        : undefined;
    const shadowLegacy = {
      specs,
      status: legacyStatus as 'mapped_builtin' | 'semantic_only' | 'needs_clarification' | 'unsupported',
    };
    const divergence = classifyDivergence(rawText, shadowLegacy, shadowNew);
    getDefaultShadowLogger().log({
      rawText,
      legacy: shadowLegacy,
      new: shadowNew,
      divergence: divergence.divergence,
      explanation: divergence.explanation,
    });
    diagnostics.push({ stage: 'done', message: `shadow=${divergence.divergence}` });
  }

  // M8: When parser mode is 'ir_first', use the IR-first result as the
  // authoritative output. Otherwise, use the legacy slot-fill result.
  // In 'shadow' mode, we still return legacy but log divergence.
  let finalSpecs = specs;
  let finalStatus: 'mapped_builtin' | 'custom_dsl' | 'needs_clarification' | 'unsupported' =
    specs.length > 0
      ? hasCustom || confidence !== 'high'
        ? 'needs_clarification'
        : (specs[0].kind === 'custom_dsl' ? 'custom_dsl' : 'mapped_builtin')
      : 'needs_clarification';

  if (parserMode === 'ir_first' && irFirstResult?.kind === 'ir') {
    finalSpecs = [irFirstResult.spec];
    finalStatus = irFirstResult.spec.kind === 'custom_dsl' ? 'custom_dsl' : 'mapped_builtin';
    diagnostics.push({ stage: 'done', message: `mode=ir_first authoritative` });
  }

  const interpretationCard =
    mustConfirmInterpretation && finalSpecs.length > 0
      ? buildInterpretationConfirm(finalSpecs[0], hints.droppedIllustrations)
      : undefined;

  return {
    status: finalStatus,
    hints,
    candidates,
    ambiguityGate,
    specs: finalSpecs,
    normalizedText,
    backTranslation,
    confidence,
    requiresConfirmation,
    diagnostics,
    usageTokens: response.usage?.total_tokens,
    rawResponse: response.content,
    clarificationReasonCode: mustConfirmInterpretation ? 'confirm_interpretation' : hasCustom ? 'unsupported_semantics' : undefined,
    interpretationCard,
  };
}
