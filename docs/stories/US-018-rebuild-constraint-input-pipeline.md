# US-018 Rebuild Constraint Input Pipeline

## Status

implemented

## Lane

high-risk

## Product Contract

Vietnamese free-text constraints must pass through an LLM-centric segment and slot-fill pipeline, deterministic verification, and user clarification before any uncertain IR reaches the scheduler.

## Relevant Product Docs

- `docs/product/constraint-engine.md`

## Acceptance Criteria

- Segment text into normalized Vietnamese, shared scope, optional IF clause, THEN atoms, and dropped illustration spans.
- Slot-fill maps only to known built-in kinds or `custom`; invalid schema, custom semantics, low confidence, and extra fields fail closed into clarification.
- Compound and if-then inputs use self-consistency and always require `confirm_interpretation` before commit.
- Entity resolution chooses exact matches before fuzzy matches; multiple fuzzy candidates require `ambiguous_entity`.
- Solver admission rejects unresolved custom, low-confidence, unconfirmed, or unverified hard constraints.
- G1, G2, G3, and G4 golden cases pass.

## Design Notes

- Commands: `npm test`, `pytest`, focused `npm run test:grep` golden tests.
- Queries: GitNexus impact for parser, resolver, clarification, and solver gate symbols.
- API: parser/reparse DTOs gain confirm-interpretation metadata without hardcoding model/provider.
- Domain rules: resolver hints are advisory; illustration spans cannot become hard params.
- UI surfaces: constraint review renders interpretation cards and full constraint tree highlights.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-018 --unit 1 --integration 1 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | `npm test`; focused parser, resolver, clarification, gate, and UI tests |
| Integration | `pytest`; solve gate tests |
| E2E | Not required for this slice |
| Platform | Not required |
| Release | Branch push to `gpt` |

## Harness Delta

No harness policy changes expected. This story records the large Plan.md implementation scope for future traceability.

## Evidence

- `npm test`: passed 765 tests.
- `pytest`: passed 48 tests.
- `npx tsx --test --test-name-pattern G1 src/features/timetable/ai/constraint-pipeline-golden.test.ts`: passed 1 test.
- `npx tsx --test --test-name-pattern G2 src/features/timetable/ai/constraint-pipeline-golden.test.ts`: passed 1 test.
- `npx tsx --test --test-name-pattern G3 src/features/timetable/ai/constraint-pipeline-golden.test.ts`: passed 1 test.
- `npx tsx --test --test-name-pattern G4 src/features/timetable/ai/constraint-pipeline-golden.test.ts`: passed 2 tests.
- `npm run lint`: passed.
- SonarQube local server reached `UP`; scan upload not run because no local `SONAR_TOKEN` was configured.
