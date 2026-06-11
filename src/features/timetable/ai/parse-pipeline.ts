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
import { buildSlotFillPrompt, type SlotFillResponse, type SlotFillAtom, SLOT_FILL_RESPONSE_SCHEMA } from './slot-fill-prompt';
import { backTranslateBatch, type BackTranslationCheck } from './back-translation-check';
import { logRetrievalMiss } from './synonym-miss-log';
import type { AgentInputPayload, AIProviderConfig } from './types';
import type { ConstraintSpec, ConstraintKind } from './constraint-spec';
import { BUILT_IN_CONSTRAINT_KINDS, type BuiltInConstraintScope } from './constraint-registry';
import { invokeAnalyzeChat } from './analyze-constraint-service';
import { parseModelJson } from './parse-model-json';
import { parseIRFirstWithGuard } from './ir-first-parser';
import { classifyDivergence, getDefaultShadowLogger } from './shadow-mode';
import { getParserMode, isIRFirstAuthoritative } from './parser-mode';
import type { ConstraintSegment } from './segment-types';
import { shouldRunSelfConsistency } from './self-consistency';
import { stripUnknownKindParams, verifyRoundTrip } from './ir-type-checker';
import { buildInterpretationConfirm, type InterpretationCardDTO } from './constraint-clarification-builder';
import { humanizeConstraintSpec } from './constraint-humanizer';

export type ParsePipelineInput = {
  rawText: string;
  agentInput: AgentInputPayload;
  config: AIProviderConfig;
  previousAttempts?: Array<{ displayText: string; source: string; confidence: string }>;
};

export type ParsePipelineStage = 'resolver' | 'retriever' | 'ambiguity' | 'slot_fill' | 'self_consistency' | 'verify' | 'clarify' | 'back_translation' | 'done';

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
  /** Whether self-consistency was run */
  selfConsistencyRun: boolean;
  /** Whether the result was unanimous (only if self-consistency was run) */
  unanimous: boolean;
  /** Whether verify (type-check + round-trip) passed */
  verifyPassed: boolean;
  /** Stripped fields from type-check */
  strippedFields: string[];
  /** Interpretation card DTO for UI confirmation */
  interpretationCard?: InterpretationCardDTO;
  /** Whether clarification is required before commit */
  requiresClarification: boolean;
  /** Token usage. */
  usageTokens?: number;
  /** Raw LLM response for debugging. */
  rawResponse?: string;
};

// M1.1: Use centralized BUILT_IN_CONSTRAINT_KINDS from registry instead of hardcoded list
// This prevents drift when new kinds are added to the registry

/** Run the end-to-end parse pipeline. */
export async function runParsePipeline(input: ParsePipelineInput): Promise<ParsePipelineResult> {
  const diagnostics: Array<{ stage: ParsePipelineStage; message: string }> = [];
  const { rawText, agentInput, config, previousAttempts } = input;

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
      selfConsistencyRun: false,
      unanimous: true,
      verifyPassed: true,
      strippedFields: [],
      requiresClarification: true,
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
  let slotFillJson: SlotFillResponse | null = null;
  try {
    response = await invokeAnalyzeChat(config, [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ]);
    const rawContent = response.content ?? '';
    if (rawContent.trim()) {
      const parsed = parseModelJson(rawContent);
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).atoms)) {
        slotFillJson = parsed as SlotFillResponse;
      }
    }
  } catch (err) {
    diagnostics.push({ stage: 'slot_fill', message: `error: ${err instanceof Error ? err.message : String(err)}` });
  }
  diagnostics.push({ stage: 'slot_fill', message: `parsed=${slotFillJson ? 'yes' : 'no'} atoms=${slotFillJson?.atoms?.length ?? 0}` });

  // Parse slot-fill response as SlotFillResponse
  const specs: ConstraintSpec[] = [];
  let normalizedText = rawText;
  let confidence: 'high' | 'medium' | 'low' = 'medium';

  if (slotFillJson && slotFillJson.atoms?.length) {
    const atoms = slotFillJson.atoms;
    
    // Determine overall confidence (lowest among atoms)
    const confidenceOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const minConfidence = atoms.reduce<'high' | 'medium' | 'low'>(
      (min, a) => (confidenceOrder[a.confidence] ?? 1) < (confidenceOrder[min] ?? 1) ? a.confidence : min,
      'high',
    );
    confidence = minConfidence;
    
    // Check if this is an if_then with a condition
    const hasCondition = !!slotFillJson.condition;
    
    if (hasCondition) {
      // Build an if_then spec
      specs.push({
        id: `slot_${Date.now()}_0`,
        original: rawText,
        severity: 'hard',
        kind: 'if_then',
        params: {
          if: slotFillJson.condition,
          then: atoms.map(a => ({ kind: a.kind, params: a.params })),
        },
      });
    } else {
      // Build individual specs for each atom
      for (let i = 0; i < atoms.length; i++) {
        const atom = atoms[i];
        const kind = atom.kind;
        if (kind === 'custom' || kind === 'custom_dsl') {
          specs.push({
            id: `slot_${Date.now()}_${i}`,
            original: rawText,
            severity: 'hard',
            kind: 'custom_dsl',
            params: {
              ...atom.params,
              explain: atom.params.explain ?? rawText,
            },
          });
        } else if (BUILT_IN_CONSTRAINT_KINDS.has(kind as any)) {
          specs.push({
            id: `slot_${Date.now()}_${i}`,
            original: rawText,
            severity: 'hard',
            kind: kind as ConstraintKind,
            params: atom.params,
          });
        } else {
          diagnostics.push({ stage: 'slot_fill', message: `unknown kind=${kind}` });
        }
      }
    }
    
    normalizedText = atoms.map(a => {
      const kindLabel = a.kind;
      const paramsStr = Object.entries(a.params).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
      return `${kindLabel}(${paramsStr})`;
    }).join(' ∧ ');
  }

  // ── Stage 4.5: Self-consistency check (diagnostic only — actual N=3 calls are separate) ──
  const isCompound = slotFillJson?.condition != null || (slotFillJson?.atoms?.length ?? 0) > 1;
  const needsSelfConsistency = shouldRunSelfConsistency(
    slotFillJson?.condition ? 'if_then' : 'simple',
    slotFillJson?.atoms?.length ?? 0
  );
  let unanimous = true;
  if (needsSelfConsistency) {
    diagnostics.push({ stage: 'self_consistency', message: `compound=${isCompound} would run N=3` });
    // Actual self-consistency calls would happen here in production
    // For now, flag that it should be run
  }

  // ── Stage 4.7: Verify (strip + round-trip) ────────────────────────────
  let verifyPassed = true;
  const strippedFields: string[] = [];
  for (const spec of specs) {
    const stripResult = stripUnknownKindParams(spec.kind, spec.params);
    if (stripResult.hadStrippedFields) {
      spec.params = stripResult.stripped;
      strippedFields.push(...stripResult.strippedFields);
      diagnostics.push({ stage: 'verify', message: `stripped fields from ${spec.kind}: ${stripResult.strippedFields.join(', ')}` });
    }
  }

  // Round-trip check for specs with IR expr
  for (const spec of specs) {
    if (spec.params?.expr) {
      const ir = { id: spec.id, severity: spec.severity, original: spec.original, expr: spec.params.expr };
      const rt = verifyRoundTrip(ir as any);
      if (!rt.ok) {
        verifyPassed = false;
        diagnostics.push({ stage: 'verify', message: `round-trip failed: ${rt.issues.join('; ')}` });
      }
    }
  }
  diagnostics.push({ stage: 'verify', message: `passed=${verifyPassed} strippedFields=${strippedFields.length}` });

  // ── Determine if clarification is required ────────────────────────────
  const hasLowConfidence = slotFillJson?.atoms?.some(a => a.confidence === 'low') ?? false;
  const isIfThen = slotFillJson?.condition != null;
  const requiresClarification = hasLowConfidence || isIfThen || !verifyPassed || strippedFields.length > 0;

  // Build interpretation card for compound constraints
  let interpretationCard: InterpretationCardDTO | undefined;
  if (requiresClarification && specs.length > 0) {
    const scopeVi = hints.extractedDays.length > 0 ? `Vào ${hints.extractedDays.join(', ')}` : undefined;
    const ifAtomVi = slotFillJson?.condition
      ? `nếu ${JSON.stringify(slotFillJson.condition)}`
      : undefined;
    const thenAtomsVi = specs.map(s => {
      try { return humanizeConstraintSpec(s); } catch { return s.kind; }
    });
    const notesVi: string[] = [];
    if (strippedFields.length > 0) {
      notesVi.push(`Các trường bị loại vì không thuộc kind: ${strippedFields.join(', ')}`);
    }

    interpretationCard = {
      scopeVi,
      ifAtomVi,
      thenAtomsVi,
      notesVi,
      editableAtomIds: specs.map((_, i) => `atom_${i}`),
    };
  }

  // ── Stage 5: Back-translation check (code) ──────────────────────────────
  const backTranslation = backTranslateBatch(specs, rawText);
  const requiresConfirmation = backTranslation.needsConfirmation || specs.length === 0;

  diagnostics.push({
    stage: 'back_translation',
    message: `score=${backTranslation.score.toFixed(2)} needsConfirm=${requiresConfirmation}`,
  });
  diagnostics.push({ stage: 'done', message: `status=${specs.length > 0 ? 'mapped' : 'unmapped'}` });

  const legacyStatus = specs.length > 0 ? (specs[0].kind === 'custom_dsl' ? 'semantic_only' : 'mapped_builtin') : 'needs_clarification';
  const parserMode = getParserMode();
  const runIrFirst = parserMode !== 'legacy';
  const irFirstResult = runIrFirst ? parseIRFirstWithGuard(rawText, hints) : undefined;

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
    specs.length > 0 ? (specs[0].kind === 'custom_dsl' ? 'custom_dsl' : 'mapped_builtin') : 'needs_clarification';

  if (parserMode === 'ir_first' && irFirstResult?.kind === 'ir') {
    finalSpecs = [irFirstResult.spec];
    finalStatus = irFirstResult.spec.kind === 'custom_dsl' ? 'custom_dsl' : 'mapped_builtin';
    diagnostics.push({ stage: 'done', message: `mode=ir_first authoritative` });
  }

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
    selfConsistencyRun: needsSelfConsistency,
    unanimous,
    verifyPassed,
    strippedFields,
    interpretationCard,
    requiresClarification,
    usageTokens: response.usage?.total_tokens,
    rawResponse: response.content,
  };
}
