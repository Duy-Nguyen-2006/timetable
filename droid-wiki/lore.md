# Tack Timetable — Project Lore

Active contributors: Duy

This page tells the story of how the codebase evolved. All dates are derived from git commit timestamps in the default branch history.

## Eras

### The Big Bang Restart (May 15, 2026)

The visible history of the current repository begins with a full rewrite:

- `b7dfd0a` and `822736a` — "Khoi tao lai va ghi de toan bo code" (Restart and overwrite all code)
- Immediate follow-ups: refactor of the timetable app structure, style improvements to the wizard, and the first public declaration of intent: "feat(timetable): add AI-assisted timetable solver"
- Same day: first Windows desktop packaging work ("feat(release): package Windows desktop app")

This was not an incremental evolution from a prior codebase. It was a deliberate ground-up rebuild that established the Next.js + Electron + Python foundation that still exists today.

### API Keys, Early Agentic Dreams, and the Repomix Era (May 16–18, 2026)

- Lowprizo.com API key integration appears (`1908912`).
- The first major architectural leap: "feat: upgrade AI pipeline - compiler → sandbox exec → verifier" (`371e75a`, May 18).
- "feat: refactor backend to agentic sandbox architecture" (`0b0cb83`).
- The infamous `repomix-output.xml` (eventually 17.5 kLOC) is introduced as a context-packing artifact for AI-assisted development.
- "feat: implement agentic loop with AI Judge for timetable generation" (`1c4cddb`).

This period established the core security idea (sandboxed execution of AI-written code) and the "agentic loop" mental model, even though the concrete pipeline shape would change dramatically later.

### The Turn Toward Deterministic Trust (May 19–20, 2026)

Two pivotal shifts happen in quick succession:

- Multiple test datasets are added with validation harnesses.
- "feat: redesign solver architecture - AI writes constraint snippets, not full solver" (`2a708ac`).
- "feat: implement Tier A verification - deterministic checker replaces LLM Judge" (`3e2041a`).

The project explicitly moves away from "LLM as judge" (letting another model decide whether a schedule is good) toward **deterministic, auditable checkers** that can be reasoned about and unit-tested. This decision would later enable the 46-constraint expansion with real correctness guarantees.

### Release Hardening and Intermediate Architectures (May 21–24, 2026)

A rapid series of release tags appears: v0.2.0 through v3.0.10 in just a few days.

- Heavy investment in Electron packaging (Linux AppImage/deb, Windows NSIS/portable, cross-platform build scripts).
- "refactor timetable generation to two-agent solver loop" — an intermediate architecture that split responsibilities differently than the final 6-stage design.
- Significant work on violation display (separate hard/soft, conflict analysis).
- Multiple "fix: Checker LLM failure no longer blocks valid schedules" patches show the team learning the hard way that LLM-based validation is unreliable.

By the end of this week the project has a shippable desktop app, a clearer understanding that deterministic validation is non-negotiable, and a lot of battle scars from trying to make LLM judges trustworthy.

### The Great Constraint Expansion + Harness Engineering (May 29–31, 2026)

This is the largest single capability jump in the recorded history:

- May 29: "feat: add resource_capacity, session_limit, subject_group built-ins to solver"
- May 30: "Fix custom_dsl validation deadlock and enhance constraint specification"
- May 31 (cdac5b5): "feat: add 17 new built-in constraint kinds with checkers and fallback parser rules" — the commit that took the system from ~29 to 46 constraint kinds in one leap
- Same day (9d33311): "feat: 17 constraint kinds, executor status, local agent improvements, solver skeleton"
- Same day (2ca87b4 — current HEAD): "feat: constraint registry, persistent Python daemon worker, violations UI on fail"

Parallel to the constraint explosion, the project adopts the **Harness** operating system (multiple "Init Harness Engineering" commits, introduction of `scripts/bin/harness-cli`, durable SQLite layer, intake/story/trace workflow).

In the same 48-hour window the team also:
- Hardened the prompt syncing infrastructure
- Added a persistent Python daemon worker in the Electron main process (major cold-start win)
- Removed large generated artifacts (including the original 17 kLOC repomix file and duplicate CLAUDE.md/Backup.md files)
- Landed the current 6-stage pipeline shape with bounded repair loops and typed lifecycle events

This is the era in which Tack Timetable became recognizably the system described in the current documentation.

## Longest-standing features

These components have survived the most refactors and are still central:

- **`src/features/timetable/TimetableApp.tsx`** (37 commits touching it) — the entire interactive canvas, assignment entry, quick-import, live grid, Excel export, and agent progress UI. It has been the stable "front door" since the May 15 restart.
- **`src/features/timetable/ai/types.ts`** (19 commits) — the core data contracts (`AgentInputPayload`, `ConstraintSpec`, `LocalAgentFinalResult`, etc.). These types have been remarkably stable even as the pipeline around them changed.
- **`electron/main.mjs`** (15 commits) — the desktop bridge and (later) persistent daemon. The packaging story has been painful, but the main process contract has been a constant.
- **`python/templates/solver_skeleton.py`** (12+ commits) — the template that the Coder completes. Its shape has evolved, but the "AI writes the constraint blocks, not the whole solver" pattern has been consistent since the May 20 redesign.
- **`AGENTS.md`** (18 commits) — the project-specific agent instructions, including the GitNexus impact analysis rule, have been maintained as living documents rather than one-time scaffolding.

## Deprecated experiments and removed paths

- **LLM-as-Judge (AI Judge)**: Heavily used in mid-May ("agentic loop with AI Judge"), explicitly replaced by "Tier A verification - deterministic checker" on May 20. The project learned that another LLM cannot be trusted to validate hard scheduling constraints.
- **"Compiler → sandbox exec → verifier" pipeline**: The May 18 shape. Later replaced by the 6-stage prompt-driven loop (Translator/Planner/Coder/Exec/Validator/Repair).
- **"Two-agent solver loop"**: An intermediate May 24 architecture. Superseded by the current single orchestrator with explicit stages and repair.
- **`repomix-output.xml`** (13 commits touching it): A 17.5 kLOC generated context file that was added in the early agentic period and deleted during the May 31 cleanup. Its entire lifecycle was measured in days.
- Early "full solver generation" approach: Before the May 20 redesign, the AI was asked to emit entire solvers. The pivot to "AI writes constraint snippets against a stable skeleton" was a major complexity reduction.

## Major rewrites and growth trajectory

- **May 15, 2026**: Complete codebase restart (the "Khoi tao lai" commits). Everything before this is not visible in the current clone history.
- **May 18, 2026**: First sandboxed agentic architecture ("compiler → sandbox → verifier").
- **May 20, 2026**: Deterministic verification becomes the law ("Tier A verification replaces LLM Judge").
- **May 24–25, 2026**: Release cadence peaks (v0.2.0 → v3.0.10 in ~4 days). Heavy Electron packaging investment.
- **May 29–31, 2026**: The 17-kind constraint explosion + Harness adoption + daemon worker + artifact cleanup. The single largest delta in the project's recorded life.

The growth pattern is classic for a small, high-intensity team: long periods of exploratory commits ("Fix BE" appears many times), punctuated by very large, high-signal commits that change the fundamental shape of the system.

## Speculation and open questions

- The exact motivation for the May 15 full rewrite is not recorded in commit messages. It appears to have been a conscious decision to start fresh rather than evolve an earlier prototype.
- The rapid release tagging in late May (v0.2 through v3.0.10) suggests the team was simultaneously trying to stabilize a desktop product for real users while the core AI architecture was still undergoing major surgery.
- The decision to adopt the full Harness operating system (with durable SQLite layer, intake classification, traces, and backlog) on the same day as the largest capability expansion (46 constraints) is striking. It implies the team had reached a point where "more features" without process would become unsustainable.

The current HEAD (`2ca87b44`) represents a system that has finally stabilized the core loop (6 stages + deterministic validation + bounded repair + sandbox), added the majority of the domain-specific constraint vocabulary it needs for Vietnamese school timetabling, and put a professional operating harness underneath the development process.

What comes next is likely refinement, performance work on the solver, more constraint kinds discovered in real usage, and the long tail of making the UI and explanation of violations first-class parts of the product.
