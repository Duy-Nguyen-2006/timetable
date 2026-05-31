# Planner Stage

Active contributors: Duy

## Purpose

The Planner is the second stage of the Local Agent. It receives the list of structured `ConstraintSpec`s from the Translator and a compact `datasetDigest`, and produces a `Plan` that tells the Coder:

- How to model the decision variables
- The estimated size of the search space
- In what order to add constraints
- Which constraints require reification (intermediate BoolVars)
- What objective (if any) to pursue
- Which solver skeleton templates are likely to be useful
- What risks the Coder should watch for

The Planner does **not** write Python code. Its output is deliberately abstract so the Coder can choose the best concrete formulation.

## Location and entry point

- Implementation: `src/features/timetable/ai/planner.ts`
- Exported function: `runPlannerTurn(config, input, invokeChat?)`
- Prompt: `prompts/planner.system.md`

## Input

```ts
{
  datasetDigest: {
    classes: number;
    days: number;
    periods: number;
    estimated?: number;
    estimatedVars?: number;
  };
  constraintSpecs: ConstraintSpec[];
  previousAttemptSummary?: string;   // context from a failed prior attempt
}
```

The `datasetDigest` is a rough upper bound on the search space (class × day × period combinations, scaled by number of assignments).

## Output

`PlannerTurnResult`:

```ts
{
  plan: Plan;
  rawResponse?: string;
  usageTokens?: number;
}
```

`Plan` (defined in `constraint-spec.ts`):

```ts
{
  decisionVars: string;                    // one-line description
  domainSize: { ... };
  constraintOrder: string[];               // constraint ids in recommended add order
  reifiedNeeded: string[];                 // ids that need intermediate BoolVars
  objective: 'none' | 'maximize_soft' | 'minimize_gaps';
  templatesUsed: string[];                 // names of patterns in the skeleton
  objectiveFunction?: string;
  provenPatterns?: string[];
  risks: string[];
}
```

## LLM-driven planning with fallback

The stage follows the same hybrid pattern as the Translator:

1. It always loads the current system prompt from `/prompts/planner.system.md`.
2. It sends the dataset digest, the full list of `ConstraintSpec`s, and any `previousAttemptSummary`.
3. The model is asked (via JSON schema) to return a `Plan`.
4. The response is validated.
5. A post-processing step `validatePlanCoverage` ensures that every hard constraint id appears in `constraintOrder`; missing ones are appended with a risk note.

If the LLM call fails or the response is invalid, `fallbackPlan` produces a conservative default plan:
- Simple `slots[(assignment_id, day, period)] = BoolVar` decision variables
- Constraint order = input order
- Reification for all `if_then` and soft constraints
- Objective = `satisfy_all_hard_then_minimize_soft_violations`
- A small set of known-good templates

## Reification logic

Reification (creating an intermediate Boolean variable that represents whether a constraint is satisfied) is needed for:

- All `if_then` constraints (the implication itself must be a first-class variable)
- Soft constraints that the objective will try to maximize/minimize

The Planner marks these ids in `reifiedNeeded`. The Coder is then expected to create the corresponding `BoolVar` and add the reified constraint before using it in the objective.

## Constraint ordering guidance

The Planner is encouraged to order constraints so that:

- Hard constraints that prune the domain early come first.
- Constraints that are likely to cause many propagations (teacher capacity, class capacity) come before softer or more complex ones.
- `if_then` and other reified constraints are added after their antecedents and consequents are declared.

The Coder is not strictly bound by this order, but the plan gives it a strong hint.

## Risk signaling

The `risks` array is the Planner's way of warning the Coder and later stages about potential trouble:

- `"Cần symmetry breaking hoặc giảm domain"` when `estimatedVars > 50,000`
- `"missing_hard_constraints:..."` when coverage validation had to patch the order
- Domain-specific notes about unusual combinations of constraints

These risks are included in the prompt to the Coder on subsequent attempts, giving the model context about why previous attempts failed.

## Integration with the rest of the pipeline

- The `Plan` is stored in `WorkspaceBoard` so that the Coder, Repair, and diagnostics can inspect it.
- The `constraintOrder` and `reifiedNeeded` arrays are used by the Coder to decide the structure of the generated fragment.
- `previousAttemptSummary` (passed in on retry) lets the Planner adjust its recommendations after a Coder or execution failure.

## Testing and validation

- The planner is exercised by `local-agent.test.ts` integration scenarios.
- Prompt behavior is covered by `npm run test:prompt`.
- The `validatePlanCoverage` function has implicit coverage through the agent loop tests (missing hard constraints are a common failure mode that the orchestrator must handle).

## Related pages

- [AI Pipeline index](index.md)
- [Translator](translator.md) — the producer of the `ConstraintSpec[]` list the Planner consumes
- [Coder](coder.md) — the primary consumer of the `Plan`
- [Planner prompt](../../../../prompts/planner.system.md) — the instructions given to the model

## Where to start if you need to change planning behavior

1. Run `gitnexus_impact` on `runPlannerTurn` and `fallbackPlan`.
2. If you are introducing a new class of constraint that affects modeling strategy, update:
   - The Planner prompt table of patterns and risks
   - `fallbackPlan` if the new kind should change the default objective or reification rules
   - `validatePlanCoverage` if the new kind has special ordering requirements
3. Add or update tests that exercise the planner with the new constraint kind.
4. Verify that the generated `Plan` still produces valid `constraintOrder` and `reifiedNeeded` arrays for the Coder.
