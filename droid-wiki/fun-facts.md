# Tack Timetable — Fun Facts

Active contributors: Duy

A collection of interesting, surprising, or amusing discoveries from the codebase and its history.

## The 17.5k-line artifact that lived for one commit

In the delta between the previous wiki generation and current HEAD, the repository deleted a single file containing **17,546 lines**: `repomix-output.xml`.

This file was apparently produced by an AI-powered code context packing tool (Repomix) and had been committed wholesale at some point. It was then removed in the same window that added 17 new constraint kinds.

The removal, combined with the addition of `scripts/bin/harness-cli` (a 3.5 MB binary) to `.gitignore` patterns, marks a clear policy decision: large generated artifacts and build harness binaries do not belong in the repository, even if they were useful for a single AI-assisted development session.

## 46 constraint kinds in 16 days

The entire public git history of the project fits inside May 2026. The foundational reset landed on 2026-05-15. By 2026-05-31 — just 16 calendar days later — the system had grown from a smaller initial set of constraints to **exactly 46 built-in `ConstraintKind` values**, each with deterministic checkers on both the TypeScript and Python sides, plus fallback parser rules in the Translator.

Many of these constraints encode extremely specific Vietnamese secondary-school scheduling practices (double-period rules, "no two subjects of the same group on the same day," session limits, resource capacity for labs, etc.). The semantic density of the constraint system is unusually high for a project this young.

## The AI never runs its own code on the host

A core invariant, repeated in `AGENTS.md`, `sandbox/README.md`, and the architecture documentation:

> No code written by an LLM is ever executed with the privileges of the user who launched the app.

This is not marketing. It is enforced at three separate layers:
- The Coder is only allowed to emit a fragment that is injected into an audited skeleton.
- The skeleton is syntax- and (optionally) AST-checked before execution.
- Execution always goes through `code_executor.py`, which always delegates to Docker or bubblewrap.

Even the web fallback route (`/api/ai/python-execute`) spawns the executor in a temp directory and relies on the same sandbox contract.

The only way to violate this rule is to set explicit unsafe environment variables that are documented as "dev only, do not use in production."

## Version numbers that skipped from 0.x straight to 3.x

The repository carries tags `v0.2.0`, `v0.3.0`–`v0.3.6`, and then `v3.0.7`, `v3.0.8`.

There is no `v1.x` or `v2.x` series visible in the tag list. Either the earlier history was squashed or kept private during the May 2026 reset, or the versioning was deliberately aligned with a larger internal product family. Either way, the public version numbers contain a mysterious 3.x jump that no one has yet explained in a commit message.

## The prompt files are the real source code

While the TypeScript and Python files are what the computer executes, the **actual behavior** of the four AI stages is defined in four Markdown files:

- `prompts/translator.system.md`
- `prompts/planner.system.md`
- `prompts/coder.system.md`
- `prompts/repair.system.md`

These files are treated as first-class source artifacts. They are synced into `public/prompts/` before every `dev`, `build`, and `test` run via `scripts/sync_prompts.mjs`. Changing a prompt requires the same review process (impact analysis, tests, lint) as changing a `.ts` or `.py` file.

In a very real sense, the prompts *are* the specification of the agent's intelligence.

## The largest file is the UI, not the AI

Despite the project being famous (inside its own documentation) for its sophisticated 6-stage Local Agent, the single largest source file by a significant margin is the UI component:

- `src/features/timetable/TimetableApp.tsx` — 2,982 lines

This file contains the entire interactive scheduling canvas, assignment grid, quick-import text parsing integration, Excel export, live agent progress panel, and settings modal wiring. The agent orchestrator (`local-agent.ts`) is only 582 lines — less than one-fifth the size.

This is a common pattern in sophisticated AI tooling: the "boring" UI that makes the magic usable often ends up being the biggest piece of code.

## GitNexus is treated like a linter

The project does not just *recommend* using GitNexus for impact analysis. The guidelines in `AGENTS.md` and `CLAUDE.md` use capital letters and the word "MUST":

> **MUST run impact analysis before editing any symbol.**

This is enforced culturally the same way a team might enforce "run the linter before committing." The fact that the project invested in GitNexus indexing (it reports 1,861 symbols and 2,746 relationships) and then made its use a non-negotiable part of the workflow is unusual and noteworthy.

## The "Fix BE" commit message pattern

A large number of commits in the recorded history carry the laconic message "Fix BE" (Backend).

This appears to be the team's shorthand for "something in the Python execution path, validator, bridge, or agent orchestration was broken after the last change and now it is less broken." The frequency of these commits during the late-May constraint expansion period gives a sense of how much iteration was required to make 17 new constraint kinds work reliably across the TypeScript ↔ Python boundary.

## The harness-cli binary that is 3.5 MB and gitignored

In the recent delta, a new file appeared: `scripts/bin/harness-cli` (3,510,720 bytes).

It was immediately added to `.gitignore`. This is almost certainly a compiled test harness or benchmark binary (possibly related to the concurrency or provider smoke harnesses in `scripts/`). The fact that it was generated during development and then explicitly excluded from version control is another data point in the project's evolving hygiene standards.

## The solver skeleton is duplicated on purpose

There are two identical copies of the solver skeleton:

- `python/templates/solver_skeleton.py`
- `public/templates/solver_skeleton.py`

The first is used at runtime by the Python execution host. The second is served to the browser via the `/api/ai/solver-skeleton` route so that the Coder stage (running in the browser) can see the current template it is supposed to complete.

A build step (`scripts/sync_solver_template.mjs`, invoked as `presync:skeleton`) keeps them in sync. This duplication is intentional and documented; changing the skeleton requires updating the source and letting the sync script propagate it.

---

These facts are offered in the spirit of curiosity, not as formal documentation. They illustrate the personality of a young but unusually disciplined codebase that reset itself completely, added 17 sophisticated scheduling rules in a single commit, deleted its own 17k-line context dump, and then wrote a wiki about the experience — all within 16 days of calendar time.
