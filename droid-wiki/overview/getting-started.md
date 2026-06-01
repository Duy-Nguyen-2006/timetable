# Getting started

Active contributors: Duy

## Prerequisites

- **Node.js 22+** and npm (CI uses 22)
- **Python 3.12+** with `venv` and `pip`
- (Recommended) Docker or bubblewrap for the sandbox
- A modern browser (for the web app) or Linux/Windows for the Electron desktop build

For the AI features you also need access to an OpenAI-compatible LLM provider (OpenRouter, generic OpenAI-compatible endpoint, etc.). API keys are never stored in the repo.

## Install

```bash
git clone https://github.com/Duy-Nguyen-2006/timetable.git
cd timetable
npm install
```

This installs the Next.js frontend, Electron builder, and all TypeScript dependencies.

## Python environment (for local development and tests)

```bash
python -m venv .venv
source .venv/bin/activate        # Linux/macOS
# .\.venv\Scripts\activate     # Windows
pip install -U pip pytest ortools
```

The Python layer (`python/code_executor.py`, `validator_engine.py`, solver skeleton) is executed either via the system `python3` (web dev server path) or via the bundled PyInstaller binary (Electron desktop path).

## Development

```bash
npm run dev
```

This runs the `predev` hook automatically:

- `npm run sync:prompts` — copies `prompts/*.md` → `public/prompts/`
- `npm run presync:skeleton` — copies the solver skeleton template

Then starts the Next.js dev server (usually on http://localhost:3000).

Open the app, click **"+ Bắt đầu nhập dữ liệu"**, and you will land in the main scheduling canvas (`TimetableApp`).

### First-run provider setup

On first use the app will prompt for LLM provider settings (base URL, API key, model). These are stored only in your browser's localStorage for that origin.

- Default base URL in the UI: `https://openrouter.ai/api/v1`
- The app supports per-stage models (Translator / Planner / Coder / Repair) via the advanced settings if needed.
- Use the **Provider test** button in Settings to verify connectivity before running the agent.

## Running the full agent loop locally

1. Start the dev server (`npm run dev`).
2. Open the app and enter a small dataset (or paste the quick-import sample).
3. Add at least one natural-language constraint (e.g. "Giáo viên Nguyễn Văn A không dạy thứ 2").
4. Click the AI solve button.
5. Watch the 6-stage progress (Translator → Planner → Coder → Running → Checking → Fixing).
6. When successful you will see a validated timetable + any soft violations.

The agent will never execute LLM-generated Python directly on your machine. All execution goes through `code_executor.py` inside the sandbox dispatcher.

## Build

```bash
npm run build
```

This runs the same sync hooks as dev, then produces a standalone Next.js build (`next build`) followed by `scripts/post-build.mjs`.

The output is in `.next/standalone` (used by Electron packaging and `npm start`).

## Lint

```bash
npm run lint
```

ESLint is intentionally relaxed in a few places because the codebase frequently crosses the TypeScript ↔ Python JSON boundary (see `eslint.config.mjs`).

## Test

### TypeScript tests

```bash
npm test                 # runs all src/**/*.test.ts via tsx + Node test runner
npm run test:grep translator   # example: run only translator-related tests
```

### Prompt behavior validation

```bash
npm run test:prompt
```

This script (`scripts/validate_coder_prompt_models.ts`) verifies that the four prompts in `prompts/` still produce valid structured JSON for the configured model set.

### Python layer tests

```bash
./.venv/bin/pytest python/tests
```

### Provider smoke (optional, requires key)

```bash
npm run provider:smoke
```

This starts the dev server (if needed) and exercises the configured provider. In CI it is skipped unless `LOWPRIZO_API_KEY` is present.

### Full CI locally (approximate)

```bash
npm run lint
npm run test:prompt
npx tsx --test "src/**/*.test.ts"
npm run build
./.venv/bin/pytest python/tests
```

## Electron desktop app (development)

```bash
npm run electron
```

This launches the app using the current source (it will use the Python binary from `python-dist/` if present, otherwise falls back to source `python/` execution via the daemon).

## Packaging desktop apps

### Linux (AppImage + deb)

```bash
npm run dist:linux
```

Produces artifacts in `release/`.

### Windows (NSIS + portable)

```bash
npm run package:win
```

Requires a Windows environment (or runs via CI). The dedicated Windows CI pipeline (`.github/workflows/windows-ci.yml` + reusable `_reusable-windows-build.yml`) handles PyInstaller + electron-builder NSIS packaging on `master` pushes and PRs. Artifacts are uploaded for smoke verification.

Key Windows smoke steps (run automatically in CI, or manually via `workflow_dispatch`):
- `scripts/smoke-datasets.ts` — validates all `DATASET` blocks in `datasets.txt` against the quick-import parser.
- `scripts/smoke-http.mjs` — exercises provider connectivity and `/api/ai/python-execute`.
- `scripts/smoke-openrouter.mjs` — direct OpenRouter reachability + model list check.

The packaging step bundles:
- The standalone Next.js server
- The PyInstaller `code_executor.exe` binary (from `python-dist/`)
- The Python source as a fallback (`python-src/`)
- The current solver skeleton and validator engine

See [How to contribute — tooling](how-to-contribute/tooling.md) for the full smoke matrix and harness CLI commands.

## Sandbox setup (critical for security)

The project refuses to execute LLM-generated solver code outside a sandbox.

### Docker (recommended for strongest isolation)

```bash
cd sandbox
docker build -t timetable-sandbox:latest -f Dockerfile .
```

Then set (or let auto-detect):

```bash
export TT_SANDBOX_MODE=docker
```

### bubblewrap (lighter, Linux only)

```bash
sudo apt install bubblewrap   # Debian/Ubuntu
# sudo pacman -S bubblewrap   # Arch
# sudo dnf install bubblewrap # Fedora
```

Auto-detect will prefer bwrap on Linux when available.

### Unsafe mode (development only)

```bash
export TT_SANDBOX_MODE=none
export TT_SANDBOX_ALLOW_UNSAFE=1
```

This bypasses all isolation and is intentionally painful to enable. Never use in production or when handling real provider keys.

See `sandbox/README.md` and `sandbox/run.py` for the full dispatch logic.

## Environment variables

- `TT_SANDBOX_MODE` — `docker` | `bwrap` | `none` (default: auto)
- `TT_SANDBOX_ALLOW_UNSAFE` — must be `1` to allow `none` mode
- `EXECUTOR_TIMEOUT_SECONDS` — overrides the default 360s timeout inside `code_executor.py`
- `LOWPRIZO_API_KEY` (CI only) — used for provider smoke and dataset tests

Never commit real secrets. The app expects keys to be supplied at runtime via the Settings modal (web/Electron) or environment for CI smoke tests.

## Next steps

- Read the [Architecture](architecture.md) page for the full layered diagram.
- Explore the [AI Pipeline](systems/ai-pipeline/index.md) to understand the 6 stages in depth.
- See the [Constraint System](features/constraint-system.md) for the 46 built-in constraint kinds.
- Review [How to contribute — patterns and conventions](how-to-contribute/patterns-and-conventions.md) before making changes (especially the mandatory GitNexus impact analysis rule).
