# US-013 IR Type Checker Binding Semantics

## Status

implemented

## Lane

normal

## Product Contract

Constraint IR semantic validation must understand quantifier placeholders emitted by kind-to-IR adapters while still failing closed for unknown entities, unknown days/sessions, out-of-range periods, and placeholder/domain mismatches.

## Relevant Product Docs

- `docs/product/constraint-engine.md`
- `docs/ARCHITECTURE.md`
- `PLAN.md`

## Acceptance Criteria

- `$$D$$` or equivalent placeholders bound by an enclosing `days` quantifier are accepted in atom day fields.
- `$$P$$` or equivalent placeholders bound by an enclosing `periods` quantifier are accepted in atom period fields.
- `$$C$$` or equivalent placeholders bound by an enclosing `classes` quantifier are accepted in class fields.
- Placeholders used in the wrong domain are rejected with an `invalid_binding` issue.
- `classBusy` and `classSubjectAt` validate concrete day/period ranges, not only entity existence.
- Kind-to-IR adapter outputs are checked for semantic validity against representative `AgentInputPayload` fixtures.
- Existing Phase 0 frozen and golden constraint tests keep passing.

## Design Notes

- Commands:
  - `npm run test:grep -- ir-type-checker`
  - `npm run test:grep -- kind-to-ir`
  - `npm test`
  - `npm run build`
  - `npx gitnexus analyze`
- Queries:
  - GitNexus impact: `checkBoolExpr`, `checkIntExpr`, `typeCheckIR` all LOW risk.
- API: no public HTTP route changes.
- Tables: no database changes.
- Domain rules: semantic IR validation is now binding-aware and fail-closed for domain mismatches.
- UI surfaces: no direct UI changes.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | `npm run test:grep -- ir-type-checker`; `npm run test:grep -- kind-to-ir`; `npm test` |
| Integration | `npm run build`; `npx gitnexus analyze`; `npx gitnexus detect-changes --repo timetable` |
| E2E | Not covered in this slice |
| Platform | Not covered in this slice |
| Release | Not covered in this slice |

## Harness Delta

The required `scripts/bin/harness-cli query matrix` command could not run because `scripts/bin/harness-cli` is missing in this checkout. This story records the proof in markdown instead of durable CLI records.

## Evidence

- `npm run test:grep -- ir-type-checker`: passed 17 tests.
- `npm run test:grep -- kind-to-ir`: passed 10 tests, including semantic type-checking of representative adapter outputs.
- `npm test`: passed 544 tests.
- `npm run build`: passed.
- `npm run lint`: passed.
- `npx gitnexus analyze`: repository indexed successfully (6,166 nodes, 10,241 edges, 300 flows).
- `gitnexus_detect_changes(scope=all, repo=timetable)`: low risk for the adapter proof slice; no affected execution processes.
