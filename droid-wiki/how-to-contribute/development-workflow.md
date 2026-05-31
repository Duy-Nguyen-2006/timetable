# Development Workflow

Active contributors: Duy

This page describes the end-to-end development cycle for contributors (human or agent) in the Tack Timetable repository: branching, coding, mandatory pre-commit validation, prompt changes as first-class behavioral edits, pull request, and merge. All work is governed by the Harness operating model (`docs/HARNESS.md`, `docs/FEATURE_INTAKE.md`) and the GitNexus impact-analysis rule (`AGENTS.md`).

## Overview

Every task follows the Harness task loop:

1. Classify via `docs/FEATURE_INTAKE.md` (tiny / normal / high-risk lane).
2. Record intake with `scripts/bin/harness-cli intake`.
3. Work inside the chosen lane only.
4. Run all mandatory local checks before any commit/PR.
5. Record a trace (`scripts/bin/harness-cli trace`) and any friction as backlog.
6. Open a PR; CI must pass; human review for high-risk or architecture changes.
7. Merge to `master` (the default branch). CI runs on every push and PR.

Prompts in `prompts/` are executable behavior, not documentation. Changing them requires the same validation as code changes.

Cross-references:
- [Patterns and conventions](patterns-and-conventions.md) — coding style, GitNexus rules, security invariants.
- [Testing](testing.md) — detailed test commands, matrix expectations, and coverage rules (to be expanded).

## Branching

- Default branch: `master`.
- Create short-lived feature branches from `master` for all changes: `feat/xxx`, `fix/xxx`, `docs/xxx`, `chore/xxx`.
- Never push directly to `master`.
- Rebase or merge `master` into your branch before opening a PR to keep history clean.
- Delete the branch after merge (CI and PR hygiene).

## Coding

1. Read the required entry points before any edit:
   - `README.md`
   - `AGENTS.md` (GitNexus impact analysis is mandatory)
   - `docs/HARNESS.md`
   - `docs/FEATURE_INTAKE.md`
   - `docs/ARCHITECTURE.md`
   - `docs/CONTEXT_RULES.md`

2. Before modifying any symbol, run:
   ```bash
   # Use the GitNexus MCP tools (see .claude/skills/gitnexus/)
   gitnexus_impact({ target: "symbolName", direction: "upstream" })
   ```
   Report the blast radius. Use `gitnexus_rename` for renames. Run `gitnexus_detect_changes()` before every commit.

3. Work only inside the lane chosen during intake. High-risk changes require human confirmation before implementation.

4. Keep changes minimal and vertical. Update stories, test matrix rows, and relevant docs as part of the same PR.

## Mandatory pre-commit checks

Run these **before every commit** and before opening a PR. CI enforces them.

```bash
npm run lint
npm run test:prompt          # validates that prompts/*.md still produce valid structured JSON
npm test                     # tsx --test "src/**/*.test.ts"
npm run build                # runs sync hooks + Next.js build
```

Additional recommended local checks (approximate full CI):

```bash
./.venv/bin/pytest python/tests
# Provider smoke (optional, needs LOWPRIZO_API_KEY or will skip):
npm run provider:smoke
```

If any check fails, fix before committing. The final PR description must state what was changed, what was not attempted, and any harness friction discovered.

## Prompt changes are first-class behavioral changes

The four files under `prompts/` (`translator.system.md`, `planner.system.md`, `coder.system.md`, `repair.system.md`) define the AI agent's reasoning strategy. They are the source of truth for behavior.

- Before every `dev`, `build`, `test`, and `pretest`, the project runs `npm run sync:prompts` (and `npm run presync:skeleton`) via package.json lifecycle hooks. These copy prompts into `public/prompts/` and the solver skeleton into `public/templates/`.
- Editing a prompt is equivalent to changing executable code. Always run:
  ```bash
  npm run test:prompt
  ```
  after editing. This script validates that the prompts still emit the expected JSON contracts for the current model set.
- Prompt edits must be accompanied by corresponding updates to TypeScript types (`ConstraintSpec`, `Plan`, etc.), deterministic checkers when the output contract changes, and relevant tests.
- Never hard-code model-specific tricks in TypeScript; put reasoning guidance in the prompts.

See [Patterns and conventions — Prompt-driven behavior](patterns-and-conventions.md#prompt-driven-behavior-prompts-are-source-of-truth) for the full rationale.

## Running the full agent loop locally

1. Install and set up Python environment (see [Getting started](../overview/getting-started.md)):
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -U pip pytest ortools
   ```

2. Start the dev server (this runs the sync hooks automatically):
   ```bash
   npm run dev
   ```

3. Open the app (usually http://localhost:3000). Click "+ Bắt đầu nhập dữ liệu".

4. In the Settings modal (gear icon), configure your LLM provider:
   - Base URL (default: `https://openrouter.ai/api/v1`)
   - API key (never committed)
   - Optional per-stage model overrides (Translator / Planner / Coder / Repair)
   - Solver profile (`fast` / `balanced` / `deep`)

5. Use the **Provider test** button to verify connectivity.

6. Enter a small dataset (or use quick-import), add at least one natural-language constraint, and click the AI solve button.

7. Watch the live 6-stage progress (Translator → Planner → Coder → Running → Checking → Fixing). All execution goes through the sandbox (`code_executor.py` via Docker or bubblewrap). The agent will never run generated code directly on the host.

8. On success you will see the validated timetable, soft violations (if any), and diagnostics. Export to Excel from the result view.

For sandbox setup (Docker recommended), see the [Getting started](../overview/getting-started.md#Sandbox-setup-critical-for-security) section and `sandbox/README.md`.

Environment variables for local runs:
- `TT_SANDBOX_MODE` (`docker` | `bwrap` | `none` — the last only with `TT_SANDBOX_ALLOW_UNSAFE=1`)
- `EXECUTOR_TIMEOUT_SECONDS`

Never commit real secrets. Keys belong in the UI Settings (localStorage) or CI secrets only.

## Pull request and merge cycle

1. Ensure your branch is up-to-date with `master` and all mandatory checks pass locally.
2. Open a PR against `master`. CI runs automatically on push and on PR:
   - `npm run lint`
   - `npm run test:prompt`
   - `npx tsx --test "src/**/*.test.ts"`
   - `npm run build`
   - Provider smoke (skipped unless `LOWPRIZO_API_KEY` present)
   - `pytest python/tests`
   - Dataset API tests (when key present)
3. For high-risk or architecture changes, the PR description must reference the intake classification and any human confirmation obtained.
4. Address review feedback. Re-run the full local check suite after each significant change.
5. Once CI is green and reviews are approved, merge (squash or rebase as project preference). Delete the feature branch.

## Definition of done (minimum for this workflow)

A task is complete only when:

- The requested change works and is covered by appropriate tests/validation.
- All mandatory pre-commit commands (`lint`, `test`, `test:prompt`) pass.
- Relevant docs, stories, and test matrix entries are updated.
- GitNexus impact analysis and `gitnexus_detect_changes()` were performed where required.
- A trace was recorded with `scripts/bin/harness-cli trace`.
- Any harness friction was recorded via `scripts/bin/harness-cli backlog add`.
- The final response (or PR description) clearly states what changed and what was intentionally left unchanged.

See [How to contribute — index](index.md) for the broader definition of done and the [Patterns and conventions](patterns-and-conventions.md) page for the detailed coding and safety rules that accompany this workflow.

## Key source files

All paths are repository-root relative.

| Repository-root path          | Role |
|-------------------------------|------|
| `package.json`                | Scripts: `dev`, `build`, `test`, `test:prompt`, `lint`, `sync:prompts`, `presync:skeleton`, lifecycle hooks |
| `.github/workflows/ci.yml`    | CI job that enforces lint + prompt validation + TypeScript tests + build + Python tests + optional provider smoke |
| `AGENTS.md`                   | GitNexus impact-analysis mandate, Harness entry points, prompt validation rule |
| `docs/HARNESS.md`             | Full task loop, lanes, trace requirements, harness change policy, done definition |
| `docs/FEATURE_INTAKE.md`      | Input types, risk checklist, lane selection (tiny/normal/high-risk) |
| `scripts/sync_prompts.mjs`    | Build-time copy of `prompts/*.md` → `public/prompts/` |
| `scripts/sync_solver_template.mjs` | Build-time copy of solver skeleton |
| `scripts/validate_coder_prompt_models.ts` | Prompt contract validator (run via `npm run test:prompt`) |
| `scripts/bin/harness-cli`     | Rust CLI for intake, story, trace, backlog, matrix queries (primary harness tool) |
| `src/features/timetable/ai/local-agent.ts` | Orchestrator; the "full agent loop" entry point invoked from the UI |
| `prompts/translator.system.md` | One of the four executable prompt sources of truth (treated as code) |
| `prompts/planner.system.md`   | Planner prompt (executable behavior) |
| `prompts/coder.system.md`     | Coder prompt (executable behavior) |
| `prompts/repair.system.md`    | Repair prompt (executable behavior) |

## Related pages

- [How to contribute — index](index.md) — high-level contribution guide and definition of done
- [Patterns and conventions](patterns-and-conventions.md) — mandatory GitNexus impact analysis, security invariants, prompt-driven behavior, commit hygiene
- [Testing](testing.md) — detailed commands, matrix, and expectations (cross-link target)
- [Getting started](../overview/getting-started.md) — local setup, sandbox configuration, first agent run
- [AI Pipeline](../systems/ai-pipeline/index.md) — the 6-stage Local Agent in depth
- [Architecture](../overview/architecture.md) — layered security and execution model

## Notes

- This workflow page intentionally stays at the process level. Implementation details for the agent stages, constraint system, and Python execution live in the sibling wiki sections.
- The project has no traditional feature flags; behavioral toggles are exposed at runtime through the Settings UI or environment variables (`TT_SANDBOX_MODE`).
- Always treat prompt edits as behavioral changes with the same rigor as TypeScript or Python logic changes.
