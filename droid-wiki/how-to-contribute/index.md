# How to Contribute

Active contributors: Duy

This section explains how to work effectively in the Tack Timetable codebase.

## Before you start

Every task must follow the Harness workflow:

1. Read the required entry points: `README.md`, `docs/HARNESS.md`, `docs/FEATURE_INTAKE.md`, `docs/ARCHITECTURE.md`, `docs/CONTEXT_RULES.md`.
2. Run `scripts/bin/harness-cli query matrix` to see current proof status.
3. Classify the work using the intake rules (tiny / normal / high-risk).
4. Record the intake with the Harness CLI.
5. Work only inside the chosen lane.
6. Before finishing, ask whether product truth, validation expectations, or harness friction changed.
7. Record a trace.
8. Record any friction as a backlog item.

The Rust Harness CLI at `scripts/bin/harness-cli` is the primary tool for all operational records.

## Mandatory rules for code changes

- **GitNexus impact analysis is non-negotiable.** Before editing any symbol, run `gitnexus_impact` and report the blast radius. Use `gitnexus_rename` for renames. Run `gitnexus_detect_changes()` before every commit.
- The AI agent pipeline is security-critical. LLM-generated code is **never** executed on the host. All changes touching `python-bridge.ts`, `code_executor.py`, `sandbox/`, or the execution path must preserve this invariant.
- Prompts in `prompts/` are executable behavior, not documentation. Changes require prompt validation (`npm run test:prompt`).

## Where to begin

- New to the project? Start with the [Development Workflow](development-workflow.md) and [Patterns and conventions](patterns-and-conventions.md).
- Want to understand the AI loop? Read the [AI Pipeline](../systems/ai-pipeline/index.md) and the six stage pages.
- Adding or changing constraints? See the [Constraint System](../features/constraint-system.md).
- Working on the UI canvas? See the [Scheduling Wizard](../features/scheduling-wizard.md).

## Definition of done (minimum)

A task is complete only when:

- The requested change works and is covered by appropriate tests or validation.
- Relevant docs and stories are updated.
- All quick checks pass (`npm run lint`, `npm test`, `npm run test:prompt`).
- A trace has been recorded with the Harness CLI.
- Any harness friction discovered has been recorded as a backlog item.
- The final response clearly states what changed and what was intentionally left unchanged.

See the sub-pages for detailed guidance on workflow, testing, debugging, and tooling.
