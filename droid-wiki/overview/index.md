# Tack Timetable

Active contributors: Duy

## Purpose

Tack Timetable is an AI-assisted timetable (scheduling) generator for Vietnamese schools. Users enter teacher–subject–class assignments and natural-language constraints through an interactive canvas. A 6-stage local AI agent (Translator → Planner → Coder → Sandbox execution → Validator → Repair) turns the input into safe, executable Python solver code. The code runs inside an isolated sandbox (Docker preferred, bubblewrap fallback) using OR-Tools CP-SAT. Deterministic validation and a bounded repair loop guarantee that hard constraints are satisfied before any schedule is returned to the UI for review and Excel export.

The product ships as both a web app (Next.js 16 + React 19 standalone) and a desktop Electron app that bundles a PyInstaller Python runner. The AI never executes LLM-generated code directly on the host machine.

## Directory layout

```
.
├── src/
│   ├── app/                    # Next.js App Router shell
│   │   ├── page.tsx            # Landing + quick-import entry
│   │   ├── layout.tsx
│   │   └── api/ai/*            # LLM proxy, python-execute, checks
│   └── features/timetable/     # All product logic lives here
│       ├── TimetableApp.tsx    # Main interactive canvas (~3 kLOC)
│       ├── SettingsModal.tsx
│       ├── quick-import.ts
│       └── ai/                 # The 6-stage Local Agent
│           ├── local-agent.ts  # Orchestrator (runLocalAgent)
│           ├── translator.ts, planner.ts, coder.ts, repair.ts
│           ├── deterministic-validator.ts
│           ├── python-bridge.ts
│           └── ...
├── prompts/                    # Source of truth for AI behavior (4 .md files)
├── public/prompts/             # Build-time copy (synced by scripts)
├── python/
│   ├── code_executor.py        # Secure host for generated solver code
│   ├── validator_engine.py     # 46 constraint checkers
│   └── templates/solver_skeleton.py
├── sandbox/                    # Docker + bubblewrap isolation
├── electron/                   # Desktop main process + preload
├── scripts/                    # Prompt sync, skeleton sync, smoke tests
└── .github/workflows/ci.yml
```

## Key abstractions

| Type / Concept                  | Location                                              | One-line description |
|--------------------------------|-------------------------------------------------------|----------------------|
| `AgentInputPayload`            | `src/features/timetable/ai/types.ts`                  | Normalized days, sessions, assignments, and raw constraints coming from the UI. |
| `ConstraintSpec` + `ConstraintKind` | `src/features/timetable/ai/constraint-spec.ts`     | 46 structured constraint kinds (hard/soft/info) with parameters; the central domain model. |
| `Plan`                         | `src/features/timetable/ai/types.ts`                  | Planner output: decision variables, objective, template selection, risks. |
| `LocalAgentFinalResult`        | `src/features/timetable/ai/types.ts`                  | Validated schedule + deterministic report + violation details returned to UI. |
| `ExecutionResult`              | `src/features/timetable/ai/types.ts`                  | Structured result from the Python sandbox (status, schedule, stdout/stderr). |
| `DeterministicValidationReport`| `src/features/timetable/ai/constraint-spec.ts`        | Hard/soft pass/fail + per-constraint violations + coverage flags. |
| Solver skeleton                | `python/templates/solver_skeleton.py` + public copy   | Base CP-SAT model that the Coder stage completes. |

## How it works (high-level flow)

```mermaid
graph TD
    UI[TimetableApp.tsx] -->|AgentInputPayload| Agent[runLocalAgent]
    Agent -->|stage events| UI
    Agent --> Translator[Translator]
    Translator -->|ConstraintSpec[46]| Planner[Planner]
    Planner -->|Plan| Coder[Coder]
    Coder -->|Python code| Inject[Skeleton Injector + AST check]
    Inject -->|safe code| Bridge[python-bridge.ts]
    Bridge -->|HTTP/IPC| Sandbox["code_executor.py (Docker/bwrap)"]
    Sandbox -->|ExecutionResult| Validator[Deterministic Validator]
    Validator -->|Report + violations| Repair{Repair needed?}
    Repair -->|yes, bounded| Coder
    Repair -->|no| UI[Return LocalAgentFinalResult]
```

The orchestrator (`runLocalAgent` in `src/features/timetable/ai/local-agent.ts`) enforces hard caps: 3 coder retries, 1 runtime repair round, 2 violation repair rounds, 15 total tool calls, 80 k token budget per run. Every stage emits typed lifecycle events so the UI can show live progress.

Security model: LLM-generated Python is **never** executed on the host. It is always written to a temp directory inside `code_executor.py`, compiled, and run under strict sandboxing. The Electron desktop app bundles the compiled Python binary; the web version falls back to the `/api/ai/python-execute` route.

## Integration points

- **UI entry**: `src/app/page.tsx` → `src/features/timetable/TimetableApp.tsx` (the live scheduling canvas).
- **Agent orchestration**: `src/features/timetable/ai/local-agent.ts` calls the six stages and the Python bridge.
- **Prompts as source of truth**: `prompts/*.md` are synced to `public/prompts/` before every dev/build/test run.
- **Python host**: `python/code_executor.py` + `python/validator_engine.py` implement the execution contract and all 46 deterministic checkers.
- **Desktop bridge**: `electron/main.mjs` + `preload.ts` expose `window.electron.python.executeCode`.
- **Server fallbacks**: `src/app/api/ai/*` routes (chat proxy, python-execute, syntax/AST checks, solver skeleton).

## Entry points for modification

- New constraint kind → add to `ConstraintKind` union in `src/features/timetable/ai/constraint-spec.ts`, implement checker in `python/validator_engine.py`, update translator fallback rules and prompt.
- Change AI behavior → edit the corresponding file in `prompts/` (treated as a first-class behavioral change; run `npm run sync:prompts`).
- Improve sandbox isolation → modify `sandbox/executor.py` or `bubblewrap_executor.py`; update documentation in `sandbox/README.md`.
- Adjust UI canvas or quick-import format → work in `src/features/timetable/TimetableApp.tsx` + `quick-import.ts`.
- Add a new stage or change retry policy → edit `runLocalAgent` and the typed event system in `local-agent.ts`.

See the [Architecture](architecture.md) page for the full layered diagram and security rationale. Start the [Getting started](getting-started.md) guide to run the app locally. The [AI Pipeline](systems/ai-pipeline/index.md) section documents each of the six stages in depth. The [Constraint System](features/constraint-system.md) page lists all 46 kinds and their semantics.
