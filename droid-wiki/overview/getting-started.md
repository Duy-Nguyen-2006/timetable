# Getting started

Active contributors: Duy

## Prerequisites

- Node.js 22+ (the CI matrix uses 22)
- npm (or equivalent)
- Python 3.11 or 3.12 (for local development and running the Python layer tests)
- (Optional but recommended) Docker — for the full sandbox experience when running generated solver code
- (Optional, Linux only) bubblewrap (`bwrap`) — lighter-weight sandbox alternative

## Install

```bash
npm install
```

The `predev`, `prebuild`, and `pretest` scripts will automatically run prompt and skeleton sync steps (see Tooling).

## Development

```bash
npm run dev
```

This starts the Next.js dev server. The first request will trigger the prompt sync and solver skeleton sync if they have not already run.

To exercise the full Local Agent pipeline you will need to configure an LLM provider in the Settings modal (the gear icon in the UI). The app supports any OpenAI-compatible endpoint and has special handling for Anthropic models via the server proxy.

### Running the Python layer tests

```bash
python -m venv .venv
./.venv/bin/pip install -U pip pytest ortools
./.venv/bin/pytest python/tests
```

## Build

```bash
npm run build
```

This produces a standalone Next.js build in `.next/standalone`. The Electron packaging step consumes this.

## Lint and TypeScript checks

```bash
npm run lint
```

The ESLint configuration is intentionally relaxed for rules that commonly fire at the TypeScript ↔ Python JSON boundary (see `eslint.config.mjs`). The project still expects clean builds and passing tests before PRs.

## Test (TypeScript side)

```bash
npm test
# or with filtering
npm run test:grep -- translator
```

Prompt behavior validation (important when you change `prompts/`):

```bash
npm run test:prompt
```

## Desktop (Electron) run

```bash
npm run electron
```

This launches the packaged Electron app against the current dev server or a built bundle. The main process (`electron/main.mjs`) exposes the native Python execution IPC used by the Local Agent when running inside Electron.

## Building a distributable

Linux (AppImage + deb):

```bash
npm run dist:linux
```

Windows (requires a Windows runner or cross-compilation setup):

```bash
npm run build
# then the packaging step defined in package.json under the "win" target
```

See `.github/workflows/release-windows.yml` for the full CI packaging flow (PyInstaller for the Python runner + electron-builder).

## Sandbox setup (Docker)

If you want the agent to execute generated solver code safely:

```bash
cd sandbox
./build.sh
# or manually:
docker build -t timetable-sandbox:latest -f Dockerfile .
```

Once the image exists, the Python execution path will use it automatically when `TT_SANDBOX_MODE` is not set or is set to `docker`.

See `sandbox/README.md` for the full matrix of sandbox modes (`docker`, `bwrap`, `none`) and production recommendations.

## Provider smoke test (optional)

Some CI jobs and local verification scripts call external LLM providers:

```bash
npm run provider:smoke
```

This requires `LOWPRIZO_API_KEY` (or equivalent) in the environment unless `SKIP_PROVIDER_SMOKE=1` is set.

## Common environment variables

- `LOWPRIZO_API_KEY` — used by provider smoke tests and dataset API tests in CI.
- `TT_SANDBOX_MODE` — `docker` | `bwrap` | `none`. Controls which sandbox the Python executor uses.
- `EXECUTOR_TIMEOUT_SECONDS` — overrides the default timeout passed to `code_executor.py`.
- `SOLVER_MAX_SECONDS`, `SOLVER_WORKERS` — passed through to the generated solver for tuning.

## Next steps

- Read the [Architecture](architecture.md) page to understand the five layers and the six-stage agent.
- Browse the [AI Pipeline](../systems/ai-pipeline/index.md) to see how each stage works.
- Look at the [Constraint System](../features/constraint-system.md) if you plan to extend the scheduling rules.
- Review [How to Contribute](../how-to-contribute/index.md) and the mandatory impact analysis rule before making code changes.
