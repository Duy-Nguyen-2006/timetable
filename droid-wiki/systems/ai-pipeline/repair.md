# Repair Stage
Active contributors: Duy

The Repair stage implements a violation-driven repair loop that feeds failure context (violations or compile/runtime errors) back into the Coder/Validator cycle under strict budgets. It is the final safety net that allows the agent to self-correct within hard limits instead of failing immediately on the first invalid solver.

## Core Functions

- `runRepairTurn` (src/features/timetable/ai/repair.ts): Calls the repair LLM (modelRepair override) with the current Plan, constraint code, list of Violations (or compileOrRunError), and expects a structured JSON response containing `summary`, `patches[]`, and `assumptions[]`. Uses `prompts/repair.system.md`.
- `applyRepairPatches` (src/features/timetable/ai/repair.ts): Atomic, overlap-safe patch applicator. Validates all `oldStr` locations on the original source first, detects duplicates (unless `replaceAll`), sorts by offset, checks for overlaps, then stitches the result in a single pass. Throws on missing or ambiguous patches.

## Repair Budgets (enforced in local-agent.ts)

- `MAX_RUNTIME_REPAIR_ROUNDS = 1` — used for executable/compile failures before any schedule was produced.
- `MAX_VIOLATION_REPAIR_ROUNDS = 2` — used for hard violations or CP-SAT round-trip failures after a successful execution.
- Total repair LLM calls are further bounded by `MAX_TOTAL_TOOL_CALLS = 15` and the 80 k token cap.

## Loop Integration

Inside `runLocalAgent`:

1. After Coder inner loop (≤3 retries) produces a solver that either fails to execute or produces a schedule with hard violations / round-trip failure:
   - Runtime failure path increments `runtimeRepairRound` and calls `runRepairTurn` with `compileOrRunError`.
   - Violation path builds a violation signature (constraintId:kind + round-trip status), detects repeated identical signatures (≥2), and calls `runRepairTurn` with the `Violation[]` list (plus pseudo-violations for uncovered hard constraints).
2. On success, patches are stored in `pendingRepairPatches`.
3. On the next Coder iteration, `applyRepairPatches` is attempted atomically before invoking Coder again. If patch application fails, the attempt is counted as a Coder retry.
4. `previousAttemptSummary` and `WorkspaceBoard` carry the failure digest to the next Coder turn so the coder prompt contains context about previous failures.
5. Control returns to the Coder/Validator stages; the repair stage itself does not execute code or re-validate.

Repeated-violation detection (same signature across two repair rounds) short-circuits to prevent infinite same-error repair loops.

## Prompt Contract (prompts/repair.system.md v3.0.0)

The repair agent is instructed to output only minimal, targeted patches (never full rewrites). Key rules:
- `oldStr` must be unique (or `replaceAll: true`); otherwise the call fails.
- Minimal diff only — patches must target the exact violation or error.
- Special semantics for `subject_consecutive`: only `floor(weeklyPeriods / length)` contiguous blocks are required; remainder may be scheduled singly.
- On unresolvable cases, return empty `patches` and document assumptions.

## Safety and Atomicity Guarantees

- Patch application is fully validated before any mutation.
- Overlap detection prevents destructive interleaving.
- All repair turns consume the token budget and increment the tool-call counter.
- If no patches are proposed or budgets are exhausted, the agent terminates with a clear "Coder exhausted" or "Repair exhausted" error.

## Cross-references

- Orchestration and budgets: [AI Pipeline index](systems/ai-pipeline/index.md)
- Deterministic validation that produces the violations fed to Repair: [Validator](systems/ai-pipeline/validator.md)
- Coder stage that receives the repaired code: sibling Coder page (see index for status)

This page intentionally stays focused on the repair loop mechanics. Detailed prompt text lives in `prompts/repair.system.md`; implementation details are in the two functions in `repair.ts` and their call sites in `local-agent.ts`.
