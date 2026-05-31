# Tack Timetable — Fun Facts

Active contributors: Duy

A collection of the most interesting trivia and war stories from the codebase.

## The 17 kLOC ghost that lived for two weeks

In mid-May 2026 the team added a file called `repomix-output.xml`. By the time it was deleted on May 31, it had grown to **17,500 lines** and had 13 separate commits touching it.

It was a generated "everything in one file" context dump intended to help AI coding agents understand the whole project. It was added, updated, reviewed via PR, then unceremoniously removed in the same cleanup that introduced the 46-constraint expansion and the Harness operating system.

The file no longer exists in the repository, but its ghost still appears in the "most touched files" statistics from `git log`.

## 46 constraint kinds, most of which describe Vietnamese high-school reality

The `ConstraintKind` union currently contains 46 literal values. Many of them are extremely specific to the Vietnamese secondary-school scheduling problem:

- `class_no_double_subject_day` — a class should not have the same subject twice on one day
- `subject_min_gap_days` — certain subjects must have a minimum number of days between occurrences
- `teacher_no_gaps` + `class_no_gaps` — no holes in a teacher or class's daily schedule
- `if_then` + `pair_not_same_slot` — conditional logic and mutual exclusion rules that appear in real school policy documents

Roughly half of these 46 kinds were added in a single 24-hour burst on May 31, 2026 (`cdac5b5`). The translator, deterministic validator (both languages), and solver skeleton all had to be extended in lockstep.

## The AI is not allowed to run its own code on the host — ever

This is the single most strongly worded invariant in the entire project.

Even in development, to execute solver code outside a sandbox you must set **two** environment variables:

```bash
TT_SANDBOX_MODE=none
TT_SANDBOX_ALLOW_UNSAFE=1
```

The second one is deliberately verbose and scary on purpose. The code comments call it "DEV ONLY" and the dispatcher will refuse to run without it.

The security model is enforced at three different boundaries (python-bridge.ts, code_executor.py, sandbox/run.py). If any one of them is ever bypassed, the entire value proposition of "AI writes the timetable solver" collapses.

## The project has its own operating system (Harness)

On the same day the team added 17 new constraint kinds and a persistent Python daemon, they also landed multiple "Init Harness Engineering" commits.

The repo now contains:
- A Rust CLI binary at `scripts/bin/harness-cli`
- A local SQLite database (`harness.db`, gitignored)
- A full intake → story → trace → backlog workflow documented in `docs/`

This is unusually heavy process for a ~20 kLOC application. It reflects the lesson the team learned the hard way in late May: when your core loop involves LLMs writing code that must satisfy hard constraints, you need an extremely disciplined way of tracking what changed, why, and whether the proof still holds.

## The persistent daemon that made cold starts bearable

Before commit `2ca87b44`, every agent solve in the Electron desktop app would spawn a fresh Python process (with full OR-Tools import cost).

The final commit on record introduced a long-lived `--daemon` mode for `code_executor`. Jobs are now sent over stdin as JSON lines; results come back on stdout. The Python interpreter stays warm for the entire desktop session.

This single change turned "the agent feels slow on first run" into "subsequent solves are dramatically faster" without changing any of the security properties.

## The test datasets that are more than test data

There are 6 official test datasets (mentioned in commit `09893a0`). They are used both for:

- Unit/integration testing of the validator and agent loop
- Live "Dataset API tests" in CI (which spin up the dev server and hit it with real provider keys when available)

The datasets are treated as first-class artifacts. They are the closest thing the project has to a public contract for "what good input looks like."

## The rule that no one is allowed to break (even the AI writing the wiki)

`AGENTS.md` and `CLAUDE.md` both contain the same terrifying block:

> **MUST run impact analysis before editing any symbol.**  
> NEVER edit a function, class, or method without first running `gitnexus_impact` on it.

This rule is taken seriously enough that the wiki generation process itself (which is writing dozens of markdown files describing the code) was careful never to suggest a code edit without the proper analysis step having been performed first.

In a repository this interconnected, the rule is the only thing preventing a single well-meaning change from silently breaking the repair loop, the round-trip checker, or the sandbox contract six months later.
