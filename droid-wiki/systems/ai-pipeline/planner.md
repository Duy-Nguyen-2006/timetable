# Planner Stage

Active contributors: Duy

## Purpose

The Planner stage is the second step in the 6-stage Local Agent pipeline. It receives the deduplicated `ConstraintSpec[]` (from Translator) plus a compact `datasetDigest` and produces a single structured `Plan` object. The Plan tells the downstream Coder stage exactly which decision variables to declare, how large the search space is, the order in which constraints should be added to the CP-SAT model, which constraints require reification (BoolVar indirection), which objective to pursue, which solver skeleton templates are likely to be useful, and any identified risks.

The Planner **never writes Python code**. Its only job is to emit a high-level plan that the Coder can follow. The authoritative system prompt lives in `prompts/planner.system.md` (version 3.0.0 as of 2026-05-28).

See also:
- [AI Pipeline index](systems/ai-pipeline/index.md)
- [Coder stage](systems/ai-pipeline/coder.md) (receives the Plan)
- [Overview architecture](overview/architecture.md)

## Core Function

- `runPlannerTurn` (`src/features/timetable/ai/planner.ts`): The single exported async function. It:
  1. Fetches the system prompt from `/prompts/planner.system.md` (falls back to a minimal English string if the file is unreachable).
  2. Builds a chat payload with temperature 0, `response_format` JSON schema enforcement for `solver_plan`, and a hard 2500-token cap.
  3. Calls `invokeChat` (via `chat-client.ts` → `POST /api/ai/chat`).
  4. Parses the response with `parseModelJson` + Zod `planSchema`.
  5. Runs `validatePlanCoverage` to ensure every hard constraint id appears in `constraintOrder` (appends missing ones and records a risk).
  6. On any failure (network, parse, schema, budget) returns the deterministic `fallbackPlan`.

The function is wrapped by the stage cache in `local-agent.ts` (key includes the planner model and the plannerInput digest) so identical happy-path inputs within a 10-minute window avoid a second LLM call.

## Input Shape

```ts
{
  datasetDigest: { classes: number; days: number; periods: number; estimated?: number; estimatedVars?: number };
  constraintSpecs: ConstraintSpec[];   // already deduplicated
  previousAttemptSummary?: string;     // failure digest from prior repair round
}
```

The `datasetDigest` is derived in `local-agent.ts` from the compressed payload produced by `input-compressor.ts`. It never contains raw assignment lists or full constraint text — only counts — to keep the Planner prompt token-efficient.

## Output Shape (`Plan`)

Defined in `src/features/timetable/ai/constraint-spec.ts`:

```ts
export type Plan = {
  decisionVars: string;                 // one-line declaration, e.g. "slots[(assignmentId, day, period)] = BoolVar"
  domainSize: { classes, days, periods, estimated?, estimatedVars? };
  constraintOrder: string[];            // every constraint id, in the order they should be posted to the model
  reifiedNeeded: string[];              // ids of if_then and soft constraints that need an auxiliary BoolVar
  objective: 'none' | 'maximize_soft' | 'minimize_gaps';
  templatesUsed: string[];              // names of sections in the solver skeleton that Coder should apply
  objectiveFunction?: string;
  provenPatterns?: string[];
  risks: string[];
};
```

The JSON schema sent to the model (in `planner.ts`) exactly matches this type (required fields are enforced).

## Prompt Contract (`prompts/planner.system.md`)

Key non-negotiable rules the prompt gives the LLM:

1. `constraintOrder` **must contain every id** present in the incoming `constraintSpecs`. No omissions, no inventions.
2. `reifiedNeeded` must list every `if_then` and every soft constraint that requires an auxiliary Boolean.
3. When `estimatedVars > 50 000`, the planner **must** emit the risk `"Cần symmetry breaking hoặc giảm domain"`.
4. The planner must understand the special semantics of `subject_consecutive`: only `floor(weeklyPeriods / length)` contiguous blocks are mandatory; the remainder may be scheduled as singletons.
5. When `previousAttemptSummary` is present, the planner must adjust the plan to avoid the prior failure mode and must record the adjustment in `risks` using the exact phrasing `"Lần trước: <reason>. Lần này: <adjustment>"`.

The prompt is written in Vietnamese because the primary user base and the majority of natural-language constraints are Vietnamese. The Planner output fields themselves remain English identifiers.

## Fallback Behavior

If the LLM call fails for any reason (timeout, bad JSON, schema violation, network error, or token budget exhaustion), `runPlannerTurn` returns:

```ts
{
  decisionVars: 'slots[(assignment_id, day, period)] = BoolVar',
  domainSize: datasetDigest,
  constraintOrder: constraints.map(c => c.id),
  reifiedNeeded: constraints.filter(c => c.kind === 'if_then' || c.severity === 'soft').map(c => c.id),
  objective: 'none',
  templatesUsed: ['teacher_slot_capacity', 'class_slot_capacity', 'implication_reified'],
  objectiveFunction: 'satisfy_all_hard_then_minimize_soft_violations',
  provenPatterns: [...],
  risks: []
}
```

`validatePlanCoverage` is still applied to the fallback, so hard constraints are never lost even in degraded mode.

## Integration in the Orchestrator (`local-agent.ts`)

Inside `runLocalAgent`:

```ts
emit(..., { type: 'phase', phase: 'planner', ... });
emit(..., { type: 'stage_started', stage: 'planner' });

const plannerInput = {
  datasetDigest: { classes: ..., days: ..., periods: ..., estimated: ... },
  constraintSpecs: deduped,
};

const plannerCached = await getCachedStage(`planner:${hash...}`, () =>
  runPlannerTurn(pickStageConfig(config, 'planner'), plannerInput)
);

const planner = plannerCached.value;
consumeBudget(budget, plannerCached.hit ? 0 : planner.usageTokens, ...);
board.setPlan(planner.plan);
emit(..., { type: 'stage_completed', stage: 'planner' });
```

The returned `Plan` is stored in the `WorkspaceBoard` and is later supplied verbatim to every Coder turn (including after repair patches). It is also part of the attempt history summary that appears in the final `LocalAgentFinalResult`.

## Cross-references

- Full pipeline context and budgets: [AI Pipeline index](systems/ai-pipeline/index.md)
- The stage that consumes the Plan: [Coder](systems/ai-pipeline/coder.md)
- The prompt that drives this stage: `prompts/planner.system.md`
- Type definitions: `src/features/timetable/ai/constraint-spec.ts` (`Plan`, `ConstraintSpec`)
- Orchestration call site and caching: `src/features/timetable/ai/local-agent.ts`
- Stage cache and token accounting: `src/features/timetable/ai/local-agent.ts` + `budget-guard.ts`

This page intentionally stays narrow: it describes only what the Planner emits and why. Implementation details of Coder consumption, skeleton templates, and concrete variable naming live in the Coder page and the solver skeleton itself.
