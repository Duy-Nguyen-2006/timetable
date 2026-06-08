# US-006 Suggestion-to-Wizard Slice

## Status

implemented

## Lane

normal

## Product Contract

The built-in suggestion assistant is available inside the built-in constraint
authoring panel. When the user enters a sentence and the deterministic assistant
is confident, the UI shows a Vietnamese wizard path and can open the built-in
wizard with the suggested type and fields already filled. If confidence is low,
the UI routes the sentence to Custom mode instead.

## Relevant Product Docs

- `REFACTOR_PLAN.md`
- `docs/ARCHITECTURE.md`

## Acceptance Criteria

- Built-in mode has a helper input for finding a built-in wizard path.
- High-confidence suggestions show severity, scope, constraint label, and
  prefilled params in user-facing labels.
- Applying a high-confidence suggestion opens the wizard with the suggested
  template and params.
- Low-confidence, ambiguous, or complex suggestions show a Custom fallback.
- Switching to Custom carries over the helper text.
- Prefill mapping is covered by unit tests and does not modify shared form
  defaults.

## Design Notes

- Commands: `npx gitnexus analyze`, `npm run test:grep -- built-in-suggestion`,
  `npm run test:grep -- constraint-wizard-prefill`, `npx tsc --noEmit`,
  `npm run lint`, `npm test`.
- Queries: GitNexus impact checks for `ConstraintInputPanel`,
  `ConstraintWizardDialog`, `suggestBuiltInConstraint`, and
  `defaultFormValues`.
- API: no route changes.
- Tables: no database changes.
- Domain rules: the assistant does not create final constraints; it only
  pre-fills the deterministic wizard.
- UI surfaces: built-in helper in `ConstraintInputPanel` and prefill handling in
  `ConstraintWizardDialog`.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | `npm run test:grep -- built-in-suggestion`; `npm run test:grep -- constraint-wizard-prefill`; `npm test` |
| Integration | Type/lint proof: `npx tsc --noEmit`; `npm run lint` |
| E2E | Not covered in this slice |
| Platform | Not covered in this slice |
| Release | Not covered in this slice |

## Harness Delta

No Harness policy changes were required.

## Evidence

- `npm run test:grep -- built-in-suggestion` passed: 6 tests.
- `npm run test:grep -- constraint-wizard-prefill` passed: 3 tests.
- `npx tsc --noEmit` passed.
- `npm run lint` passed.
- `npm test` passed: 278 tests.
- `npx gitnexus analyze` reported the index already up to date after edits.
