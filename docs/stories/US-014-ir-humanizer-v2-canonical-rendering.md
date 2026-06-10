# US-014 IR Humanizer V2 Canonical Rendering

## Status

implemented

## Lane

normal

## Product Contract

The IR humanizer must render Phase 1.1 expressions deterministically in user-facing Vietnamese without generic placeholders for supported shapes.

## Relevant Product Docs

- `docs/product/constraint-engine.md`
- `docs/ARCHITECTURE.md`
- `PLAN.md`

## Acceptance Criteria

- Session atoms render known session ids (`morning`, `afternoon`) as natural Vietnamese (`sáng`, `chiều`).
- `before` and `after` expressions render both sides of the relation instead of the generic `trước/sau` placeholder.
- `teaches`, `classBusy`, and `classSubjectAt` atom renderers are treated as supported canonical shapes, not unmatched fallbacks.
- Humanizer output remains deterministic for the same IR.

## Design Notes

- Commands:
  - `npm run test:grep -- ir-humanizer-v2`
  - `npm test`
  - `npm run build`
  - `npm run lint`
  - `npx gitnexus analyze`
- Queries:
  - GitNexus impact: `humanizeIRExpr` and `humanizeIR` LOW risk; direct caller limited to `humanizeIR`.
- API: no public HTTP route changes.
- Tables: no database changes.
- Domain rules: supported IR V1.1 shapes should not ask the UI to add a template by returning `unmatched: true`.
- UI surfaces: improves future confirm preview text, no direct component change.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | `npm run test:grep -- ir-humanizer-v2`; `npm test` |
| Integration | `npm run build`; `npx gitnexus analyze`; `gitnexus_detect_changes(scope=all, repo=timetable)` |
| E2E | Not covered in this slice |
| Platform | Not covered in this slice |
| Release | Not covered in this slice |

## Harness Delta

The required `scripts/bin/harness-cli query matrix` command remains unavailable because `scripts/bin/harness-cli` is missing in this checkout. Proof is recorded in markdown.

## Evidence

- `npm run test:grep -- ir-humanizer-v2`: passed 12 tests.
- `npm test`: passed 542 tests.
- `npm run build`: passed.
- `npm run lint`: passed.
- `npx gitnexus analyze`: repository indexed successfully (6,158 nodes, 10,228 edges, 300 flows).
- `gitnexus_detect_changes(scope=all, repo=timetable)`: low risk; no affected execution processes.
