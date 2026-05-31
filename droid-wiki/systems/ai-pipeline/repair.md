# Repair Stage

Active contributors: Duy

## Purpose

The Repair stage is the sixth and final step in the Local Agent pipeline (when it is needed). Its job is to react to failures from the Coder or the Validator/Executor and produce actionable fixes that can be fed back into the next Coder attempt.

There are two distinct repair paths, each with its own round limit:

- **Runtime / compile repair** — triggered by syntax errors, AST rejection, compile failures inside `code_executor.py`, or runtime crashes/timeouts. Limited to `MAX_RUNTIME_REPAIR_ROUNDS = 1`.
- **Violation repair** — triggered by hard constraint violations or CP-SAT round-trip failures after a "successful" solver run. Limited to `MAX_VIOLATION_REPAIR_ROUNDS = 2`.

The separation exists to prevent token budget explosion: runtime errors are usually quick to diagnose and patch, while violation-driven repairs can require more context and multiple rounds.

## Location and entry points

- Main logic: `src/features/timetable/ai/repair.ts`
  - `runRepairTurn(config, payload)` — calls the LLM with violation/compile context and asks for patches.
  - `applyRepairPatches(source, patches)` — safely applies the returned patches to the previous Coder output.
- Orchestration: `src/features/timetable/ai/local-agent.ts` (the two repair loops inside `runLocalAgent`).

## Input to `runRepairTurn`

```ts
{
  plan: Plan;
  constraintCode: string;           // the code that just failed
  violations: Violation[];          // hard violations (may be empty for runtime errors)
  compileOrRunError?: string;       // digest of the failure for runtime/compile path
}
```

The payload sent to the model includes:
- The current `constraint_code` from the Coder
- A summarized list of hard violations (constraintId, kind, message, sample offending entries)
- The compile/runtime error digest (if any)
- The original `plan`

## Output

`RepairTurnResult`:

```ts
{
  summary: string;
  patches: Array<{
    oldStr: string;
    newStr: string;
    reason: string;
    replaceAll?: boolean;
  }>;
  assumptions: string[];
  rawResponse?: string;
  usageTokens?: number;
}
```

The `patches` array is the actionable output. Each patch describes a precise string replacement to apply to the previous Coder output before the next attempt.

## Safe patch application (`applyRepairPatches`)

This function is deliberately strict (it was hardened after several subtle bugs):

1. **Validation phase** — For every patch, it searches the *original* source for `oldStr`. It records every occurrence index.
   - If zero occurrences → error ("oldStr not found").
   - If multiple occurrences and `replaceAll` is not true → error ("ambiguous, expand context or set replaceAll").
2. **Overlap detection** — After collecting all replacement segments, it sorts them by start offset and verifies that no two segments overlap.
3. **Atomic stitching** — It walks the source once, cutting at each validated segment and inserting the corresponding `newStr`. Each patch is applied exactly once at its validated location.

This prevents the classic "patch N changes the text so that patch N+1's oldStr now matches in the wrong place or multiple times" problem.

## How the two repair loops work in the orchestrator

**Runtime / compile repair loop** (outer `while (coderRetry < MAX_CODER_RETRIES)`):

- After a Coder attempt, the code is injected and checked (syntax + optional AST).
- If execution fails with a compile/runtime error, `shouldRepairExecutableFailure` decides whether to call `runRepairTurn` with `compileOrRunError`.
- At most 1 runtime repair round is allowed.
- Successful patches are stored in `pendingRepairPatches` and applied on the *next* Coder attempt (before calling the model again).

**Violation repair loop** (separate counter `violationRepairRound`):

- After a "successful" execution, `validateSchedule` + round-trip are run.
- If hard violations exist or round-trip failed, the orchestrator calls `runRepairTurn` with the violation list.
- At most 2 violation repair rounds.
- The violation signature (hard violation ids + round-trip status) is tracked to detect repeated identical failures and exit early with a clear message.

These two loops are intentionally bounded and separate so that a cascade of runtime fixes cannot consume the entire violation repair budget (and vice versa).

## The Repair prompt

`prompts/repair.system.md` gives the model very specific rules:

- It must output **patches only**, never a full rewrite.
- `oldStr` should ideally appear exactly once; otherwise the model must either make it unique or set `replaceAll`.
- There are domain-specific semantics rules (e.g., for `subject_consecutive`, the model must not demand that every period is inside a consecutive block when `weeklyPeriods % length != 0`).

The prompt also tells the model to look at `plan_summary` from the previous Coder turn for context.

## Integration with `WorkspaceBoard` and diagnostics

Every repair action is recorded via `board.addAttempt(...)`:
- `"repair_patch_applied"`
- The number of patches and the round number

These attempts appear in the final `LocalAgentFinalResult.attemptHistorySummary` and are visible in the UI progress panel.

The `summary` and `assumptions` from each Repair turn are also stored and can be shown to the user as part of the diagnostic trail.

## Why bounded repair instead of "just ask the model to try again"?

Unlimited retries would:
- Explode token usage (the prompt grows with every failure context)
- Hide real modeling problems behind a long chain of micro-patches
- Make it hard for a human to understand what actually went wrong

The explicit round limits + signature-based early exit for repeated violations force the system to fail fast with a useful error message when the model cannot produce a correct solution within the budget.

## Testing

- `src/features/timetable/ai/repair.test.ts` (if present) or coverage inside `local-agent.test.ts`
- The atomic patch application logic has explicit unit tests because it was the source of several subtle bugs during development (see comments referencing "fix bug #8").
- Prompt behavior for repair is covered by `npm run test:prompt`.

## Related pages

- [AI Pipeline index](index.md)
- [Coder](coder.md) — the stage whose output Repair patches
- [Validation Stage](validator.md) — the source of the violation lists that trigger repair
- [Repair prompt](../../../../prompts/repair.system.md)
- [Patterns and Conventions](../../../how-to-contribute/patterns-and-conventions.md) (bounded loops, typed events, never trust the solver)

## Where to start if you need to change repair behavior

1. Run `gitnexus_impact` on `runRepairTurn` and especially `applyRepairPatches` (the latter has a very large blast radius).
2. If you change the patch application algorithm, you **must** update or add tests for the atomic stitching + overlap detection logic.
3. If you relax the round limits, update the constants in `local-agent.ts`, the orchestrator logic, and the documentation.
4. Any change to the Repair prompt or the violation payload shape affects both the model behavior and the UI diagnostics. Treat it as a cross-cutting change.
