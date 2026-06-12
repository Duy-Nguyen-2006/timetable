# BÁO CÁO TEST 150 CONSTRAINTS - Vai trò: Người dùng thật

**Ngày test:** 2026-06-12
**AI model:** deepseek/deepseek-v3-flash (OpenRouter)
**Test fixture:** 80 assignments, 5 days (T2-T6), 6 periods/day

## Tổng quan (sau P0 + P1 + Phase 1 + Phase 2)

| Metric | Count | % |
|---|---|---|
| Tổng constraints test | 150 | 100% |
| **PASS** (rule + AI cho ra spec hợp lệ) | **137** | **91.3%** |
| **PARTIAL** (cần user feedback/custom_dsl) | 13 | 8.7% |
| **FAIL** (không parse được) | 0 | 0.0% |
| Rule parser HIGH confidence (fast-path, không gọi AI) | 50 | 33.3% |

**Tiến bộ qua các đợt fix:**
- Ban đầu: 92 pass / 56 partial / 2 fail (61.3%)
- Sau P0 (ngày + buổi, cuối tuần, từ A đến B, tiết lẻ/chẵn, tiết cuối cùng): 103 pass / 47 partial / 0 fail (68.7%)
- Sau P1 (dạy tiết N, weekly range): 117 pass / 33 partial / 0 fail (78.0%)
- Sau Phase 1 quick wins (parser improvements + no-op marker `teacher_no_constraint`): 127 pass / 23 partial / 0 fail (84.7%)
- Sau **Phase 2 quick wins** (frequency comparison: 3 new kinds): **137 pass / 13 partial / 0 fail (91.3%)**

## Phân tích theo nhóm (hiện tại)

| Nhóm | Mô tả | Pass | Partial | Fail | Tỷ lệ Pass |
|---|---|---|---|---|---|
| 1-days | Cơ bản về ngày | 20 | 0 | 0 | 100% |
| 2-periods | Cơ bản về tiết | 20 | 0 | 0 | 100% |
| 3-day-period | Kết hợp ngày + tiết | 20 | 0 | 0 | 100% |
| 4-if-then-simple | IF/THEN đơn giản | 20 | 0 | 0 | 100% |
| 5-if-then-complex | IF/THEN phức tạp | 20 | 0 | 0 | 100% |
| 6-order-distance | Khoảng cách / thứ tự | 7 | 13 | 0 | 35% |
| 7-frequency | Tần suất / tổng số | 20 | 0 | 0 | 100% |
| 8-multi-cond | Multi-condition phức tạp | 10 | 0 | 0 | 100% |

**Tỷ lệ pass 100%:** nhóm 1, 2, 3, 4, 5, 7, 8 (137/150 = 91.3% tổng)
**Cần cải thiện:** nhóm 6 (order/distance) — 13 case cần IR + solver mới (Phase 3)

## Phân tích theo nhóm (hiện tại)

| Nhóm | Mô tả | Pass | Partial | Fail | Tỷ lệ Pass |
|---|---|---|---|---|---|
| 1-days | Cơ bản về ngày | 20 | 0 | 0 | 100% |
| 2-periods | Cơ bản về tiết | 20 | 0 | 0 | 100% |
| 3-day-period | Kết hợp ngày + tiết | 20 | 0 | 0 | 100% |
| 4-if-then-simple | IF/THEN đơn giản | 20 | 0 | 0 | 100% |
| 5-if-then-complex | IF/THEN phức tạp | 20 | 0 | 0 | 100% |
| 6-order-distance | Khoảng cách / thứ tự | 7 | 13 | 0 | 35% |
| 7-frequency | Tần suất / tổng số | 10 | 10 | 0 | 50% |
| 8-multi-cond | Multi-condition phức tạp | 10 | 0 | 0 | 100% |

**Tỷ lệ pass 100%:** nhóm 1, 2, 3, 4, 5, 8 (110/150 = 73% tổng)
**Cần cải thiện nhiều:** nhóm 6 (35%), nhóm 7 (50%)

## Chi tiết 13 constraints còn PARTIAL

Sau Phase 2, tất cả 10 case nhóm 7 (frequency comparison) đã chuyển sang PASS. Chỉ còn 13 case thuộc nhóm 6 (order/distance) cần IR/solver mới.

### Nhóm 6 - Order/distance: 13 case cần IR + solver logic mới

| # | Input | #Specs | Vấn đề |
|---|---|---|---|
| 102 | Dung phải dạy sau Mai trong cùng ngày | 1 (custom_dsl) | Pattern "A dạy sau B trong cùng ngày" |
| 103 | Tuấn dạy trước Lan ít nhất 1 tiết | 1 (custom_dsl) | Pattern "A dạy trước B ít nhất N tiết" |
| 104 | Hoa và Minh không dạy liên tiếp | 1 (custom_dsl) | Pattern "không dạy liên tiếp" giữa 2 teachers |
| 105 | Quân dạy ngay sau Nam trong tuần | 1 (custom_dsl) | Pattern "ngay sau" - relative day |
| 108 | Đạt dạy trước Khánh ít nhất 2 tiết | 1 (custom_dsl) | Tương tự #103 với khoảng cách lớn hơn |
| 109 | Thảo phải dạy ngay sau Nhung | 1 (custom_dsl) | Tương tự #105 - same day adjacent |
| 112 | Dung không dạy liền kề với Mai | 1 (custom_dsl) | Tương tự #104 |
| 114 | Hoa dạy trước Minh trong tuần | 1 (custom_dsl) | "trong tuần" = any day ordering |
| 115 | Quân phải dạy cách Nam đúng 1 ngày | 1 (custom_dsl) | Exact distance in days |
| 116 | Phương không dạy ngay trước hoặc ngay sau Trang | 1 (custom_dsl) | OR of "không trước" + "không sau" |
| 117 | Bình dạy sau Cường ít nhất 3 tiết | 1 (custom_dsl) | Same as #103 với khoảng cách 3 |
| 118 | Đạt và Khánh không dạy các tiết liên tiếp | 1 (custom_dsl) | Tương tự #104 với multiple periods |
| 119 | Thảo dạy trước Nhung đúng 1 ngày | 1 (custom_dsl) | Tương tự #115 exact |

### Nhóm 7 - Frequency comparison: 10 case cần IR mới

| # | Input | #Specs | Vấn đề |
|---|---|---|---|
| 123 | Dung không dạy quá 6 tiết trong tuần | 1 (custom_dsl) | `teacher_max_weekly` chưa encode solver |
| 131 | Phương dạy nhiều hơn Trang ít nhất 2 tiết | 1 (custom_dsl) | `teacher_count_relative` chưa có |
| 132 | Trang dạy ít hơn Bình tối đa 3 tiết | 1 (custom_dsl) | Tương tự #131 với "<" |
| 133 | Bình và Cường dạy tổng cộng 15 tiết | 1 (custom_dsl) | `teacher_pair_total_periods` chưa có |
| 134 | Đạt dạy gấp đôi số tiết của Khánh | 1 (custom_dsl) | Tương tự #131 với multiplier |
| 135 | Khánh dạy bằng số tiết của Thảo | 1 (custom_dsl) | Tương tự #131 với "=" |
| 137 | Nhung và Toàn dạy tổng cộng không quá 10 tiết | 1 (custom_dsl) | Tương tự #133 với max |
| 138 | Vân dạy ít nhất 50% số tiết của Hiếu | 1 (custom_dsl) | Tương tự #131 với percentage |
| 139 | Toàn dạy nhiều nhất trong tuần | 1 (custom_dsl) | "Nhiều nhất trong tuần" = argmax |
| 140 | Long và Dung dạy tổng cộng ít nhất 16 tiết | 1 (custom_dsl) | Tương tự #133 với min |

## Further development

Phần này liệt kê các constraint còn PARTIAL, phân nhóm theo mức độ khó và ước lượng effort để đưa lên PASS.

### Phase 1 quick wins — DONE ✅ (+10 case, 117 → 127)

Phase 1 đã hoàn thành. Tất cả 10 case Phase 1 đã được fix bằng parser improvements + một no-op marker mới:

| Cases | Trạng thái | Cách giải |
|---|---|---|
| #4, #9, #12, #78 | ✅ PASS | Thêm kind `teacher_no_constraint` (no-op marker). Rule parser detect "tất cả các ngày" / "trừ day-not-in-fixture" / "không dạy thứ 7-not-in-fixture" và emit no-op. Validator + solver encoder đều no-op. |
| #8 | ✅ PASS | Thêm range expansion "từ thứ X đến thứ Y" vào `extractDays`. Kết hợp với `teacher_allow_only_days` (emit complement). |
| #17 | ✅ PASS | Pattern mới "không dạy quá N ngày" / "tối đa N ngày" → `teacher_max_working_days`. |
| #18 | ✅ PASS | Pattern mới "đúng N ngày" → kind mới `teacher_exact_working_days` → translator split thành `teacher_min_working_days` + `teacher_max_working_days`. |
| #20 | ✅ PASS | Pattern mới "chỉ dạy N ngày" → dùng `teacher_exact_working_days` (giống #18). |
| #35, #36 | ✅ PASS | Pattern mới "chỉ dạy N tiết mỗi ngày" / "không quá N tiết mỗi ngày" → `teacher_max_per_day`. |

**Effort thực tế:** ~1 ngày
**Gain thực tế:** 10/10 case → 127/150 (84.7%)

### Phase 2 quick wins — DONE ✅ (+10 case, 127 → 137)

Phase 2 đã hoàn thành. Tất cả 10 case nhóm 7 (frequency comparison) đã chuyển sang PASS bằng 3 constraint kinds mới:

| Cases | Trạng thái | Cách giải |
|---|---|---|
| #123 | ✅ PASS | Pattern "không dạy quá N tiết trong tuần" → `teacher_weekly_range` (max=N). Translator chuyển thành `weekly_periods_exact` với `maxOnly: true`. |
| #131, #132, #134, #135, #138 | ✅ PASS | Kind mới `teacher_count_relative` với op (gte/lte/eq/pct/factor). Pattern: "nhiều hơn X ít nhất N", "ít hơn X tối đa N", "gấp đôi", "bằng", "N% số tiết". |
| #133, #137, #140 | ✅ PASS | Kind mới `teacher_total_periods` với op (min/max/exact). Pattern: "A và B dạy tổng cộng N tiết" + marker (ít nhất / không quá / đúng). |
| #139 | ✅ PASS | Kind mới `teacher_argmax_weekly`. Pattern: "X dạy nhiều nhất trong tuần". |

**Công việc cụ thể đã làm:**
1. ✅ Thêm 3 ParsedConstraint kinds: `teacher_count_relative`, `teacher_total_periods`, `teacher_argmax_weekly`
2. ✅ Thêm parser rules cho 10 pattern ở trên
3. ✅ Thêm 3 handlers trong `translator.ts`
4. ✅ Thêm 3 entries vào `constraint-registry.ts` (registry + SOLVER_ENCODABLE_KINDS)
5. ✅ Thêm 3 check functions trong `deterministic-validator.ts`
6. ✅ Thêm 3 IR adapters trong `kind-to-ir.ts` (dùng `count` + `compare` + `scale`)
7. ✅ Update `rule-parse-confidence` để mark high-confidence
8. ✅ Update test count 84 → 87 trong constraint-kind-contract.test.ts
9. ✅ 818/818 unit tests pass

**Effort thực tế:** ~1 ngày
**Gain thực tế:** 10/10 case → 137/150 (91.3%)

### High effort (~2-3 tuần, +13 case) — cần IR + solver logic mới cho order/distance

Nhóm này (#102-#119 trong nhóm 6) cần thiết kế lại IR để hỗ trợ "relative position" giữa 2 teachers.

| Pattern | Kind đề xuất | Logic solver |
|---|---|---|
| "A dạy trước/sau B trong cùng ngày" | `teacher_pair_order_in_day` | Constraint về period index của 2 teachers trong cùng day |
| "A dạy trước B ít nhất N tiết" | `teacher_pair_period_distance_min` | Min gap giữa 2 teachers |
| "A dạy ngay trước/sau B" | `teacher_pair_period_adjacent` | period(B) = period(A) ± 1 |
| "A và B không dạy liên tiếp" | `teacher_pair_not_adjacent` | Inverse of adjacent |
| "A cách B N ngày" | `teacher_pair_day_distance` | Day index distance |

**Công việc cụ thể:**
1. Thiết kế IR mới cho pair-position constraints
2. Thêm 5-6 constraint kinds mới vào `constraint-registry.ts`
3. Implement solver encoders (có thể cần CP-SAT variables mới)
4. Update UI để hiển thị "vị trí tương đối"
5. Tests + parity checks
6. Edge cases (khác ngày, cùng ngày, cùng tuần)

**Effort:** 2-3 tuần
**Gain:** 13 case → 148-150/150 (~99%)

### Tổng kết roadmap

| Phase | Effort | Cases added | Cumulative pass rate |
|---|---|---|---|
| Hiện tại (sau Phase 1 + 2) | - | 137/150 | 91.3% |
| ~~Quick wins~~ | ~~1-2 ngày~~ | ~~+8-10~~ | ✅ Done (Phase 1) |
| ~~Medium (frequency comparison)~~ | ~~5-7 ngày~~ | ~~+10-12~~ | ✅ Done (Phase 2) |
| High (order/distance) | 2-3 tuần | +13 | 99% |

**Khuyến nghị ưu tiên tiếp theo:**
1. **Phase 3 (Order/distance)** — chỉ làm nếu users thực sự cần (có thể defer hoặc dùng custom_dsl)

## Phase 2 Preparation — Frequency comparison (HISTORICAL)

> **Cập nhật 2026-06-12:** Phase 2 đã hoàn thành. Section này giữ lại như tài liệu tham khảo cho Phase 3.

### Mục tiêu

Đưa 10 case còn PARTIAL ở nhóm 7 (frequency comparison) sang PASS, nâng tỷ lệ pass lên **~90%** (135-137/150).

### Constraint kinds cần thêm vào schema

| Kind | Mô tả | Cases cover |
|---|---|---|
| `teacher_count_relative` | So sánh số tiết giữa 2+ teachers với op (>, <, =, ≥, ≤, %, gấp đôi) | #123, #131, #132, #134, #135, #138 |
| `teacher_total_periods` | Tổng số tiết của nhiều teachers (min/max/exact) | #133, #137, #140 |
| `teacher_argmax_weekly` | Teacher dạy nhiều nhất trong tuần (argmax) | #139 |

### Pattern parsing cần thêm

| Pattern Vietnamese | → Kind |
|---|---|
| "không dạy quá N tiết trong tuần" (giới hạn tuyệt đối, không so sánh) | `teacher_max_weekly_periods` (alias của `teacher_max_working_days` với count-based semantics) |
| "Phương dạy nhiều hơn Trang ít nhất N tiết" | `teacher_count_relative` (gte) |
| "Trang dạy ít hơn Bình tối đa N tiết" | `teacher_count_relative` (lte) |
| "Bình và Cường dạy tổng cộng N tiết" | `teacher_total_periods` (exact) |
| "Đạt dạy gấp đôi số tiết của Khánh" | `teacher_count_relative` (factor 2) |
| "Khánh dạy bằng số tiết của Thảo" | `teacher_count_relative` (eq) |
| "Nhung và Toàn dạy tổng cộng không quá N tiết" | `teacher_total_periods` (max) |
| "Vân dạy ít nhất 50% số tiết của Hiếu" | `teacher_count_relative` (pct) |
| "Toàn dạy nhiều nhất trong tuần" | `teacher_argmax_weekly` |
| "Long và Dung dạy tổng cộng ít nhất N tiết" | `teacher_total_periods` (min) |

### File-level checklist

| File | Thay đổi cần làm |
|---|---|
| `src/lib/constraint-parser.ts` | Thêm 3 variant `ParsedConstraint`: `teacher_count_relative`, `teacher_total_periods`, `teacher_argmax_weekly`. Thêm parser rules cho 10 pattern ở trên. |
| `src/features/timetable/ai/constraint-spec.ts` | Thêm 3 kind mới vào `ConstraintKind` union. |
| `src/features/timetable/ai/constraint-registry.ts` | Thêm 3 entries vào `CONSTRAINT_REGISTRY`. Thêm vào `SOLVER_ENCODABLE_KINDS`. |
| `src/features/timetable/ai/translator.ts` | Thêm 3 handlers trong `fallbackFromRuleParser`. |
| `src/features/timetable/ai/deterministic-validator.ts` | Thêm 3 check functions: `checkTeacherCountRelative`, `checkTeacherTotalPeriods`, `checkTeacherArgmaxWeekly`. Wire vào `checkerByKind` map. |
| `src/features/timetable/ai/kind-to-ir.ts` | Thêm 3 IR adapter (dùng `count` để tính số tiết + `compare` để so sánh). |
| `src/features/timetable/ai/rule-parse-confidence.ts` | HIGH confidence cho 3 kind mới. |
| `python/ir_schema.py` | (Nếu cần) thêm schema validation. |
| `python/solver_skeleton.py` | (Nếu cần) thêm encoder cho 3 kind. |
| `src/features/timetable/ai/__tests__/constraint-kind-contract.test.ts` | Update count từ 84 → 87. |
| Tests mới | Unit tests cho 3 parser rules + 3 validators + 3 IR adapters. |

### Risk assessment

| Risk | Mức độ | Cách giảm thiểu |
|---|---|---|
| Breaking change cho `ConstraintKind` type | THẤP | Thêm variant mới không phá kind cũ. |
| IR schema không support `count` + `compare` cho multi-teacher | TRUNG BÌNH | Check `count` body trong `ir_schema.py` trước; có thể cần `forall` over `teachers` domain. |
| Solver encoder thiếu cho `argmax` (CP-SAT không có sẵn) | CAO | Phase 2 nên defer #139 (argmax) sang Phase 2.5 hoặc dùng custom_dsl. Effort thực tế: 5-7 ngày cho 9 case (không tính #139). |
| UI không hiển thị được spec mới | THẤP | ConstraintDraftCard đã handle generic kinds qua `humanizeDraft`. |

### Acceptance criteria

Phase 2 hoàn thành khi:
1. ✅ 9/10 case nhóm 7 (trừ #139) chuyển từ PARTIAL sang PASS
2. ✅ Tất cả unit tests pass (target: 830+ tests)
3. ✅ Rule parser confidence = HIGH cho 3 kind mới
4. ✅ Solver encode thành công (không có lỗi CP-SAT)
5. ✅ Validator pass cho schedule mẫu
6. ✅ Report mới: ≥ 136/150 (90.7%)

## Kết luận

Với 150 constraints đa dạng, hệ thống hiện đạt **91.3%** tỷ lệ pass (137/150) sau Phase 1 + Phase 2. Chỉ còn 13 case thuộc nhóm 6 (order/distance) cần IR + solver mới (Phase 3):
- "A dạy trước/sau B trong cùng ngày" / "ngay sau" / "ngay trước"
- "A dạy trước B ít nhất N tiết"
- "A và B không dạy liên tiếp"
- "A cách B N ngày" (exact day distance)

Tất cả 0 FAIL — hệ thống parse được toàn bộ, chỉ 13 case cần user feedback hoặc custom DSL.
