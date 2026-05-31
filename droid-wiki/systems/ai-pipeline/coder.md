# Coder Stage
Active contributors: Duy

## Purpose

The Coder stage is the code-generation heart of the 6-stage Local Agent. It receives a `Plan` (from Planner) plus the filtered hard `custom_dsl` constraints and emits a Python snippet (`constraint_code`) that is injected into the solver skeleton to implement those constraints. Only hard `custom_dsl` constraints ever reach the Coder; all built-in kinds and soft constraints are handled by the registry inside the skeleton. The stage is deliberately narrow: it never creates models or slots, never prints, never does I/O, and must respect strict semantics (especially Rule A for `subject_consecutive`).

The public entry point is `runCoderTurn` in `src/features/timetable/ai/coder.ts`. It is invoked from the nested Coder loop inside `runLocalAgent` (`src/features/timetable/ai/local-agent.ts`).

## Core Function — `runCoderTurn`

Signature (simplified):

```ts
async function runCoderTurn(
  config: AIProviderConfig,
  payload: {
    dataset: { ...compressed dataset with constraints... };
    plan: Plan;
    previousAttemptSummary?: string;
  },
  invokeChat?: ChatInvoke
): Promise<CoderTurnResult>
```

Behavior:
- Early exit with a no-op result (`constraint_code: 'pass'`, empty coverage) when there are no hard `custom_dsl` constraints.
- Loads the system prompt via `fetch('/prompts/coder.system.md')` (falls back to a minimal string on failure).
- Builds a single user message containing `datasetDigest`, `assignments`, the hard custom constraints, the `plan`, and `previousAttemptSummary`.
- Calls the chat proxy with `temperature: 0.1`, `max_tokens: 30000`, and a strict `json_schema` for the expected shape.
- Parses the response with `parseModelJson` + Zod (`coderResponseSchema`).
- Runs `ensureCoverage(...)` which:
  - Collects all hard custom ids that must be covered.
  - For any hard custom id missing from `covered_constraint_ids`, performs a word-boundary regex search in the emitted `constraint_code`.
  - If the reference is present, auto-adds it to coverage with an `auto_added_coverage:<id>` assumption.
  - If a hard custom id has no reference at all, throws — the turn fails and triggers a retry.
- Returns `{ plan_summary, constraint_code, covered_constraint_ids, assumptions, rawResponse?, usageTokens? }`.

The returned `constraint_code` is **only the body** that replaces the `# <<< AI_FILL_HERE >>>` marker; it is never a full function or module.

## Prompt Contract (prompts/coder.system.md, v3.2.0)

The prompt (in Vietnamese + English) is the authoritative behavioral spec. Key rules the model must obey:

- **Scope**: Only emit code for `kind == "custom_dsl" && severity == "hard"`. Ignore everything else (built-ins, softs, room constraints that were already dropped by Translator).
- **Injection site**: The skeleton already extracts `custom_specs = [s for s in constraints if ... custom_dsl and hard]`. The generated code runs **once** after that extraction (outside any per-spec `elif`). The coder must therefore write its own `for spec in custom_specs:` loop.
- **Data access**: Only `params["naturalLanguage"]` per spec. Never assume variables from outer scope.
- **Environment**: Use existing `slots[(a["id"], d, p)]`, `model`, `assignments`, `days`, `periods`, `_periods_for(d)`. No imports, no `print`, no file I/O, no new model/slot creation.
- **Failure**: `raise NotImplementedError(spec["id"])` if a constraint cannot be expressed.
- **Semantics — Rule A for subject_consecutive**: The built-in already implements the correct floor-division behavior. The coder must **never** emit code that changes this (no forcing every period into a block, no error on remainders).
- **Output contract** (exact JSON keys):
  ```json
  {
    "plan_summary": string,
    "constraint_code": string,
    "covered_constraint_ids": string[],
    "assumptions": string[]
  }
  ```
- **Self-check** before submit (listed in the prompt): coverage of all listed kinds, hard ids present in `covered_...`, no banned constructs, variable naming matches Translator labels, etc.

The prompt file is the source of truth; changes to it are first-class behavioral changes and must be validated with `npm run test:prompt`.

## Skeleton Injection & Static Safety Gates

After a successful Coder turn, `runLocalAgent` performs the following in order (`skeleton-injector.ts`):

1. `loadSolverSkeleton()` — prefers `fetch('/templates/solver_skeleton.py')`; falls back to the dedicated API route. Both `python/templates/solver_skeleton.py` and `public/templates/solver_skeleton.py` are kept in sync at build time.
2. `injectConstraintCode(skeleton, constraintCode)` — locates the exact marker line `# <<< AI_FILL_HERE >>>` (with surrounding whitespace tolerance), normalizes incoming indentation, strips the coder's common leading indent while preserving relative nesting, and splices the snippet in place. Returns `{ solverCode, injected }`. Failure to find the marker is fatal.
3. `syntaxCheckPython(fullSolverCode)` — POSTs to `/api/ai/python-syntax-check`; the server runs `py_compile`. Any error aborts the attempt and feeds the digest back as `previousAttemptSummary` for the next retry.
4. `astCheckPython(constraintCodeOnly)` — only executed when hard `custom_dsl` constraints exist and the coder actually emitted code. POSTs to `/api/ai/python-ast-check`. Rejects obviously dangerous or malformed fragments before any execution.

These gates run **before** the solver ever reaches the Python host. The Python side (`python/code_executor.py`) still performs its own `py_compile` as a final belt-and-suspenders check.

## Integration Inside the Local Agent

In `src/features/timetable/ai/local-agent.ts`:

- Constant: `const MAX_CODER_RETRIES = 3;`
- The Coder stage lives inside a nested `while (coderRetry < MAX_CODER_RETRIES)` loop.
- On every iteration:
  - Emits `phase: 'coding'`, `stage_started: 'coder'`.
  - Optionally uses the stage cache (10 min TTL) when there is no `previousAttemptSummary`.
  - Calls `runCoderTurn` (model may be overridden via `config.modelCoder`).
  - Injects + runs the two static checks.
  - Executes via `executeGeneratedCode` (see Python Execution system).
  - Runs deterministic validation + CP-SAT round-trip.
  - On any failure (syntax, AST, exec, hard violations after execution) the loop either retries (up to the limit) or hands control to the Repair stage.
- Repair patches (from `runRepairTurn`) are applied atomically via `applyRepairPatches` **before** the next Coder attempt; a failed patch application itself counts as a retry.
- `previousAttemptSummary` (digest of the last error/violation) is threaded into the next Coder call so the model sees prior failure context.
- All turns consume the `TokenBudgetGuard`; tool-call counter is incremented.
- On clean success (base pass + no hard violations + round-trip ok + full hard coverage) the agent exits with a `LocalAgentFinalResult`.

The outer repair budgets (`MAX_RUNTIME_REPAIR_ROUNDS = 1`, `MAX_VIOLATION_REPAIR_ROUNDS = 2`) plus `MAX_TOTAL_TOOL_CALLS = 15` and the 80 k token cap bound the total work even if the inner Coder loop keeps failing.

## Safety & Coverage Model

- Hard-only: soft `custom_dsl` and all non-custom kinds are deliberately excluded from the prompt and from coverage requirements.
- `ensureCoverage` + word-boundary regex guarantees that every hard custom id either appears in the returned `covered_constraint_ids` or has an unmistakable textual reference in the generated code.
- The skeleton's own `custom_specs` filter + the single execution of the injected block (outside the built-in `for spec in constraints`) prevents double-counting or accidental shadowing.
- No generated code can escape the skeleton's variable and model context.
- All execution is forced through the hardened Python host (never direct on the renderer or Next.js server).

## Key Source Files

| Repository-root path                                      | Role |
|-----------------------------------------------------------|------|
| `src/features/timetable/ai/coder.ts`                      | `runCoderTurn`, response schema, `ensureCoverage` enforcement |
| `prompts/coder.system.md`                                 | Authoritative prompt (v3.2.0) — source of truth for allowed constructs and Rule A |
| `src/features/timetable/ai/skeleton-injector.ts`          | `loadSolverSkeleton`, `injectConstraintCode`, `syntaxCheckPython`, `astCheckPython` |
| `python/templates/solver_skeleton.py`                     | Authoritative CP-SAT template (build syncs to `public/templates/`) |
| `public/templates/solver_skeleton.py`                     | Served to browser for injection |
| `src/features/timetable/ai/local-agent.ts`                | Orchestration, `MAX_CODER_RETRIES`, retry/repair loops, event emission, caching |
| `src/features/timetable/ai/types.ts`                      | `CoderTurnResult` and related types |

## Cross-references

- Full pipeline context and Mermaid: [AI Pipeline index](systems/ai-pipeline/index.md)
- Python sandbox host, daemon, and execution contract: [Python Execution](systems/python-execution.md)
- Repair stage that feeds patches back into Coder: [Repair](systems/ai-pipeline/repair.md)
- Planner output consumed by Coder: [Planner](systems/ai-pipeline/planner.md)
- Deterministic validation that consumes the produced schedule: [Validator](systems/ai-pipeline/validator.md)

This page documents the Coder stage as it exists after the constraint-registry and persistent-daemon changes. Implementation details live in the listed source files; the prompt is the behavioral contract.
