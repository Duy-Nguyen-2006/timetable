# US-007 Custom Normalization Backend

## Status

implemented

## Lane

normal

## Product Contract

Custom mode has a backend normalization contract that preserves the original
text, returns a clear Vietnamese normalized sentence, detects only known
entities, and asks clarification or marks unsupported when the statement cannot
be made precise. It does not emit built-in kinds or solver specs.

## Relevant Product Docs

- `REFACTOR_PLAN.md`
- `docs/ARCHITECTURE.md`

## Acceptance Criteria

- Custom normalization has a typed service contract.
- API route validates request, provider config, and severity.
- Known teachers, subjects, classes, assignments, days, and periods are detected
  without inventing entities.
- Model output is filtered back to known context values.
- Vague statements return clarification questions.
- Unsupported resource-like statements do not silently pass as normalized.
- No built-in specs are produced by this custom flow.

## Design Notes

- Commands: `npx gitnexus impact parseConstraintDraftsWithRaws --direction upstream`.
- API: new `POST /api/ai/normalize-custom-constraint`.
- Tables: no database changes.
- Domain rules: this route prepares custom review text only; solver enforcement
  remains a later adapter slice.
- UI surfaces: no UI changes in this slice.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | `npm run test:grep -- custom-normalization` |
| Integration | `npm run test:grep -- normalize-custom-constraint`; `npm run lint`; `npx tsc --noEmit` |
| E2E | Not covered in this slice |
| Platform | Not covered in this slice |
| Release | Not covered in this slice |

## Harness Delta

No Harness policy changes were required.

## Evidence

- `npm run test:grep -- custom-normalization` passed: 3 tests.
- `npm run test:grep -- normalize-custom-constraint` passed: 2 tests.
- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm test` passed: 283 tests.
