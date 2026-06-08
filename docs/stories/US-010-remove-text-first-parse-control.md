# US-010 Remove Text-First Parse Control

## Status

implemented

## Lane

normal

## Product Contract

The main constraint review UI no longer exposes the old text-first parse action.
Users create built-ins through the wizard or suggestion helper, and custom rules
through the custom normalization flow.

## Relevant Product Docs

- `REFACTOR_PLAN.md`
- `docs/ARCHITECTURE.md`

## Acceptance Criteria

- The review panel no longer shows the `Phân tích ràng buộc` button.
- `TimetableApp` no longer wires normal UI flow to `runParse`.
- Stale user-facing copy no longer tells users to press the old parse button.
- Legacy parser services remain available for API/migration/internal uses.

## Design Notes

- Commands: GitNexus impact checks for `ConstraintReviewPanel`,
  `ConstraintDraftCard`, and `App`.
- API: no route changes.
- Tables: no database changes.
- UI surfaces: `ConstraintReviewPanel`, `ConstraintDraftCard`, and preflight
  copy.

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
