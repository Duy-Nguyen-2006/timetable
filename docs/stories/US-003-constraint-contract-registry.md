# US-003 Constraint Contract Registry Slice

## Status

implemented

## Lane

normal

## Product Contract

Constraint authoring must have a structured built-in definition registry and a
new `TimetableConstraint` contract that separates deterministic built-in
constraints from custom free-text constraints. The legacy `ConstraintSpec`
solver path remains available through adapters during the migration.

## Relevant Product Docs

- `REFACTOR_PLAN.md`
- `docs/ARCHITECTURE.md`

## Acceptance Criteria

- Built-in definitions expose kind, scope, Vietnamese label, description,
  example, required params, solver encoder status, and validator status.
- `pair_not_same_slot`, `pair_same_slot`, `mutual_exclusion`, and
  `session_limit` appear under the assignment scope for user-facing selection.
- `TimetableConstraint` parses as a discriminated union of `built_in` and
  `custom` constraints with Zod validation.
- Missing built-in params and hard constraints with weights are rejected.
- Soft built-ins keep deterministic solver compatibility with a default weight.
- Custom constraints convert only through the `custom_dsl` compatibility path.

## Design Notes

- Commands: `npm run test:grep -- timetable-constraint-contract`,
  `npm run test:grep -- constraint-form-schema`, `npm test`, `npm run lint`,
  `npm run check:parity`, `npx gitnexus analyze`.
- Queries: GitNexus impact checks for `CONSTRAINT_REGISTRY`,
  `CONSTRAINT_TEMPLATES`, `formValuesToSpecs`, `applyFormToDraft`,
  `buildContextFromAgentInput`, `defaultFormValues`, `specToFormValues`, and
  `TemplateFields`.
- API: no public HTTP route changes in this slice.
- Tables: no database changes.
- Domain rules: built-in constraints remain deterministic; custom constraints
  stay out of the built-in encoder path.
- UI surfaces: template picker grouping now places relation/session constraints
  under `Phân công`; `session_limit` uses teacher/session/max-period fields.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | `npm run test:grep -- timetable-constraint-contract`; `npm run test:grep -- constraint-form-schema`; `npm test` |
| Integration | `npm run check:parity` |
| E2E | Not covered in this slice |
| Platform | Not covered in this slice |
| Release | Not covered in this slice |

## Harness Delta

No Harness policy changes were required. This story records the first bounded
implementation slice from `REFACTOR_PLAN.md`.

## Evidence

- `npm run test:grep -- timetable-constraint-contract` passed: 7 tests.
- `npm run test:grep -- constraint-form-schema` passed: 4 tests.
- `npm test` passed: 269 tests.
- `npm run lint` passed.
- `npm run check:parity` passed: 76 checked kinds and 77 solver-encodable
  kinds.
- `npx gitnexus analyze` reported the index already up to date.
