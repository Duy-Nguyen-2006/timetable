# Task 8 — Final Wire + Golden Tests

## Agent: PR8
## Status: Completed

### What was done:
1. Modified `parse-pipeline.ts` to wire all new pipeline stages together
2. Created `golden-v2.test.ts` with comprehensive golden tests for G1-G4

### Changes to parse-pipeline.ts:
- Added 5 new imports: ConstraintSegment, shouldRunSelfConsistency, stripUnknownKindParams, verifyRoundTrip, buildInterpretationConfirm, InterpretationCardDTO, humanizeConstraintSpec
- Updated `ParsePipelineStage` type with 'self_consistency' | 'verify' | 'clarify'
- Added 6 new fields to `ParsePipelineResult`: selfConsistencyRun, unanimous, verifyPassed, strippedFields, interpretationCard?, requiresClarification
- Added Stage 4.5 (self-consistency diagnostic), Stage 4.7 (verify strip + round-trip), clarification determination, interpretation card building
- Updated early return and final return to include new fields

### New file: golden-v2.test.ts
- 18 tests in 5 suites covering G1 (illustration trap), G2 (if-then compound), G3 (typo+negation), G4 (ambiguous entity), 4 Guide Rules
- All 18 tests pass
- All existing tests pass (no regressions)
