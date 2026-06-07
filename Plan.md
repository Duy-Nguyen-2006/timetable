# PLAN: Hệ ràng buộc mở (open-world) cho Tack Timetable
### Giải pháp: **Constraint IR + Compiler dual-backend** (một IR, hai backend: CP-SAT enforce + Python verify)

> Mục tiêu: chấm dứt vĩnh viễn tình trạng "không thể liệt kê đủ ràng buộc" và lỗi
> *"custom_dsl chưa mã hoá được vào solver / thiếu pythonPredicate / rule parser chưa hiểu"*.
> Repo: `Duy-Nguyen-2006/timetable` (Next.js + TS + Python OR-Tools CP-SAT).
> Phiên bản tài liệu: 1.0 — dành cho người triển khai (không cần tác giả gốc giải thích thêm).

---

## 0. TL;DR cho người triển khai

1. **Vấn đề gốc**: Registry kind là **đóng**. Tier 3 (`pythonPredicate`) chỉ **verify sau khi giải**, không **encode vào CP-SAT** → solver không bị ràng buộc → lỗi "checked but not encoded".
2. **Giải pháp**: Định nghĩa **một IR (Intermediate Representation)** — đại số boolean/đếm/tuyến tính trên biến slot. Mọi ràng buộc TKB thực tế đều biểu diễn được bằng IR.
3. **Một IR, hai backend** (đây là điểm cốt lõi đảm bảo chính xác 100%):
   - **Backend 1 — Compiler → CP-SAT**: enforce ràng buộc *trong lúc search* (reification).
   - **Backend 2 — Interpreter → Python**: verify ràng buộc trên lịch đã giải.
   - Vì cùng 1 IR → **verify luôn khớp enforce**, không còn lệch ngữ nghĩa.
4. Registry ~25 kind cũ trở thành **macro** expand ra IR (giữ nguyên hành vi đã test).
5. `pythonPredicate` chỉ còn là **escape hatch hiếm** cho ràng buộc phi tuyến không reify được (vd tỉ lệ nhân chia).

**Kết quả kỳ vọng**: thêm ràng buộc mới = viết 1 biểu thức IR (hoặc để Translator tự sinh IR), **không phải sửa code ở 4 nơi** (translator table + coder list + skeleton branch + validator).

---

## 1. Nguyên tắc thiết kế (bắt buộc tuân thủ)

| # | Nguyên tắc | Lý do |
|---|---|---|
| P1 | **Single source of truth**: ngữ nghĩa ràng buộc định nghĩa 1 lần trong IR. | Verify == Enforce. |
| P2 | **Compiler deterministic**, không dùng LLM. | Loại bỏ vòng repair do LLM sinh code sai. |
| P3 | **Reify mọi atom** về BoolVar trước khi tổ hợp. | Cho phép lồng `and/or/not/exists/forall/count`. |
| P4 | **Hard → `model.Add(...)` enforce**; **Soft → biến vi phạm vào objective**. | Đúng bản chất CP-SAT. |
| P5 | **Backward-compatible**: 25 kind cũ vẫn chạy y nguyên (qua macro). | Không phá golden test hiện có. |
| P6 | **Fail-fast & rõ ràng**: spec không hợp lệ bị từ chối ở schema, không "âm thầm bỏ qua". | Hết bug "thiếu pythonPredicate". |
| P7 | **Mọi thay đổi kèm golden test** (E2E không cần API key). | Chống hồi quy. |

---

## 2. Kiến trúc: Trước vs Sau

### Trước (hiện tại)
```
NL (tiếng Việt)
  → Translator (LLM)  → ConstraintSpec[] (25 kind đóng | custom_dsl+pythonPredicate)
  → Planner (LLM)
  → Coder (LLM)       → viết tay CP-SAT vào build_custom_constraints
  → Solver CP-SAT     → lịch
  → Validator         → _verify_custom_predicates (CHỈ verify, không enforce)  ← LỖ HỔNG
```

### Sau (đề xuất)
```
NL (tiếng Việt)
  → Translator (LLM)  → IR AST (JSON, schema-validated)   ← biểu diễn mở
  → [Macro expander]  → IR (25 kind cũ = macro → IR)
  → IR Compiler (deterministic, Python) ──┬──► CP-SAT model (ENFORCE)  ← Backend 1
                                          └──► Python eval (VERIFY)    ← Backend 2
  → Solver CP-SAT     → lịch
  → Validator         → IR Interpreter (cùng IR) → 0 lệch ngữ nghĩa
```
Coder LLM **gần như không còn việc** với ràng buộc thường (compiler lo). `pythonPredicate` chỉ dùng cho phần phi tuyến hiếm.

---

## 3. Định nghĩa IR (đặc tả đầy đủ)

### 3.1. Biến quyết định nền (đã/đang có trong skeleton)
- `slots[(assignment_id, day, period)] : BoolVar` — assignment được xếp tại (day, period).
- `assignment` = (class, subject, teacher, weeklyPeriods).

### 3.2. Lớp "derived booleans" (PHẢI thêm — nền của mọi atom)
Tạo helper có **cache** để reify quan sát thành BoolVar:

```python
# python/ir_compiler.py  (mới)
class DerivedVars:
    def __init__(self, model, slots, assignments):
        self.model = model
        self.slots = slots
        self.assignments = assignments
        self._cache = {}
        # index sẵn để tra nhanh
        self.by_teacher = defaultdict(list)   # teacher -> [assignment_id]
        self.by_class   = defaultdict(list)
        self.by_class_subject = defaultdict(list)  # (class,subject)->[assignment_id]
        for a in assignments:
            self.by_teacher[a["teacher"]].append(a["id"])
            self.by_class[a["class"]].append(a["id"])
            self.by_class_subject[(a["class"], a["subject"])].append(a["id"])

    def teacher_busy(self, t, d, p):
        key = ("tb", t, d, p)
        if key in self._cache: return self._cache[key]
        lits = [self.slots[(aid, d, p)] for aid in self.by_teacher.get(t, [])
                if (aid, d, p) in self.slots]
        b = self.model.NewBoolVar(f"tb_{t}_{d}_{p}")
        if lits:
            self.model.AddMaxEquality(b, lits)   # b = OR(lits)
        else:
            self.model.Add(b == 0)               # GV không có assignment nào ở slot này
        self._cache[key] = b
        return b

    def class_subject_at(self, c, s, d, p):
        key = ("cs", c, s, d, p)
        if key in self._cache: return self._cache[key]
        lits = [self.slots[(aid, d, p)] for aid in self.by_class_subject.get((c, s), [])
                if (aid, d, p) in self.slots]
        b = self.model.NewBoolVar(f"cs_{c}_{s}_{d}_{p}")
        if lits: self.model.AddMaxEquality(b, lits)
        else:    self.model.Add(b == 0)
        self._cache[key] = b
        return b
    # tương tự: class_busy(c,d,p), assigned(aid,d,p) = slots trực tiếp
```

> Lưu ý CP-SAT: dùng đúng hoa/thường — `NewBoolVar`, `Add`, `AddBoolAnd`, `AddBoolOr`,
> `AddMaxEquality`, `AddMinEquality`, `OnlyEnforceIf`. (coder.system.md đã cảnh báo.)

### 3.3. Grammar IR (JSON AST)

```
Constraint   := { id, severity:"hard"|"soft", weight?:number,
                  original:string, explain:string, expr:BoolExpr }

BoolExpr     :=
  | Atom
  | { "and":  [BoolExpr, ...] }
  | { "or":   [BoolExpr, ...] }
  | { "not":  BoolExpr }
  | { "implies": [BoolExpr, BoolExpr] }      # a → b
  | { "iff":     [BoolExpr, BoolExpr] }
  | { "exists":  { var, in:Domain, body:BoolExpr } }       # ∃
  | { "forall":  { var, in:Domain, body:BoolExpr } }       # ∀
  | { "atLeast": { k:int, var, in:Domain, body:BoolExpr } } # |{x: body}| ≥ k
  | { "atMost":  { k:int, var, in:Domain, body:BoolExpr } }
  | { "exactly": { k:int, var, in:Domain, body:BoolExpr } }
  | { "compare": { op:"<="|"<"|"=="|"!="|">="|">", lhs:IntExpr, rhs:IntExpr } }
  | { "consecutive": { var, in:Domain, length:int, body:BoolExpr } }  # ∃ cửa sổ liên tiếp dài `length` mà body đúng

IntExpr      :=
  | int
  | { "count": { var, in:Domain, body:BoolExpr } }   # đếm số phần tử thỏa body
  | { "sum":   [IntExpr, ...] }
  | { "scale": { factor:int, of:IntExpr } }

Atom         :=                                  # phải reify được về BoolVar
  | { "teaches":       { teacher, day, period } }            # GV dạy tại slot
  | { "teachesOnDay":  { teacher, day } }                    # GV dạy ≥1 tiết trong ngày
  | { "classSubjectAt":{ class, subject, day, period } }
  | { "classBusy":     { class, day, period } }
  | { "assigned":      { assignment, day, period } }
  | { "const": true|false }

Domain       :=
  | "days" | "periods" | "classes" | "teachers" | "subjects"
  | { "list": [ ... ] }                          # tập tường minh
  | { "range": [from, to] }                      # vd [1, "P-1"]  (P = số tiết/ngày)
  | { "filter": { in:Domain, where:<vị từ đơn giản> } }

# Tham chiếu biến lượng từ: dùng "$<var>" và cho phép số học chỉ số: "$p+1", "$p-1"
```

### 3.4. Ngữ nghĩa chuẩn (định nghĩa CHÍNH XÁC — implementer bám sát)

| Node | CP-SAT (enforce) | Python (verify) | Domain rỗng |
|---|---|---|---|
| `and[xs]` | `b`; `AddMinEquality(b, reify(xs))` | `all()` | `and[]` = true |
| `or[xs]` | `b`; `AddMaxEquality(b, reify(xs))` | `any()` | `or[]` = false |
| `not x` | trả về `reify(x).Not()` | `not` | — |
| `implies[a,b]` | `or[ not a, b ]` | `(not a) or b` | — |
| `iff[a,b]` | `and[ implies(a,b), implies(b,a) ]` | `a == b` | — |
| `exists` | OR reify body trên domain | `any(...)` | false |
| `forall` | AND reify body trên domain | `all(...)` | true |
| `atLeast k` | `s=sum(reify(body)); Add(s>=k)⇔b` | `count(...) >= k` | so với k |
| `atMost k` | `Add(s<=k)⇔b` | `<= k` | so với k |
| `exactly k` | `Add(s==k)⇔b` | `== k` | so với k |
| `compare` | dựng IntVar 2 vế, `Add(lhs op rhs)⇔b` | so sánh số | — |
| `consecutive L` | ∃ start: AND(body[start..start+L-1]); OR các start | có cửa sổ liên tiếp | false nếu domain < L |
| `count` | IntVar = `sum(reify(body))` | đếm | 0 |

**Reify tổng quát** (hàm `compile_expr(expr, env) -> BoolVar`):
- Atom → trả BoolVar từ `DerivedVars`.
- `atLeast/atMost/exactly/compare`: tạo `b = NewBoolVar`; ràng buộc 2 chiều bằng `OnlyEnforceIf(b)` và `OnlyEnforceIf(b.Not())`.
- **Top-level**:
  - `severity=="hard"` → `model.Add(compile_expr(expr) == 1)`.
  - `severity=="soft"` → `viol = compile_expr(expr).Not()`; cộng `weight * viol` vào `penalty_terms` (objective).

### 3.5. Recipe reification chuẩn (copy-paste cho implementer)

```python
def reify_and(model, lits, name):
    b = model.NewBoolVar(name)
    model.AddBoolAnd(lits).OnlyEnforceIf(b)
    model.AddBoolOr([l.Not() for l in lits]).OnlyEnforceIf(b.Not())
    return b   # hoặc: model.AddMinEquality(b, lits)

def reify_or(model, lits, name):
    b = model.NewBoolVar(name)
    model.AddMaxEquality(b, lits)
    return b

def reify_atleast(model, lits, k, name):
    b = model.NewBoolVar(name); s = sum(lits)
    model.Add(s >= k).OnlyEnforceIf(b)
    model.Add(s <= k - 1).OnlyEnforceIf(b.Not())
    return b

def reify_compare(model, lhs, rhs, op, name):
    b = model.NewBoolVar(name)
    pos = {"<=":(lhs<=rhs),"<":(lhs<rhs),">=":(lhs>=rhs),">":(lhs>rhs),"==":(lhs==rhs),"!=":(lhs!=rhs)}
    neg = {"<=":(lhs>rhs),"<":(lhs>=rhs),">=":(lhs<rhs),">":(lhs<=rhs),"==":(lhs!=rhs),"!=":(lhs==rhs)}
    model.Add(pos[op]).OnlyEnforceIf(b)
    model.Add(neg[op]).OnlyEnforceIf(b.Not())
    return b
```

---

## 4. Ví dụ minh hoạ (worked examples)

### 4.1. ⭐ Ví dụ của bạn: "Thủy phải có 2 tiết liên tiếp ở một hôm nào đó bất kì"
**IR:**
```json
{
  "id": "c1", "severity": "hard",
  "original": "Thủy phải có 2 tiết liên tiếp ở một hôm nào đó bất kì",
  "explain": "Tồn tại ≥1 ngày mà GV Thủy dạy 2 tiết liên tiếp",
  "expr": {
    "exists": { "var": "d", "in": "days",
      "body": {
        "exists": { "var": "p", "in": { "range": [1, "P-1"] },
          "body": { "and": [
            { "teaches": { "teacher": "Thủy", "day": "$d", "period": "$p" } },
            { "teaches": { "teacher": "Thủy", "day": "$d", "period": "$p+1" } }
          ] }
        }
      }
    }
  }
}
```
**Compiler → CP-SAT** (kết quả sinh ra):
```python
day_has = []
for d in days:
    pairs = []
    for p in range(1, P):                       # p, p+1
        tp  = dv.teacher_busy("Thủy", d, p)
        tp1 = dv.teacher_busy("Thủy", d, p+1)
        pr  = reify_and(model, [tp, tp1], f"pair_Thuy_{d}_{p}")
        pairs.append(pr)
    day_has.append(reify_or(model, pairs, f"dayhas_Thuy_{d}"))
model.Add(reify_or(model, day_has, "exists_day_Thuy") == 1)   # HARD enforce
```
→ Solver **bị ràng buộc** phải tạo ít nhất 1 ngày có cặp liên tiếp. Không còn "checked but not encoded".
Validator dùng cùng IR để verify → khớp 100%.

### 4.2. "Mỗi GV dạy tối đa 4 buổi/tuần" (đếm)
```json
{ "id":"c2","severity":"hard","expr":{
  "forall":{ "var":"t","in":"teachers","body":{
    "compare":{ "op":"<=",
      "lhs":{ "count":{ "var":"d","in":"days","body":{ "teachesOnDay":{ "teacher":"$t","day":"$d" } } } },
      "rhs":4 } } } } }
```

### 4.3. "Toán không quá 2 tiết liên tiếp/ngày cho lớp 6A" (∀, consecutive cấm)
```json
{ "id":"c3","severity":"hard","expr":{
  "forall":{ "var":"d","in":"days","body":{
    "not":{ "consecutive":{ "var":"p","in":"periods","length":3,
      "body":{ "classSubjectAt":{ "class":"6A","subject":"Toán","day":"$d","period":"$p" } } } } } } } }
```

### 4.4. Soft cân bằng tải: "nên trải đều, weight=5"
`severity:"soft"`, `weight:5`, expr là điều kiện lý tưởng; compiler đưa `5 * viol` vào objective.

> **Catalog mẫu** (người triển khai làm fixture cho toàn bộ): block_day, block_slot,
> max_per_day, max_consecutive, pin_period, subject_consecutive, not_same_day,
> pair_not_same_slot, if_then, not_last_period, first_period_required, exists_consecutive (4.1),
> count_week (4.2), balance(soft). Mỗi mẫu 1 golden test.

---

## 5. Thay đổi theo từng file (file-by-file)

| File | Thay đổi |
|---|---|
| **`python/ir_compiler.py`** *(mới)* | `DerivedVars` + `compile_constraint(model, ir, dv, penalty_terms)` + các `reify_*`. Backend CP-SAT. |
| **`python/ir_eval.py`** *(mới)* | `eval_constraint(ir, schedule, assignments) -> bool | list[violation]`. Backend verify. Cùng grammar. |
| **`python/ir_schema.py`** *(mới)* | Định nghĩa + validate JSON Schema của IR (jsonschema). Raise lỗi rõ ràng khi sai. |
| **`python/templates/solver_skeleton.py`** | Trong `build_custom_constraints`: thay nhánh viết-tay bằng `for ir in ir_constraints: compile_constraint(...)`. Khởi tạo `DerivedVars` 1 lần. Giữ vùng `AI_FILL_HERE` chỉ cho `pythonPredicate` hiếm. |
| **`python/validator_engine.py`** | Thêm `_verify_ir` dùng `ir_eval`; giữ `_verify_python_predicate` cho escape hatch. Báo cáo violation kèm `id`, `explain`. |
| **`python/macros.py`** *(mới)* | `expand_macro(spec) -> ir`: ánh xạ 25 kind cũ → IR. Một chỗ duy nhất. |
| **`prompts/translator.system.md`** | Đổi đầu ra: ưu tiên (1) kind/macro, (2) **emit IR** cho ràng buộc mới, (3) `pythonPredicate` chỉ khi không reify được. Thêm grammar IR + few-shot (gồm ví dụ 4.1–4.4). |
| **`prompts/coder.system.md`** | Thu hẹp vai trò: KHÔNG viết CP-SAT cho ràng buộc IR (compiler lo). Chỉ xử lý `pythonPredicate` hiếm. |
| **`prompts/repair.system.md`** | Repair = sửa **IR** (đổi node/tham số), không sửa CP-SAT tay. |
| **`src/features/timetable/ai/constraint-ir.ts`** *(mới)* | TS types + `validateIR()` (ajv) trước khi gửi xuống Python. Reject hard thiếu expr. |
| **`src/features/timetable/ai/pipeline-versions.ts`** | Bump `solverTemplate`, `prompt.translator/coder/repair`, thêm `irSchema` version → invalidate cache. |
| **`scripts/check_constraint_parity.ts`** | Đổi mục tiêu: đảm bảo mọi `kind` có macro→IR; mọi node IR có cài đặt trong cả `ir_compiler` lẫn `ir_eval` (parity 2 backend). `--strict` fail CI nếu lệch. |
| **`python/tests/`, `tests/fixtures/`** | Golden E2E cho catalog §4; test parity compile-vs-eval; test ví dụ 4.1. |
| **`docs/decisions/ADR-00X-constraint-ir.md`** *(mới)* | Ghi quyết định kiến trúc. |

---

## 6. Kế hoạch theo phase (rollout)

### Phase 0 — Hardening / vá lỗi ngay (1–2 ngày) — *rủi ro thấp, làm trước*
- [ ] Schema-validate ở Translator/TS: **cấm** `custom_dsl` hard thiếu cơ chế thi hành → trả lỗi rõ, không "âm thầm bỏ".
- [ ] `check_constraint_parity.ts --strict` trong CI: fail khi có hard "verify-only".
- [ ] UI hiện lại `explain` (cách hệ hiểu) để người dùng xác nhận.
- **Acceptance**: lỗi *"Thiếu tham số bắt buộc pythonPredicate"* không còn làm crash pipeline; thay bằng thông báo cần xác nhận/diễn đạt lại.

### Phase 1 — Lõi IR + 2 backend (4–6 ngày)
- [ ] `DerivedVars`, `ir_compiler.py`, `ir_eval.py`, `ir_schema.py`.
- [ ] Unit test **parity**: với cùng IR + cùng lịch mẫu, `eval` đồng nhất kết quả mà compiler enforce (sinh lịch rồi eval phải = true).
- **Acceptance**: compile + eval chạy cho toàn bộ node grammar; ≥ 20 unit test xanh.

### Phase 2 — Macro hoá registry cũ (3–4 ngày)
- [ ] `macros.py`: 25 kind → IR. Giữ nhánh native cũ phía sau cờ để so sánh.
- [ ] Test parity: macro→IR→solve cho golden dataset 1 ra **kết quả ≡** nhánh cũ (0 violation).
- **Acceptance**: tất cả golden test hiện có vẫn xanh khi đi qua đường IR.

### Phase 3 — Translator sinh IR (3–4 ngày)
- [ ] Cập nhật `translator.system.md` (grammar + few-shot §4).
- [ ] JSON-schema-validate output; vòng repair nhắm sửa IR.
- **Acceptance**: 15–20 câu NL khó (gồm ∃/∀/đếm/temporal) → IR hợp lệ, solve ra lịch thỏa, validator 0 violation. Ví dụ 4.1 **bắt buộc đạt**.

### Phase 4 — Thu gọn Coder + dọn pythonPredicate (2 ngày)
- [ ] Coder không sinh CP-SAT cho IR. `pythonPredicate` chỉ còn cho phi tuyến hiếm (có test riêng + sandbox AST cũ).
- **Acceptance**: pipeline giải các dataset mà **không cần** Coder viết CP-SAT tay.

### Phase 5 — UX (tuỳ chọn, khuyên có) (3–5 ngày)
- [ ] Màn xác nhận diễn giải ràng buộc (hiện `explain`, cho sửa).
- [ ] **Constraint Builder UI**: chọn GV/môn/lớp + lượng từ (∃/∀/atLeast) + số tiết → sinh IR trực tiếp, né mơ hồ NL.
- **Acceptance**: tạo được ví dụ 4.1 hoàn toàn bằng UI, không gõ NL.

### Phase 6 — CI / phát hành (1–2 ngày)
- [ ] Golden E2E (không cần API key) cho catalog §4; fuzz IR; bump version → invalidate cache localStorage.
- **Acceptance**: CI xanh; `npm test` + `pytest` đều pass; parity strict bật.

---

## 7. Test plan (đảm bảo chính xác 100%)

1. **Parity test (cốt lõi)**: với mỗi IR mẫu → (a) compile + solve ra lịch L; (b) `ir_eval(IR, L)` PHẢI = true. Nếu lệch ⇒ bug compiler/eval.
2. **Golden E2E**: dataset tiếng Việt thật (như `dataset1.json`) đi qua đường IR ⇒ 0 violation, ổn định (seed cố định solver).
3. **Catalog coverage**: mỗi mục §4 + 25 macro có ít nhất 1 fixture pass.
4. **Negative test**: IR sai schema → reject với thông điệp rõ; `custom_dsl` hard thiếu cơ chế → bị chặn.
5. **Existential/temporal**: ví dụ 4.1, 4.3 phải pass (đây là loại trước đây fail).
6. **Performance**: đo số biến phụ (derived + reify) trên dataset lớn nhất; đảm bảo solve < ngưỡng thời gian (đặt timeout + log).
7. **Regression**: toàn bộ test cũ vẫn xanh.

---

## 8. Edge cases & rủi ro

| Rủi ro | Xử lý |
|---|---|
| Domain rỗng (∃/∀) | Quy ước: `exists=false`, `forall=true`, đếm=0. Test riêng. |
| Chỉ số ngoài biên (`$p+1` khi p=P) | `range:[1,"P-1"]` ở tầng IR; compiler kẹp biên, bỏ cặp vượt biên. |
| Bùng nổ biến phụ (reify) | Cache `DerivedVars`; chỉ tạo var khi atom được dùng; đo & đặt trần. |
| Ràng buộc phi tuyến thật (tỉ lệ %, nhân biến×biến) | Giữ `pythonPredicate` (soft/verify) + cảnh báo "không enforce được", đề xuất tuyến tính hoá. |
| Vô nghiệm do hard quá chặt | Solver trả INFEASIBLE → báo cáo **tập ràng buộc mâu thuẫn** (assumption literals + `AddAssumptions`/IIS-lite) kèm `explain`. |
| Hoa/thường API CP-SAT | Lint/test bắt `model.add` vs `model.Add` (coder.system.md đã liệt kê). |
| Lệch ngữ nghĩa enforce vs verify | Đã loại trừ bằng kiến trúc 1-IR-2-backend + parity test §7.1. |

---

## 9. Definition of Done

- [ ] Mọi ràng buộc trong catalog §4 + 25 macro: compile ✓, verify ✓, golden ✓.
- [ ] Ví dụ 4.1 (Thủy ∃ 2 tiết liên tiếp) **enforce trong solver** và verify khớp.
- [ ] Translator sinh IR hợp lệ cho ≥ 90% câu test khó; phần còn lại rơi vào `pythonPredicate` có kiểm soát (không crash).
- [ ] Không còn đường "hard verify-only" (parity `--strict` chặn CI).
- [ ] Thêm ràng buộc mới = thêm 1 IR/macro + 1 test, **không sửa 4 nơi**.
- [ ] CI `npm test` + `pytest` xanh; version bump + cache invalidation.

---

## 10. Vì sao đây là phương án TỐT NHẤT (so với các lựa chọn khác)

| Tiêu chí | B: Coder viết CP-SAT tay | C: chỉ vá pythonPredicate | **A: IR + 2 backend (chọn)** |
|---|---|---|---|
| Enforce trong solver | Có nhưng phụ thuộc LLM (dễ sai) | **Không** (chỉ verify) | **Có, deterministic** |
| Verify khớp enforce | Không đảm bảo | Lệch | **Khớp tuyệt đối (1 IR)** |
| Mở rộng ràng buộc mới | Sửa nhiều nơi | Hạn chế | **Thêm 1 IR/macro** |
| Vòng repair LLM | Nhiều | Nhiều | **Rất ít** |
| Rủi ro hồi quy | Cao | Trung bình | **Thấp (macro giữ hành vi cũ)** |

→ A là đầu tư lõi một lần, đóng vĩnh viễn bài toán open-world; B/C chỉ là vá tạm (đưa vào Phase 0 như bước đệm).

---

*Hết. Người triển khai bắt đầu từ Phase 0 → 1 → 2 → 3; Phase 5 (UX) làm song song khi lõi ổn.*
