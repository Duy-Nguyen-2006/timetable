# US-017 Parse Pipeline IR-First Shadow Logging

## Status

implemented

## Lane

normal

## Product Contract

The parse pipeline must run the IR-first parser in shadow mode alongside the legacy parser and log divergence without changing the user-visible legacy parse result.

## Relevant Product Docs

- `docs/product/constraint-engine.md`
- `docs/ARCHITECTURE.md`
- `PLAN.md`

## Acceptance Criteria

- `runParsePipeline` invokes IR-first parsing after legacy slot-fill/back-translation output is assembled.
- Shadow logging compares legacy specs/status with IR-first specs/status through the existing divergence classifier.
- Shadow logging records divergence in the default shadow logger.
- The parse result returned to the caller remains the legacy result.
- Diagnostics include the shadow divergence category for debugging.

## Design Notes

- Commands:
  - `npm run test:grep -- parse-pipeline`
  - `npm test`
  - `npm run build`
  - `npm run lint`
  - `npx gitnexus analyze`
- Queries:
  - GitNexus impact: `runParsePipeline` LOW risk in index before edit.
- API: affects internal behavior of parse pipeline; no response shape changes.
- Tables: no database changes.
- Domain rules: shadow mode must never override authoritative legacy output before Phase 4 flip.
- UI surfaces: no direct UI changes; diagnostics get an additional `shadow=...` message.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | `npm run test:grep -- parse-pipeline`; `npm test` |
| Integration | `npm run build`; `npx gitnexus analyze`; `gitnexus_detect_changes(scope=all, repo=timetable)` |
| E2E | Not covered in this slice |
| Platform | Not covered in this slice |
| Release | Not covered in this slice |

## Harness Delta

The required `scripts/bin/harness-cli query matrix` command remains unavailable because `scripts/bin/harness-cli` is missing in this checkout. Proof is recorded in markdown.

## Evidence

- `npm run test:grep -- parse-pipeline`: passed 11 tests.
- `npm test`: passed 553 tests.
- `npm run build`: passed.
- `npm run lint`: passed.
- `npx gitnexus analyze`: repository indexed successfully (6,215 nodes, 10,326 edges, 300 flows).
- `gitnexus_detect_changes(scope=all, repo=timetable)`: medium risk; affected flows limited to `RunParsePipeline → ...` paths and intended shadow logging behavior.
