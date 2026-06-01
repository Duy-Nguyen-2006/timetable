# Tooling

Active contributors: Duy

This page documents the build, test, synchronization, and developer tooling used in the Tack Timetable project.

## Build system

The project is a Next.js 16 (App Router) + React 19 + TypeScript application that supports both web (standalone output) and desktop (Electron) distribution.

Key characteristics:

- **Standalone output**: `next.config.ts` enables `output: 'standalone'` so the production image contains only the minimal server and static assets.
- **Pre-build synchronization** (non-negotiable): before `dev`, `build`, `test`, and `start`, the following hooks run automatically:
  - `npm run sync:prompts`
  - `npm run presync:skeleton`
- **Full production build**: `npm run build` executes `next build` followed by `scripts/post-build.mjs`, which performs a lightweight sanity check for the presence of `.next/standalone/server.js` and the solver skeleton in `public/`.
- **Electron packaging**: configured in `package.json#build` and driven by `electron-builder` (v26).
  - Windows: `npm run package:win` (NSIS installer + portable)
  - Linux: `npm run dist:linux` (AppImage + deb)
- **Python executor bundling**: the secure runner (`python/code_executor.py`) is compiled to a single binary via PyInstaller in CI and placed into `python-dist/`. The binary plus the original `.py` source are shipped as extra resources inside the Electron app.

See the release workflow (`.github/workflows/release-windows.yml`) and the dedicated Windows CI pipeline (`.github/workflows/windows-ci.yml` + reusable `_reusable-windows-build.yml`) for the full Windows smoke + NSIS packaging flow (runs on every `master` push/PR and supports manual `workflow_dispatch`).

Cross-link: see [Development Workflow](development-workflow.md) for the day-to-day local development commands and pre-commit expectations.

## Prompt and skeleton synchronization scripts

Prompts (`prompts/*.md`) are **executable behavior**, not documentation. The public copies under `public/prompts/` and `public/templates/` are the runtime source of truth for the server-side LLM proxy and the Local Agent pipeline.

Scripts (all plain Node ESM, no external deps beyond Node stdlib):

- `scripts/sync_prompts.mjs`
  - Copies every `.md` file from `prompts/` into `public/prompts/`.
  - Invoked via `npm run sync:prompts` (and as a pre* hook for dev/build/test).
- `scripts/sync_solver_template.mjs`
  - Copies `python/templates/solver_skeleton.py` → `public/templates/solver_skeleton.py`.
  - Invoked via the `presync:skeleton` / `predev` / `prebuild` / `pretest` / `prestart` hooks.

These scripts are intentionally minimal and deterministic. Changing a prompt or the solver skeleton is a first-class behavioral change — run `npm run test:prompt` and the full agent loop after any edit.

## Provider smoke harness

- Command: `npm run provider:smoke`
- Implementation: `scripts/provider_smoke_test.ts`
- Purpose: minimal end-to-end connectivity and basic chat-completion smoke against an OpenAI-compatible provider (defaults to OpenRouter + deepseek/deepseek-v4-flash).
- Required environment: `OPENROUTER_API_KEY` (or equivalent base URL + key). The script exits non-zero on any failure and prints a compact JSON status report.
- Usage in CI: guarded by `SKIP_PROVIDER_SMOKE=1` or missing `LOWPRIZO_API_KEY` secret (see `.github/workflows/ci.yml` and `windows-ci.yml`).

This harness is intentionally tiny — it only verifies that the provider can be reached and returns a well-formed response. It is not a substitute for full agent integration tests.

## Windows + dataset smoke matrix (June 2026)

New dedicated smoke scripts live under `scripts/` and participate in the Windows CI pipeline (`.github/workflows/windows-ci.yml`):

- `scripts/smoke-datasets.ts` — parses every `DATASET` block in `datasets.txt` through `parseQuickImportText` and fails if any assignment/class list is empty. Fast sanity gate for quick-import format drift.
- `scripts/smoke-http.mjs` — exercises the live dev server (or packaged build) for provider connectivity and `/api/ai/python-execute`.
- `scripts/smoke-openrouter.mjs` — direct OpenRouter reachability + model list check (used for cross-org smoke before Windows packaging).

These are invoked automatically in the reusable Windows build job and can be triggered manually via `workflow_dispatch` with a custom `smoke_command`. They are developer/CI-only tools, not user-facing features. See [Getting started — Windows packaging](overview/getting-started.md#windows-nsis--portable) for the full flow.

## Prompt model validation

- Command: `npm run test:prompt`
- Implementation: `scripts/validate_coder_prompt_models.ts`
- Purpose: structural contract check on `prompts/coder.system.md`.
- Currently asserts the presence of three critical tokens that the Coder stage and deterministic validator depend on:
  - `custom_dsl`
  - `covered_constraint_ids`
  - `severity == "hard"`
- Failure is fatal in CI (`npm run test:prompt` runs on every push and PR).

When adding new structural expectations to the Coder prompt, extend the validator so the contract remains machine-enforceable.

## GitNexus code intelligence (mandatory before edits)

This repository is indexed by GitNexus (see `.gitnexus/`, `AGENTS.md`, `CLAUDE.md`).

**Rule (enforced):**

> Before modifying any function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` (or equivalent `gitnexus_context`) and report the blast radius. Run `gitnexus_detect_changes()` before every commit.

Key commands (all available via `npx`, no global install required):

- `npx gitnexus analyze [--force] [--embeddings]` — (re)build or refresh the knowledge graph.
- `npx gitnexus status` — report index freshness, symbol/relationship counts, and staleness warnings.
- `npx gitnexus wiki [--force] [--concurrency <n>] [--model <model>]` — generate the droid-wiki documentation set. The `--concurrency` flag controls parallel LLM calls during wiki generation (default 3).
- `npx gitnexus clean [--force]` — delete the local index (use before re-indexing a corrupted state).

In the Claude Code / Factory environment the GitNexus MCP tools and the skills under `.claude/skills/gitnexus/` provide `gitnexus_impact`, `gitnexus_context`, `gitnexus_detect_changes()`, `gitnexus_rename`, `gitnexus_query`, etc.

**Never** perform blind find-and-replace renames. Use `gitnexus_rename` so the call graph is updated consistently.

See:
- `AGENTS.md` and `CLAUDE.md` for the complete mandatory rules.
- `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` for how to interpret blast-radius output.
- `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` for the full CLI reference.

## Linting (relaxed by design)

The project uses ESLint 9 with the Next.js core-web-vitals + TypeScript presets (`eslint.config.mjs`).

A long list of strict rules is intentionally disabled:

- `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-non-null-assertion`, etc.
- `react-hooks/exhaustive-deps`, `react-hooks/purity`
- General JS rules: `no-console`, `no-debugger`, `no-empty`, `no-unused-vars`, `prefer-const`, etc.

**Rationale**: the codebase deliberately crosses the TypeScript ↔ Python JSON boundary at several points (`python-bridge.ts`, `parse-model-json.ts`, immediate deserialization sites after sandbox execution). Overly strict lint rules generate excessive noise exactly where structural `any` and dynamic shapes are required by the problem domain.

**Guideline** (from patterns-and-conventions.md):

> Avoid `any` and loose typing everywhere **except** at the Python bridge and immediate deserialization sites. Restore strict typing as soon as the data has been validated against a known schema.

Run lint locally with `npm run lint`. The CI job fails on any lint error.

## Testing commands

- TypeScript unit tests: `npm test` (or `npm run test:grep <substring>`) — uses Node's built-in test runner via `tsx`.
- Prompt contract validation: `npm run test:prompt`
- Provider smoke: `npm run provider:smoke`
- Python layer: `pytest python/tests` (ortools + pytest required in the venv)
- Full local CI approximation: `npm run lint && npm run test:prompt && npx tsx --test "src/**/*.test.ts" && npm run build && pytest python/tests`

## Concurrency harness notes

- The GitNexus wiki generator supports `--concurrency <n>` for parallel LLM calls during documentation generation.
- The scripts/README.md contains aspirational notes about future `validate:quick`, `test:integration`, etc., parallel harnesses; these do not yet exist as runnable commands.
- No dedicated "concurrency test" script for the agent loop currently exists. Bounded concurrency inside a single agent run is controlled by the orchestrator constants in `local-agent.ts` and the token budget guard.

## Related pages

- [Development Workflow](development-workflow.md) — branching, PR process, definition of done, pre-commit checklist.
- [Patterns and conventions](patterns-and-conventions.md) — deeper treatment of the GitNexus impact rule, prompt-driven behavior, and security invariants.
- [How to Contribute](../index.md) — high-level entry point and Harness workflow.

All tooling commands and scripts are expected to be stable. When adding a new script, wire it into `package.json` scripts and the relevant CI job so it participates in the "everything must pass" contract.
