'use client';

import { useState, useCallback } from 'react';
import type { InterpretationCardDTO, ClarificationQuestion } from '../ai/constraint-clarification-types';

export type ConstraintReviewState = {
  /** Current interpretation being reviewed */
  currentInterpretation: InterpretationCardDTO | null;
  /** Whether we're in confirmation mode */
  isConfirming: boolean;
  /** Whether a reparse is in progress */
  isReparsing: boolean;
  /** Number of reparse attempts (max 3) */
  reparseAttempts: number;
  /** Whether max reparse attempts reached */
  maxAttemptsReached: boolean;
  /** Clarification question if any */
  clarificationQuestion: ClarificationQuestion | null;
};

export type ConstraintReviewActions = {
  /** Start reviewing an interpretation */
  startReview: (interpretation: InterpretationCardDTO, isCompound: boolean) => void;
  /** Confirm the current interpretation */
  confirmInterpretation: () => void;
  /** Edit a specific atom */
  editAtom: (atomId: string, newValue: string) => void;
  /** Submit free-text feedback for reparse */
  submitFeedback: (feedback: string) => void;
  /** Cancel the review */
  cancelReview: () => void;
  /** Set clarification question */
  setClarification: (question: ClarificationQuestion | null) => void;
};

const MAX_REPARSE_ATTEMPTS = 3;

export function useConstraintReview(options?: {
  onConfirm?: (interpretation: InterpretationCardDTO) => void;
  onEditAtom?: (atomId: string, newValue: string) => void;
  onReparse?: (feedback: string) => void;
  onCancel?: () => void;
}): [ConstraintReviewState, ConstraintReviewActions] {
  const { onConfirm, onEditAtom, onReparse, onCancel } = options ?? {};
  
  const [state, setState] = useState<ConstraintReviewState>({
    currentInterpretation: null,
    isConfirming: false,
    isReparsing: false,
    reparseAttempts: 0,
    maxAttemptsReached: false,
    clarificationQuestion: null,
  });
  
  const startReview = useCallback((interpretation: InterpretationCardDTO, _isCompound: boolean) => {
    setState(prev => ({
      ...prev,
      currentInterpretation: interpretation,
      isConfirming: true,
      reparseAttempts: 0,
      maxAttemptsReached: false,
      clarificationQuestion: null,
    }));
  }, []);
  
  const confirmInterpretation = useCallback(() => {
    if (state.currentInterpretation) {
      onConfirm?.(state.currentInterpretation);
    }
    setState(prev => ({
      ...prev,
      isConfirming: false,
      currentInterpretation: null,
    }));
  }, [state.currentInterpretation, onConfirm]);
  
  const editAtom = useCallback((atomId: string, newValue: string) => {
    onEditAtom?.(atomId, newValue);
    // Update the interpretation in place
    setState(prev => {
      if (!prev.currentInterpretation) return prev;
      const idx = prev.currentInterpretation.editableAtomIds.indexOf(atomId);
      if (idx === -1) return prev;
      const newThenAtoms = [...prev.currentInterpretation.thenAtomsVi];
      newThenAtoms[idx] = newValue;
      return {
        ...prev,
        currentInterpretation: {
          ...prev.currentInterpretation,
          thenAtomsVi: newThenAtoms,
        },
      };
    });
  }, [onEditAtom]);
  
  const submitFeedback = useCallback((feedback: string) => {
    if (state.reparseAttempts >= MAX_REPARSE_ATTEMPTS) {
      setState(prev => ({ ...prev, maxAttemptsReached: true }));
      return;
    }
    setState(prev => ({
      ...prev,
      isReparsing: true,
      reparseAttempts: prev.reparseAttempts + 1,
    }));
    onReparse?.(feedback);
  }, [state.reparseAttempts, onReparse]);
  
  const cancelReview = useCallback(() => {
    onCancel?.();
    setState({
      currentInterpretation: null,
      isConfirming: false,
      isReparsing: false,
      reparseAttempts: 0,
      maxAttemptsReached: false,
      clarificationQuestion: null,
    });
  }, [onCancel]);
  
  const setClarification = useCallback((question: ClarificationQuestion | null) => {
    setState(prev => ({ ...prev, clarificationQuestion: question }));
  }, []);
  
  return [state, {
    startReview,
    confirmInterpretation,
    editAtom,
    submitFeedback,
    cancelReview,
    setClarification,
  }];
}

export default useConstraintReview;

// ─── Legacy backward-compatible export (full constraint review hook) ─────

import { useEffect, useMemo, useRef } from 'react';

import { parseConstraintDraftsWithRaws } from '../ai/constraint-parse-service';
import { buildDraftFromSpecs } from '../ai/constraint-draft-validator';
import { reparseRejectedConstraint } from '../ai/constraint-reparse-service';
import { assertSolvableConstraintState } from '../ai/constraint-preflight';
import type { ConfirmedConstraint, ParsedConstraintDraft, ReparseAttempt } from '../ai/constraint-review-types';
import {
  confirmedFromDraftsAfterUserAccept,
  constraintItemsToRaw,
} from '../ai/solver-constraint-gate';
import type { AgentInputPayload, AIProviderConfig } from '../ai/types';
import type { ConstraintItem } from '../types';
import {
  applyFormToDraft,
  buildContextFromAgentInput,
  defaultFormValues,
  type ConstraintFormTemplateId,
} from './constraint-form-schema';

import { preferCanonicalNormalizedText } from '../ai/constraint-canonical-text';
import { humanizeConstraintSpec } from '../ai/constraint-humanizer';
import { MAX_AI_ANALYSIS_ATTEMPTS } from './constraint-review-ui';

const LEGACY_MAX_REPARSE_ATTEMPTS = MAX_AI_ANALYSIS_ATTEMPTS;

export type ConstraintReviewHydration = {
  constraintDrafts?: ParsedConstraintDraft[];
  confirmedConstraints?: ConfirmedConstraint[];
};

/**
 * Legacy constraint review hook (used by TimetableApp).
 * Kept for backward compatibility.
 */
export function useConstraintReviewLegacy(initial?: ConstraintReviewHydration) {
  const [constraintDrafts, setConstraintDrafts] = useState<ParsedConstraintDraft[]>(
    () => initial?.constraintDrafts ?? []
  );
  const [confirmedConstraints, setConfirmedConstraints] = useState<ConfirmedConstraint[]>(
    () => initial?.confirmedConstraints ?? []
  );
  const [parseLoading, setParseLoading] = useState(false);
  const [reparseLoadingId, setReparseLoadingId] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [newConstraintIds, setNewConstraintIds] = useState<Set<string>>(() => new Set());
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current || !initial) return;
    if (initial.constraintDrafts?.length) setConstraintDrafts(initial.constraintDrafts);
    if (initial.confirmedConstraints?.length) setConfirmedConstraints(initial.confirmedConstraints);
    hydratedRef.current = true;
  }, [initial]);

  const hydrateFromWorkspace = useCallback((data: ConstraintReviewHydration) => {
    if (data.constraintDrafts) setConstraintDrafts(data.constraintDrafts);
    if (data.confirmedConstraints) setConfirmedConstraints(data.confirmedConstraints);
    hydratedRef.current = true;
  }, []);

  const invalidateReview = useCallback(() => {
    setConstraintDrafts([]);
    setConfirmedConstraints([]);
    setNewConstraintIds(new Set());
    setParseError(null);
  }, []);

  const markConstraintsAdded = useCallback((ids: string[]) => {
    setNewConstraintIds((current) => new Set([...current, ...ids]));
    setParseError(null);
  }, []);

  const removeConstraintReview = useCallback((rawConstraintId: string) => {
    setConstraintDrafts((current) => current.filter((d) => d.rawConstraintId !== rawConstraintId));
    setConfirmedConstraints((current) => current.filter((c) => c.rawConstraintId !== rawConstraintId));
    setNewConstraintIds((current) => {
      const next = new Set(current);
      next.delete(rawConstraintId);
      return next;
    });
    setParseError(null);
  }, []);

  const confirmDraft = useCallback((rawConstraintId: string, drafts: ParsedConstraintDraft[]) => {
    const draft = drafts.find((d) => d.rawConstraintId === rawConstraintId);
    const confirmed = draft ? confirmedFromDraftsAfterUserAccept([draft])[0] : undefined;
    if (!confirmed) return;
    setConfirmedConstraints((current) => {
      const without = current.filter((c) => c.rawConstraintId !== rawConstraintId);
      return [...without, confirmed];
    });
    setNewConstraintIds((current) => {
      const next = new Set(current);
      next.delete(rawConstraintId);
      return next;
    });
  }, []);

  const ignoreDraft = useCallback((rawConstraintId: string) => {
    setConfirmedConstraints((current) => current.filter((c) => c.rawConstraintId !== rawConstraintId));
    setConstraintDrafts((current) =>
      current.map((d) =>
        d.rawConstraintId === rawConstraintId ? { ...d, status: 'ignored' as const } : d
      )
    );
    setNewConstraintIds((current) => {
      const next = new Set(current);
      next.delete(rawConstraintId);
      return next;
    });
  }, []);

  const updateDraft = useCallback((updated: ParsedConstraintDraft) => {
    setConstraintDrafts((current) => {
      const has = current.some((d) => d.rawConstraintId === updated.rawConstraintId);
      if (has) {
        return current.map((d) => (d.rawConstraintId === updated.rawConstraintId ? updated : d));
      }
      return [...current, updated];
    });
    setConfirmedConstraints((current) =>
      current.filter((c) => c.rawConstraintId !== updated.rawConstraintId)
    );
  }, []);

  function finalizeAiDisplayText(
    agentInput: AgentInputPayload,
    rawText: string,
    modelText: string,
    specs: ParsedConstraintDraft['proposedSpecs']
  ): string {
    const canonical = preferCanonicalNormalizedText(agentInput, rawText, modelText);
    if (specs.length === 1 && specs[0].kind !== 'custom_dsl') {
      return specs.map((s) => humanizeConstraintSpec(s)).join('\n');
    }
    return canonical;
  }

  const rejectAndReparse = useCallback(
    async (
      rawConstraint: { id: string; text: string; type: 'required' | 'preferred'; weight?: number },
      currentDraft: ParsedConstraintDraft,
      agentInput: AgentInputPayload,
      provider: AIProviderConfig,
      options?: { userFeedback?: string }
    ): Promise<ParsedConstraintDraft | null> => {
      const attempts = currentDraft.reparseCount ?? 0;
      if (attempts >= LEGACY_MAX_REPARSE_ATTEMPTS) {
        return null;
      }

      setReparseLoadingId(rawConstraint.id);
      try {
        const previousAttempts: ReparseAttempt[] = [
          ...(currentDraft.previousAttempts ?? []),
          {
            summary: currentDraft.explanation || '',
            displayText: currentDraft.displayText || currentDraft.original,
            spec: currentDraft.proposedSpecs[0],
            semantic: currentDraft.semanticRepresentation,
            source: currentDraft.proposedSpecs[0] ? 'built_in' : 'semantic',
            confidence: currentDraft.confidence,
            assumptions: [],
            createdAt: new Date().toISOString(),
          },
        ];

        const context = {
          teachers: agentInput.assignments.map((a) => a.teacher.label),
          classes: agentInput.assignments.map((a) => a.class.label),
          subjects: agentInput.assignments.map((a) => a.subject.label),
          days: agentInput.days,
          periods: agentInput.sessions.flatMap((session) =>
            Array.from({ length: agentInput.periodCounts[session.id] ?? 0 }, (_, i) => ({
              session: session.id,
              period: i + 1,
            }))
          ),
          assignments: agentInput.assignments.map((a) => ({
            id: a.id,
            teacher: a.teacher.label,
            class: a.class.label,
            subject: a.subject.label,
            weeklyPeriods: a.weeklyPeriods,
          })),
        };

        const result = await reparseRejectedConstraint(
          {
            rawConstraint: {
              id: rawConstraint.id,
              text: rawConstraint.text,
              type: rawConstraint.type,
              weight: rawConstraint.weight,
            },
            rejectedDraft: {
              summary: currentDraft.explanation || '',
              displayText: currentDraft.displayText || currentDraft.original,
              spec: currentDraft.proposedSpecs[0],
            },
            previousAttempts: previousAttempts.map((a) => ({
              summary: a.summary,
              displayText: a.displayText,
              source: a.source,
              confidence: a.confidence,
            })),
            ...(options?.userFeedback?.trim() ? { userFeedback: options.userFeedback.trim() } : {}),
            context,
          },
          provider,
          agentInput
        );

        const specs = result.candidate.specs;
        let updatedDraft: ParsedConstraintDraft;

        if (result.status === 'candidate' && specs?.length) {
          const built = buildDraftFromSpecs(
            currentDraft.id,
            {
              id: rawConstraint.id,
              text: rawConstraint.text,
              type: rawConstraint.type,
            },
            specs,
            agentInput,
            {
              source: 'ai_reparse',
              confidence: result.candidate.confidence,
              explanation: result.displayText,
            }
          );
          const displayText = finalizeAiDisplayText(
            agentInput,
            rawConstraint.text,
            result.displayText,
            built.proposedSpecs
          );
          updatedDraft = {
            ...built,
            displayText,
            reparseCount: attempts + 1,
            previousAttempts,
            semanticRepresentation: result.candidate.semantic,
            source: 'ai_reparse',
          };
        } else {
          const reparseIssues = result.candidate.unresolvedQuestions.map((message) => ({
            code: 'low_confidence' as const,
            message,
          }));
          const displayText = finalizeAiDisplayText(
            agentInput,
            rawConstraint.text,
            result.displayText,
            currentDraft.proposedSpecs
          );
          updatedDraft = {
            ...currentDraft,
            displayText,
            reparseCount: attempts + 1,
            previousAttempts,
            proposedSpecs: [],
            semanticRepresentation: result.candidate.semantic,
            confidence: result.candidate.confidence,
            source: 'ai_reparse',
            status: result.status === 'unsupported' ? 'unsupported' : 'needs_review',
            issues: reparseIssues,
          };
        }

        setConstraintDrafts((current) => {
          const has = current.some((d) => d.rawConstraintId === updatedDraft.rawConstraintId);
          if (has) {
            return current.map((d) =>
              d.rawConstraintId === updatedDraft.rawConstraintId ? updatedDraft : d
            );
          }
          return [...current, updatedDraft];
        });

        return updatedDraft;
      } catch (e) {
        setParseError(e instanceof Error ? e.message : 'Diễn giải lại thất bại');
        return null;
      } finally {
        setReparseLoadingId(null);
      }
    },
    []
  );

  const applyTemplate = useCallback(
    (
      constraint: ConstraintItem,
      templateId: ConstraintFormTemplateId,
      agentInput: AgentInputPayload,
      existingDraft?: ParsedConstraintDraft
    ) => {
      const baseDraft: ParsedConstraintDraft =
        existingDraft ??
        ({
          id: `draft_${constraint.id}`,
          rawConstraintId: constraint.id,
          original: constraint.text,
          proposedSpecs: [],
          status: 'unparsed',
          confidence: 'low',
          explanation: '',
          issues: [],
          source: 'template',
        } as ParsedConstraintDraft);
      const ctx = buildContextFromAgentInput(agentInput);
      const values = defaultFormValues(templateId, constraint.type);
      const updated = applyFormToDraft(agentInput, baseDraft, constraint.type, values, ctx);
      setConstraintDrafts((current) => {
        const has = current.some((d) => d.rawConstraintId === constraint.id);
        if (has) {
          return current.map((d) => (d.rawConstraintId === constraint.id ? updated : d));
        }
        return [...current, updated];
      });
      setConfirmedConstraints((current) =>
        current.filter((c) => c.rawConstraintId !== constraint.id)
      );
    },
    []
  );

  const runParse = useCallback(
    async (agentInput: AgentInputPayload, constraintList: ConstraintItem[], provider: AIProviderConfig) => {
      if (!constraintList.length) {
        setConstraintDrafts([]);
        setParseError(null);
        return;
      }
      setParseLoading(true);
      setParseError(null);
      try {
        const raws = constraintItemsToRaw(
          constraintList.map((c) => ({
            id: c.id,
            type: c.type,
            text: c.text,
            weight: c.weight,
          }))
        );
        const confirmedIds = new Set(confirmedConstraints.map((c) => c.rawConstraintId));
        const drafts = await parseConstraintDraftsWithRaws(
          agentInput,
          raws.filter((raw) => !confirmedIds.has(raw.id)),
          provider
        );
        setConstraintDrafts((current) => {
          const parsedIds = new Set(drafts.map((d) => d.rawConstraintId));
          const kept = current.filter((d) => !parsedIds.has(d.rawConstraintId));
          return [...kept, ...drafts];
        });
        const rawIds = new Set(raws.map((raw) => raw.id));
        setConfirmedConstraints((prev) =>
          prev.filter((c) => rawIds.has(c.rawConstraintId))
        );
      } catch (e) {
        setParseError(e instanceof Error ? e.message : 'Phân tích thất bại');
      } finally {
        setParseLoading(false);
      }
    },
    [confirmedConstraints]
  );

  const preflight = useCallback(
    (constraintList: ConstraintItem[]) => {
      const raws = constraintItemsToRaw(
        constraintList.map((c) => ({
          id: c.id,
          type: c.type,
          text: c.text,
          weight: c.weight,
        }))
      );
      return assertSolvableConstraintState(raws, constraintDrafts, confirmedConstraints);
    },
    [constraintDrafts, confirmedConstraints]
  );

  return {
    constraintDrafts,
    confirmedConstraints,
    parseLoading,
    reparseLoading: reparseLoadingId,
    parseError,
    hydrateFromWorkspace,
    invalidateReview,
    confirmDraft,
    ignoreDraft,
    updateDraft,
    rejectAndReparse,
    applyTemplate,
    markConstraintsAdded,
    removeConstraintReview,
    newConstraintIds,
    runParse,
    preflight,
  };
}
