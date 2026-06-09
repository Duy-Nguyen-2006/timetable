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
import { backTranslateBatch, type BackTranslationCheck } from './back-translation-check';
import { logRetrievalMiss } from './synonym-miss-log';
import type { AgentInputPayload, AIProviderConfig } from './types';
import type { ConstraintSpec, ConstraintKind } from './constraint-spec';
import type { BuiltInConstraintScope } from './constraint-registry';
import { invokeAnalyzeChat } from './analyze-constraint-service';

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
};

const SLOT_FILL_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    decision: { type: 'string', enum: ['suggest_built_in', 'use_custom', 'needs_clarification'] },
    kind: { type: 'string' },
    params: { type: 'object' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    missingParams: { type: 'array', items: { type: 'string' } },
    explanation: { type: 'string' },
    clarificationQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['decision', 'kind', 'confidence'],
} as const;

const BUILT_IN_KINDS = new Set<string>([
  'teacher_block_day', 'teacher_block_period', 'teacher_block_slot',
  'teacher_max_per_day', 'teacher_max_consecutive', 'teacher_max_working_days',
  'teacher_min_per_day', 'teacher_no_gaps', 'teacher_allowed_days',
  'teacher_allowed_periods', 'teacher_min_working_days', 'teacher_max_gaps',
  'teacher_min_consecutive', 'teacher_balanced_load', 'teacher_max_subjects_per_day',
  'teacher_max_consecutive_days', 'teacher_min_off_days', 'teacher_preferred_periods',
  'teacher_max_classes_per_day', 'teacher_pair_not_same_slot', 'teacher_pair_not_same_day',
  'teacher_homeroom_first_period',
  'subject_pin_period', 'subject_preferred_periods', 'subject_not_last_period',
  'subject_consecutive', 'subject_max_consecutive', 'subject_allowed_days',
  'subject_min_gap_days', 'subject_daily_max_periods', 'subject_block_period',
  'subject_block_days', 'subject_not_consecutive', 'subject_min_days',
  'subject_spread_evenly', 'subject_order_before', 'subject_not_after_subject',
  'class_block_day', 'class_block_period', 'class_block_slot', 'class_max_per_day',
  'class_min_per_day', 'class_no_gaps', 'class_no_double_subject_day',
  'class_subjects_not_same_day', 'class_fixed_period', 'class_allowed_days',
  'class_allowed_periods', 'class_max_consecutive', 'class_max_subjects_per_day',
  'class_balanced_load', 'class_subjects_same_day', 'class_min_working_days',
  'class_max_heavy_subjects_per_day', 'class_max_heavy_subjects_per_session',
  'class_first_period_required',
  'subject_flag_ceremony_slot', 'global_teacher_utilization_balance',
  'assignment_pin_slot', 'assignment_block_slot', 'assignment_allowed_slots',
  'assignment_spread_days', 'weekly_periods_exact', 'assignment_consecutive',
  'assignment_max_per_day', 'assignment_same_day', 'assignment_not_same_day',
  'if_then', 'pair_not_same_slot', 'pair_same_slot', 'mutual_exclusion',
  'session_limit', 'subject_group', 'subject_group_daily_limit',
  'subject_session_max_periods',
  'teacher_required_day', 'teacher_required_slot',
  'teacher_pair_required_same_day', 'teacher_pair_required_same_slot',
]);

function extractJson(content: string): unknown {
  if (!content) return null;
  const trimmed = content.trim();
  // Try to find a JSON block
  const m = trimmed.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

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
  let slotFillJson: any = null;
  try {
    response = await invokeAnalyzeChat(config, [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ]);
    slotFillJson = extractJson(response.content ?? '');
  } catch (err) {
    diagnostics.push({ stage: 'slot_fill', message: `error: ${err instanceof Error ? err.message : String(err)}` });
  }
  diagnostics.push({ stage: 'slot_fill', message: `parsed=${slotFillJson ? 'yes' : 'no'}` });

  // Parse slot-fill response
  const specs: ConstraintSpec[] = [];
  let normalizedText = rawText;
  let confidence: 'high' | 'medium' | 'low' = 'medium';

  if (slotFillJson && typeof slotFillJson === 'object') {
    const decision = String(slotFillJson.decision ?? '');
    const kind = String(slotFillJson.kind ?? '');
    const params = (slotFillJson.params ?? {}) as Record<string, unknown>;
    confidence = (slotFillJson.confidence as 'high' | 'medium' | 'low') ?? 'medium';
    if (decision === 'suggest_built_in' && BUILT_IN_KINDS.has(kind)) {
      specs.push({
        id: `slot_${Date.now()}_0`,
        original: rawText,
        severity: 'hard',
        kind: kind as ConstraintKind,
        params,
      });
      normalizedText = slotFillJson.explanation ?? rawText;
    } else if (decision === 'use_custom' || kind === 'custom' || kind === 'custom_dsl') {
      // Custom IR — must have a structured expr
      specs.push({
        id: `slot_${Date.now()}_0`,
        original: rawText,
        severity: 'hard',
        kind: 'custom_dsl',
        params: {
          ...params,
          explain: slotFillJson.explanation ?? rawText,
        },
      });
      normalizedText = slotFillJson.explanation ?? rawText;
    } else {
      // Clarify or unrecognized
      diagnostics.push({ stage: 'slot_fill', message: `clarify/unrecognized decision=${decision} kind=${kind}` });
    }
  }

  // ── Stage 5: Back-translation check (code) ──────────────────────────────
  const backTranslation = backTranslateBatch(specs, rawText);
  const requiresConfirmation = backTranslation.needsConfirmation || specs.length === 0;

  diagnostics.push({
    stage: 'back_translation',
    message: `score=${backTranslation.score.toFixed(2)} needsConfirm=${requiresConfirmation}`,
  });
  diagnostics.push({ stage: 'done', message: `status=${specs.length > 0 ? 'mapped' : 'unmapped'}` });

  return {
    status: specs.length > 0 ? (specs[0].kind === 'custom_dsl' ? 'custom_dsl' : 'mapped_builtin') : 'needs_clarification',
    hints,
    candidates,
    ambiguityGate,
    specs,
    normalizedText,
    backTranslation,
    confidence,
    requiresConfirmation,
    diagnostics,
    usageTokens: response.usage?.total_tokens,
    rawResponse: response.content,
  };
}
