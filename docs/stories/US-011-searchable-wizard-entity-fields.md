# US-011 Searchable Wizard Entity Fields

## Status

implemented

## Lane

normal

## Product Contract

Built-in create and edit forms support searchable entity pickers for teachers,
subjects, classes, and assignments. Search is case-insensitive,
Vietnamese-diacritic-insensitive, supports partial matches, and shows an empty
state when no option matches.

## Relevant Product Docs

- `REFACTOR_PLAN.md`
- `docs/ARCHITECTURE.md`

## Acceptance Criteria

- Teacher fields are searchable in create/edit forms.
- Subject fields and subject multi-select fields are searchable.
- Class fields are searchable.
- Assignment single-select and multi-select fields are searchable.
- Search supports Vietnamese diacritic-insensitive partial matching.
- Empty search results show normal-language empty state text.

## Design Notes

- Commands: GitNexus impact check for `TemplateFields`.
- API: no route changes.
- Tables: no database changes.
- UI surfaces: `TemplateFields`, `GenericFields`, and `IfThenFields` in
  `ConstraintEditDialog.tsx`, reused by the built-in creation wizard.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | `npm test` |
| Integration | `npm run lint`; `npx tsc --noEmit` |
| E2E | Not covered in this slice |
| Platform | Not covered in this slice |
| Release | Not covered in this slice |

## Harness Delta

No Harness policy changes were required.

## Evidence

- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm test` passed: 288 tests.
