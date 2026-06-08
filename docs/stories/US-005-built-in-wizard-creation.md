# US-005 Built-in Wizard Creation Slice

## Status

implemented

## Lane

normal

## Product Contract

The constraint authoring screen defaults to a guided built-in wizard instead of
requiring text-first entry. Users choose severity, scope, a built-in type, fill
the deterministic fields in a modal, review the generated Vietnamese sentence,
then create a draft that can be confirmed in the existing review list.

Custom text entry remains visible as a separate mode and continues to use the
existing parse/review flow.

## Relevant Product Docs

- `REFACTOR_PLAN.md`
- `docs/ARCHITECTURE.md`

## Acceptance Criteria

- The left constraint panel exposes separate `Built-in` and `Custom` modes.
- Built-in mode opens a wizard modal with severity inherited from the picker.
- The wizard lets users choose scope, search built-in type names/examples, and
  fill the required fields through the existing deterministic form renderer.
- The modal shows a Vietnamese preview sentence before `Đồng ý`.
- Wizard-created constraints are inserted into the review panel with a
  deterministic draft and do not require LLM parsing before user confirmation.
- Custom text entry remains available and separate from built-in creation.

## Design Notes

- Commands: `npx gitnexus analyze`, `npx tsc --noEmit`, `npm run lint`,
  `npm test`, `npx gitnexus detect-changes --scope staged`.
- Queries: GitNexus impact checks for `ConstraintInputPanel`, `TemplateFields`,
  `App`, `buildContextFromAgentInput`, and `applyFormToDraft`.
- API: no route changes.
- Tables: no database changes.
- Domain rules: built-in wizard output is produced through
  `applyFormToDraft`, preserving the legacy `ConstraintSpec` adapter path.
- UI surfaces: `ConstraintInputPanel`, `ConstraintWizardDialog`, and existing
  review cards.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | Existing constraint form and review tests through `npm test` |
| Integration | Type/lint proof: `npx tsc --noEmit`; `npm run lint` |
| E2E | Not covered in this slice |
| Platform | Not covered in this slice |
| Release | Not covered in this slice |

## Harness Delta

No Harness policy changes were required. GitNexus metadata counts were refreshed
by the required analysis command.

## Evidence

- `npx tsc --noEmit` passed.
- `npm run lint` passed.
- `npm test` passed: 275 tests.
- `npx gitnexus analyze` reindexed the repo to 5,139 symbols and 250 flows.
