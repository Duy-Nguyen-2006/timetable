# Constraint Engine

## Contract

The constraint engine converts Vietnamese timetable constraints into deterministic `ConstraintSpec` and Constraint IR representations before solving.

## Fail-Closed Rules

- Hard constraints must be solver-encodable, carry a valid IR expression, or be rejected before solve.
- Clear Vietnamese require/block/only phrasing must not be silently inverted.
- IR shape validation is not enough: semantic validation must also check entities, days, sessions, period ranges, and quantifier placeholder bindings against the current timetable input.

## IR Type Checking

The TypeScript IR type checker validates a `ConstraintIR` against `AgentInputPayload`:

- teacher/class/subject names must exist, unless the value is a placeholder bound by an enclosing quantifier to the matching entity domain;
- day values must exist, unless the value is a placeholder bound to the `days` domain;
- period values must be positive active periods for the concrete day, unless the period is a placeholder bound to the `periods` domain;
- `classBusy` and `classSubjectAt` atoms are checked with the same day/period rules as `teaches` atoms;
- `atLeast`, `atMost`, `exactly`, `exists`, `forall`, `count`, `consecutive`, `gap`, `before`, and `after` propagate quantifier bindings into nested expressions.

## IR Humanizer V2

The deterministic IR humanizer renders supported IR shapes to Vietnamese without calling an LLM:

- `session` atoms render common session ids as Vietnamese labels (`morning` → `sáng`, `afternoon` → `chiều`);
- `before` and `after` expressions render both sides of the relation;
- `teaches`, `classBusy`, and `classSubjectAt` atoms are canonical supported shapes;
- unmatched output is reserved for genuinely unsupported shapes that need a new template.
