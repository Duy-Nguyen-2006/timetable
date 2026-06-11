# PR2 — Structured Slot-Fill

## Task ID: 2
## Agent: PR2 — Structured Slot-Fill

### Summary
Replaced the existing `extractJson` regex parsing in `parse-pipeline.ts` with structured `SlotFillResponse` schema parsing. Updated the slot-fill prompt to include the new structured output format and mandatory few-shot examples.

### Changes Made

#### 1. Modified: `slot-fill-prompt.ts`
- **SMALL_SYSTEM_PROMPT**: Updated to new version (§4.2) with rules for teacher_pair_not_same_slot, params.scope, no redundant if_then wrapping, SlotFillResponse schema reference
- **SlotFillAtom / SlotFillResponse types**: Replaced old types with new structured versions. `SlotFillResponse.condition` now has explicit fields: `{ op, teachers?, teacher?, day?, period? }`
- **SLOT_FILL_RESPONSE_SCHEMA**: Added JSON Schema constant for structured output validation
- **Few-shot examples (§4.3)**: Added FS1 (if-then đa atom), FS2 (bẫy minh hoạ), FS3 (phủ định + typo) to `buildSlotFillUserMessage`

#### 2. Modified: `parse-pipeline.ts`
- Removed `extractJson` regex function
- Removed old local `SLOT_FILL_RESPONSE_SCHEMA` (decision/kind/confidence-based)
- Added imports: `SlotFillResponse`, `SlotFillAtom`, `SLOT_FILL_RESPONSE_SCHEMA`, `parseModelJson`
- Stage 4 slot-fill parsing now uses `parseModelJson` + validates `atoms` array
- New parsing: iterates atoms, handles if_then with condition, builds individual specs per atom, custom_dsl fallback, min confidence across atoms
- Normalized text rendered as `kind(k=v) ∧ kind(k=v)` format

#### 3. Created: `slot-fill.test.ts`
- 8 tests in 3 suites covering: prompt rules, schema structure, few-shot examples, type structure (G1-G3), validation

### Test Results
- 8/8 pass
- No new TypeScript compilation errors
