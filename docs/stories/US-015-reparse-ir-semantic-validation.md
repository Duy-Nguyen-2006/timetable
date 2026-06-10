# US-015 Reparse IR Semantic Validation

## Status

implemented

## Lane

normal

## Product Contract

When the AI reparse loop returns a `custom_dsl` constraint with an IR `expr`, the candidate must be schema-valid and semantic-valid for the current timetable input before it can become a confirmable draft.

## Relevant Product Docs

- `docs/product/constraint-engine.md`
- `docs/ARCHITECTURE.md`
- `PLAN.md`

## Acceptance Criteria

- Hard `custom_dsl` reparse candidates without `expr` remain unsupported.
- `custom_dsl.params.expr` must pass IR schema validation.
- `custom_dsl.params.expr` must pass semantic type checking against `AgentInputPayload`.
- Unknown entities in reparse IR return unsupported/hard-unchecked issues.
- Out-of-range periods in reparse IR return unsupported/hard-unchecked issues.
- Valid custom IR remains accepted by the reparse validator.

## Design Notes

- Commands:
  - `npm run test:grep -- reparse-candidate-validator`
  - `npm test`
  - `npm run build`
  - `npm run lint`
  - `npx gitnexus analyze`
- Queries:
  - GitNexus impact: `validateReparseCandidateSpecs` LOW risk; no upstream impacted processes.
- API: indirectly affects `POST /api/ai/reparse-constraint` by rejecting invalid custom IR earlier, but no route shape changes.
- Tables: no database changes.
- Domain rules: reparse cannot use `custom_dsl.params.expr` as a bypass around IR type checking.
- UI surfaces: invalid reparse candidates surface as unsupported/needs-review issues instead of confirmable drafts.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | `npm run test:grep -- reparse-candidate-validator`; `npm test` |
| Integration | `npm run build`; `npx gitnexus analyze`; `gitnexus_detect_changes(scope=all, repo=timetable)` |
| E2E | Not covered in this slice |
| Platform | Not covered in this slice |
| Release | Not covered in this slice |

## Harness Delta

The required `scripts/bin/harness-cli query matrix` command remains unavailable because `scripts/bin/harness-cli` is missing in this checkout. Proof is recorded in markdown.

## Evidence

- `npm run test:grep -- reparse-candidate-validator`: passed 7 tests.
- `npm test`: passed 547 tests.
- `npm run build`: passed.
- `npm run lint`: passed.
- `npx gitnexus analyze`: repository indexed successfully (6,183 nodes, 10,272 edges, 300 flows).
- `gitnexus_detect_changes(scope=all, repo=timetable)`: HIGH risk because the intentional fail-closed change affects central reparse API flows (`POST → ...`, `RejectAndReparse → ...`). Validation evidence above covers the new accept/reject behavior.
