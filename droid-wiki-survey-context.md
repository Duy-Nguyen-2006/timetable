# Wiki Generation — Survey Context Document
**Repository:** Tack Timetable (https://github.com/Duy-Nguyen-2006/timetable)  
**Generated for wiki run:** 2026-05-31  
**Mode:** FULL (delta = 19,530 lines changed since last wiki commit `82d45e84`)

---

## 1. Repo Summary (3–5 sentences)

Tack Timetable is an AI-assisted timetable (scheduling) generator that combines a modern Next.js 16 + React 19 + TypeScript frontend with a local AI agent pipeline and a Python/OR-Tools solver backend. The core workflow is: user enters assignments + natural-language constraints in the UI → browser-based 6-stage Local Agent (Translator → Planner → Coder → Sandbox execution → Validator → Repair) generates safe Python solver code → code runs in an isolated sandbox (Docker or bubblewrap) → deterministic validation + repair loop → results rendered as an interactive timetable with Excel export.

The project is packaged as both a web app (standalone Next.js) and a desktop Electron app (v37) that bundles a Python runner. It emphasizes safety (no raw execution of LLM-generated code on host), strict TypeScript, and a prompt-driven AI loop whose behavior is defined in `prompts/*.md`.

Since the previous wiki (commit 82d45e84), the most significant change is the addition of **17 new built-in constraint kinds** (now 46 total) with corresponding deterministic checkers and parser fallback rules, plus a major overhaul of the `deterministic-validator`, prompt syncing infrastructure, and removal of a 17k-line `repomix-output.xml` artifact.

---

## 2. Architecture Overview

**High-level layers:**

1. **Frontend / UI Layer**
   - Next.js App Router entry: `src/app/page.tsx` → `src/features/timetable/TimetableApp.tsx` (≈3k LOC, the main interactive scheduling canvas).
   - Supporting UI: `SettingsModal.tsx`, quick-import parser, export (Excel via `xlsx`), shadcn/ui components.
   - State is largely local (Zustand) with React Query for provider tests.

2. **AI Local Agent Pipeline** (`src/features/timetable/ai/`)
   - Orchestrator: `local-agent.ts` (`runLocalAgent`) — 6 explicit stages with bounded retries, token budgeting (`TokenBudgetGuard`), and violation-driven repair.
   - Stages:
     - `translator.ts` — natural language → structured `ConstraintSpec[]` (46 kinds).
     - `planner.ts` — produces a `Plan` (decision vars, objective, templates, risks).
     - `coder.ts` — emits Python code using a skeleton template (`solver_skeleton.py`).
     - `python-bridge.ts` + server route `/api/ai/python-execute` — executes code (IPC in Electron, HTTP fallback in web).
     - `deterministic-validator.ts` + `cp-sat-roundtrip.ts` — post-execution validation (hard violations, round-trip checks).
     - `repair.ts` — applies patches and re-invokes Coder/Validator.
   - Supporting: `skeleton-injector.ts` (AST/syntax checks + constraint injection), `input-compressor.ts`, `workspace.ts`, `budget-guard.ts`, `parse-model-json.ts`, `chat-client.ts`.
   - Prompts are the source of truth (`prompts/*.md`) and are synced to `public/prompts/` at build/dev time.

3. **Python Execution & Validation Layer**
   - `python/code_executor.py` — secure runner that writes generated code to a temp dir, compiles it, executes with timeout, returns structured `result.json`.
   - `python/validator_engine.py` — deterministic checker library for the 46 constraint kinds.
   - `python/templates/solver_skeleton.py` + public copy — base CP-SAT model that the Coder fills in.
   - Sandbox (`sandbox/`): Docker (recommended) and bubblewrap executors for untrusted code. `executor.py` and `bubblewrap_executor.py` provide the isolation harness.

4. **Electron Desktop Layer**
   - `electron/main.mjs` + `preload.ts` — exposes `window.electron.python.executeCode` for native execution of the bundled Python binary.
   - Build: `electron-builder` produces AppImage/deb (Linux) and NSIS/portable (Windows). Python runner is bundled via PyInstaller in CI.

5. **API Surface (Next.js routes)**
   - `/api/ai/chat` — server-side LLM proxy (supports OpenAI-compatible + Anthropic caching).
   - `/api/ai/python-execute` — web fallback for code execution.
   - `/api/ai/python-syntax-check`, `/api/ai/python-ast-check` — static checks used by the agent.
   - `/api/ai/solver-skeleton` — serves the current skeleton template.
   - `/api/provider/test` — connectivity test for LLM providers.

6. **Data & Domain Model**
   - Core types in `src/features/timetable/ai/types.ts` and `constraint-spec.ts`.
   - `AgentInputPayload` — normalized input (days, sessions, assignments, constraints).
   - `ConstraintSpec` / `ConstraintKind` (46 variants), `ConditionExpr`, `Plan`, `ScheduleEntry`, `Violation`, `DeterministicValidationReport`.
   - Quick-import text format for bulk assignment entry.

7. **Build, Test, CI**
   - Scripts: prompt sync (`sync_prompts.mjs`), skeleton sync, provider smoke tests, prompt model validation, concurrency harness.
   - CI (`.github/workflows/ci.yml`): lint, unit tests (tsx), prompt validation, build, provider smoke (optional), pytest for Python layer, dataset API tests.
   - Release: Windows build on tag (PyInstaller + electron-builder).
   - No feature flags; configuration is via UI (provider settings) and environment for secrets.

**External dependencies of note:**
- Frontend: Radix UI primitives, Tailwind 4, Zustand, React Query, xlsx, zod, uuid, OpenAI SDK (client + server proxy).
- Python runtime (bundled or dev): ortools, pytest.
- Optional: Docker / bubblewrap for sandboxing.

---

## 3. Discovered Topics (complete list for wiki coverage)

**Core subsystems (Tier 1 — deserve dedicated pages or sub-pages):**
- AI Pipeline (orchestrator + 6 stages) — the heart of the product.
- Constraint System (46 kinds + parser + deterministic validators).
- Python Execution & Sandbox.
- Timetable UI / Scheduling Wizard (the main canvas in TimetableApp).
- Solver Skeleton & Code Generation.
- Deterministic Validation & Repair Loop.
- Quick Import & Data Entry.
- Provider / LLM Integration (chat proxy, settings, smoke tests).

**Supporting / Tier 2:**
- Electron packaging and native bridge.
- Build / prompt sync infrastructure.
- Testing (TS + Python) and CI.
- Security model (sandboxing, no raw execution).

**Cross-cutting / primitives:**
- `AgentInputPayload`, `ConstraintSpec`, `Plan`, `ExecutionResult`, `LocalAgentFinalResult`.
- Token budgeting and workspace board abstractions.
- Prompt templates as first-class artifacts.

**Out of scope for deep coverage (thin or generated):**
- Individual shadcn/ui wrapper components (covered by "UI components" note).
- The 17k-line `repomix-output.xml` (deleted).
- Transient scripts in `scripts/bin/` (harness-cli binary).

---

## 4. Key Patterns & Conventions

- **Strict impact analysis rule** (enforced in AGENTS.md + CLAUDE.md): Every symbol edit must be preceded by `gitnexus_impact` or `gitnexus_context`. No blind find-and-replace; use `gitnexus_rename` for renames.
- **AI behavior is prompt-driven**: The four `.md` files in `prompts/` are the source of truth. They are synced to `public/prompts/` before dev/build/test. Changes to prompts are treated as first-class behavioral changes.
- **Bounded, observable agent loops**: `runLocalAgent` has hard caps (MAX_CODER_RETRIES=3, MAX_RUNTIME_REPAIR_ROUNDS=1, MAX_VIOLATION_REPAIR_ROUNDS=2, MAX_TOTAL_TOOL_CALLS=15, TOKEN_CAP_PER_RUN=80k). Every stage emits typed events via `config.onEvent`.
- **Security-first execution**: LLM-generated Python never runs on the host. Always goes through `code_executor.py` inside a sandbox (Docker preferred; bubblewrap fallback). `strict=True` is mandatory in production paths.
- **Deterministic validation after every execution**: The agent does not trust solver output. It always runs `validateSchedule` + CP-SAT round-trip + per-constraint checkers from `validator_engine.py`.
- **TypeScript strictness with pragmatic escapes**: Many `any` / loose rules are intentionally disabled in `eslint.config.mjs` because the code frequently crosses the TS ↔ Python JSON boundary. The guideline is "avoid `any` except at the Python bridge."
- **Testing split**: TS tests use Node's built-in test runner (`tsx --test`). Python tests use pytest. Prompt behavior is validated via `test:prompt` script.
- **No feature flags** in the traditional sense; provider selection and model choice are runtime UI configuration.

**Glossary seeds (terms that appear frequently and should be defined early):**
- Local Agent / 6-stage pipeline
- Translator, Planner, Coder, Repair
- ConstraintSpec / ConstraintKind (the 46 kinds)
- Solver skeleton
- Deterministic validator / round-trip check
- Sandbox (Docker vs bubblewrap)
- AgentInputPayload
- TokenBudgetGuard
- WorkspaceBoard
- Quick import text format

---

## 5. Directory-to-Purpose Map

| Directory / File                          | Purpose / Wiki Relevance |
|-------------------------------------------|----------------------------|
| `src/app/`                                | Next.js App Router entry (page, layout, globals). Thin shell. |
| `src/features/timetable/`                 | The entire product UI + AI logic lives here. Dominant source tree. |
| `src/features/timetable/ai/`              | The 6-stage local agent + all supporting machinery (most critical for wiki). |
| `src/features/timetable/TimetableApp.tsx` | Main interactive scheduling canvas (≈3k LOC). |
| `src/lib/constraint-parser.ts`            | (Note: appears to have been refactored into the AI layer; check current state.) |
| `prompts/` + `public/prompts/`            | Source of truth for AI behavior; build-time sync. |
| `python/`                                 | Execution host, validator engine, solver skeleton template. |
| `python/templates/solver_skeleton.py`     | The template the Coder completes. |
| `sandbox/`                                | Docker + bubblewrap isolation harness (critical security story). |
| `electron/`                               | Main process + preload for desktop Python execution. |
| `src/app/api/ai/*`                        | Server-side LLM proxy and Python execution fallback routes. |
| `scripts/`                                | Prompt sync, skeleton sync, provider smoke, prompt validation, benchmarks. |
| `.github/workflows/`                      | CI (lint+test+build+smoke) and Windows release. |
| `public/templates/`                       | Runtime copy of solver skeleton (synced). |

---

## 6. Coverage Cross-Check Notes

- All top-level source directories under `src/`, `python/`, `sandbox/`, `electron/`, `prompts/`, `scripts/`, and `.github/` were walked.
- The 46 constraint kinds and the deterministic validator overhaul are the largest new surface since the prior wiki — they require updated or new pages under `systems/` or `features/`.
- The prompt sync mechanism and the public/ copy are new enough to warrant explicit mention in "Tooling" or "Development Workflow".
- No traditional REST/GraphQL API surface beyond the handful of internal Next.js routes (so `api/` section will be small or folded into reference).
- Security story is strong and worth its own short page or section (sandbox model, threat model for LLM-generated code).
- No maintainers file or CODEOWNERS in the repo; `maintainers.md` will be derived purely from git blame (likely low contributor count).

---

## 7. Recommendations for Wiki Structure (high level)

- Keep the existing high-level shape (overview, by-the-numbers, lore, fun-facts, how-to-contribute, systems, features, reference, maintainers) because it already matches the repo's own mental model.
- Expand **systems/ai-pipeline/** with more sub-pages (or deeper coverage) for the new constraint kinds, deterministic-validator, and repair loop.
- Add or refresh a **security** or **sandbox** page under conditional sections.
- Refresh **by-the-numbers** and **lore** because of the large delta (17k line deletion + 17 new constraint kinds + prompt infrastructure).
- Consider a short **background/** or **design-decisions** page explaining why the 6-stage prompt-driven loop + sandbox was chosen over simpler "LLM writes Python and we exec it".

This survey context will be the shared input for all sub-agents during page generation.
