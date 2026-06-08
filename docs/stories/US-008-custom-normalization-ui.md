# US-008 Custom Normalization UI

## Status

implemented

## Lane

normal

## Product Contract

Custom mode sends each entered sentence to the custom normalization API, stores
the original custom text, and attaches a normalized review draft. The draft
shows the normalized Vietnamese sentence and clarification state, but it does
not produce built-in or solver specs in this slice.

## Relevant Product Docs

- `REFACTOR_PLAN.md`
- `docs/ARCHITECTURE.md`

## Acceptance Criteria

- Custom mode button calls the normalization route instead of importing raw text
  straight into the old parser flow.
- Enter in the custom textarea triggers normalization.
- Provider configuration is required before normalization.
- Each normalized line is added to the constraint list with a review draft.
- Normalized custom drafts keep `proposedSpecs` empty.
- Solver confirmation remains blocked until the custom solver adapter slice.

## Design Notes

- Commands: GitNexus impact checks for `ConstraintInputPanel`,
  `importConstraint`, `updateDraft`, and `App`.
- API: uses `POST /api/ai/normalize-custom-constraint`.
- Tables: no database changes.
- Domain rules: custom normalization stores semantic review text only; it does
  not silently convert custom constraints into built-ins.
- UI surfaces: `ConstraintInputPanel` custom mode and `TimetableApp` custom
  normalization handler.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | `npm run test:grep -- custom-normalization-draft`; `npm run test:grep -- custom-normalization` |
| Integration | `npm run lint`; `npx tsc --noEmit` |
| E2E | Not covered in this slice |
| Platform | Not covered in this slice |
| Release | Not covered in this slice |

## Harness Delta

No Harness policy changes were required.

## Evidence

- `npm run test:grep -- custom-normalization-draft` passed: 3 tests.
- `npm run test:grep -- custom-normalization` passed: 6 tests.
- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm test` passed: 286 tests.
