# Validation Stage
Active contributors: Duy

Post-execution deterministic validation is the fifth stage inside the 6-stage Local Agent pipeline (`runLocalAgent` in `src/features/timetable/ai/local-agent.ts`). After the sandbox successfully executes generated solver code and returns a schedule, the system runs two independent deterministic (non-LLM) validation passes plus a CP-SAT round-trip feasibility re-check before accepting the result for the UI.

## Core Entry Points

- TypeScript facade: `validateSchedule(schedule, constraintSpecs, ctx)` — `src/features/timetable/ai/deterministic-validator.ts`
- Extracted helpers (post-May 2026 refactor): `toPeriod`, `slotKey`, `pushViolation`, `evaluateCondition`, `checkBaseConstraints` — `src/features/timetable/ai/validator-helpers.ts`
- Python reference: `validate_schedule(schedule, constraint_specs, assignments)` — `python/validator_engine.py`
- CP-SAT round-trip: `verifyCpSatRoundTrip(schedule, assignments, domain)` — `src/features/timetable/ai/cp-sat-roundtrip.ts`

Both layers separate **base constraints** (teacher/class clashes at the same slot + weekly-periods exact match per assignment) from **kind-specific checkers** driven by `ConstraintKind`.

## Hard vs Soft Violations

`ConstraintSpec` carries `severity: 'hard' | 'soft'`. After collecting all violations:

- `hardViolations` = base violations + any violation whose `constraintId` is a hard spec.
- `softViolations` = violations belonging only to soft specs.
- `allHardViolations` (in the agent) further merges hard `custom_dsl` violations reported back from the sandbox via `customChecks`.

A schedule is only accepted when:
- `baseConstraintPass`
- `allHardViolations.length === 0`
- `roundTrip.ok`
- `hardUncheckedConstraintIds.length === 0` (fail-closed coverage)

Soft violations are recorded but do not block acceptance.

## Per-Constraint Checkers & Coverage

The TypeScript validator is driven by `CHECKED_KINDS` (from the constraint registry). Any hard constraint whose kind is not in `CHECKED_KINDS` (or is `custom_dsl` without a corresponding sandbox-reported `customChecks` entry) produces an entry in `hardUncheckedConstraintIds`. This forces `hardCoverageComplete = false` and routes the run into the Repair stage with pseudo-violations so the coder knows exactly which constraint IDs still need code.

The Python `validator_engine.py` implements the original/core subset (teacher_block_*, teacher_max_*, subject_pin_*, subject_consecutive, class_no_double_*, weekly_periods_exact, pair_not_same_slot, if_then, session_limit, subject_group_daily_limit) plus the shared base checks. It explicitly skips `resource_capacity` (enforced inside the CP-SAT model) and marks `custom_dsl` as unchecked (the predicate actually runs inside the generated solver).

## CP-SAT Round-Trip Check

`verifyCpSatRoundTrip` re-encodes the produced schedule as a forced solution inside a fresh CP-SAT model using the exact same assignments + domain (days/periods). It asks the solver: "Is this assignment still feasible under the original constraints?" This catches cases where the generated solver silently dropped constraints or produced a schedule that only appeared valid because of a modeling bug.

Failure here is treated as a hard violation and fed to Repair.

## Call Sites in local-agent.ts (the MUST-READ integration)

After every successful `executeGeneratedCode`:

1. Post-process schedule to attach unambiguous `assignmentId` values.
2. Call `validateSchedule(...)` → produces `DeterministicValidationReport` (base/hard/soft pass flags, full violation lists, `uncheckedConstraintIds`, `hardUncheckedConstraintIds`, `hardCoverageComplete`).
3. Call `verifyCpSatRoundTrip(...)`.
4. Merge `customChecks` array from sandbox result for `custom_dsl` hard predicates that actually executed inside the generated solver.
5. Compute `allHardViolations` and the final set of uncovered hard IDs.
6. Accept only on the four conditions listed above; otherwise populate `deterministicReport` / `checkerReport` / `violations` on the failure path and hand control to the Repair stage (with bounded rounds: 1 runtime repair, 2 violation repair).

On the happy path the final `LocalAgentFinalResult` also carries:
- `iisConstraintIds: []`
- `conflictingConstraints: []`
- `validationErrors: []`
- `deterministicReport` (the full report)

These fields are reserved for future IIS / conflict-set extraction and richer diagnostics; they are empty on clean success.

## Relationship to the Broader Validation System

This stage is the runtime gate inside the agent loop. The complete static + dynamic validation picture (including standalone usage of the Python engine and the full `DeterministicValidationReport` contract) lives in the sibling page:

- [Validation System](../validation.md)

## Driving Repair

Hard violations (plus round-trip failures and uncovered hard constraints) are exactly what the Repair stage consumes:

- `runRepairTurn` receives the `Violation[]` list (or compile/runtime error).
- Patches are applied atomically and control returns to the Coder → re-execute → re-validate cycle.

See: [Repair Stage](repair.md) for budgets, patch safety, and repeated-violation short-circuit logic.

## Key Source Files (for this stage)

| Path | Responsibility |
|------|----------------|
| `src/features/timetable/ai/local-agent.ts` | All validation call sites, customChecks merge, hard-violation decision, repair loop integration, `hardCoverageComplete` gate |
| `src/features/timetable/ai/deterministic-validator.ts` | `validateSchedule` + all TS per-kind checkers + fail-closed coverage logic |
| `src/features/timetable/ai/cp-sat-roundtrip.ts` | `verifyCpSatRoundTrip` implementation |
| `python/validator_engine.py` | Reference Python checkers (used inside sandboxes for custom predicates and for standalone verification) |
| `src/features/timetable/ai/constraint-registry.ts` | `CHECKED_KINDS` set that drives which kinds receive deterministic checkers |
| `src/features/timetable/ai/constraint-spec.ts` | Core types: `DeterministicValidationReport`, `Violation`, `ConstraintSpec`, etc. |

## Notes

- `iisConstraintIds` and `conflictingConstraints` are carried in the final result envelope for future extraction of Irreducible Inconsistent Subsystems / minimal conflict sets from the CP-SAT solver. They are not yet populated by the current validator/round-trip layer.
- When adding a new `ConstraintKind`, the pattern is: add to the union + registry, implement the checker in both TS and (where appropriate) Python, update translator fallback + coder/repair prompts, and ensure the new kind is either marked `hasChecker: true` or explicitly handled via code generation inside the solver.
