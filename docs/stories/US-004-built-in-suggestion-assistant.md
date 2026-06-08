# US-004 Built-in Suggestion Assistant Slice

## Status

implemented

## Lane

normal

## Product Contract

Users can type a short helper sentence and receive a built-in wizard suggestion
only when deterministic matching is confident and required parameters are
present. Ambiguous, unsupported, or complex conditional text must route to
custom mode instead of being forced into a built-in kind.

## Relevant Product Docs

- `REFACTOR_PLAN.md`
- `docs/ARCHITECTURE.md`

## Acceptance Criteria

- The suggestion contract returns either `suggest_built_in` or `use_custom`.
- Confidence below `BUILT_IN_SUGGESTION_THRESHOLD` returns `use_custom`.
- `Sơn không dạy thứ 2` suggests `teacher_block_day` with teacher and day
  params.
- Diacritic-insensitive teacher matching works for built-in suggestions.
- Ambiguous teacher mentions return `use_custom`.
- Complex if-then text returns `use_custom`.
- Daily max-period teacher text suggests `teacher_max_per_day`.

## Design Notes

- Commands: `npx gitnexus analyze`, `npm run test:grep -- built-in-suggestion`,
  `npx tsc --noEmit`, `npm test`, `npm run lint`.
- Queries: `npx gitnexus detect-changes`.
- API: no route added in this slice; this is the deterministic candidate
  extractor for Phase 4.
- Tables: no database changes.
- Domain rules: the assistant never creates final constraints; it only suggests
  wizard path and params when the strict gate passes.
- UI surfaces: no UI wiring in this slice.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | `npm run test:grep -- built-in-suggestion`; `npm test` |
| Integration | Type/lint proof: `npx tsc --noEmit`; `npm run lint` |
| E2E | Not covered in this slice |
| Platform | Not covered in this slice |
| Release | Not covered in this slice |

## Harness Delta

No Harness policy changes were required. GitNexus metadata counts were refreshed
by the required analysis command.

## Evidence

- `npm run test:grep -- built-in-suggestion` passed: 6 tests.
- `npx tsc --noEmit` passed.
- `npm run lint` passed.
- `npm test` passed: 275 tests.
- `npx gitnexus analyze` reindexed the repo, then reported up to date after
  the lint helper rename.
- `npx gitnexus detect-changes` reported low risk for metadata before staging;
  final staged scope is expected to include the new suggestion module and tests.
