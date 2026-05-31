# Configuration

Active contributors: Duy

All runtime behavior in Tack Timetable is controlled either by user settings in the UI or by environment variables. There are no traditional feature flags.

## LLM Provider settings (UI)

The Settings modal (`src/features/timetable/SettingsModal.tsx`) collects:

- **Base URL** — default `https://openrouter.ai/api/v1`. Must start with `http://` or `https://`.
- **API Key** — never persisted to disk or source control; stored only in browser localStorage for the current origin (web) or equivalent secure storage in Electron.
- **Model** — free-form string (e.g. `deepseek/deepseek-v4-flash`, `gpt-4o-mini`). The app auto-infers the provider type from the base URL and model name:
  - `openrouter` if the URL contains `openrouter.ai`
  - `openai-responses` for GPT-5 / o-series / codex models
  - `generic-chat-completion-api` otherwise
- **Solver profile** — one of `fast` (20 s, ~½ CPU), `balanced` (60 s, CPU-1 worker), `deep` (180 s, all CPUs). This drives the default timeout and worker count passed to the solver.

These values are passed as `AIProviderConfig` (plus optional per-stage model overrides) into every `runLocalAgent` call.

The server-side proxy (`/api/ai/chat`) receives the same config on each request and forwards it to the provider. No keys are logged.

## Solver runtime configuration

Resolved in `resolveSolverRuntime` (`local-agent.ts`):

```ts
const defaults = {
  fast:    { timeoutMs: 20_000,  workers: Math.max(1, Math.floor(cpuCount / 2)) },
  balanced:{ timeoutMs: 60_000,  workers: Math.max(1, cpuCount - 1) },
  deep:    { timeoutMs: 180_000, workers: cpuCount },
};
```

The final values can still be overridden by explicit `timeoutMs` and `solverWorkers` in the agent config object.

Hard caps that cannot be overridden per-run:
- `MAX_CODER_RETRIES = 3`
- `MAX_RUNTIME_REPAIR_ROUNDS = 1`
- `MAX_VIOLATION_REPAIR_ROUNDS = 2`
- `MAX_TOTAL_TOOL_CALLS = 15`
- `TOKEN_CAP_PER_RUN = 80_000`

## Sandbox mode (`TT_SANDBOX_MODE`)

Controlled by the environment variable `TT_SANDBOX_MODE` (or auto-detected):

- `docker` — use Docker sandbox (`sandbox/executor.py`)
- `bwrap` — use bubblewrap (`sandbox/bubblewrap_executor.py`)
- `none` — raw subprocess (only allowed if `TT_SANDBOX_ALLOW_UNSAFE=1`)

Auto-detect order (when the variable is not set):
1. Linux + `bwrap` binary present → `bwrap`
2. `docker` binary present → `docker`
3. Otherwise → refuse to run (error)

See `sandbox/run.py` and `sandbox/README.md` for the full dispatch logic and security rationale.

## Python executor timeouts

- `EXECUTOR_TIMEOUT_SECONDS` (env) or first CLI argument to `code_executor.py` — wall-clock limit for the entire job.
- `SOLVER_MAX_SECONDS` — derived inside the executor as `timeout - 5` and passed to the OR-Tools solver.
- `SOLVER_WORKERS` — number of CP-SAT workers (clamped to 1–8).

These are set by the TypeScript caller (`python-execute/route.ts` and the Electron daemon) based on the solver profile.

## CI / release configuration

### GitHub Actions (`.github/workflows/ci.yml`)

- Node 22 + Python 3.12
- Runs lint, prompt validation, TS tests, full build, provider smoke (conditional), pytest, and dataset API tests
- Provider smoke and dataset tests are skipped unless `LOWPRIZO_API_KEY` secret is present (and `SKIP_PROVIDER_SMOKE` is not set to `1`)

### Windows release (`.github/workflows/release-windows.yml`)

- Builds the PyInstaller binary + Electron NSIS/portable artifacts on tag push
- Uses the same Python 3.12 + Node 22 matrix

### Electron builder (`package.json` → `"build"`)

- App ID: `com.tackstudio.timetable`
- Output directory: `release/`
- Bundles:
  - `.next/standalone`
  - `python-dist/code_executor` (PyInstaller binary) → `python/`
  - `python/` source (with `__pycache__` filtered) → `python-src/`
- Targets: NSIS + portable (Windows), AppImage + deb (Linux)
- `asarUnpack` includes the standalone server and native modules so they remain accessible after packaging

## Secrets & environment variables (never committed)

| Variable                    | Used by                          | Purpose |
|----------------------------|----------------------------------|---------|
| `LOWPRIZO_API_KEY`         | CI smoke + dataset tests         | Real provider key for integration tests |
| `OPENROUTER_API_KEY` etc.  | `scripts/provider_smoke_test.ts` | Local/manual smoke |
| `TT_SANDBOX_MODE`          | `sandbox/run.py`                 | Force specific sandbox |
| `TT_SANDBOX_ALLOW_UNSAFE`  | `sandbox/run.py`                 | Gate for `none` mode (dev only) |
| `EXECUTOR_TIMEOUT_SECONDS` | `python/code_executor.py`        | Override default 360 s timeout |

Never commit real secrets. The app is designed so that provider keys only ever travel from the browser to the LLM proxy or from CI to the smoke-test script.

## No feature flags

The project deliberately avoids feature flags. Behavioral variation is expressed through:

- User-controlled provider + model + solver profile (UI)
- Environment-controlled sandbox mode (ops)
- Build-time prompt and skeleton syncing (development process)

When adding a new behavioral option, prefer exposing it in the Settings modal (with a safe default) rather than a new environment variable or flag.
