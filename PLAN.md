# Constraint Engine Refactoring Plan

## Status: Phase 0 ✅ COMPLETE

Phase 0 of the constraint engine refactoring has been **fully implemented and verified**.

---

## Phase 0 Implementation Summary

| Item | Location | Status |
|------|----------|--------|
| Dangerous fallback override removed | `analyze-constraint-service.ts:547-671` | ✅ **DONE** |
| Vague `general_meaning` removed | `constraint-clarification.ts:88-115` | ✅ **DONE** |
| Negative semantic guard | `negative-guard.ts` | ✅ **DONE** |
| Require-family kinds added | `constraint-registry.ts:111-113` | ✅ **DONE** |
| userFeedback in reparse | `ReparseRejectedConstraintRequest` | ✅ **DONE** |
| Frozen regression tests | `golden-eval-set-v2.test.ts` | ✅ **DONE** |
| Disambiguation table | `disambiguation-table.ts` | ✅ **DONE** |

---

## Implementation Details

### 1. Dangerous Fallback Override (Phase 0.1)

**File**: `src/features/timetable/ai/analyze-constraint-service.ts`

**Key changes** (lines 547-671):
- Deterministic fallback is ONLY permitted in catch block (LLM infrastructure failure)
- All fallback results capped at `confidence: 'medium'`
- All fallback results forced `requiresConfirmation: true`
- Negative guard runs on fallback specs too

```typescript
// Phase 0.1: deterministic fallback is ONLY permitted when the LLM call
// actually FAILED. We MUST NOT silently override a needs_clarification
// or low-confidence LLM answer with the rule parser's guess.
```

### 2. Vague Question Removal (Phase 0.5)

**File**: `src/features/timetable/ai/constraint-clarification.ts`

**Key changes** (lines 88-115):
- Removed `general_meaning` fallback
- All clarification questions are concrete A-or-B choices
- Derived from candidate specs via humanizer
- Last resort: `pick_domain` with concrete options

### 3. Negative Semantic Guard (Phase 0.3)

**File**: `src/features/timetable/ai/negative-guard.ts`

**Features**:
- `REQUIRE_MARKERS`: phải có, cần có, ít nhất, có ít nhất, bắt buộc có, phải được
- `BLOCK_MARKERS`: không, cấm, nghỉ, đừng, tránh, né
- Demotes confidence to `medium` and forces confirmation on mismatch
- Forces `needs_clarification` on self-contradicting sentences (both markers present)

### 4. Require-Family Kinds

**File**: `src/features/timetable/ai/constraint-registry.ts` (lines 111-113)

```typescript
// Phase 0 require-family: positive at-least constraints.
{ kind: 'teacher_required_period', label: 'Teacher required period', ... }
{ kind: 'class_required_period', label: 'Class required period', ... }
{ kind: 'subject_required_period', label: 'Subject required period', ... }
```

### 5. Reparse with userFeedback (Phase 0.4)

**File**: `src/features/timetable/ai/constraint-reparse-service.ts`

**Added field**:
```typescript
export type ReparseRejectedConstraintRequest = {
  // ...
  /** Phase 0.4: explicit user feedback - takes PRIORITY over raw text */
  userFeedback?: string;
};
```

### 6. Frozen Regression Tests

**File**: `src/features/timetable/ai/golden-eval-set-v2.test.ts`

**Frozen cases**:
- G2-FROZEN-001: "Cô Thủy phải có ít nhất 1 tiết 4 trong tuần" → atLeastDaysTeaches
- G2-FROZEN-002: "Thủy phải có tiết 4" (shorter form)
- G2-FROZEN-003: "Cô Thủy chỉ dạy tiết 4" → forallDaysTeachesInPeriods
- G2-FROZEN-004: "Cô Thủy không dạy tiết 4" → notForallDaysTeaches

### 7. Disambiguation Table

**File**: `src/features/timetable/ai/disambiguation-table.ts`

**Features**:
- Versioned (DISAMBIGUATION_TABLE_VERSION = '1.0.0')
- Canonical mappings for Vietnamese phrases
- D001: "phải có" → require; "không dạy" → block
- D004: "chỉ dạy" → only (allowed_periods)

---

## Verification Results

- ✅ All 535 tests pass
- ✅ Build succeeds
- ✅ GitNexus analyze completed (6,124 symbols, 10,173 edges, 300 flows)
- ✅ Committed and pushed to master

---

## Remaining Phases

### Phase 1: IR V1.1 + bảng disambiguation (2–3 tuần)

1. IR V1.1 extension (session, before/after, gap)
2. IR Type Checker (TS)
3. Humanizer V2
4. Kind → IR adapters with parity tests

### Phase 2: Parser IR-first (2–3 tuần, chạy SHADOW MODE)

1. Tier-1 pattern table output IR trực tiếp
2. Tier-2 LLM prompt mới: output IR JSON
3. Shadow mode: pipeline mới chạy song song pipeline cũ
4. Golden set V2: dual-key kind+IR

### Phase 3: Compiler & hiệu năng (2 tuần)

1. ir_compiler.py phủ V1.1
2. Rewrite pass trước compile
3. Soft constraints: thang weight
4. Capability map versioned

### Phase 4: Flip + UI (1–2 tuần)

1. Bật parser IR-first làm đường chính
2. Confirm UI: preview = humanText từ IR
3. Solve gate: chỉ nhận confirmed có `expr` valid
4. Migration dữ liệu user đã lưu

### Phase 5: Decommission & cleanup (1 tuần)

1. Xóa `pythonPredicate` khỏi mọi đường nhận input
2. Built-in registry chỉ còn vai trò template UI + macro selection
3. Gỡ các fallback override đã vô hiệu ở P0
