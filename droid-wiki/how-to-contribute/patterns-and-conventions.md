# Patterns and conventions

Active contributors: Duy

This page documents the cross-cutting coding patterns, architectural rules, and team conventions that govern work in the Tack Timetable repository. Many of these rules exist to keep the AI agent pipeline safe, observable, and maintainable.

## Mandatory impact analysis before every edit

**Rule (enforced in `AGENTS.md` and `CLAUDE.md`):**

> Before modifying any function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` (or equivalent `gitnexus_context`) and report the blast radius (direct callers, affected processes, risk level) to the user.

**Additional requirements:**

- `gitnexus_detect_changes()` must be run before every commit to verify that only expected symbols and execution flows were touched.
- If impact analysis returns HIGH or CRITICAL risk, the user must be warned before proceeding.
- Renames must use `gitnexus_rename` — never blind find-and-replace.
- When exploring unfamiliar code, prefer `gitnexus_query({query: "concept"})` over raw grepping; it returns process-grouped results ranked by relevance.

**Why this rule exists**

The codebase is heavily interconnected (2482 symbols, 3493 relationships, 69 execution flows at last GitNexus index). A seemingly small change in the validator or translator can affect the entire agent loop, the UI progress display, the repair strategy, and downstream Python checkers. The impact tool makes the call graph explicit.

**Resources**

- `gitnexus://repo/timetable/context` — codebase overview
- `gitnexus://repo/timetable/processes` — all execution flows
- `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` — how to run and interpret impact analysis

## Bounded, observable agent loops

The Local Agent (`runLocalAgent` in `src/features/timetable/ai/local-agent.ts`) is deliberately constrained:

| Limit                        | Value | Rationale |
|-----------------------------|-------|-----------|
| `MAX_CODER_RETRIES`         | 3     | Prevent infinite repair loops |
| `MAX_RUNTIME_REPAIR_ROUNDS` | 1     | One chance to fix compile/runtime errors |
| `MAX_VIOLATION_REPAIR_ROUNDS`| 2    | Two chances to fix hard constraint violations |
| `MAX_TOTAL_TOOL_CALLS`      | 15    | Hard global cap on LLM invocations |
| `TOKEN_CAP_PER_RUN`         | 80 k  | Protect against runaway token usage |

Every stage emits typed events (`stage_started`, `stage_completed`, `violations_found`, `execution_result`, etc.) via the `onEvent` callback. The UI renders these as a live progress list. The orchestrator also maintains a `StageCache` (10-minute TTL) to avoid repeating identical LLM calls inside one run.

**Pattern:** when adding a new stage or changing retry policy, update both the constants and the event emission sites so the UI and tests remain consistent.

## Security-first execution (non-negotiable)

**Core invariant:**

> LLM-generated Python is **never** executed directly on the host machine.

Enforcement points:

1. `python-bridge.ts` — refuses to run code locally; always routes through IPC (Electron) or the server route `/api/ai/python-execute`.
2. `python/code_executor.py` — always calls `sandbox.run.run_sandboxed(...)`.
3. `sandbox/run.py` — dispatches to Docker, bubblewrap, or (only with explicit unsafe flag) raw subprocess.

**Sandbox modes** (controlled by `TT_SANDBOX_MODE` or auto-detect):

- `docker` — strongest isolation (network none, read-only root, limited CPU/RAM, non-root user).
- `bwrap` — lightweight Linux namespace + seccomp sandbox (fast startup).
- `none` — raw execution; gated behind `TT_SANDBOX_ALLOW_UNSAFE=1` and intended only for local development.

See `sandbox/README.md` and the [Python Execution System](../systems/python-execution.md) page for details.

When modifying execution paths, always preserve the invariant that untrusted code goes through the dispatcher.

## Prompt-driven behavior (prompts are source of truth)

The four files in `prompts/` define the AI's reasoning strategy:

- `translator.system.md`
- `planner.system.md`
- `coder.system.md`
- `repair.system.md`

These are **not** documentation — they are executable behavior. Before every `dev`, `build`, `test`, and `pretest`, the project runs `npm run sync:prompts` to copy them into `public/prompts/`. The server-side LLM proxy reads from the public copy.

**Conventions:**

- Changing a prompt is a first-class behavioral change. Run `npm run test:prompt` (which validates that the prompts still produce valid structured JSON for the current model set).
- Prompt changes should be accompanied by updates to the corresponding TypeScript types (`ConstraintSpec`, `Plan`, etc.) and deterministic checkers when the output contract changes.
- Never hard-code model-specific reasoning tricks in TypeScript; put them in the prompt so they can be iterated without code changes.

## Pragmatic TypeScript at the language boundary

The ESLint configuration (`eslint.config.mjs`) intentionally disables a long list of strict rules:

- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/no-unused-vars`
- `no-console`, `no-debugger`, `no-empty`, etc.

**Rationale:** the codebase frequently crosses the TypeScript ↔ Python JSON boundary. Objects returned from `code_executor.py` (or from LLM JSON parsing) are structurally dynamic. The guideline is:

> Avoid `any` and loose typing everywhere **except** at the Python bridge and immediate deserialization sites.

When adding new interop code, keep the loose typing localized (ideally in `python-bridge.ts`, `parse-model-json.ts`, or the immediate callers) and restore strict typing as soon as the data has been validated against a known schema.

## Deterministic validation after every solver run

The agent **never** trusts solver output on faith.

After every execution the orchestrator runs:

1. TypeScript-side `validateSchedule` (hard + soft constraint checkers mirrored from Python).
2. CP-SAT round-trip check (`cp-sat-roundtrip.ts`): re-encode the produced schedule as a forced solution and ask the solver whether it is still feasible.
3. Python-side checkers in `validator_engine.py` for all 46 `ConstraintKind` values.

Only when `hardConstraintPass && roundTripOk` (or after repair budget is exhausted) does the agent surface a result to the UI.

**Pattern:** when adding a new constraint kind, implement the checker in both `python/validator_engine.py` **and** `src/features/timetable/ai/deterministic-validator.ts` (or the shared registry) so the two sides stay in sync.

## No feature flags — runtime UI configuration instead

The project does not use traditional feature flags or config files for behavioral toggles.

- Provider selection, per-stage models, and solver profile (`fast` / `balanced` / `deep`) are chosen by the user at runtime in `SettingsModal.tsx`.
- Timeouts and worker counts are derived from the chosen solver profile plus explicit overrides in the config object.
- Sandbox mode is controlled by the `TT_SANDBOX_MODE` environment variable (with safe auto-detect defaults).

When adding a new behavioral option, prefer exposing it through the Settings UI (with sensible defaults) rather than a new environment variable or feature flag.

## Harness operating rules (AGENTS.md + docs/)

Before any implementation work:

1. Classify the request using `docs/FEATURE_INTAKE.md` (tiny / normal / high-risk).
2. Record the classification with `scripts/bin/harness-cli intake`.
3. Read the relevant product docs, stories, and decisions.
4. Check proof status with `scripts/bin/harness-cli query matrix`.
5. Work only inside the selected lane.
6. Before finishing, ask whether product truth, validation expectations, or harness friction changed.
7. Record a trace with `scripts/bin/harness-cli trace` (following `docs/TRACE_SPEC.md` tier requirements).
8. Run `scripts/bin/harness-cli score-trace` when available.
9. Record any harness friction with `scripts/bin/harness-cli backlog add`.

The durable layer (SQLite + Rust CLI) is the source of truth for operational state. Markdown docs describe policy; the database stores what actually happened.

## Testing split and expectations

- TypeScript: Node built-in test runner via `tsx --test "src/**/*.test.ts"`.
- Python: pytest in `python/tests/`.
- Prompt behavior: `npm run test:prompt` (validates JSON contract for the four prompts).
- Provider smoke (optional): `npm run provider:smoke` (requires key in CI).
- Dataset API tests: exercised in CI when `LOWPRIZO_API_KEY` is present.

When adding a new constraint kind or agent stage, add both unit tests (for the pure logic) and an integration test that exercises the full `runLocalAgent` path with a minimal payload.

## Commit and PR hygiene

- Never commit real secrets (`.env*` files are ignored).
- Run `npm run lint`, `npm test`, and `npm run test:prompt` before opening a PR.
- Use the GitNexus tools to confirm scope before and after changes.
- PR description should state what changed, what was not attempted, and any harness friction discovered.

These patterns exist to keep the AI pipeline trustworthy, the harness observable, and the contributor workflow safe even when the underlying code is complex and highly interconnected.
