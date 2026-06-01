**Date:** 2026-06-01  
**Base wiki commit:** `6f571326df7f4d512ed471a1cc740389bc6b2805` (wiki generated 2026-06-01 01:19 UTC)  
**Current HEAD:** `80d40b2b8e33fe5051ac64260240e8f8f00b6d0d`  
**Mode:** INCREMENTAL (small delta: 19 files, +782/-92 net excluding droid-wiki/ and lockfiles)

## Delta Summary (this cycle)

**Changed source files (19 files, +782 insertions / 92 deletions):**

### New Windows CI / packaging pipeline (major infrastructure addition)
- `.github/workflows/windows-ci.yml` — **NEW** full Windows smoke + optional NSIS packaging reusable workflow
- `.github/workflows/_reusable-windows-build.yml` — **NEW** shared build job for PyInstaller + electron-builder
- `.github/workflows/release-windows.yml` — updated to call the new reusable windows build
- `scripts/smoke-datasets.ts` — **NEW** quick-import dataset smoke test
- `scripts/smoke-http.mjs` — **NEW** HTTP-level smoke (provider, python-execute)
- `scripts/smoke-openrouter.mjs` — **NEW** OpenRouter connectivity + model list smoke

### Desktop / Electron hardening
- `electron/main.mjs` — daemon lifecycle improvements, `resolveCurrentSpec` + docker fallback notice, persistent worker for low-latency solves
- `electron/preload.cjs` — **NEW** (CommonJS bridge for PyInstaller-bundled builds)
- `electron/preload.ts` — small updates to expose python checks (syntax/ast) via contextBridge
- `src/features/timetable/ai/skeleton-injector.ts` — improved indentation stripping + dual-bridge (IPC + HTTP) for syntax/ast checks

### Runtime / AI feature small improvements
- `src/features/timetable/TimetableApp.tsx` — minor integration of run-cache + updated imports post-refactor
- `src/features/timetable/SettingsModal.tsx` — small UI tweaks, runtime mode descriptions
- `src/features/timetable/ai/run-cache.ts` — **NEW** (input-digest keyed localStorage cache for identical runs, `buildRunCacheDigest`, `readCachedRuns`, `writeCachedRun`)
- `src/features/timetable/ai/pipeline-versions.ts` — new (version stamp for cache invalidation)

### Python execution & sandbox
- `python/code_executor.py` — timeout/env handling, daemon mode, stricter result parsing, artifact rotation
- `sandbox/build.sh`, `sandbox/executor.py` — minor image tag + hardening tweaks

### Tooling / quality
- `package.json` — scripts + deps updates (postinstall, smoke helpers)
- `eslint.config.mjs` — rule tweaks
- `.gitignore` — ignore new smoke artifacts + python build outputs

**No new top-level subsystems.** No routes, ConstraintKinds, or agent stages added. No deletions of existing documented modules. Behavior contracts (6-stage pipeline, sandbox host, deterministic validation) are unchanged.

## Affected Wiki Pages (Must Update or Refresh)

These pages reference directory trees, key files, CI, desktop transport, caching, or build steps that are now stale:

| Page | Why it needs change | Priority |
|------|---------------------|----------|
| `overview/index.md` | Directory tree + "Entry points" mention old CI layout and missing `scripts/smoke-*.ts` + windows-ci.yml | High |
| `overview/getting-started.md` | Build/test/run commands, new smoke scripts, Windows packaging note, daemon vs per-call | High |
| `overview/architecture.md` | If it shows high-level component diagram or "Desktop vs Web transport" — the preload.cjs + daemon story should be reflected | Medium |
| `systems/ai-pipeline/index.md` | Directory tree in `ai/` now includes `run-cache.ts`, `pipeline-versions.ts`, `skeleton-injector.ts` (already partially updated in prior wiki) | Low-Medium |
| `systems/python-execution.md` | Electron daemon lifecycle, preload.cjs bridge, code_executor daemon mode, new IPC surface, sandbox image tag | High |
| `systems/validation.md` | Minor — only if it references executor internals that moved | Low |
| `features/scheduling-wizard.md` | TimetableApp + SettingsModal deltas (runtime modes, cache integration); components/ already documented from prior refactor | Medium |
| `how-to-contribute/tooling.md` | New smoke scripts under `scripts/`, harness CLI usage, Windows CI | Medium |
| `reference/configuration.md` | package.json changes, new env for smoke / daemon | Low |
| `reference/dependencies.md` | package.json + python reqs drift | Low |
| `by-the-numbers.md` | **ALWAYS REFRESH** in incremental mode (git churn, file counts, language stats since last snapshot) | High |
| `lore.md` | Optional light touch — new Windows CI era / desktop daemon milestone (June 2026) | Low |
| `security.md` | Already regenerated in prior run; verify it still covers the new preload.cjs + daemon attack surface correctly | Medium |

## Pages to Copy Unchanged (Safe)

All other pages in the current wiki have no underlying source changes in this delta and can be byte-copied:

- `overview/glossary.md`
- `how-to-contribute/` (except tooling.md)
- `systems/ai-pipeline/` (except possibly index.md for the file list)
- `features/constraint-system.md`, `features/index.md`
- `reference/index.md`
- `fun-facts.md`
- `maintainers.md`
- `systems/index.md`
- `systems/ai-pipeline/planner.md`, `coder.md`, `repair.md`, `translator.md`, `validator.md`

## New Areas / Gaps Discovered

- **Windows CI smoke matrix** — first-class Windows packaging + smoke path now exists. Should be mentioned in getting-started and tooling (previously Linux/macOS-centric).
- **Run cache** — new client-side caching layer for identical AI runs. Worth a 1–2 paragraph note in scheduling-wizard or ai-pipeline (under "performance & UX").
- **Daemon worker** — persistent Python worker for desktop dramatically changes latency model vs per-call spawn. Update python-execution + architecture if they describe transport.
- **Preload split (.cjs)** — for PyInstaller + ESM interop. Security surface is now split between .ts and .cjs bridges.

## Cross-Cutting Patterns (Stable)

- GitNexus impact analysis before edits (still enforced in CLAUDE.md / AGENTS.md)
- Harness durable layer (scripts/bin/harness-cli) — no change in this delta
- Security model (never execute LLM code on host, sandbox always) — unchanged
- 6-stage Local Agent contracts + deterministic validation — unchanged

## Recommended Execution Order for This Incremental Run

1. Refresh `by-the-numbers.md` (git history + counts).
2. Update high-priority pages: `overview/index.md`, `overview/getting-started.md`, `systems/python-execution.md`.
3. Medium: `features/scheduling-wizard.md`, `how-to-contribute/tooling.md`, `overview/architecture.md`, `security.md`.
4. Light: `systems/ai-pipeline/index.md`, `reference/*`, `lore.md` (one sentence if warranted).
5. Final cross-link audit + regenerate `.wiki-meta.json` with HEAD `80d40b2...` and updated `generatedAt`.

## Notes for Sub-Agents

- Preserve all existing Mermaid diagrams and section order unless the underlying flow genuinely changed.
- When updating file trees, use the exact current layout from `src/features/timetable/ai/` and `electron/` (the daemon + preload.cjs story is the biggest desktop change).
- Do not invent new ConstraintKinds or stages — there are none.
- All new scripts are under `scripts/` and are dev/CI-only (smoke tests); they are not user-facing features.

**End of scoped incremental survey context.**
