# Phân tích vấn đề & gợi ý cải tiến

Sau khi đọc kỹ `service.ts` (agentic loop), `base_solver_template.py`, `template_solver.py`, `sandbox.ts` và `timetable-validator.ts`, tôi thấy luồng hiện tại **đúng về ý tưởng nhưng "trang bị" cho agent quá nghèo nàn**. Đây là chỗ làm model "có cảm giác mù" — nó chỉ nhận text feedback, không có công cụ để **khám phá vấn đề**, **test cục bộ**, hay **truy vết lỗi**.

Dưới đây là chẩn đoán + đề xuất theo mức độ ưu tiên.

---

## 🔴 Vấn đề lõi (root causes)

### 1. Agent không có **tool calls** — chỉ có "viết file rồi cầu nguyện"

Hiện tại `runCoderAttempt` gọi LLM một phát, nhận về một block Python, rồi chạy. LLM không thể:

- Đọc lại problem JSON theo từng phần
- Test thử 1 constraint trước khi viết hết
- Tra OR-Tools API khi gặp method lạ
- Xem code của attempt trước nó

→ Đây là lý do lớn nhất khiến nó **"loop mãi không hội tụ"**.

### 2. Feedback từ checker quá "thô"

`buildCheckerReport` trả về list violations dạng text. LLM phải đoán:

- Constraint nào trong code Python tương ứng?
- Dòng nào cần sửa?
- Sửa thế nào?

### 3. `base_solver_template.py` có chỗ chưa hoàn thiện

- `iis_constraint_ids` được khai báo nhưng **không bao giờ được compute** khi INFEASIBLE → khi solver báo "không khả thi", agent không biết ràng buộc nào đang xung đột.
- Không có cơ chế **đánh số / đặt tên constraint** → không thể trace ngược.

### 4. Vòng lặp không có "chiến lược leo thang" (escalation)

`shouldContinueLoop` chỉ check `attempt < maxAttempts` và `verdict !== "success"`. Khi LLM lặp đi lặp lại cùng một lỗi → vẫn cứ chạy. Không có cơ chế:

- "Lỗi lặp 2 lần → đổi chiến thuật"
- "INFEASIBLE → giảm ràng buộc mềm"
- "Timeout → tăng `num_workers` / nới `max_time`"

### 5. Coder và Checker không "nói chung ngôn ngữ"

Checker phán "vi phạm ràng buộc giờ trống GV X". Coder không biết:

- Mapping từ tên ràng buộc → biến/hàm Python nào.
- Là vi phạm cứng hay mềm?
- Một ví dụ cụ thể (slot nào, GV nào) trông ra sao?

---

## 🛠️ Đề xuất cụ thể — theo độ ưu tiên

### ⭐ Ưu tiên 1: Trang bị **tool calls** cho Coder agent

Đây là thay đổi có ROI cao nhất. Chuyển từ single-shot generation sang **agent có tools**. Thêm các function sau (expose qua function-calling API của Lowprizo):

| Tool | Mục đích | File implement |
| --- | --- | --- |
| `inspectProblem(path?)` | Đọc problem JSON theo từng nhánh (tránh nhồi hết vào prompt) | `src/lib/agent-tools/inspect.ts` |
| `runPartialSolver({ code, sampleSize?, timeLimit })` | Chạy thử với 1 lớp / 1 ngày → nhanh, debug dễ | extend `sandbox.ts` |
| `validateOneConstraint({ constraintId, timetable })` | Check riêng 1 constraint, trả slot/agent vi phạm cụ thể | extract từ `timetable-validator.ts` |
| `computeIIS()` | Khi INFEASIBLE → list constraint IDs gây xung đột | thêm vào `base_solver_template.py` (dùng `model.AddAssumption`  • `solver.SufficientAssumptionsForInfeasibility`) |
| `lookupOrtoolsApi(query)` | RAG nhỏ trên doc OR-Tools | dataset tĩnh trong `src/lib/ortools-docs.ts` |
| `getPreviousAttempt(n)` | Đọc code + lỗi của attempt trước | đọc từ `generated-solver-artifacts.ts` |
| `getCodeDiff(from, to)` | Show diff giữa 2 attempts | dùng `diff` lib |
| `submitFinalCode(code)` | Action "kết thúc" — chỉ gọi khi tự tin | gate vào `executeSolver` |

→ Lập tức bạn sẽ thấy LLM **hỏi-trước-khi-viết**, ít hallucinate API hơn nhiều.

---

### ⭐ Ưu tiên 2: Đánh số & đặt tên constraint trong `base_solver_template.py`

Thay vì:

```python
model.Add(sum(x[a, s] for a in asgs) <= 1)
```

Bọc lại:

```python
def add_constraint(model, expr, *, cid: str, kind: str, meta: dict | None = None):
    constraint = model.Add(expr)
    constraint.WithName(cid)
    _CONSTRAINT_REGISTRY[cid] = {"kind": kind, "meta": meta or {}}
    return constraint
```

Sau đó:

- Khi solver chạy → trả về `constraint_registry` cùng kết quả.
- Khi INFEASIBLE → `solver.SufficientAssumptionsForInfeasibility()` → map ngược ra `cid` → **checker biết chính xác constraint nào conflict**.
- Khi checker fail → đính kèm `cid` → coder biết grep dòng nào trong code.

### ⭐ Ưu tiên 3: Tách pipeline thành 3 phase rõ ràng

Hiện tại: Coder → Solver → Checker → (loop).

Đề xuất:

```
Phase 1: PLANNER (mới)
  - Input: raw problem
  - Output: structured constraint plan (JSON):
      [{ id: "C1", type: "no_overlap", scope: "teacher", priority: "hard", ... }]
  - Mục đích: chuẩn hoá yêu cầu trước khi sinh code

Phase 2: CODER
  - Input: constraint plan + base template + tools
  - Output: Python code có đánh dấu cid theo plan
  - Tools: inspectProblem, runPartialSolver, lookupOrtoolsApi

Phase 3: CHECKER
  - Input: result + constraint plan
  - Output: per-cid pass/fail + counter-example
```

Phase 1 cực kỳ quan trọng — nó là **"hợp đồng"** giữa Coder và Checker. Hai bên không còn nói chuyện qua text mơ hồ.

File mới: `src/lib/agent-prompts/planner.ts` + `src/app/api/generate-timetable/planner.ts`.

---

### ⭐ Ưu tiên 4: Cải thiện `shouldContinueLoop` — thêm chiến lược escalation

```tsx
function pickStrategy(history: AttemptSummary[]): "retry" | "patch" | "rewrite" | "relax" | "stop" {
  const last = history.at(-1)
  const sameErrorTwice = history.length >= 2 && 
    history.at(-1)?.errorSignature === history.at(-2)?.errorSignature

  if (last?.status === "syntax_error") return "patch"
  if (last?.status === "infeasible" && sameErrorTwice) return "relax"  // gợi ý user nới soft constraint
  if (last?.status === "timeout") return "retry" // với time budget lớn hơn
  if (sameErrorTwice) return "rewrite" // viết lại từ đầu với prompt khác
  if (history.length >= 5) return "stop"
  return "patch"
}
```

Thêm field `errorSignature` (hash của loại lỗi + dòng) vào `AttemptSummary`.

---

### 🟡 Ưu tiên 5: Improvements bổ trợ

#### a) **Pre-flight check** trước khi gọi LLM

File mới: `src/lib/preflight.ts` — kiểm tra:

- Số slot >= số demand? (nếu không → INFEASIBLE hiển nhiên, báo user ngay, không cần chạy LLM)
- Mỗi giáo viên có ít nhất `weeklyPeriods` slots khả dụng?
- Tổng thời lượng môn không vượt tổng slot?

→ Tiết kiệm rất nhiều token + thời gian.

#### b) **Partial solving / warm start**

Thêm cờ `--sample` cho `runner.py`: chạy với subset lớp đầu tiên. Coder dùng để smoke-test nhanh trước khi commit.

#### c) **Counter-example trong checker**

Khi `validateTimetableResult` fail, trả về:

```tsx
{
  cid: "C5",
  message: "Giáo viên Trần Văn A dạy 2 lớp cùng lúc",
  evidence: { day: "Mon", period: 3, conflicts: [...] }
}
```

LLM nhìn evidence → biết phải sửa logic ở đâu.

#### d) **Persist learning** (`.swarm/memory.db` bạn đã có sẵn schema!)

Lưu các pattern bug→fix vào bảng `patterns`. Mỗi lần coder fail → search pattern tương tự → đính kèm vào prompt sau.

Bạn đã có `pattern_learning: enabled` trong schema rồi — chỉ thiếu code wire nó vào loop.

#### e) **Streaming reasoning ra UI**

SSE đã có `AgentEvent` rồi → thêm event `tool_call`, `tool_result` để user thấy agent đang làm gì → tăng trust + debug dễ.

#### f) **Token budget guard**

Thêm vào `service.ts`:

```tsx
if (totalPromptCharsOut > MAX_BUDGET) {
  emit({ type: "warning", message: "Budget exceeded, finalizing best-so-far" })
  return finalizeResult({ ..., status: "budget_exceeded" })
}
```

---

## 📋 Checklist hành động (theo thứ tự nên làm)

1. **[1 ngày]** Thêm `add_constraint(cid, ...)` wrapper vào `base_solver_template.py` + return registry trong kết quả.
2. **[1 ngày]** Cài `solver.SufficientAssumptionsForInfeasibility()` để compute IIS thực sự.
3. **[2 ngày]** Implement preflight check (`src/lib/preflight.ts`) — ROI cao, code đơn giản.
4. **[2 ngày]** Counter-example trong checker — sửa `timetable-validator.ts` để return `evidence`.
5. **[3 ngày]** Implement Planner phase + cập nhật prompt.
6. **[3-5 ngày]** Refactor Coder thành agent có tool calls (Lowprizo có hỗ trợ function calling không? Nếu không → bọc bằng prompt-based ReAct).
7. **[2 ngày]** Escalation strategy trong `shouldContinueLoop`.
8. **[2 ngày]** Wire `.swarm/memory.db` vào loop để learn from past bugs.

---

## 🎯 Tóm gọn 3 điều nếu chỉ làm được 3

1. **Cho agent tools để gọi** (đặc biệt `runPartialSolver` và `computeIIS`) — giải quyết 60% vấn đề "loop vô hạn".
2. **Đánh số constraint (cid) xuyên suốt 3 phase** — để Coder và Checker nói cùng ngôn ngữ.
3. **Tách phase Planner** — chuẩn hoá yêu cầu thành JSON trước, đừng để LLM vừa parse vừa code cùng lúc.

Bạn muốn tôi đi sâu vào phần nào, hoặc viết ra prototype code cho một trong các đề xuất trên (ví dụ phần `add_constraint` wrapper + IIS, hoặc skeleton cho tool-calling agent)?
