# Validation Stage

Active contributors: Duy

## Purpose

The Validation stage is the fifth step in the Local Agent pipeline. After the generated solver runs (inside the sandbox), the agent **never** accepts the result at face value. Instead, it re-validates every constraint using a separate, deterministic checker library.

This stage produces two `DeterministicValidationReport`s:
- One from the TypeScript implementation (`validateSchedule`)
- One from the Python `validator_engine.py` (for cross-check, especially on `custom_dsl` predicates)

It also runs a CP-SAT round-trip verification to ensure the returned schedule is internally consistent with the input assignments.

Hard violations or round-trip failures trigger the Repair stage. Success here is what allows the agent to return a `LocalAgentFinalResult` to the UI.

## Location and entry points

- TypeScript deterministic validation: `src/features/timetable/ai/deterministic-validator.ts`
  - Main function: `validateSchedule(schedule, constraints, ctx)`
  - Round-trip check: `verifyCpSatRoundTrip(...)` in `cp-sat-roundtrip.ts`
- Python validator engine: `python/validator_engine.py`
- Orchestration: `src/features/timetable/ai/local-agent.ts` (the post-execution block after `executeGeneratedCode`)

## What gets validated

Every `ConstraintSpec` in the current set is checked, regardless of whether it came from the Translator's LLM path or the deterministic fallback parser.

- **Base constraints** — fundamental sanity rules (every scheduled entry must have a valid assignmentId, no duplicate slots for the same assignment, etc.).
- **Hard constraints** — must be fully satisfied. Any violation is fatal for this attempt.
- **Soft constraints** — violations are recorded but do not block success; they contribute to the objective.
- **Custom DSL predicates** — for hard `custom_dsl` specs, the Python-side predicate is executed inside the sandbox and the results (`customChecks`) are merged into the report.

## DeterministicValidationReport structure

```ts
{
  ok: boolean;
  baseConstraintPass: boolean;
  hardConstraintPass: boolean;
  softConstraintPass: boolean;
  hardCoverageComplete: boolean;   // true only if EVERY hard constraint had a real checker
  violations: Violation[];
  hardViolations: Violation[];
  softViolations: Violation[];
  uncheckedConstraintIds: string[];
  hardUncheckedConstraintIds: string[];  // hard constraints with no checker (fail-closed)
}
```

`hardCoverageComplete` is a critical safety flag. The system is fail-closed: if a hard constraint has no corresponding checker implementation, it is listed in `hardUncheckedConstraintIds` and `ok` will be false.

## The 46 checkers

As of the `cdac5b5` commit, the TypeScript validator (`deterministic-validator.ts`) and the Python `validator_engine.py` together implement checkers for all 46 `ConstraintKind` values. The implementations must stay in sync.

Key implementation patterns in the TypeScript side:

- Slot maps (`teacherSlotMap`, `classSlotMap`, `assignmentSlotMap`) for O(1) lookups during capacity and blocking checks.
- `evaluateCondition` for the `if_then` / `ConditionExpr` family (supports `and`/`or`/`not` nesting).
- Special handling for `weekly_periods_exact`, `subject_consecutive`, `class_no_double_subject_day`, `resource_capacity`, `session_limit`, and the grouping constraints.
- `customChecks` merging for hard `custom_dsl` predicates that were executed in the sandbox.

The Python side (`validator_engine.py`) contains the authoritative reference implementations for the same logic, plus the interpreter for `pythonPredicate` strings in `custom_dsl` specs.

## CP-SAT round-trip verification

`verifyCpSatRoundTrip` (in `cp-sat-roundtrip.ts`) performs an independent consistency check:

1. From the returned `schedule` entries, it reconstructs which assignment slots were used.
2. It verifies that the reconstructed usage exactly matches the input assignments' `weeklyPeriods` counts.
3. It checks that no assignment was scheduled more times than declared, and that all declared periods were covered (unless the solver reported infeasible).

A round-trip failure is treated as a hard error even if the deterministic constraint checkers passed. This catches cases where the solver produced a schedule that satisfies the encoded model but does not correspond to the original problem (a common symptom of Coder mistakes in constraint formulation).

## Integration in the agent loop

In `local-agent.ts`, after a successful `executeGeneratedCode` call:

```ts
const report = validateSchedule(scheduleWithAssignmentIds, deduped, { assignments: ... });
const roundTrip = verifyCpSatRoundTrip(...);

const customChecks = (execResult.resultData as any).customChecks ?? [];
// merge customChecks into report...

const signature = buildViolationSignature(report.hardViolations, roundTrip.ok, roundTrip.message);

if (!report.ok || !roundTrip.ok) {
  // violation repair round or runtime repair
  previousViolationSignature = signature;
  // ... invoke Repair or retry Coder ...
}
```

The `signature` (constraint ids + round-trip status) is used to detect repeated identical failure modes and terminate the repair loop early with a clear diagnostic.

## Why two implementations (TS + Python)?

- The TypeScript side runs in the browser/Electron renderer with zero additional dependencies and provides instant feedback in the UI.
- The Python side (`validator_engine.py`) is the ground truth for the actual solver execution environment. It is the only place that can execute arbitrary `pythonPredicate` strings from hard `custom_dsl` constraints.
- Cross-checking the two reports increases confidence that a "solved" timetable is genuinely correct.

## Error handling and diagnostics

- Unchecked hard constraints → `hardCoverageComplete = false` → `ok = false` → repair or failure.
- Round-trip failure → treated as hard error → repair or failure.
- Custom predicate execution errors inside the sandbox are captured in `customChecks` and surfaced as `executionErrors` in the final result.

All of this information flows into `LocalAgentFinalResult` (`violations`, `deterministicReport`, `checkerReport`, `executionErrors`, `validationErrors`, `iisConstraintIds`, `conflictingConstraints`).

## Testing

- `src/features/timetable/ai/deterministic-validator.test.ts` — extensive unit tests for the TypeScript checkers.
- `python/tests/test_validator_engine.py` — pytest coverage for the Python engine.
- `cp-sat-roundtrip.test.ts` — round-trip verification tests.
- End-to-end scenarios in `local-agent.test.ts`.

## Related pages

- [AI Pipeline index](index.md)
- [Validation System](../validation.md) — deeper dive into the Python validator engine and the dual-implementation strategy
- [Constraint System](../../../features/constraint-system.md) — the 46 kinds and their semantics
- [Repair](repair.md) — what happens when this stage finds hard violations
- [Python Execution](../python-execution.md) — the sandboxed environment that also runs custom predicates

## Where to start if you need to add or change a checker

1. Run `gitnexus_impact` on the checker functions and on `validateSchedule`.
2. Add the new `ConstraintKind` to `constraint-spec.ts` (if it does not exist yet).
3. Implement the checker in both:
   - `src/features/timetable/ai/deterministic-validator.ts`
   - `python/validator_engine.py`
4. Update the Translator (prompt + fallback parser) if the new kind should be producible from natural language.
5. Add unit tests on both sides.
6. Verify that `hardCoverageComplete` logic still works (the new kind must be recognized as having a checker).
7. Consider whether the new kind needs special handling in `verifyCpSatRoundTrip` or in the Coder skeleton registry.
