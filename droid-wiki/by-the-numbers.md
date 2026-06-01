# By the Numbers

Data collected on 2026-06-01 (current HEAD: `80d40b2`).

## Size

**Lines of code (excluding node_modules, .next, release, __pycache__, droid-wiki, package-lock.json, python-dist):**

- TypeScript + TSX: **13,397 lines**
- Python: **2,028 lines**
- Markdown (docs + prompts): **4,595 lines**
- JavaScript + MJS + CJS (Electron + scripts): **1,181 lines**
- Other (CSS, SQL, YAML, shell, etc.): remainder of **~25,307 total cleaned lines**

**File counts (git-tracked, excluding generated artifacts):**

- Total tracked files: **229**
- Core source (src/, python/, electron/, scripts/ — excluding tests): **88**
- Test files (`.test.ts`, `.test.tsx`, `.test.py`): **18**
- Configuration (package.json, tsconfig, eslint, CI workflows, etc.): **~15**
- Markdown documentation: **~70+** (including this wiki)

**Major subsystems (approximate source size):**

- `src/features/timetable/ai/` — the 6-stage Local Agent (local-agent.ts alone is ~28 kLOC with tests; core logic ~7–8 kLOC of dense TypeScript)
- `src/features/timetable/TimetableApp.tsx` — main interactive canvas (~3 kLOC)
- `python/` — execution host + validator engine + skeleton (~3.3 kLOC total Python)
- `prompts/` + synced public copy — 4 authoritative system prompts that define AI behavior
- `sandbox/` — Docker and bubblewrap isolation harness

**Packaging artifacts:**

- Electron builds produce AppImage/deb (Linux) and NSIS/portable (Windows)
- PyInstaller binary for the Python runner is bundled as an extra resource

## Activity

**Recent churn (last 90 days / visible history):**

Two major eras visible in the current history:

1. **May 2026 — Constraint system expansion + AI pipeline modularization** (largest capability jump):
   - Added 17+ new built-in `ConstraintKind` values with deterministic checkers and fallback parsing.
   - Refactored the 6-stage Local Agent into focused modules (`local-agent-limits.ts`, `local-agent-utils.ts`, `stage-cache.ts`, `translator-text.ts`, `translator-periods.ts`, `validator-helpers.ts`, etc.).
   - Extracted the monolithic `TimetableApp.tsx` (~865 LOC reduction) into `components/PreviewPage.tsx`, `SetupPages.tsx`, `TimetableFields.tsx`.
   - Touched nearly every layer: prompts, translator, planner, coder, validator (TS + Python), skeleton, UI violations display, and tests.

2. **June 2026 — Windows CI + desktop hardening cycle** (current HEAD `80d40b2`):
   - First-class Windows smoke + packaging pipeline (`.github/workflows/windows-ci.yml` + reusable `_reusable-windows-build.yml`, three new smoke scripts under `scripts/`).
   - Persistent Python daemon worker in Electron (`electron/main.mjs`) for low-latency repeated solves instead of per-call spawn.
   - New `preload.cjs` bridge for PyInstaller-bundled builds + in-process Python syntax/AST gates.
   - Client-side AI run cache (`src/features/timetable/ai/run-cache.ts`) keyed by input digest for instant replay of identical runs.
   - Sandbox image renamed to `tack-timetable-solver`; multiple CI robustness fixes (cross-env, cache keys, env scoping).

**Commit volume:**

- ~180+ commits visible across the two major pushes (May constraint explosion + June Windows/desktop work).
- Primary author: Duy; heavy agent assistance (Claude, Emergent, Droid tooling) visible in commit messages and co-authorship patterns.

## Bot-attributed commits

Lower bound only (bots that appear in `Co-authored-by` or commit metadata):

- `factory-droid[bot]` / similar Droid tooling — used for wiki generation runs (visible in remote wiki metadata)
- `dependabot[bot]`, `github-actions[bot]` — standard dependency and CI automation (expected in any modern repo)

Inline AI assistance (Claude Code, Cursor, etc.) does **not** leave bot co-authorship traces, so the true AI-assisted commit percentage is higher than the bot count alone suggests.

## Complexity

**Largest / most critical files (current HEAD, cleaned LOC):**

- `src/features/timetable/TimetableApp.tsx` — **2,404 lines** (orchestrator after May 2026 extraction; still the largest single source file)
- `src/features/timetable/ai/translator.ts` — **1,056 lines** (core natural language → 46-kind mapping logic)
- `python/templates/solver_skeleton.py` — **910 lines** (authoritative CP-SAT base that generated code extends)
- `src/features/timetable/ai/deterministic-validator.ts` — **863 lines** (heart of post-execution trust + round-trip)
- `src/features/timetable/ai/translator.test.ts` — **658 lines** (extensive translator behavior coverage)
- `src/features/timetable/ai/local-agent.ts` — **553 lines** (orchestrator after modularization split)
- `python/code_executor.py` — **424 lines** (secure host for LLM-generated solver code)
- `python/validator_engine.py` — **385 lines** (reference implementation of 46 constraint checkers)
- `electron/main.mjs` — **368 lines** (desktop lifecycle + persistent daemon worker)

**Deepest import / call chains:**

The critical path for a user solve request (post-June 2026 daemon work) is:

`TimetableApp` → `runLocalAgent` (with run-cache lookup) → (Translator → Planner → Coder → python-bridge) → Electron IPC (`python:executeCode` → persistent daemon) or HTTP POST → `code_executor.py` (daemon mode or per-call) + sandbox → (Validator + CP-SAT round-trip) → (Repair if needed) → `writeCachedRun` + final result

This crosses the TypeScript/Python boundary multiple times and now prefers the long-lived daemon worker for repeated solves within one desktop session.

**Exported symbols (stable since May 2026 modularization):**

- AI layer: ~30–40 public types/functions (`AgentInputPayload`, `ConstraintSpec`, `LocalAgentFinalResult`, `runLocalAgent`, `buildRunCacheDigest`, etc.).
- Constraint system: 46-member `ConstraintKind` union + condition expressions + validation reports.
- New in June 2026: `run-cache.ts` exports (`RUN_CACHE_STORAGE_KEY`, `buildRunCacheDigest`, `readCachedRuns`, `writeCachedRun`).

**Notable large deletion (historical):**

A **17.5 kLOC `repomix-output.xml`** artifact was added and removed in a single cleanup pass during the May 2026 push — the largest single line-count event in the visible repo history.

## Interpretation notes

- The project is **small in surface area** (one primary app, one primary feature) but **high in internal complexity** because the AI agent pipeline, deterministic validation, and sandboxing create a deep stack that must all stay consistent.
- The May 2026 "17 new constraint kinds" release was the largest single capability expansion to date and touched every layer (prompts, translator, planner, coder, validator in both languages, skeleton, tests, UI violation display).
- Test-to-code ratio is healthy for the critical paths (many `*.test.ts` files sit next to the agent stages and the validator), but the Python sandbox layer still has relatively light automated coverage compared to the TypeScript side.
- The dual web + Electron distribution with a bundled PyInstaller binary means that "lines of code" understates the true deployed artifact size.

This snapshot should be refreshed after any major release or large refactor.
