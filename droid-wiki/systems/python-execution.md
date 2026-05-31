# Python Execution System

Active contributors: Duy

## Purpose

The Python Execution System is the narrow, trusted bridge between the untrusted code produced by the Coder stage and the actual solver run. Its contract is simple and non-negotiable:

> Receive a string of Python (the generated solver), run it inside an isolated sandbox with a hard timeout, and return a structured `ExecutionResult`. Never execute LLM-written code with host privileges.

The single source of truth for this contract is `python/code_executor.py`. All execution paths — whether from the Electron desktop app or the browser web fallback — ultimately feed this same program.

## Location and entry points

- Core executor: `python/code_executor.py`
- High-level bridge (TypeScript side):
  - `src/features/timetable/ai/python-bridge.ts` — `executeGeneratedCode(code, input, options)`
- Server fallback route: `src/app/api/ai/python-execute/route.ts`
- Electron native path: `electron/main.mjs` (IPC handler `python:executeCode`) + `electron/preload.ts`
- Sandbox wrappers:
  - `sandbox/executor.py` (Docker)
  - `sandbox/bubblewrap_executor.py` (bubblewrap on Linux)

## The execution contract

The executor receives two things:

1. A string of Python code (the complete solver: skeleton + Coder's injected fragment).
2. An `input.json` file in the current working directory (or it creates an empty one).

It performs the following steps inside a fresh temporary directory:

1. Write the generated code to `solver_generated.py`.
2. Run `py_compile` as a fast syntax gate. Failure here returns `phase: "compile"`.
3. Delegate execution to the chosen sandbox (Docker or bubblewrap) with a hard timeout (default 360 seconds, overridable via `EXECUTOR_TIMEOUT_SECONDS` or argv[1]).
4. Capture stdout/stderr (truncated to the last 100 lines for diagnostics).
5. Look for `result.json` written by the solver.
6. Parse it, normalize the solver status (`OPTIMAL` → `optimal`, etc.), and apply a sanity rule: an "optimal/feasible" status with an empty schedule is forced to `infeasible`.
7. Return a structured `ExecutionResult` containing:
   - `phase`, `ok`, `status`
   - `resultData` (the schedule, classes, days, periods, status)
   - `resultSummary` (scheduledCount, unscheduledAssignments)
   - `errorDigest`, truncated `stdout`/`stderr`
   - `durationMs`

The TypeScript side (`python-bridge.ts`) and the Electron main process both understand this exact JSON shape.

## Sandbox isolation (the non-negotiable rule)

The executor itself does **not** run the Python interpreter directly on the host. It always calls into a sandbox wrapper.

**Docker path** (`sandbox/executor.py`):
- Builds `timetable-sandbox:latest` on first use (if not present).
- Runs the solver with:
  - `--network=none`
  - `--read-only` root filesystem + limited tmpfs
  - `--cap-drop=ALL`
  - Non-root user inside the container
  - CPU and memory limits
  - Hard timeout (enforced by Docker + Python watchdog)
- The only writable area is the mounted workspace directory.

**Bubblewrap path** (`sandbox/bubblewrap_executor.py`):
- Lighter-weight alternative on Linux when Docker is undesirable.
- Provides filesystem and capability isolation but weaker network isolation than Docker.
- Still preferred over raw host execution.

Production recommendation (documented in `sandbox/README.md`):
- Set `TT_SANDBOX_MODE=docker` (or `bwrap` on Linux servers).
- `strict=True` is mandatory; if the sandbox cannot be initialized, the executor refuses to run the code rather than falling back to an unsafe path.

Even in development, the default is to require a sandbox. The only way to bypass it is to set explicit unsafe environment variables that are clearly labeled as "dev only."

## Two execution paths from the agent

**Electron (native, recommended)**

- `python-bridge.ts` first checks for `window.electron?.python?.executeCode`.
- If present, it calls the IPC handler in `electron/main.mjs`.
- The main process spawns the PyInstaller-bundled `code_executor` binary (or the dev `python-dist` version) in a temp job directory.
- This path has the best performance and the strongest isolation (the binary is self-contained).

**Browser / web fallback**

- When no Electron IPC exists (plain `npm run dev` or hosted demo), `python-bridge.ts` POSTs to `/api/ai/python-execute`.
- The Next.js route (`src/app/api/ai/python-execute/route.ts`) does the equivalent work in Node:
  - Creates a temp job directory
  - Writes `input.json`
  - Spawns `python3 python/code_executor.py <timeoutSeconds>`
  - Passes through environment variables (`EXECUTOR_TIMEOUT_SECONDS`, `SOLVER_MAX_SECONDS`, `SOLVER_WORKERS`)
  - Cleans up the job directory even on timeout or error (idempotent cleanup)
- Returns the same `ExecutionResult` shape.

Both paths are functionally equivalent from the agent's perspective. The agent does not care which path was used; it only sees the structured result.

## Timeout and resource control

- Default timeout: 360 seconds.
- Overridable via:
  - `EXECUTOR_TIMEOUT_SECONDS` environment variable
  - First command-line argument to `code_executor.py`
  - `timeoutMs` option passed to `executeGeneratedCode` from the UI
- The solver skeleton is also given `SOLVER_MAX_SECONDS` (timeout minus a small buffer) and `SOLVER_WORKERS` (cpu count minus one) so the OR-Tools CP-SAT solver itself respects the time budget.

The executor truncates stdout/stderr to the last 100 lines before returning them, to avoid flooding the agent (and the UI) with megabytes of solver logs.

## Error phases

The `phase` field tells the caller exactly where things went wrong:

- `compile` — `py_compile` failed (syntax error in the generated code).
- `run` — sandbox execution failed (crash, timeout, or sandbox itself could not start).
- `parse` — `result.json` was missing, unreadable, or had invalid format.

This distinction is used by the orchestrator to decide whether to trigger a runtime repair round or a violation repair round (or to fail immediately).

## Custom predicate execution for hard custom_dsl

When the input contains hard `custom_dsl` constraints, the generated solver code (written by the Coder) may include calls that execute the `pythonPredicate` strings.

Those predicates run **inside the same sandboxed execution** as the rest of the solver. Their results are collected into a `customChecks` array in `result.json` and later merged into the `DeterministicValidationReport` by the Validation stage.

This is the only place in the entire system where arbitrary Python expressions provided by the LLM are allowed to run — and even then, they are:
- Limited to hard `custom_dsl` only
- Executed inside the sandbox
- Subject to the same timeout and resource limits
- Cross-checked by the deterministic validator afterward

## Security properties

The combination of the three layers (Coder scope restriction + skeleton injection + sandboxed execution) gives the following guarantees:

- The LLM can only contribute a small fragment inside a marked function.
- That fragment is syntax-checked and (for hard custom constraints) AST-checked before execution.
- Execution happens with no network, limited filesystem, dropped capabilities, and resource limits.
- Even if the generated code tries to read host files, open sockets, or fork bombs, the sandbox prevents it.
- The host never trusts the solver status or schedule; the Validation stage always re-checks.

This is the concrete implementation of the project's core rule: "No code written by an LLM is ever executed with the privileges of the user who launched the app."

## Testing and diagnostics

- `python/tests/test_executor_status.py` and `test_sandbox_dispatch.py` exercise the executor and sandbox paths.
- Concurrency and timeout behavior are tested by `scripts/test_python_execute_concurrency.ts`.
- Provider smoke and dataset API tests in CI exercise the full path through the web fallback route.
- When things go wrong, the `errorDigest` (last 12 non-empty lines of stderr, truncated to 800 chars) plus the truncated stdout are the primary diagnostic signals returned to the agent and the UI.

## Related pages

- [AI Pipeline](../ai-pipeline/index.md) — how the agent calls this system
- [Validation System](validation.md) — the checkers that run after execution succeeds
- [Sandbox README](../../sandbox/README.md) — detailed hardening flags and production recommendations
- [Architecture](../../overview/architecture.md) — the five-layer view showing this as Layer 3 + Layer 4

## Where to start if you need to change execution behavior

1. Run `gitnexus_impact` on `python/code_executor.py` and the sandbox wrappers (very high blast radius).
2. Changes to the `ExecutionResult` shape must be mirrored in:
   - `src/features/timetable/ai/types.ts`
   - `python-bridge.ts`
   - The Electron IPC handler
   - The web route
   - All test harnesses that parse the result
3. Sandbox hardening changes should be reviewed as security modifications.
4. Any change that relaxes the "always sandbox" rule must update the documentation in `sandbox/README.md` and the safety comments in the agent.
