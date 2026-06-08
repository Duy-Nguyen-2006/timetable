# US-009 Custom Solver Adapter

## Status

implemented

## Lane

normal

## Product Contract

Normalized custom constraints can be confirmed as `custom_dsl` specs. Confirmed
hard custom specs pass preflight into the existing AI-coded solver path, while
unknown hard kinds still fail closed.

## Relevant Product Docs

- `REFACTOR_PLAN.md`
- `docs/ARCHITECTURE.md`

## Acceptance Criteria

- Normalized custom drafts create a `custom_dsl` spec with original text,
  normalized text, detected entities, and custom source metadata.
- Custom drafts that need clarification do not create specs.
- Confirmed hard `custom_dsl` specs pass `validateConfirmedSolveRequest`.
- Unknown hard kinds still fail preflight before solver execution.
- Solve route keeps returning 400 for unknown hard kinds.

## Design Notes

- Commands: GitNexus impact checks for `assertSolvableConstraintState`,
  `confirmedFromDraftsAfterUserAccept`, and
  `buildCustomDraftFromNormalization`.
- API: no new route; existing solve gate behavior changed.
- Tables: no database changes.
- Domain rules: hard custom constraints are not treated as built-ins; they enter
  the AI-coded custom path.
- UI surfaces: custom review cards can now confirm normalized custom drafts.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | `npm run test:grep -- custom-normalization-draft`; `npm run test:grep -- solver-constraint-gate`; `npm run test:grep -- solve-route` |
| Integration | `npm run lint`; `npx tsc --noEmit` |
| E2E | Not covered in this slice |
| Platform | Not covered in this slice |
| Release | Not covered in this slice |

## Harness Delta

No Harness policy changes were required.

## Evidence

- `npm run test:grep -- custom-normalization-draft` passed: 3 tests.
- `npm run test:grep -- solver-constraint-gate` passed: 5 tests.
- `npm run test:grep -- solve-route` passed: 2 tests.
- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm test` passed: 288 tests.
