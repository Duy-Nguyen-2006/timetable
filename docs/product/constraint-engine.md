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

This keeps kind-to-IR adapters such as `teacher_required_period` valid while rejecting mismatched placeholders like using `$$D$$` (bound to days) as a class name.
