'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { parseConstraintDraftsWithRaws } from '../ai/constraint-parse-service';
import { assertSolvableConstraintState } from '../ai/constraint-preflight';
import type { ConfirmedConstraint, ParsedConstraintDraft } from '../ai/constraint-review-types';
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

export type ConstraintReviewHydration = {
  constraintDrafts?: ParsedConstraintDraft[];
  confirmedConstraints?: ConfirmedConstraint[];
};

export function useConstraintReview(initial?: ConstraintReviewHydration) {
  const [constraintDrafts, setConstraintDrafts] = useState<ParsedConstraintDraft[]>(
    () => initial?.constraintDrafts ?? []
  );
  const [confirmedConstraints, setConfirmedConstraints] = useState<ConfirmedConstraint[]>(
    () => initial?.confirmedConstraints ?? []
  );
  const [parseLoading, setParseLoading] = useState(false);
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
    parseError,
    hydrateFromWorkspace,
    invalidateReview,
    confirmDraft,
    ignoreDraft,
    updateDraft,
    applyTemplate,
    markConstraintsAdded,
    removeConstraintReview,
    newConstraintIds,
    runParse,
    preflight,
  };
}
