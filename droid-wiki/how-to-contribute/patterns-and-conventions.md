# Patterns and conventions

Active contributors: Duy

This page documents the cross-cutting coding patterns and project conventions that every contributor must follow. These rules exist because the system combines a prompt-driven AI agent with untrusted code generation and strict safety requirements.

## Mandatory impact analysis before every edit

**This is the single most important rule in the project.**

Before you modify any function, class, method, or symbol:

1. Run `gitnexus_impact({ target: "symbolName", direction: "upstream" })` (or the downstream variant if you are analyzing callers).
2. Review the blast radius: direct callers, affected execution flows, and the risk level returned by GitNexus.
3. Report the findings (especially if risk is HIGH or CRITICAL) before proceeding with the edit.

This rule is stated in `AGENTS.md`, `CLAUDE.md`, and the GitNexus sections embedded in both files. It is not optional.

**Never edit a symbol without first running impact analysis.**  
**Never ignore HIGH or CRITICAL risk warnings.**

For renames, extracts, splits, or refactors, use `gitnexus_rename`. Do not perform manual find-and-replace across the codebase.

Before committing, always run `gitnexus_detect_changes()` to verify that your changes only affect the symbols and flows you intended.

When exploring unfamiliar code, prefer `gitnexus_query({ query: "concept" })` over raw grepping. It returns results grouped by execution flow and ranked by relevance.

## Bounded agent loops with typed events

The Local Agent (`runLocalAgent` in `src/features/timetable/ai/local-agent.ts`) is deliberately bounded. Hard limits prevent runaway token usage, infinite repair loops, or excessive tool calls:

```ts
const MAX_CODER_RETRIES = 3;
const MAX_RUNTIME_REPAIR_ROUNDS = 1;
const MAX_VIOLATION_REPAIR_ROUNDS = 2;
const MAX_TOTAL_TOOL_CALLS = 15;
const TOKEN_CAP_PER_RUN = 80_000;
```

Every significant action inside the agent emits a typed event through the `onEvent` callback supplied in `LocalAgentConfig`. The event types are defined in `src/features/timetable/ai/types.ts` (`AgentEvent` union) and include:

- `status`, `phase`
- `stage_started`, `stage_completed`
- `violations_found`
- `execution_result`
- `final_result`
- `error`

The UI (primarily `TimetableApp.tsx`) consumes these events to render the live progress panel with phases such as `thinking`, `translator`, `planner`, `coding`, `running`, `checking`, `fixing`, and `idle`.

When adding new stages, retries, or repair logic, you must:
- Respect the existing bounds (or explicitly justify raising them with impact analysis).
- Emit the appropriate typed events so the UI and diagnostics remain consistent.
- Update the attempt history recorded in `WorkspaceBoard`.

## Security-first execution (sandbox is mandatory)

**No code written by an LLM is ever executed with the privileges of the user who launched the app.**

This is the foundational security invariant. It is enforced at three points:

1. The Coder stage only ever produces a fragment that is injected into the audited solver skeleton (`python/templates/solver_skeleton.py`).
2. The combined file is syntax-checked (and optionally AST-checked for `custom_dsl`), then passed to `python/code_executor.py`.
3. `code_executor.py` always delegates execution to a sandbox (`sandbox/executor.py` for Docker or `sandbox/bubblewrap_executor.py`).

The production recommendation is `TT_SANDBOX_MODE=docker` (or `bwrap` on Linux servers). The `strict=True` path in the sandbox helpers must not be bypassed in production code.

Even in development, the default behavior refuses to run outside a sandbox unless explicit unsafe environment variables are set (documented in `sandbox/README.md`).

When modifying anything in the execution path (`python-bridge.ts`, `code_executor.py`, the sandbox executors, or the Electron IPC handler), treat the change as security-sensitive and run impact analysis on all call sites.

## Prompt-driven behavior (prompts are source of truth)

The four Markdown files in `prompts/` define the actual behavior of the Translator, Planner, Coder, and Repair stages:

- `prompts/translator.system.md`
- `prompts/planner.system.md`
- `prompts/coder.system.md`
- `prompts/repair.system.md`

These files are the **source of truth**. Before every `dev`, `build`, or `test` run, `scripts/sync_prompts.mjs` (invoked via `predev`/`prebuild`/`pretest`) copies them into `public/prompts/` so the browser and server routes can serve the current versions.

Changing a prompt is a first-class behavioral change. It requires the same review rigor as changing TypeScript or Python code:
- Run impact analysis on the stages that consume the prompt.
- Update or add tests (especially `npm run test:prompt`).
- Document the intent of the change in the commit message and, when relevant, in the wiki.

Do not edit the copies under `public/prompts/` directly; they will be overwritten by the sync script.

## Pragmatic TypeScript at the language boundary

The project enables `strict: true` in `tsconfig.json`, but `eslint.config.mjs` deliberately disables a long list of rules:

- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/no-unused-vars`
- `react-hooks/exhaustive-deps`
- Many others (see the full list in the config)

**Guideline**: Avoid `any` except where code must cross the TypeScript ↔ Python JSON boundary (the `python-bridge.ts` layer, the routes that speak to the executor, and the places that parse `result.json` or construct `input.json`).

The relaxation exists because the agent frequently serializes complex nested objects (ConstraintSpec with arbitrary params, Plan objects, ScheduleEntry arrays, etc.) into JSON that the Python side consumes, and vice versa. Insisting on perfect types at every boundary would make the code significantly harder to maintain without adding meaningful safety.

When you do use `any` or disable a rule locally, add a short comment explaining why (e.g., "Python JSON boundary — see python-bridge.ts").

## Deterministic validation after every solver run (never trust the solver alone)

After every call to `executeGeneratedCode`, the agent **always** runs:

1. `validateSchedule(...)` (TypeScript deterministic checkers for all 46 constraint kinds).
2. `verifyCpSatRoundTrip(...)` (reconstructs the assignment slots from the returned schedule and verifies consistency with the input).
3. Merges any `customChecks` results returned by the sandbox (for `custom_dsl` hard constraints).

Only if all hard constraints pass and the round-trip succeeds does the agent consider the result viable. Hard violations or round-trip failures trigger the Repair stage (bounded).

This rule exists because OR-Tools (and any solver) can return solutions that satisfy the encoded model but violate the original intent, especially when the Coder has made subtle mistakes in constraint formulation. The deterministic validators are the ground truth.

When adding a new constraint kind, you must implement the checker in both:
- `python/validator_engine.py`
- `src/features/timetable/ai/deterministic-validator.ts`

and ensure the Translator and fallback parser can produce the new kind.

## No feature flags (runtime configuration instead)

Tack Timetable does not use traditional compile-time or runtime feature flags for product capabilities.

Provider selection, model choice per stage (Translator/Planner/Coder/Repair), timeouts, and sandbox mode are all configured at runtime through the Settings modal in the UI. These values live in component state or are passed explicitly into `LocalAgentConfig`; they are not persisted to disk by the application itself.

CI uses a few environment-based skip variables (e.g., `SKIP_PROVIDER_SMOKE`), but these are test and release engineering controls, not user-facing feature toggles.

If you need to introduce conditional behavior, prefer:
- Runtime configuration surfaced in the UI (when it is a user choice), or
- Environment variables clearly documented for operators/CI (when it is an infrastructure concern).

Avoid adding ad-hoc boolean flags or commented-out code paths.

## Additional conventions

- **File references in documentation and comments**: Always use the full path from the repository root inside backticks (e.g., `src/features/timetable/ai/local-agent.ts`, not just `local-agent.ts`). This enables clickable links in the rendered wiki and in many editors.
- **Testing split**: TypeScript tests use Node's built-in test runner via `tsx --test`. Python tests use pytest. Prompt behavior validation (`npm run test:prompt`) is a required check when prompts or the stages that consume them change.
- **Commit hygiene**: Run `npm run lint`, `npm test`, and `npm run test:prompt` before committing. Use `gitnexus_detect_changes()` to confirm scope. Never commit secrets (`.env*` files, API keys, etc.).
- **Scope discipline**: Only change what the task requires. The project guidelines explicitly forbid broad unsolicited refactors.

## Where these patterns appear in the code

| Pattern | Primary locations |
|---------|-------------------|
| Impact analysis + GitNexus rules | `AGENTS.md`, `CLAUDE.md`, and the embedded GitNexus blocks |
| Bounded loops + typed events | `src/features/timetable/ai/local-agent.ts` (constants, `emit`, `runLocalAgent`), `src/features/timetable/ai/types.ts` (`AgentEvent`) |
| Sandbox enforcement | `python/code_executor.py`, `sandbox/executor.py`, `sandbox/bubblewrap_executor.py`, `src/features/timetable/ai/python-bridge.ts`, `electron/main.mjs` |
| Prompt source of truth | `prompts/*.md` + `scripts/sync_prompts.mjs` + `package.json` (pre* scripts) |
| Pragmatic TypeScript | `tsconfig.json` (strict), `eslint.config.mjs` (relaxed rules), comments at JSON boundaries |
| Deterministic validation after every run | `src/features/timetable/ai/local-agent.ts` (post-execution block), `src/features/timetable/ai/deterministic-validator.ts`, `python/validator_engine.py` |
| No feature flags | Absence of flag files/variables; all configurability flows through `SettingsModal.tsx` and `LocalAgentConfig` |

Follow these patterns consistently. They are what allow the team to evolve a complex, safety-critical AI agent system without losing control of scope, security, or correctness.
