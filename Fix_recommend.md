Dựa vào những gì tôi đọc được trong `service.ts`, `coder.ts`, `checker.ts`, `sandbox.ts`, và `base_solver_template.py`, tôi thấy kiến trúc agentic loop hiện tại đang **đúng concept nhưng thiếu nhiều "giác quan" và "phản xạ"** để model yếu vẫn có thể hoàn thành task. Dưới đây là phân tích vấn đề + đề xuất cụ thể.

---

## 🔍 Vấn đề cốt lõi hiện tại

Nhìn vào `runAgenticLoop` → `runCoderAttempt` → `executeSolver` → checker, tôi đoán bạn đang gặp 1 trong 4 pattern lỗi sau:

| # | Triệu chứng | Nguyên nhân gốc |
| --- | --- | --- |
| 1 | Code Python sinh ra **chạy lỗi syntax / import / runtime** ngay | Không có "dry-run" / lint trước khi đưa vào solver |
| 2 | Solver chạy được nhưng **INFEASIBLE / TIMEOUT** mãi không thoát | Không có cơ chế **diagnose IIS**  • relax constraint động |
| 3 | Solver ra kết quả nhưng **vi phạm ràng buộc mềm** | Checker feedback quá ngắn, coder không biết sửa chỗ nào |
| 4 | Loop quay vòng, lần sau **tệ hơn lần trước** | Không có "memory" giữa các attempt — model quên context |

---

## 🛠️ Đề xuất: Thêm 6 thành phần này

### 1. **`src/lib/python-linter.ts`** — Tiền kiểm tra code trước khi chạy solver

Hiện tại code LLM sinh ra đi thẳng vào `runSolverDirect`. Nếu sai cú pháp → mất 1 attempt chỉ để biết "missing colon".

```tsx
// Chạy `python -m py_compile` hoặc `ast.parse` qua subprocess ngắn
export async function lintGeneratedSolver(code: string): Promise<{
  ok: boolean
  errors: Array<{ line: number; message: string }>
}>
```

→ Nếu fail, feed lỗi vào coder **không tính là attempt chính**.

---

### 2. **`src/lib/iis-extractor.ts`** — Khi INFEASIBLE, trích xuất "tập ràng buộc xung đột nhỏ nhất"

OR-Tools CP-SAT có `model.export_to_file()` + assumption literals. Trong `base_solver_template.py` tôi thấy đã có `iis_constraint_ids` nhưng có vẻ chưa được dùng đầy đủ.

**Thêm vào `base_solver_template.py`:**

```python
def solve_with_assumptions(model, assumption_literals):
    # Mỗi hard constraint gắn 1 BoolVar làm "công tắc"
    # Khi INFEASIBLE → solver.SufficientAssumptionsForInfeasibility()
    # Trả về list constraint nào đang xung đột
```

→ Checker feedback sẽ cụ thể kiểu: *"Constraint #7 (GV Toán dạy thứ 2 tiết 1) xung đột với #12 (Lớp 10A1 không học sáng thứ 2)"*

---

### 3. **`src/lib/attempt-memory.ts`** — Bộ nhớ giữa các attempts

Hiện `runCoderAttempt` chỉ nhận `previousArtifact` (code cũ). Thiếu:

- **Lịch sử các lỗi đã gặp** → tránh lặp lại
- **Các approach đã thử** (e.g. "đã thử dùng AllDifferent, fail")
- **Best partial solution** (kết quả tốt nhất từng đạt được, dù chưa hoàn hảo)

```tsx
type AttemptMemory = {
  triedApproaches: string[]      // "AllDifferent on teachers", "Circuit constraint"
  recurringErrors: Map<string, number>  // error signature → count
  bestPartial: { code: string; violations: number } | null
  blacklistedPatterns: string[]  // code patterns gây crash
}
```

→ Đưa memory này vào system prompt của coder mỗi attempt.

---

### 4. **`buildCheckerPrompt` cần nâng cấp** — Feedback có cấu trúc

Hiện checker chỉ trả về `CheckerReport`. Cần thêm **diff-style feedback**:

```tsx
type StructuredFeedback = {
  rootCause: "syntax" | "logic" | "constraint_modeling" | "objective"
  affectedConstraints: Array<{ id: string; severity: 'hard'|'soft'; suggestion: string }>
  suggestedFix: {
    location: string  // "line 45, in build_teacher_constraints"
    pattern: string   // "Replace `model.Add(x == y)` with `model.AddElement(...)`"
  }
  shouldRelaxConstraints: string[]  // gợi ý nới ràng buộc mềm nào
}
```

---

### 5. **`src/lib/constraint-progressive-relaxer.ts`** — Tự động nới ràng buộc khi bí

Sau N attempts mà vẫn INFEASIBLE, thay vì loop vô tận:

```tsx
// Sắp xếp constraint theo priority do user gán
// Bỏ dần các soft constraint priority thấp nhất
// Báo lại cho user: "Đã bỏ ràng buộc X để có nghiệm"
async function relaxAndRetry(problem, droppedConstraints): Promise<...>
```

→ Đây là tính năng **người dùng sẽ rất thích** vì hiện tại chắc đang fail im lặng.

---

### 6. **`src/lib/solver-telemetry.ts`** — Quan sát được mới sửa được

Thêm structured logging xuyên suốt loop:

```tsx
type SolverTrace = {
  attemptNumber: number
  phase: 'codegen' | 'lint' | 'execute' | 'check' | 'relax'
  durationMs: number
  tokensIn: number
  tokensOut: number
  errorClass?: string  // phân loại lỗi để analytics
  modelSize: { vars: number; constraints: number }
}
```

→ Lưu vào SQLite `dev.db`, có thể dựng dashboard xem **attempt nào fail vì lý do gì** — rất quan trọng để fine-tune prompt.

---

## 🎯 Sửa ngay 3 điểm trong code hiện có

### (a) `shouldContinueLoop` trong `service.ts`

Có vẻ điều kiện dừng đang quá đơn giản. Cần thêm:

- **Early stop** khi 2 attempts liên tiếp cùng 1 error signature
- **Budget check**: nếu đã dùng > X tokens / Y giây mà chưa có partial solution → switch sang **fallback solver** (template thuần, không LLM)

### (b) `buildCoderPrompt` — Thêm "few-shot examples" động

Hiện prompt chắc là static. Nên inject:

- 1-2 ví dụ **code đã work** với problem tương tự (similarity match trên problem signature)
- Lỗi gần nhất + cách fix (từ `attempt-memory`)

### (c) `executeSolver` — Streaming progress từ Python về Node

CP-SAT có callback `solution_callback`. Hiện chắc đang chờ blocking. Thêm:

```python
class ProgressCallback(cp_model.CpSolverSolutionCallback):
    def on_solution_callback(self):
        print(json.dumps({"type": "progress", "obj": self.ObjectiveValue()}), flush=True)
```

→ Frontend hiển thị "đã tìm thấy solution với cost 142, đang cải thiện..." thay vì spinner câm.

---

## 📋 Thứ tự ưu tiên triển khai

1. **Python linter (#1)** — rẻ, hiệu quả cao, làm trong 1 buổi
2. **Structured checker feedback (#4)** — sửa prompt, không cần code mới
3. **Attempt memory (#3)** — giúp model yếu nhất cũng tiến bộ qua loop
4. **IIS extractor (#2)** — kỹ thuật, nhưng đây là "vũ khí hạng nặng" cho bài INFEASIBLE
5. **Progressive relaxer (#5)** — UX win lớn
6. **Telemetry (#6)** — làm sau khi đã chạy được, để tối ưu tiếp

---

Bạn muốn tôi **đi sâu vào cái nào trước**? Tôi có thể:

- Viết draft code đầy đủ cho 1 trong 6 module trên
- Review chi tiết `coder.ts` / `checker.ts` prompt hiện tại và rewrite
- Vẽ sơ đồ Mermaid mô tả luồng mới sau khi thêm các thành phần
