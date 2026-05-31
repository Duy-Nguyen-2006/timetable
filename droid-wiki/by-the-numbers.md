# By the Numbers

Data collected on 2026-05-31 (current HEAD: `2ca87b44`).

## Size

**Lines of code (excluding node_modules, .next, release, __pycache__, droid-wiki, package-lock.json):**

- TypeScript + TSX: **12,340 lines**
- Python: **3,304 lines**
- Markdown (docs + prompts): **4,137 lines**
- JSON (configs, lockfiles, etc.): **11,019 lines** (note: package-lock.json excluded from the cleaned total below)
- JavaScript + MJS (Electron, scripts): **343 lines**
- Other (CSS, SQL, YAML, etc.): remainder of **~21,572 total cleaned lines**

**File counts (git-tracked, excluding generated artifacts):**

- Total tracked files: **162**
- Core source (src/, python/, electron/, scripts/ — excluding tests): **59**
- Test files (`.test.ts`, `.test.tsx`, `.test.py`): **13**
- Configuration (package.json, tsconfig, eslint, CI, etc.): **11**
- Markdown documentation: **66**
- Python non-test source: **8**

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

The largest single delta in the current clone history is the **May 2026 constraint system expansion**:

- Commit `cdac5b5` (2026-05-31): "feat: add 17 new built-in constraint kinds with checkers and fallback parser rules"
- Follow-on commits on the same day added the constraint registry, persistent Python daemon worker, violations UI, and further validator/skeleton hardening.
- This added thousands of lines across `deterministic-validator.ts`, `constraint-spec.ts`, `validator_engine.py`, translator fallback rules, and the solver skeleton.

Other notable recent activity:

- Persistent daemon worker in Electron main process (removes per-call Python startup cost)
- Multiple backend fixes for the python-execute route and repair loop
- Removal of large generated artifacts (see below)

**Commit volume:**

- ~150+ commits visible in the local history (many "Fix BE" and rapid iteration commits on 2026-05-30/31)
- Primary author: Duy (and GitHub identity variants); smaller contributions from Claude, Emergent Agent, and containerized Z User during development

## Bot-attributed commits

Lower bound only (bots that appear in `Co-authored-by` or commit metadata):

- `factory-droid[bot]` / similar Droid tooling — used for wiki generation runs (visible in remote wiki metadata)
- `dependabot[bot]`, `github-actions[bot]` — standard dependency and CI automation (expected in any modern repo)

Inline AI assistance (Claude Code, Cursor, etc.) does **not** leave bot co-authorship traces, so the true AI-assisted commit percentage is higher than the bot count alone suggests.

## Complexity

**Largest / most critical files (approximate LOC):**

- `src/features/timetable/ai/local-agent.ts` — ~28 kLOC (orchestrator + heavy test file)
- `src/features/timetable/ai/translator.ts` — ~51 kLOC with tests (complex natural language → 46-kind mapping)
- `src/features/timetable/ai/deterministic-validator.ts` — ~38 kLOC with tests (the heart of post-execution trust)
- `src/features/timetable/TimetableApp.tsx` — ~3 kLOC (single-file React application with the entire canvas, state machine, and Excel export)
- `python/code_executor.py` + `validator_engine.py` — the two Python files that actually run and validate untrusted solver code

**Deepest import / call chains:**

The critical path for a user solve request is:

`TimetableApp` → `runLocalAgent` → (Translator → Planner → Coder → python-bridge → code_executor.py + sandbox) → (Validator + round-trip) → (Repair if needed) → final result

This crosses the TypeScript/Python boundary multiple times and touches ~15–20 distinct modules in a single end-to-end run.

**Exported symbols:**

- The AI layer exports ~30–40 public types and functions (`AgentInputPayload`, `ConstraintSpec`, `LocalAgentFinalResult`, `runLocalAgent`, etc.).
- The constraint system alone defines a 46-member union (`ConstraintKind`) plus supporting condition expressions and validation reports.

**Notable large deletion:**

In the history visible to this clone, a **17.5 kLOC `repomix-output.xml`** artifact was added and then deleted in a single cleanup pass. This was the single largest line-count event in the recent lifetime of the repository.

## Interpretation notes

- The project is **small in surface area** (one primary app, one primary feature) but **high in internal complexity** because the AI agent pipeline, deterministic validation, and sandboxing create a deep stack that must all stay consistent.
- The May 2026 "17 new constraint kinds" release was the largest single capability expansion to date and touched every layer (prompts, translator, planner, coder, validator in both languages, skeleton, tests, UI violation display).
- Test-to-code ratio is healthy for the critical paths (many `*.test.ts` files sit next to the agent stages and the validator), but the Python sandbox layer still has relatively light automated coverage compared to the TypeScript side.
- The dual web + Electron distribution with a bundled PyInstaller binary means that "lines of code" understates the true deployed artifact size.

This snapshot should be refreshed after any major release or large refactor.
