# Maintainers

Active contributors: Duy

This page maps major subsystems to the people who have worked on them most recently, derived from `git blame` and `git log` on the default branch (`master`), excluding bot accounts.

## Subsystem ownership

| Subsystem                  | Primary active contributors (from git history) | Notes |
|----------------------------|------------------------------------------------|-------|
| AI Pipeline (local-agent, translator, planner, coder, validator, repair, etc.) | Duy | The 6-stage orchestrator and all stage implementations; the largest and most frequently changed area. |
| Python Execution & Sandbox (code_executor.py, validator_engine.py, sandbox/*) | Duy | Secure execution host, Docker and bubblewrap dispatchers, validator engine for all constraint kinds. |
| Timetable UI / Scheduling Wizard (TimetableApp.tsx, quick-import, SettingsModal) | Duy | The entire interactive canvas, agent progress visualization, Excel export, and provider settings. |
| Electron Desktop Bridge (main.mjs, preload, daemon worker) | Duy | Persistent Python daemon, IPC contract, packaging configuration. |
| Build / Prompt Sync / Tooling (scripts/*, package.json lifecycle, CI workflows) | Duy | Prompt and skeleton syncing, provider smoke harness, GitHub Actions, electron-builder config. |
| Documentation & Harness (docs/*, AGENTS.md, CLAUDE.md, droid-wiki/) | Duy | Operating rules, feature intake process, architecture decisions, and this wiki. |

## Git history summary (default branch)

- **Duy** (and GitHub identity variants Duy-Nguyen-2006, toan9ctranphu@gmail.com) — overwhelmingly the dominant contributor across every major directory. The vast majority of commits that define the current architecture, constraint system, sandbox, and UI are from this author.
- **Claude** (noreply@anthropic.com) — appears in commit metadata for several AI-assisted changes, especially in the May 2026 period (Electron packaging, prompt work, CI refinements). Treated as tooling/assistance rather than primary ownership.
- **Z User** (z@container) and **Emergent Agent** — containerized / ephemeral development environments used during rapid iteration. Not treated as long-term owners.
- No other human contributors have meaningful commit volume in the visible history.

## CODEOWNERS

There is no `CODEOWNERS` file in the repository. Ownership is derived purely from git history on `master`.

## Implications for future work

Because the contributor count is very small (effectively a solo project with AI tooling assistance), the bus factor for most subsystems is 1. Any change that touches the AI pipeline, the sandbox contract, or the deterministic validator should be treated as high-risk from a knowledge perspective even when the code change itself is small.

The strict GitNexus impact analysis rule documented in `AGENTS.md` and `CLAUDE.md` exists in part to compensate for this concentration of knowledge.
