# US-012 Quick Import Constraint Normalization

## Status

implemented

## Lane

normal

## Product Contract

Quick import and manual constraint entry must route simple Vietnamese timetable rules into built-in constraints before falling back to custom constraints. The UI must use Vietnamese, non-technical labels for the primary constraint workflow. Hard custom constraints that cannot be enforced by IR or Python predicate must be blocked before solve.

## Relevant Product Docs

- `REFACTOR_PLAN.md`
- `docs/ARCHITECTURE.md`

## Acceptance Criteria

- Quick import accepts Vietnamese section headers for required and preferred constraints.
- Quick import pre-normalizes high-confidence built-in constraints into review drafts.
- `Môn Văn không được 3 tiết liên tiếp` maps to `subject_max_consecutive` with `max=2`.
- Hard custom constraints without `params.expr` or `pythonPredicate` cannot reach solve.
- Primary constraint UI labels are Vietnamese and suitable for non-technical users.
- Focused unit tests cover classifier, quick import, and solve preflight behavior.

## Design Notes

- Commands: `npm test`, `npm run lint`, `npm run check:parity`, `npx gitnexus analyze`
- Queries: GitNexus impact for `parseQuickImportText`, `suggestBuiltInConstraint`, `assertSolvableConstraintState`, and `ConstraintInputPanel`.
- API: No new API route expected.
- Tables: No data model changes.
- Domain rules: Built-in classification is preferred when confidence and params are complete; custom hard must be executable or blocked.
- UI surfaces: Quick import text, constraint input panel, solve diagnostics.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | Focused tests for quick import, built-in suggestion, custom solve guard. |
| Integration | Full `npm test`, `npm run lint`, and parity check. |
| E2E | Not required for this slice. |
| Platform | Not required for this slice. |
| Release | Not required. |

## Harness Delta

No harness policy change expected.

## Evidence

- `npm test` passed 294 tests.
- `npm run lint` passed.
- `npm run check:parity` passed.
- `npm run build` passed.
- `npm run sonar:scan` uploaded to local SonarQube; open BUG count is 0.
