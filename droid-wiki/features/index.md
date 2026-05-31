# Features

Active contributors: Duy

## Purpose

Features are the user-visible and developer-visible capabilities that span multiple internal systems.

In Tack Timetable there are two primary top-level features:

- **Scheduling Wizard** — the interactive canvas where users enter data, write constraints, run the AI agent, review results, and export timetables.
- **Constraint System** — the domain model of 35+ built-in scheduling rules (teacher, subject, class, assignment, conditional) with natural-language parsing and deterministic enforcement.

These two features together deliver the core product value: "describe what you need in plain language → get a validated, correct timetable."

## Current feature pages

- [Scheduling Wizard](scheduling-wizard.md) — the main TimetableApp UI, quick-import flow, agent progress, Excel export, provider settings.
- [Constraint System](constraint-system.md) — the 35 ConstraintKind values, severity model, translator + fallback parsing, flow through the agent pipeline, and validation coverage.

## How features relate to systems

```
Scheduling Wizard (UI)
        │
        ▼
AI Pipeline (6 stages)
        │
        ├── Translator → Constraint System (parsing)
        ├── Planner / Coder
        ├── Python Execution (sandbox)
        └── Validation (deterministic checkers from Constraint System)
        │
        ▼
Validated timetable + violations
```

The Constraint System is both a feature (users write constraints) and a cross-cutting concern (every stage of the pipeline and both validator implementations depend on it).

## Adding new features

When a new capability is introduced that users will see or configure (new constraint categories, new UI flows, new export formats, new solver profiles, etc.), it should receive its own page under `features/`.

Cross-cutting technical work that does not directly expose new user behavior (e.g., adding a new internal stage, changing the sandbox dispatcher, refactoring the repair loop) belongs under `systems/` instead.

See the [AI Pipeline](../systems/ai-pipeline/index.md) and [Python Execution](../systems/python-execution.md) pages for the machinery behind the features.
