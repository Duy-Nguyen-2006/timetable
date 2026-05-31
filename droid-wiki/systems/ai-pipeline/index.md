# AI Pipeline

Active contributors: Duy

## Purpose

The AI Pipeline is the central innovation of Tack Timetable: a 6-stage Local Agent that converts raw user constraints (natural language + required/preferred) into a validated, executable CP-SAT solver program, runs it under strict sandboxing, and repairs violations within hard budgets. The orchestrator `runLocalAgent` in `src/features/timetable/ai/local-agent.ts` coordinates Translator → Planner → Coder → Sandbox execution → Deterministic Validator (with CP-SAT round-trip) → bounded Repair loops while emitting typed lifecycle events for live UI progress. Every run is protected by `TokenBudgetGuard` (80 k token cap), stage caching, and multiple safety rails (3 coder retries, 1 runtime repair round, 2 violation repair rounds, 15 total tool calls, wall-clock timeout).

## Directory layout

All Local Agent logic resides under the `ai/` feature directory. The tree below shows the current structure after the May 2026 modularization refactor (orchestrator separated from constants, utilities, caching, and stage-specific helpers):

```text
src/features/timetable/ai/
├── local-agent.ts                 # Orchestrator (runLocalAgent) — wires stages, retry/repair loops, event emission, budget
├── local-agent-limits.ts          # Hard caps (MAX_CODER_RETRIES, TOKEN_CAP, repair rounds, tool calls, cache size/TTL)
├── local-agent-utils.ts           # emit, pickStageConfig, resolveSolverRuntime, dedupeConstraintSpecs, violation signatures, budget helpers
├── stage-cache.ts                 # TTL-based LRU stage cache (replaces inline Map in orchestrator)
├── types.ts                       # AgentInputPayload, LocalAgentConfig, LocalAgentFinalResult, AgentEvent, stage result types
├── translator.ts                  # runTranslatorTurn — thin facade; delegates to translator-text + translator-periods
├── translator-text.ts             # Text utilities, fallback predicates, auto-base tagging, constraint normalization
├── translator-periods.ts          # Period expansion and day/session-aware period builders for translator context
├── planner.ts                     # runPlannerTurn — specs + digest → Plan (decision vars, ordering, objective, risks)
├── coder.ts                       # runCoderTurn — Plan + specs → constraint_code (Python) + covered_constraint_ids
├── repair.ts                      # runRepairTurn + applyRepairPatches (atomic patch application)
├── deterministic-validator.ts     # validateSchedule — thin facade; delegates base + kind checks to validator-helpers
├── validator-helpers.ts           # toPeriod, slotKey, pushViolation, evaluateCondition, checkBaseConstraints (extracted)
├── cp-sat-roundtrip.ts            # verifyCpSatRoundTrip — re-encode produced schedule and ask solver if it satisfies
├── python-bridge.ts               # executeGeneratedCode — IPC (Electron) or POST /api/ai/python-execute (web)
├── skeleton-injector.ts           # loadSolverSkeleton + injectConstraintCode + syntaxCheckPython + astCheckPython
├── budget-guard.ts                # TokenBudgetGuard — token estimation and hard cap enforcement
├── workspace.ts                   # WorkspaceBoard — scratchpad for dataset, plan, latest code, violations, attempts
├── constraint-spec.ts             # Core domain: ConstraintKind (35 implemented), ConstraintSpec, Plan, ScheduleEntry, Violation, DeterministicValidationReport
├── constraint-registry.ts         # CHECKED_KINDS — registry of constraints that have deterministic checkers
├── input-compressor.ts            # compressPayload + digest for token-efficient stage inputs
├── parse-model-json.ts            # Robust JSON extraction from LLM responses (handles fences, prefixes, trailing text)
├── chat-client.ts                 # invokeChat wrapper over the server-side /api/ai/chat proxy
├── *.test.ts                      # Per-stage unit tests + full-pipeline integration tests in local-agent.test.ts
```

Key files the pipeline depends on but that live outside `ai/`:

- `prompts/translator.system.md`, `planner.system.md`, `coder.system.md`, `repair.system.md` (synced at build time to `public/prompts/`)
- `public/templates/solver_skeleton.py` (and `python/templates/solver_skeleton.py`) — the CP-SAT base that Coder extends
- `python/code_executor.py` + `sandbox/run.py` (and Electron daemon) — the secure execution host (documented in [Python Execution](systems/python-execution.md))

## Key abstractions

| Name | File | One-line description |
|------|------|----------------------|
| `runLocalAgent` | `src/features/timetable/ai/local-agent.ts` | The single public entry point; drives the full 6-stage pipeline with bounded retries, repair loops, token budget, caching, and event emission. After the May 2026 refactor it delegates limits, utilities, and caching to sibling modules. |
| `AgentInputPayload` | `src/features/timetable/ai/types.ts` | Normalized input from the UI: days, sessions, periodCounts, assignments, raw constraints, optional previousSchedule. |
| `LocalAgentConfig` | `src/features/timetable/ai/types.ts` | Provider settings + per-stage model overrides + solverProfile + timeout + onEvent callback. |
| `LocalAgentFinalResult` | `src/features/timetable/ai/types.ts` | Successful output: schedule, solverStatus, deterministicReport, attemptHistorySummary, message. |
| `AgentEvent` | `src/features/timetable/ai/types.ts` | Discriminated union of all observable lifecycle events (phase, stage_*, violations_found, execution_result, final_result, error). |
| `ConstraintSpec` | `src/features/timetable/ai/constraint-spec.ts` | Structured constraint (id, original text, kind among 35 implemented, severity, params, optional pythonPredicate for custom_dsl). |
| `Plan` | `src/features/timetable/ai/constraint-spec.ts` | Planner output describing decision variables, domain size, constraint ordering, reification needs, objective, and risks. |
| `DeterministicValidationReport` | `src/features/timetable/ai/constraint-spec.ts` | Result of validateSchedule: pass/fail flags, full violation lists, hardCoverageComplete, unchecked IDs. |
| `TokenBudgetGuard` | `src/features/timetable/ai/budget-guard.ts` | Tracks estimated + reported token usage and throws on 80 k cap breach. |
| `WorkspaceBoard` | `src/features/timetable/ai/workspace.ts` | Mutable per-run scratchpad holding dataset, specs, plan, latest code, violations, and attempt log. |
| `executeGeneratedCode` | `src/features/timetable/ai/python-bridge.ts` | Transport abstraction: routes generated solver code to the sandboxed Python host. |
| `runTranslatorTurn` / `runPlannerTurn` / `runCoderTurn` / `runRepairTurn` | respective stage *.ts files | Individual stage functions (each calls the LLM via chat-client and returns strict JSON). |
| `applyRepairPatches` | `src/features/timetable/ai/repair.ts` | Atomic, overlap-safe patch applicator used by the repair loop. |
| `MAX_*` limits | `src/features/timetable/ai/local-agent-limits.ts` | Single source of truth for all hard caps (coder retries, repair rounds, tool calls, token budget, cache size/TTL). |
| `getCachedStage` | `src/features/timetable/ai/stage-cache.ts` | TTL-based LRU cache for stage results (replaces inline Map after May 2026 refactor). |

## How it works

`runLocalAgent(input: AgentInputPayload, config: LocalAgentConfig)` is the complete orchestrator. It immediately creates a fresh `TokenBudgetGuard(TOKEN_CAP_PER_RUN)` and a `WorkspaceBoard`, resolves solver runtime (timeout + worker count) from the requested `solverProfile`, and begins the pipeline while emitting events on every significant transition.

The flow in prose:

1. **Translator stage** — raw constraints are sent (with a rich system prompt) to produce `ConstraintSpec[]`. A deterministic fallback parser handles the newer constraint kinds. Results are deduplicated by semantic signature. Cacheable when no prior failure context.
2. **Planner stage** — a compressed dataset digest + the deduplicated specs are sent to produce a `Plan` (decision variables declaration, estimated domain size, constraint ordering, reification needs, objective choice, risks). Also cacheable on the happy path.
3. **Coder inner loop** (up to `MAX_CODER_RETRIES = 3`):
   - Coder receives the `Plan` + relevant specs and emits a Python snippet (`constraint_code`) plus the list of `covered_constraint_ids`.
   - The snippet is injected into the solver skeleton (`skeleton-injector.ts`).
   - Static checks (syntax + optional AST for custom_dsl) run before any execution.
   - The complete solver is sent via `python-bridge.ts` to `code_executor.py` (always inside Docker or bwrap sandbox).
   - On success the produced schedule is passed through `validateSchedule` (TypeScript) and `verifyCpSatRoundTrip`.
   - If the schedule is clean, passes round-trip, and all hard constraints are covered/checked → immediate success. `LocalAgentFinalResult` is assembled and returned.
4. **Repair outer loops**:
   - Runtime or compile failure → at most `MAX_RUNTIME_REPAIR_ROUNDS = 1`. Repair receives the error digest and emits patches.
   - Hard violations or round-trip failure (after a successful execution) → at most `MAX_VIOLATION_REPAIR_ROUNDS = 2`. Repair receives the violation list + current code.
   - Patches are applied atomically via `applyRepairPatches` (validates all locations first, detects overlaps, stitches safely).
   - Control returns to the Coder loop with the patched code and an updated `previousAttemptSummary`.
5. **Termination conditions** (any one stops the run):
   - Success (clean schedule + coverage + round-trip).
   - Coder retries exhausted.
   - Repeated identical violation signature across two repair rounds (prevents infinite same-error loops).
   - Repair budget exhausted.
   - `MAX_TOTAL_TOOL_CALLS` (15) reached.
   - Wall-clock timeout (`resolveSolverRuntime`).

A TTL-based stage cache (20-entry max, 10-minute TTL, implemented in `stage-cache.ts` after the May 2026 refactor) keyed by stable hash avoids repeating identical LLM calls within one agent run. Hard limits and utility functions were extracted to `local-agent-limits.ts` and `local-agent-utils.ts` in the same refactor for better separation of concerns. Token consumption is tracked after every LLM response (preferring `usage.total_tokens` when present) and the budget is asserted after each addition.

Every stage emits `stage_started` and `stage_completed` events. The UI receives continuous `phase` updates (`thinking | translator | planner | coding | running | checking | fixing | idle`) plus `violations_found`, `execution_result`, `final_result`, and `error` events. These drive the live progress list and are also recorded in the final `attemptHistorySummary`.

```mermaid
flowchart TD
    Start[AgentInputPayload + LocalAgentConfig] -->|onEvent stream| UI[TimetableApp UI]
    Start --> T[Translator]
    T -->|ConstraintSpec[] (deduped)| P[Planner]
    P -->|Plan| C[Coder]

    subgraph "Coder inner loop (≤ 3 retries)"
        C --> Inject[Inject into skeleton + syntax/AST]
        Inject --> Exec[Sandbox execution via python-bridge]
        Exec -->|ExecutionResult| V[Deterministic Validator + CP-SAT round-trip]
        V -->|clean + roundTrip.ok + coverage| Success[LocalAgentFinalResult]
        V -->|hard violations / round-trip fail / runtime fail| RepairDecide{Repair budget left?}
    end

    RepairDecide -->|yes| R[Repair LLM]
    R -->|patches| Apply[applyRepairPatches]
    Apply --> C

    RepairDecide -->|no| Fail[Coder exhausted / repeated violation / budget]

    Success --> EmitFinal[emit final_result + return]
    Fail --> EmitError[emit error + return]

    classDef stage fill:#e0f2fe,stroke:#0369a1,color:#000
    class T,P,C,Inject,Exec,V,R,Apply stage
```

The diagram illustrates the main data path, the two bounded repair loops feeding back into Coder, and the continuous typed event stream to the UI.

## Integration points

**Who calls the pipeline:**

- `src/features/timetable/TimetableApp.tsx` — the primary consumer. On "Solve" it builds `AgentInputPayload` from current React + Zustand state (days, assignments, constraints, previous schedule if present), assembles per-stage models from Settings, wires an `onEvent` handler that updates live progress, and awaits `runLocalAgent`.

**What the pipeline calls:**

- Stage turn functions (`runTranslatorTurn`, `runPlannerTurn`, `runCoderTurn`, `runRepairTurn`)
- `executeGeneratedCode` (python-bridge) → Electron IPC (`window.electron.python.executeCode`) or server route `/api/ai/python-execute`
- `validateSchedule` + `verifyCpSatRoundTrip`
- `loadSolverSkeleton`, `injectConstraintCode`, `syntaxCheckPython`, `astCheckPython`
- `invokeChat` (chat-client) → `POST /api/ai/chat` (server-side LLM proxy)
- Prompt files via `fetch('/prompts/*.system.md')`
- Solver skeleton via `fetch('/templates/solver_skeleton.py')` or the dedicated API route

**Events it emits:**

All members of the `AgentEvent` discriminated union (defined in `src/features/timetable/ai/types.ts`):

- `{ type: 'status' | 'phase' }`
- `{ type: 'stage_started' | 'stage_completed' }` (with optional attempt counter)
- `{ type: 'violations_found', count, sample }`
- `{ type: 'execution_result', attempt, result }`
- `{ type: 'final_result', result: LocalAgentFinalResult }`
- `{ type: 'error', message, fatal? }`

The UI renders these in real time. The final result also embeds `attemptHistorySummary` (the `WorkspaceBoard` log) for post-run diagnostics.

**Cross-system integration notes:**

- The pipeline never executes Python itself — that responsibility is fully delegated to the Python host (see [Python Execution](systems/python-execution.md)).
- Prompts are the source of truth; changing them is a first-class behavioral change (CI runs prompt validation tests).
- All security boundaries are outside the agent: `python-bridge` refuses local execution; `code_executor.py` always dispatches through the sandbox.

## Entry points for modification

When a developer needs to change pipeline behavior, the recommended starting points (in approximate order) are:

1. **Change orchestration policy, limits, or control flow** — edit `src/features/timetable/ai/local-agent.ts` (the `runLocalAgent` body, retry/repair loop logic, event emission, budget integration). Limits now live in `local-agent-limits.ts`; utilities (emit, dedupe, signatures, solver runtime) live in `local-agent-utils.ts`; the cache is in `stage-cache.ts`.
2. **Modify or add a pipeline stage** — work in the corresponding `runXxxTurn` function (e.g., `translator.ts`, `coder.ts`). For translator internals, see `translator-text.ts` (fallback predicates, normalization) and `translator-periods.ts` (period builders). For validator internals, see `validator-helpers.ts` (base checks, condition evaluation). Update the call site inside the orchestrator and keep the Mermaid diagram on this page in sync.
3. **Change prompts or LLM behavior** — edit the four files under `prompts/`. After editing, run `npm run sync:prompts`. Update or add tests that exercise the new behavior. Prompt changes are treated as behavioral changes.
4. **Extend the constraint system** — add the new kind to the `ConstraintKind` union in `src/features/timetable/ai/constraint-spec.ts`, implement the corresponding checker in `deterministic-validator.ts` + `validator-helpers.ts` (and the Python `validator_engine.py`), update the translator fallback parser (`translator-text.ts`) and the coder/repair prompts, register the kind in `constraint-registry.ts`.
5. **Change execution transport or sandbox policy** — modify `src/features/timetable/ai/python-bridge.ts` (new IPC channel) or the Python side (`python/code_executor.py`, `sandbox/run.py`, `sandbox/executor.py`, `bubblewrap_executor.py`). The "never run generated code on the host" rule must remain inviolate.
6. **Improve UI progress or diagnostics** — edit the event consumer inside `src/features/timetable/TimetableApp.tsx` and/or the `attemptHistorySummary` rendering.
7. **Add or update tests** — start with the integration tests in `local-agent.test.ts` (they exercise the full `runLocalAgent` path). Add unit tests in the per-stage `*.test.ts` files for pure logic.

Per project governance (see `AGENTS.md` and `CLAUDE.md`), every symbol edit must be preceded by an impact analysis (`gitnexus_impact`). Use `gitnexus_rename` for renames instead of textual find-and-replace.

## Key source files

| Repository-root path | Role |
|----------------------|------|
| `src/features/timetable/ai/local-agent.ts` | Orchestrator (post-refactor); wires stages, retry/repair loops, event emission, budget integration |
| `src/features/timetable/ai/local-agent-limits.ts` | Single source of truth for all hard caps (coder retries, repair rounds, tool calls, token budget, cache config) |
| `src/features/timetable/ai/local-agent-utils.ts` | Shared utilities: emit, pickStageConfig, resolveSolverRuntime, dedupeConstraintSpecs, violation signatures, budget helpers |
| `src/features/timetable/ai/stage-cache.ts` | TTL-based LRU stage cache (May 2026 refactor replacement for inline Map) |
| `src/features/timetable/ai/types.ts` | Public contracts: payloads, results, config, lifecycle events, stage return types |
| `src/features/timetable/ai/translator.ts` | Translator stage facade (delegates text/period logic to sibling modules) |
| `src/features/timetable/ai/translator-text.ts` | Text utilities, fallback predicates, auto-base tagging, constraint normalization/splitting |
| `src/features/timetable/ai/translator-periods.ts` | Period expansion and day/session-aware builders for translator context |
| `src/features/timetable/ai/planner.ts` | Planner stage + fallback plan + coverage validation |
| `src/features/timetable/ai/coder.ts` | Coder stage + coverage enforcement for hard custom_dsl constraints |
| `src/features/timetable/ai/repair.ts` | Repair stage + atomic `applyRepairPatches` implementation |
| `src/features/timetable/ai/deterministic-validator.ts` | Validator facade (delegates base/kind checks to validator-helpers) |
| `src/features/timetable/ai/validator-helpers.ts` | Extracted helpers: toPeriod, slotKey, pushViolation, evaluateCondition, checkBaseConstraints |
| `src/features/timetable/ai/cp-sat-roundtrip.ts` | CP-SAT round-trip verifier |
| `src/features/timetable/ai/python-bridge.ts` | Execution transport abstraction (IPC vs HTTP fallback) |
| `src/features/timetable/ai/skeleton-injector.ts` | Solver skeleton loading, constraint code injection, syntax + AST checks |
| `src/features/timetable/ai/budget-guard.ts` | TokenBudgetGuard (estimation + hard cap) |
| `src/features/timetable/ai/workspace.ts` | WorkspaceBoard (per-run mutable scratchpad) |
| `src/features/timetable/ai/constraint-spec.ts` | Core domain types (ConstraintSpec, Plan, ScheduleEntry, Violation, DeterministicValidationReport, …) |
| `src/features/timetable/ai/constraint-registry.ts` | Registry of constraints that have deterministic TypeScript checkers |
| `prompts/translator.system.md` | Translator system prompt (build-time source of truth) |
| `prompts/planner.system.md` | Planner system prompt |
| `prompts/coder.system.md` | Coder system prompt |
| `prompts/repair.system.md` | Repair system prompt |
| `public/templates/solver_skeleton.py` | Base CP-SAT solver template that the Coder extends |

For deeper detail on individual stages, see the sibling pages:

- [Translator](systems/ai-pipeline/translator.md)
- [Planner](systems/ai-pipeline/planner.md)
- [Coder](systems/ai-pipeline/coder.md)
- [Validator](systems/ai-pipeline/validator.md)
- [Repair](systems/ai-pipeline/repair.md)

For the surrounding layered architecture and security rationale, see [Architecture](overview/architecture.md).

For the Python execution host, sandbox dispatcher, and persistent daemon, see [Python Execution](systems/python-execution.md).

This page is intentionally high-level. Implementation details, edge-case handling, and per-stage prompt contracts live in the source files and the stage-specific wiki pages.
