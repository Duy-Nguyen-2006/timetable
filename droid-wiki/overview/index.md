# Tack Timetable

Active contributors: Duy

## Purpose

Tack Timetable is an AI-assisted timetable generator for schools. It lets users enter teacher, subject, class, and assignment data, express scheduling constraints in plain language or structured form, and receive a feasible timetable produced by a local AI agent that writes and runs Python code against OR-Tools.

The system runs entirely on the user's machine or in a controlled sandbox. No LLM-generated code ever executes with host privileges. A six-stage pipeline (Translator, Planner, Coder, Sandbox execution, Validator, Repair) turns natural language into validated schedules with bounded retries and deterministic checks.

## Key concepts

- **Local Agent pipeline**: The core automation. It translates constraints, plans the model, generates solver code, executes it safely, validates the output, and repairs violations when needed.
- **Constraint system**: 46 built-in constraint kinds covering teachers, subjects, classes, assignments, sessions, and conditional rules. Constraints can be hard, soft, or informational.
- **Sandbox execution**: Generated Python runs inside Docker (preferred) or bubblewrap. The host never trusts code produced by the language model.
- **Deterministic validation**: After every solver run the system re-checks every constraint using a separate checker library. The solver result is never accepted on trust alone.

## Where to go next

- Read the [Architecture](architecture.md) page for the full system diagram and data flow.
- Follow [Getting started](getting-started.md) to run the app locally.
- Consult the [Glossary](glossary.md) for precise definitions of the terms used throughout this wiki.
- Explore the [AI Pipeline](../systems/ai-pipeline/index.md) to understand the six stages in depth.
- See the [Constraint System](../features/constraint-system.md) for the complete list of supported rules.

## Quick links

- Main UI entry: `src/app/page.tsx` and `src/features/timetable/TimetableApp.tsx`
- Agent orchestrator: `src/features/timetable/ai/local-agent.ts`
- Python execution host: `python/code_executor.py`
- Solver skeleton template: `python/templates/solver_skeleton.py` (and its public copy)
- Sandbox documentation: `sandbox/README.md`
