# Reference

Active contributors: Duy

This section contains detailed reference material for configuration, data models, and external dependencies.

## Pages

- [Configuration](configuration.md) — LLM provider settings, solver profiles, sandbox mode, environment variables, CI secrets.
- [Data Models](data-models.md) — Core TypeScript interfaces that cross the entire system (`AgentInputPayload`, `ConstraintSpec` + all 35 `ConstraintKind` values, `Plan`, `ScheduleEntry`, `Violation`, `DeterministicValidationReport`, `ExecutionResult`, `LocalAgentFinalResult`, `AIProviderConfig`).
- [Dependencies](dependencies.md) — Key external libraries and why they exist (Radix + Tailwind + shadcn/ui, Zustand + React Query, OpenAI SDK, xlsx, zod, ortools, Docker/bubblewrap, relaxed ESLint rules).

These pages are intentionally dense and link-heavy. They exist so that developers (and future agents) can quickly find the exact type or configuration surface they need without reading the entire source tree.
