# Systems

Active contributors: Duy

## Purpose

Tack Timetable's internal architecture is organized into a small number of cooperating systems. These are the core building blocks that do not map 1:1 to user-facing features. They are the "how it works under the hood" layers that the rest of the application depends on.

The three primary systems are:

- **AI Pipeline** — the 6-stage Local Agent (Translator, Planner, Coder, Sandbox execution, Validator, Repair) that turns user input into validated schedules.
- **Python Execution** — the secure host (`code_executor.py`) that receives generated solver code, runs it inside a sandbox, and returns structured results.
- **Validation** — the deterministic checker engine (dual implementations in TypeScript and Python) that verifies every constraint after the solver runs.

These systems are deliberately separated from the UI and from each other so that each can be tested, reasoned about, and modified with clear blast-radius boundaries (a requirement reinforced by the project's mandatory GitNexus impact analysis rule).

## Why "systems" instead of "features"?

User-visible capabilities (the interactive scheduling canvas, natural-language constraint entry, Excel export) are documented under [Features](../features/index.md).

The systems layer contains the invisible machinery that makes those features reliable and safe:
- The AI that writes solver code
- The sandbox that protects the host from that code
- The validation layer that refuses to trust the solver output

Understanding the systems layer is essential for anyone who needs to debug agent failures, add new constraint kinds, change execution isolation, or modify the repair loop.

## Navigation

- [AI Pipeline](ai-pipeline/index.md) — the six stages, orchestration, token budgeting, bounded retries, and event model.
  - [Translator Stage](ai-pipeline/translator.md)
  - [Planner Stage](ai-pipeline/planner.md)
  - [Coder Stage](ai-pipeline/coder.md)
  - [Validation Stage](ai-pipeline/validator.md)
  - [Repair Stage](ai-pipeline/repair.md)
- [Python Execution](python-execution.md) — the execution host and sandbox contract.
- [Validation System](validation.md) — the checker implementations in Python and TypeScript.

## Cross-cutting concerns

All three systems share a few important traits:

- **Never trust the LLM or the solver alone** — every piece of generated code is syntax/AST-checked; every solver result is re-validated deterministically.
- **Narrow, auditable contracts** — `AgentInputPayload` → generated Python fragment → `result.json` + structured `ExecutionResult`.
- **Observable at every step** — the AI Pipeline emits typed events; the Python executor returns phase, status, truncated stdout/stderr, and error digests.
- **Security boundary is non-negotiable** — even in development, the default is to refuse raw host execution of LLM-written code.

## Where to start

If you are new to the internals, read the pages in this order:

1. [AI Pipeline](ai-pipeline/index.md) — this is the control center.
2. [Python Execution](python-execution.md) — how untrusted code is actually run.
3. [Validation System](validation.md) — why the system can be trusted even when the solver says "optimal".

Then dive into the individual stages as needed for debugging or extension work.
