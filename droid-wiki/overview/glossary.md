# Glossary

Active contributors: Duy

This glossary defines the key concepts and terms used throughout the Tack Timetable codebase and documentation. Terms are grouped by domain for easier navigation.

## Core product concepts

**Tack Timetable**
The full product name. An AI-assisted timetable (scheduling) generator for Vietnamese schools that combines a Next.js/React frontend, a 6-stage prompt-driven Local Agent, and a sandboxed Python/OR-Tools CP-SAT solver.

**Scheduling Wizard**
The main interactive user interface (`src/features/timetable/TimetableApp.tsx`). Users enter assignments, define days/sessions/periods, write natural-language constraints, trigger the AI solve, review the resulting timetable, and export to Excel.

**Quick import text format**
A compact, human-readable text syntax for bulk-loading teacher–subject–class assignments. Used in the landing page quick-import textarea and parsed by `quick-import.ts`.

## AI agent pipeline

**Local Agent (or 6-stage pipeline)**
The orchestrator and staged reasoning system that turns user input into a validated timetable. Implemented in `runLocalAgent` (`src/features/timetable/ai/local-agent.ts`). The six explicit stages are Translator, Planner, Coder, Sandbox execution, Deterministic Validator, and Repair.

**Translator stage**
First stage. Converts natural-language constraints (plus required/preferred flags) into structured `ConstraintSpec` objects. Uses `prompts/translator.system.md` plus rule-based fallback parsers. Output: array of up to 46 constraint kinds.

**Planner stage**
Second stage. Produces a `Plan`: decision variable declarations, domain size estimates, constraint ordering, reification needs, objective choice, template names, and risk notes. Prompt: `prompts/planner.system.md`.

**Coder stage**
Third stage. Emits complete, executable Python solver code by completing the solver skeleton template. Prompt: `prompts/coder.system.md`. Output passes through AST/syntax checks before execution.

**Sandbox execution**
Fourth stage (transport + host). The generated Python is sent via `python-bridge.ts` (Electron IPC or HTTP fallback) to `python/code_executor.py`, which runs it inside a sandbox (Docker or bubblewrap). Never executed directly on the host.

**Deterministic Validator (or Validation stage)**
Fifth stage. After every solver run the agent executes:
- TypeScript-side `validateSchedule` + CP-SAT round-trip (`deterministic-validator.ts`, `cp-sat-roundtrip.ts`)
- Python-side checkers in `validator_engine.py` (all 46 kinds)
Produces a `DeterministicValidationReport` with hard/soft pass flags, violations, and coverage completeness.

**Repair stage**
Sixth stage (conditional). If hard violations or round-trip failures exist and repair budget remains, the agent calls the Repair LLM (prompt: `prompts/repair.system.md`), applies patches, and re-runs Coder + Validator. Hard limits: 1 runtime repair round, 2 violation repair rounds.

**TokenBudgetGuard**
Utility (`budget-guard.ts`) that tracks cumulative prompt + completion tokens across all LLM calls in a single agent run. Enforces the global cap (`TOKEN_CAP_PER_RUN = 80_000`).

**WorkspaceBoard**
In-memory scratchpad (`workspace.ts`) used by the orchestrator to accumulate intermediate artifacts (plans, code, execution results, violation reports) during a run.

**AgentLifecycleEvent / stage events**
Typed events emitted by every stage via the `onEvent` callback. The UI renders them as a live progress list. Phases include `thinking`, `translator`, `planner`, `coding`, `running`, `checking`, `fixing`, `idle`.

## Constraint system

**ConstraintSpec**
The canonical structured representation of a single scheduling rule. Contains `id`, `original` (natural language), `kind` (one of 46), `severity` (hard/soft/info), `params`, optional `weight`, `tags`, and (for `custom_dsl`) a `pythonPredicate`.

**ConstraintKind**
Union of 46 literal strings representing built-in constraint types (teacher, subject, class, assignment, session, conditional, and custom). Defined in `constraint-spec.ts`. Each kind has a corresponding deterministic checker in both TypeScript and Python.

**ConstraintSeverity**
`hard` (must be satisfied; violations make the schedule invalid), `soft` (penalized but allowed), or `info` (diagnostic only).

**ConstraintTag**
`auto_base` (injected by the system), `user_required`, or `user_preferred`.

**DeterministicValidationReport**
Structured result from the validator. Fields include `ok`, `hardConstraintPass`, `softConstraintPass`, `hardCoverageComplete`, `violations`, `hardViolations`, `softViolations`, `uncheckedConstraintIds`, and `iisConstraintIds`.

**Violation**
A single detected breach of a constraint. Contains `constraintId`, `kind`, human message, and the list of offending `ScheduleEntry` objects.

**Round-trip check**
A validation technique: after the solver returns a schedule, the validator re-encodes that exact schedule as a "forced solution" inside a fresh CP-SAT model and asks whether the solver still considers it feasible. Catches cases where the generated code silently ignored constraints.

**iisConstraintIds (Irreducibly Infeasible Set)**
Subset of constraint IDs that together make the problem unsatisfiable. Computed by the solver or validator and surfaced to the user/repair stage so it can target the minimal conflicting set.

## Execution & sandbox

**Solver skeleton (solver_skeleton.py)**
The base CP-SAT model template that the Coder stage completes. Contains standard variable declarations, objective scaffolding, and hooks where constraint code is injected. Lives in `python/templates/` and is synced to `public/templates/` at build time.

**code_executor.py**
The single secure host that ever executes solver code generated by the LLM. Receives code + input via a temp job directory, compiles it, dispatches to the sandbox, captures result.json + stdout/stderr, and returns a structured envelope.

**Sandbox dispatcher (sandbox/run.py)**
Chooses the isolation technology based on `TT_SANDBOX_MODE` (or auto-detect):
- `docker` → `sandbox/executor.py`
- `bwrap` → `sandbox/bubblewrap_executor.py`
- `none` → raw subprocess (only if `TT_SANDBOX_ALLOW_UNSAFE=1`)

**Docker sandbox**
Strong isolation using a dedicated Docker image (`timetable-sandbox:latest`). Runs with `--network=none`, read-only root, tmpfs workspace, non-root user, CPU/memory limits, and strict capability drops.

**bubblewrap sandbox (bwrap)**
Lightweight Linux namespace-based sandbox. Provides new mount + PID namespaces and seccomp filtering. Faster startup than Docker; still prevents host filesystem and most dangerous syscalls.

**TT_SANDBOX_MODE**
Environment variable controlling sandbox selection. Recommended values: `docker` (strongest isolation) or `bwrap` (fast on Linux). Default: auto-detect.

**ExecutionResult**
The structured envelope returned from the sandbox host to the TypeScript agent. Contains `phase`, `ok`, `status` (optimal/feasible/infeasible/timeout/crashed), `durationMs`, `resultData` (schedule + metadata), and captured stdout/stderr.

**Solver status**
- `optimal` — proven best solution within the model
- `feasible` — valid solution found but optimality not proven
- `infeasible` — no solution exists under current hard constraints
- `timeout_with_solution` — time limit hit but a feasible schedule was returned
- `timeout`, `crashed`, `unknown` — execution failures

## Data & domain models

**AgentInputPayload**
The normalized payload sent from the UI into `runLocalAgent`. Contains days, sessions, period counts, deleted periods, assignments (`NormalizedAssignment[]`), raw constraints, optional previous schedule, and metadata.

**ScheduleEntry**
A single cell in the final timetable: `{ assignmentId?, class, day, period, subject, teacher }`.

**NormalizedAssignment**
A single teacher–subject–class triple with its weekly period count. The fundamental unit the solver allocates.

**Plan**
Planner output describing how the Coder should structure the CP-SAT model (decision variables, objective, templates, risks).

**LocalAgentFinalResult**
The final object returned to the UI after a successful (or partially successful) agent run. Contains the schedule, solver status, full deterministic + checker reports, violations, IIS, conflicting constraints, and attempt history.

## Tooling & build

**Prompt sync (sync_prompts.mjs)**
Build-time script that copies the four authoritative prompt files from `prompts/` into `public/prompts/`. Runs automatically before dev, build, test, and pretest.

**Solver skeleton sync (sync_solver_template.mjs)**
Build-time script that keeps `public/templates/solver_skeleton.py` in sync with the Python-side template.

**Provider smoke test**
Script (`scripts/provider_smoke_test.ts`) that exercises the configured LLM provider end-to-end. Used in CI when a key is available.

**GitNexus impact analysis**
Mandatory pre-edit step enforced by `AGENTS.md` / `CLAUDE.md`. Before modifying any symbol, run `gitnexus_impact` (or equivalent) and report blast radius. Renames must use `gitnexus_rename`.

See also the project [README](../README.md) and the [Architecture](architecture.md) page for context on how these terms fit together.
