# Testing

Active contributors: Duy

Test frameworks (tsx --test for TS, pytest for Python). Prompt model validation. Provider smoke tests. Dataset API tests. How to add tests for new constraint kinds or agent stages. Coverage expectations.

## Test Frameworks and Commands

- **TypeScript**: `npm test` runs the Node built-in test runner via `tsx --test "src/**/*.test.ts"`.
  - Targeted runs: `npm run test:grep <substring>` (e.g. `npm run test:grep coder`).
- **Prompt contract validation**: `npm run test:prompt` executes `scripts/validate_coder_prompt_models.ts`. It enforces required tokens (`custom_dsl`, `covered_constraint_ids`, `severity == "hard"`) in `prompts/coder.system.md`. This is a hard gate in CI and local `pretest`.
- **Provider smoke tests**: `npm run provider:smoke` (see `scripts/provider_smoke_test.ts`). Requires provider credentials (e.g. `OPENROUTER_*` or `LOWPRIZO_API_KEY` equivalents). In CI it is conditional: skipped when `SKIP_PROVIDER_SMOKE=1` or no key is present; otherwise starts the dev server and runs against it.
- **Python**: `pytest python/tests` (CI sets up a venv and installs `pytest ortools`).
- **Dataset API tests**: CI conditionally runs `test_datasets.py` (at repo root when present). If `LOWPRIZO_API_KEY` is absent it runs with `-rs` (no server); otherwise it starts `npm run dev` and waits for the server before executing the tests against the live API.

See `.github/workflows/ci.yml` for the exact matrix (lint → test:prompt → TS tests → build → conditional provider smoke → pytest → conditional dataset tests).

All quick checks (`npm run lint`, `npm test`, `npm run test:prompt`) must pass before claiming a task complete.

## Test Layout and Style

- TypeScript tests live beside the code they exercise under `src/features/timetable/ai/` (and a few API route tests):
  - `coder.test.ts` — `runCoderTurn` contract, coverage auto-patch logic, early-exit for built-in / non-hard constraints.
  - `local-agent.test.ts` — orchestrator integration (`runLocalAgent`), violation signature normalization (roundtrip dynamic ids), deduping, solver profile mapping, repair-before-exhaustion flows, worker hints, warm-start.
  - `deterministic-validator.test.ts` — the full checker matrix (pass/fail cases for every supported `ConstraintKind`).
  - `repair.test.ts` — `applyRepairPatches` atomicity, ambiguity detection, replaceAll semantics, ordering.
  - `translator.test.ts` — sanitization (unknown teacher/day → `custom_dsl`), period expansion, etc.
  - `cp-sat-roundtrip.test.ts` — assignment-tuple validation, period/day bounds, valid schedule acceptance.
  - Others: `ast-check.test.ts`, `parse-model-json.test.ts`, `skeleton-injector.test.ts`, `solver-template.test.ts`, quick-import, and API route tests.
- Python tests under `python/tests/`:
  - `test_validator_engine.py` — focused tests for individual constraint kinds plus cross-cutting behavior (e.g. `resource_capacity` ignored while others are enforced).
  - `test_sandbox_*.py`, `test_executor_status.py` — sandbox dispatch modes, strict vs. non-strict error handling, artifact cleanup, status mapping (`OPTIMAL`/`FEASIBLE` etc. → internal enum).

TS tests heavily mock `globalThis.fetch` (and chat responses) so no real LLM calls occur. Python tests use `monkeypatch` and `pytest`.

## Adding Tests for a New Constraint Kind

Constraint checkers must stay in sync between languages. See [Patterns and conventions](./patterns-and-conventions.md) ("Deterministic validation after every solver run").

1. Implement the checker:
   - TypeScript: `src/features/timetable/ai/deterministic-validator.ts` (add the kind to the supported registry and implement the predicate).
   - Python: `python/validator_engine.py` (`validate_schedule` and the internal dispatch table).
2. Add matrix coverage:
   - `src/features/timetable/ai/deterministic-validator.test.ts`: append a `CheckerCase` entry with `kind`, `spec(...)`, `pass: ScheduleEntry[]`, `fail: ScheduleEntry[]`. The `describe('checker matrix')` loop will generate the two assertions automatically.
   - `python/tests/test_validator_engine.py`: add one or more `test_*` functions following the style of `test_subject_consecutive_*` or `test_class_no_double_*`. Include at least one case that produces a violation and one that does not.
3. If the new kind participates in cross-cutting logic (if_then, custom_dsl, reification, etc.), add an orchestrator-level scenario in `local-agent.test.ts` or a dedicated integration test that exercises `runLocalAgent` (mocked) end-to-end with the new constraint.
4. Update any product docs (`constraint-system.md`, glossary, etc.) and the dual-language contract notes in patterns-and-conventions.md.

Example pattern (from existing matrix):

```ts
{
  kind: 'teacher_max_per_day',
  spec: spec('t1', 'teacher_max_per_day', { teacher: 'Sơn', maxPerDay: 2 }),
  pass: [entry('6A', 'mon', 1, 'Toán', 'Sơn'), entry('6A', 'mon', 2, 'Văn', 'Sơn')],
  fail: [/* three entries for the same teacher on one day */],
}
```

The same discipline applies when changing an existing kind's semantics.

## Adding Tests for a New Agent Stage or Orchestrator Change

1. Unit test the stage in isolation (new file `my-stage.test.ts` or extension of an existing one). Provide deterministic mock chat responses that exercise both success and the error paths you care about (bad JSON, missing required fields, exhaustion messages, etc.).
2. Add integration coverage in `local-agent.test.ts`:
   - Mock the prompt fetches and `/api/ai/chat` responses for the new stage.
   - Assert on the emitted event sequence, retry counters, `StageCache` behavior, violation signature stability, repair round budgets, and final `success` / `finalResult` shape.
   - Cover the specific limits (`MAX_CODER_RETRIES`, `MAX_RUNTIME_REPAIR_ROUNDS`, `MAX_VIOLATION_REPAIR_ROUNDS`, `MAX_TOTAL_TOOL_CALLS`, `TOKEN_CAP_PER_RUN`).
3. For repair logic changes, extend `repair.test.ts` with cases for the new patch shapes or failure modes.
4. If the stage emits new event types consumed by the UI, add a lightweight test that the event shape is stable (or update the consuming test).

See the large "runLocalAgent repairs runtime failures..." test in `local-agent.test.ts` for a realistic multi-stage mocked flow.

## Coverage Expectations

- New constraint kinds: both pass and fail cases on **both** the TypeScript and Python sides. The deterministic-validator matrix is the source-of-truth list of exercised kinds.
- New agent stages or material behavior changes in the orchestrator: at least one focused unit test + one `runLocalAgent` integration test (fully mocked).
- Prompt changes: the token check in `validate_coder_prompt_models.ts` must still pass; add regression tests in `coder.test.ts` when the contract (e.g. new required JSON field) evolves.
- Prefer hermetic, fast, deterministic tests. Real provider calls belong only in the conditional smoke / dataset suites.
- No explicit percentage target is declared; the expectation is "if the code path can affect schedule correctness or agent reliability, it must be exercised by an automated test that would have failed before the change."

Run the full suite locally before opening a PR:

```bash
npm run lint
npm run test:prompt
npm test
pytest python/tests
```

## Related Pages

- [Patterns and conventions](./patterns-and-conventions.md) — the "Testing split and expectations" section and why dual-language deterministic checkers exist.
- [Debugging](./debugging.md) — diagnosing failing tests, inspecting `.ai_results/` artifacts, using harness traces, and reproducing CI-only behavior.
- Main [How to Contribute index](./index.md) and the Harness workflow in `docs/`.

When adding tests, also consider whether a new harness friction item or validation expectation should be recorded via `scripts/bin/harness-cli`.
