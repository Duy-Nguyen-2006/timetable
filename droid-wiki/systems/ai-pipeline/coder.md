# Coder Stage

Active contributors: Duy

## Purpose

The Coder is the third stage of the Local Agent. Its job is to emit a fragment of Python code that defines additional constraints (or objective terms) that the audited solver skeleton does not already handle.

Crucially, the Coder's scope is **extremely narrow**:

- It only writes code for `custom_dsl` constraints with `severity == "hard"`.
- All 45 built-in `ConstraintKind` values are handled by a registry inside the solver skeleton.
- All soft constraints (regardless of kind) are handled by the registry as penalty terms in the objective.
- If there are no hard `custom_dsl` constraints in the current run, the Coder returns the literal string `"pass"` and an empty coverage list.

This design keeps the untrusted LLM output small, auditable, and limited to the truly novel cases that the built-in system was not designed to express.

## Location and entry point

- Implementation: `src/features/timetable/ai/coder.ts`
- Exported function: `runCoderTurn(config, payload, invokeChat?)`
- Prompt: `prompts/coder.system.md`
- Skeleton injection logic: `src/features/timetable/ai/skeleton-injector.ts` (`injectConstraintCode`)

## Input

```ts
{
  dataset: {
    classes: string[];
    days: string[];
    periods: number[];
    assignments: Array<{ id, class, subject, teacher, weeklyPeriods }>;
    constraints: ConstraintSpec[];
    datasetDigest: { ... };
  };
  plan: Plan;
  previousAttemptSummary?: string;
}
```

The Coder receives the full dataset (so it can refer to concrete teacher/class/subject names) and the `Plan` from the previous stage (for context on variable modeling and ordering). `previousAttemptSummary` carries error context from the last failed attempt (compile error, runtime failure, or validation violations).

## Output

`CoderTurnResult`:

```ts
{
  plan_summary: string;
  constraint_code: string;           // the fragment to inject
  covered_constraint_ids: string[];  // which hard custom_dsl ids this code addresses
  assumptions: string[];
  rawResponse?: string;
  usageTokens?: number;
}
```

The `constraint_code` is **not** a complete Python file. It is a body fragment that will be inserted after the marker `# <<< AI_FILL_HERE >>>` inside the function `build_custom_constraints` in the solver skeleton.

## The injection contract

Inside `python/templates/solver_skeleton.py` (and its public copy), the skeleton already contains:

```python
custom_specs = [
    s for s in constraints
    if s.get("kind") == "custom_dsl" and s.get("severity", "hard") == "hard"
]
# <<< AI_FILL_HERE >>>
pass
```

The Coder's `constraint_code` replaces the `pass` (and the marker comment). The generated code runs **once** for the entire list of hard `custom_dsl` specs.

Therefore the Coder **must** write its own loop:

```python
for spec in custom_specs:
    params = spec.get("params", {})
    # ... handle this spec using params["naturalLanguage"] or other fields
```

It must **not** assume that variables `spec`, `kind`, or `params` are already in scope from the built-in registry loop.

## Coverage enforcement (`ensureCoverage`)

After the model returns, `ensureCoverage` performs a critical safety check:

1. It identifies all hard `custom_dsl` specs that were sent to the Coder.
2. For each such id, it verifies that the generated `constraint_code` actually contains a reference to that id (using a word-boundary regex, not a naive substring search — this avoids false positives where `c1` matches inside `c10`, `c12`, etc.).
3. If a hard custom constraint id is **not** referenced in the generated code, the function throws:

   > `Coder failed to cover hard custom_dsl constraint ${id}: no code reference`

4. This error is caught by the orchestrator in `local-agent.ts`, which treats it as a Coder failure, increments the retry counter, and (on the next attempt) includes the error in `previousAttemptSummary`.

This guard prevents the agent from silently ignoring a hard custom constraint that the user explicitly marked as mandatory.

## The built-in registry (what the Coder must NOT do)

The solver skeleton contains a large `if/elif` registry that already implements checkers and CP-SAT constraints for every built-in `ConstraintKind`. The Coder prompt explicitly lists many of them and states:

> Bạn KHÔNG viết code cho các kind trên.

Similarly:

> MỌI constraint có `severity != "hard"` đều do built-in registry tự xử lý dưới dạng penalty + objective.

The Coder is only allowed to emit code for hard `custom_dsl`. Any attempt to emit code for a built-in kind or a soft constraint is considered incorrect behavior (the prompt and the `ensureCoverage` logic both discourage it).

## LLM call details

- Temperature is low (`0.1`) to encourage precise, mechanical code rather than creative solutions.
- `cache_control` is enabled (Anthropic prompt caching).
- Max tokens is generous (30,000) because custom constraint code can be long.
- The response is forced through a JSON schema (`coderResponseSchema`) requiring `plan_summary`, `constraint_code`, `covered_constraint_ids`, and `assumptions`.

## Integration with the orchestrator

In `local-agent.ts`, the Coder is invoked inside a retry loop (`while (coderRetry < MAX_CODER_RETRIES)`):

1. On the first attempt, `previousAttemptSummary` is empty.
2. If execution fails (syntax error, AST rejection, compile failure, runtime crash, or validation violations), the orchestrator calls the Repair stage (or directly feeds the error back).
3. On the next Coder attempt, `previousAttemptSummary` contains a digested version of the failure.
4. After the Coder returns, the orchestrator:
   - Applies any pending repair patches from a previous Repair turn.
   - Injects the (possibly patched) code into the skeleton via `injectConstraintCode`.
   - Runs syntax check (`syntaxCheckPython`).
   - If hard custom constraints exist, runs AST check (`astCheckPython`).
   - Proceeds to execution.

## Assumptions and plan_summary

The `assumptions` array and `plan_summary` are primarily for diagnostics and for feeding context back to the Repair stage on the next round. They are stored in the `WorkspaceBoard` attempt history.

## Testing

- `src/features/timetable/ai/coder.test.ts` covers the response parsing and `ensureCoverage` logic (especially the word-boundary regex fix for ids like `c1` vs `c10`).
- Prompt behavior is validated by `npm run test:prompt`.
- End-to-end custom constraint scenarios are exercised in `local-agent.test.ts`.

## Related pages

- [AI Pipeline index](index.md)
- [Planner](planner.md) — the provider of the `Plan` the Coder receives
- [Repair](repair.md) — the consumer of Coder output when repair is needed
- [Skeleton Injector](../skeleton-injector.md) (if a dedicated page is later created)
- [Coder prompt](../../../../prompts/coder.system.md) — the detailed instructions and rules given to the model
- [Solver skeleton](../../../../python/templates/solver_skeleton.py) — the audited template the Coder completes

## Where to start if you need to change Coder behavior

1. Run `gitnexus_impact` on `runCoderTurn` and `ensureCoverage`.
2. If you are relaxing or tightening the allowed scope (e.g., allowing the Coder to emit soft custom constraints or certain built-in overrides), you must:
   - Update the prompt (`prompts/coder.system.md`)
   - Update `isAiCodedSpec` and the filtering logic in `runCoderTurn`
   - Update `ensureCoverage` if the coverage rules change
   - Update the skeleton registry or the injection site if the contract changes
3. Any change here has a very large blast radius (it directly affects what untrusted code can be generated and executed). Treat it as a security-sensitive modification.
