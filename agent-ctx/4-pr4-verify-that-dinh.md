# Task 4 — PR4: Verify tất định (deterministic verification)

## Agent: PR4

## Summary
Strengthened the deterministic verification layer with two capabilities:
1. **Field stripping** (`stripUnknownKindParams`) — 2nd illustration trap layer that strips unknown/extra fields from IR atom params
2. **Round-trip verification** (`verifyRoundTrip`) — validates IR shape + humanizer consistency

## Files Modified
- `src/features/timetable/ai/ir-type-checker.ts`:
  - Added imports: `validateIR` from `./constraint-ir`, `humanizeIR` from `./ir-humanizer-v2`
  - Added `KNOWN_PARAMS_BY_KIND` constant (55+ atom kinds → known param field sets)
  - Added `StripResult` type and `stripUnknownKindParams()` function
  - Added `RoundTripResult` type and `verifyRoundTrip()` function

## Files Created
- `src/features/timetable/ai/ir-verify.test.ts` — 7 tests for `stripUnknownKindParams`

## Test Results
- New tests: 7/7 pass
- Existing tests: 28/28 pass (no regressions)

## Key Design Decisions
- Unknown kinds (e.g., `custom_dsl`) are NOT stripped — they pass through unchanged
- `verifyRoundTrip` checks shape validation + humanizer output quality (not full re-parse, which would require LLM)
- `KNOWN_PARAMS_BY_KIND` is a comprehensive registry covering teacher, subject, class, assignment, and if_then kinds
