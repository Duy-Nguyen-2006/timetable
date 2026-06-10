# US-016 IR-First Parser Tier-1 Regression Coverage

## Status

implemented

## Lane

normal

## Product Contract

The IR-first Tier-1 parser must produce canonical IR and legacy comparison specs for common deterministic Vietnamese constraint patterns without silently dropping extracted params.

## Relevant Product Docs

- `docs/product/constraint-engine.md`
- `docs/ARCHITECTURE.md`
- `PLAN.md`

## Acceptance Criteria

- `"Thủy phải có tiết 4"` maps to `teacher_required_period` and valid `atLeast` IR.
- `"Thủy chỉ dạy tiết 2 tiết 4"` maps to `teacher_allowed_periods` and preserves `[2, 4]` in the legacy comparison spec params.
- Guard-wrapped IR-first parsing does not add guard reasons for a valid require parse.
- A disambiguation match without enough slots/entities returns `needs_clarification` instead of guessing.
- Unrelated text escalates to Tier-2 instead of producing a false positive.

## Design Notes

- Commands:
  - `npm run test:grep -- ir-first-parser`
  - `npm test`
  - `npm run build`
  - `npm run lint`
  - `npx gitnexus analyze`
- Queries:
  - GitNexus impact: `parseIRFirst`, `parseIRFirstWithGuard`, `validateIRFirstResult` all LOW risk.
- API: no public HTTP route changes; Phase 2 parser remains shadow-mode only.
- Tables: no database changes.
- Domain rules: IR-first output must not omit extracted legacy params used for shadow divergence comparison.
- UI surfaces: no direct UI changes.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | `npm run test:grep -- ir-first-parser`; `npm test` |
| Integration | `npm run build`; `npx gitnexus analyze`; `gitnexus_detect_changes(scope=all, repo=timetable)` |
| E2E | Not covered in this slice |
| Platform | Not covered in this slice |
| Release | Not covered in this slice |

## Harness Delta

The required `scripts/bin/harness-cli query matrix` command remains unavailable because `scripts/bin/harness-cli` is missing in this checkout. Proof is recorded in markdown.

## Evidence

- `npm run test:grep -- ir-first-parser`: passed 5 tests.
- `npm test`: passed 552 tests.
- `npm run build`: passed.
- `npm run lint`: passed.
- `npx gitnexus analyze`: repository indexed successfully (6,199 nodes, 10,297 edges, 300 flows).
- `gitnexus_detect_changes(scope=all, repo=timetable)`: medium risk; affected flows limited to `ParseIRFirst → NormalizeAssertion` and `ParseIRFirst → NormalizeConstraintText`.
