# Walkthrough — Mission `mis_c5c4ca8d`

> **Mục tiêu gốc:** Sửa lỗi AI không hiểu được ràng buộc phức tạp (tiếng Việt).
> Ví dụ: *"Nếu Sơn và Hương dạy thứ 2 tiết 2 thì Dung không dạy thứ 3 tiết 1"*
> Hệ thống hiểu sai thành *"Nếu (điều kiện chưa xác định) thì ..."*.

Mission ID: `4d9a3c42-fa10-47d2-8bf3-1f4ade8cf933`
Repo: `/home/duy/Downloads/timetable`
Remote: `https://github.com/Duy-Nguyen-2006/timetable.git`

---

## 1. Tổng quan trạng thái

| Tier | Trạng thái | Quality gates |
|------|------------|---------------|
| **Tier 1** rule-parser-fix | ✅ Done (commit `7aebdce`) | tsc/lint/tests pass |
| **Tier 1** validation-blockers | ✅ Done (commit `25b9c31`) | tsc/lint/tests pass, smoke OK |
| **scrutiny-validator-tier1** | 🟡 in_progress | Awaiting completion review |
| **Tier 2** schema-decompose | ✅ Done (commit `d8c7eec`) | tsc/lint/213 tests pass |
| **Tier 3** predicate-exec | ✅ Done (commit sắp tới) | tsc/lint/213 TS + 13 Python tests pass |
| **Tier 4** interpretation-card | ⏳ pending | Chưa bắt đầu |
| **Tier 4** pattern-cache | ⏳ pending | Chưa bắt đầu |
| **cross-tier** integration | ⏳ pending | Chưa bắt đầu |
| **user-testing-validator-tier1** | ⏳ pending | Sau khi Tier 1 review xong |

---

## 2. Các commit gần nhất (đã push lên remote)

```
25b9c31 fix(validation): resolve Tier 1 validation blockers — tsc errors, smoke port, day-id consistency
7aebdce fix(translator): preserve IF-clause period + add c8-c12 few-shot + extend humanizer
ea72315 chore(reindex): refresh GitNexus index and emit Claude Code shim
334bb30 chore(harness): install repository-harness v0 docs and apply 002 migration
b954925 chore(harness): upgrade harness-cli to v0.1.8
```

---

## 3. Tier 2 — `tier2-schema-decompose` (TIẾP THEO)

**Mục tiêu:** Mở rộng `ConditionExpr` với 3 ops mới + retry tự phân rã.

### 3.1 Files cần sửa

| File | Thay đổi |
|------|----------|
| `src/features/timetable/ai/constraint-spec.ts` | Thêm 3 union members vào `ConditionExpr` |
| `python/validator_engine.py::_evaluate_condition` | Thêm 3 case cho 3 ops mới |
| `python/templates/solver_skeleton.py::_build_condition_literal` | Thêm 3 case builder cho CP-SAT |
| `prompts/translator.system.md` | Thêm workflow Schema-decompose, ví dụ VN |
| `src/features/timetable/ai/translator.ts::runTranslatorTurn` | Thêm self-decompose retry (1 lần, text.length > 30) |
| `src/features/timetable/ai/constraint-humanizer.ts` | Render 3 ops mới bằng tiếng Việt |
| Tests mới | and/or/not composition, retry threshold/idempotency, dedupe semantics |

### 3.2 3 ops mới của ConditionExpr

```typescript
| { op: 'teacher_pair_teaches_same_slot'; teachers: [string, string]; day: string; period: number }
| { op: 'teacher_pair_teaches_same_day'; teachers: [string, string]; day: string }
| { op: 'class_teacher_at_slot'; class: string; subject: string; day: string; period: number }
```

### 3.3 Pre-conditions check
- [x] Tier 1 merged (`fallbackFromRuleParser` đã fix IF period)
- [x] `prompts/translator.system.md` đã có Schema-decompose section
- [x] Python build clean
- [ ] `OPENROUTER_API_KEY` configured (cần cho LLM smoke VAL-T2-008)

### 3.4 Tiêu chí pass
- [ ] `_evaluate_condition` đúng cho 3 ops mới
- [ ] `_build_condition_literal` tạo BoolVar với `OnlyEnforceIf` binding
- [ ] Retry fires exactly once khi `text.length > 30`
- [ ] Retry idempotency: max 2 calls
- [ ] LLM smoke cho input `'Nếu Sơn và Hương cùng dạy thứ 2 tiết 2 thì không dạy cùng tiết các ngày khác'` → ≥2 specs, ≥1 `if_then`, 0 `custom_dsl`
- [ ] Humanizer render ops mới bằng tiếng Việt
- [ ] Regression: tất cả Tier 1 tests vẫn pass
- [ ] `dedupeConstraintSpecs` semantics test: id+original same, params different → KHÔNG collapse

### 3.5 Trạng thái hiện tại
- ✅ **DONE** — commit sẽ là `tier2-schema-decompose`
  - ✅ 3 ops mới thêm vào `ConditionExpr`: `teacher_pair_teaches_same_slot`, `teacher_pair_teaches_same_day`, `class_teacher_at_slot`
  - ✅ Python `_evaluate_condition` hỗ trợ 3 ops mới
  - ✅ Python `_build_condition_literal` tạo BoolVar với `OnlyEnforceIf` binding
  - ✅ Humanizer render 3 ops bằng tiếng Việt
  - ✅ Self-decompose retry fires exactly once khi `text.length > 30`
  - ✅ Retry idempotency: max 2 LLM calls
  - ✅ Tests: 8 new tests (3 humanizer, 2 dedupe, 3 retry)
  - ✅ Tổng: 213/213 tests pass, tsc clean, lint clean
  - ⏳ Live LLM smoke (VAL-T2-008) — cần `OPENROUTER_API_KEY` thực

---

## 4. Tier 3 — `tier3-predicate-exec`

**Mục tiêu:** Wire `pythonPredicate` execution cho `kind: 'custom_dsl'`.

### 4.1 Files cần sửa
| File | Thay đổi |
|------|----------|
| `python/validator_engine.py::validate_schedule` | Gọi `_verify_custom_predicates`, thêm `uncheckedNotes` |
| `prompts/translator.system.md` | Cho phép LLM emit `pythonPredicate` (signature: `def check(schedule, assignments) -> list[dict]`) |
| `prompts/coder.system.md` | Coder inline `def check_predicate_<id>(...)` |
| `prompts/repair.system.md` | Repair propose predicate fixes |
| Tests | AST-safety (14 forbidden names/attrs), exception handling, timeout bound |

### 4.2 Forbidden AST names/attrs
`exec`, `eval`, `compile`, `input`, `breakpoint`, `globals`, `locals`, `vars`, `print`, `__class__`, `__bases__`, `__subclasses__`, `__mro__`, `__builtins__`

### 4.3 Trạng thái hiện tại
- ✅ **DONE**
  - ✅ `validate_schedule` gọi `_verify_python_predicate` cho `custom_dsl` hard specs
  - ✅ Return shape có `uncheckedNotes` (key = spec id, value = `predicate_missing`/`predicate_unsafe`/`predicate_timeout`/`predicate_error`)
  - ✅ Return shape có `customChecks` (per-spec check result)
  - ✅ AST safety check 14 forbidden names/attrs (9 names + 5 dunder attrs)
  - ✅ Exception handling: `NameError`, `TypeError`, `ZeroDivisionError` → `predicate_error`
  - ✅ Timeout bound: 5s với SIGALRM
  - ✅ Coder prompt hướng dẫn inline `def check_predicate_<id>(...)` 
  - ✅ Repair prompt hướng dẫn predicate fix khi runtime fail
  - ✅ Translator prompt cho phép emit `pythonPredicate` (signature, allowlist)
  - ✅ 13 Python tests pass, 213 TS tests pass
  - ⏳ Live E2E solve (VAL-T3-013) — cần `OPENROUTER_API_KEY` thực

---

## 5. Tier 4 — `tier4-interpretation-card`

**Mục tiêu:** React component hiển thị 2-3 cách hiểu khác nhau khi parse không chắc chắn.

### 5.1 Files cần tạo/sửa
| File | Thay đổi |
|------|----------|
| `src/features/timetable/constraints/ConstraintInterpretationCard.tsx` | Tạo mới — pure function of props |
| `src/features/timetable/TimetableApp.tsx` | Wire vào khi trigger condition |
| `src/features/timetable/ai/constraint-humanizer.ts` | Render candidate spec bằng VN |

### 5.2 Trigger condition
`confidence: 'low'` HOẶC `kind: 'custom_dsl'` + `severity: 'hard'`

### 5.3 Test IDs (pinned)
`interpretation-card`, `interpretation-card-edit`, `interpretation-card-editor`, `cache-hit-badge`

### 5.4 Trạng thái hiện tại
- ⏳ **PENDING** — chờ Tier 3

---

## 6. Tier 4 — `tier4-pattern-cache`

**Mục tiêu:** localStorage cache tra cứu pattern ràng buộc trước khi gọi LLM.

### 6.1 Files cần tạo/sửa
| File | Thay đổi |
|------|----------|
| `src/features/timetable/ai/constraint-pattern-cache.ts` | Tạo mới |
| `src/features/timetable/TimetableApp.tsx` | Wire cache lookup TRƯỚC rule parser |
| Component card (Tier 4 trên) | Write cache on confirm |

### 6.2 Schema
```ts
{
  version: 1,
  entries: Array<{ text: string, spec: ConstraintSpec, createdAt: string }>
}
```

### 6.3 Key details
- Key: `tt:constraint-pattern-cache:v1`
- Algorithm: Jaccard similarity (whitespace + diacritic-normalized token sets), threshold 0.8
- Limit: 200 entries, LRU eviction
- Resilience: unparseable JSON → null, quota-exceeded → false

### 6.4 Trạng thái hiện tại
- ⏳ **PENDING** — chờ Tier 4 interpretation-card

---

## 7. Cross-tier — `cross-tier-integration`

**Mục tiêu:** E2E + resilience + regression xuyên suốt 4 tier.

### 7.1 Tests cần thêm
- E2E: paste 3+ constraints (1 per tier), run solver, all enforced
- E2E: paste 4 constraints (1 per tier), 1 cache entry, LLM call count đúng
- Resilience: 429/5xx → fallback, Vietnamese banner
- Resilience: missing `code_executor` binary → Vietnamese error
- Bilingual check: ≥10 Vietnamese diacritics mỗi prompt
- Regression: `pipeline_smoke_test.ts` re-runs unchanged

### 7.2 Trạng thái hiện tại
- ⏳ **PENDING** — chờ tất cả 4 tier

---

## 8. Validators

### 8.1 `scrutiny-validator-tier1` 🟡 in_progress
- Tất cả features Tier 1 đã complete
- Đã spawn review subagents: `4854cde7` (rule-parser-fix), `b7df6e91` (validation-blockers)
- Synthesizing findings → cần finalize

### 8.2 `user-testing-validator-tier1` ⏳ pending
- Sau khi scrutiny validator xong
- Spawn flow validator subagents cho testable assertions

---

## 9. Workflow thực hiện

Mỗi feature implementation sẽ theo các bước:

1. **Pre-flight check** — đọc preconditions, xác nhận baseline
2. **TDD write failing tests first** — cho mỗi expected behavior
3. **Implement** — TypeScript/Python changes
4. **Run quality gates** — `npx tsc --noEmit`, `npx eslint .`, `npx tsx --test 'src/**/*.test.ts'`
5. **Commit** — concise message + co-author footer
6. **Push to remote** — `git push origin master`
7. **Update walkthrough.md** — đánh dấu done, ghi chú issues
8. **Hand off** — tạo handoff JSON trong mission dir

---

## 10. Nhật ký tiến độ

| Ngày | Công việc | Commit/PR |
|------|-----------|-----------|
| 2026-06-06 | Walkthrough.md created | `2ae707f` |
| 2026-06-06 | 2 commits pushed (Tier 1: rule-parser-fix, validation-blockers) | `25b9c31`, `7aebdce` |
| 2026-06-06 | Tier 2: 3 new ConditionExpr ops, humanizer, retry logic, tests | `d8c7eec` |
| 2026-06-06 | Tier 3: pythonPredicate exec, AST safety, timeout, prompts | (sắp commit) |
| ... | Tier 4 sẽ tiếp tục ở đây | TBD |
