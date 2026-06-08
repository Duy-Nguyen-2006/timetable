# Architecture

## Stack

| Surface | Technology |
|---------|-----------|
| Desktop shell | Electron (main process in `electron/main.mjs`) |
| Web framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4, Radix UI primitives |
| State | Zustand (client), React Query (server/cache) |
| Validation | Zod 4 |
| AI pipeline | Local agent loop (translator → planner → coder → repair) calling LLM providers via `/api/ai/chat` |
| Solver | Python 3 + OR-Tools CP-SAT, executed via child process or Docker |
| Packaging | electron-builder (AppImage/deb/dmg/nsis) |

## Actual Structure

```text
src/
  app/
    api/ai/            # Next.js API routes (chat, parse-constraints, solve, python-execute)
    globals.css
    layout.tsx
    page.tsx

  features/timetable/
    ai/                # Agent pipeline: translator, planner, coder, repair, deterministic-validator
    constraints/       # Constraint UI components, form schema, review panel
    components/        # Shared timetable UI (fields, setup pages, preview)
    TimetableApp.tsx   # Main application shell
    types.ts           # Domain types
    constants.ts       # Business constants

  components/ui/       # Generic UI primitives (shadcn-style)
  hooks/               # Shared React hooks
  lib/                 # Provider resolution, constraint parser, utilities
  types/               # Global type declarations (Electron bridge)

electron/
  main.mjs             # Electron main process (IPC, solver runtime, secure store)
  preload.cjs          # Context bridge (exposes window.electron)
  solver-runtime.mjs   # Solver process management

python/
  code_executor.py     # Solver entry point (OR-Tools CP-SAT)
  ir_eval.py           # Constraint IR evaluation engine
  ir_schema.py         # Constraint IR schema + validation
  validator_engine.py  # Schedule validation engine

scripts/               # Build, test, and CI tooling
```

## Layering

The codebase uses feature-based layering rather than classical DDD layers:

```text
src/lib/                 # Shared utilities, provider resolution, constraint parser
src/features/timetable/
  ai/                    # Core domain logic (agent pipeline, validation, translation)
  constraints/           # Application layer (UI, form schema, workspace storage)
  components/            # Presentation layer
src/app/api/             # Interface layer (HTTP routes, input validation)
electron/                # Infrastructure layer (IPC, process management)
python/                  # External solver (separate process, communicates via JSON)
```

## Dependency Rule

- `src/lib/` must not import from `src/features/` or `src/app/`.
- `src/features/timetable/ai/` may import from `src/lib/` but not from `src/app/` or `electron/`.
- `src/features/timetable/constraints/` may import from `ai/` and `lib/`.
- `src/app/api/` may import from `features/` and `lib/` (route handlers delegate to domain).
- `electron/` communicates with the web layer only via IPC (preload bridge).
- `python/` is a standalone process; it receives JSON input and returns JSON output.

## Parse-First Boundary Rule

Unknown data must be parsed at boundaries before it enters inner code.

Boundaries in this project:

- Next.js API route handlers validate request bodies with manual checks before passing to domain.
- The `constraint-parser.ts` module parses raw Vietnamese text into typed constraint objects.
- The `translator.ts` module parses LLM JSON output into `ConstraintSpec[]` via Zod schemas.
- The Python executor receives JSON input and validates it against `ir_schema.py`.

Target flow:

```text
raw user input
  -> constraint-parser (Vietnamese text → structured constraints)
  -> translator (LLM → ConstraintSpec[])
  -> planner (LLM → Plan)
  -> coder (LLM → Python code)
  -> python-bridge (code → ExecutionResult)
  -> deterministic-validator (schedule → validation report)
```

## Observability

This is a desktop app running on user machines. There is no server-side logging infrastructure.

Agent lifecycle events are emitted via the `onEvent` callback and displayed in the UI timeline.
Execution diagnostics (solver status, violations, errors) are captured in `LocalAgentFinalResult`
and shown in the diagnostics panel and Excel export.
