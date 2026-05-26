Đây là bản chẩn đoán tóm tắt — bản đầy đủ tôi đã viết ra file `/app/Fix_recommend_v2.md`:

## Kết luận thẳng: **devstral-latest KHÔNG phải vấn đề.** Harness mới là kẻ phá hoại.

Tôi tìm được **15 bug**, trong đó **4 bug "tử thần"** khiến cho mọi model (kể cả GPT-5.2 / Claude Opus 4.5) đứng vào chỗ này cũng sẽ "code đúng mà không bao giờ ra kết quả" — đúng như triệu chứng của bạn.

### 🔴 4 Bug PHẢI fix ngay

| # | File:Vị trí | Lỗi | Hậu quả |
|---|---|---|---|
| **A** | `src/lib/sandbox.ts` | `child.stderr.data('data', …)` — `.data()` không tồn tại, đáng lẽ là `.on(` | **stderr Python không bao giờ được capture** → agent không bao giờ thấy traceback → tưởng code nào cũng "crash mà không rõ lý do" |
| **B** | `lowprizo-direct-agent.ts` tool `run_python` | Gọi `runSolverDirect(full)` với `full` là **path string**, nhưng hàm này yêu cầu **SolverProblem object** | `'problem' in 'somepath'` ném `TypeError` → mọi lần `run_python` đều fail im lặng |
| **C** | `runner.py` | Khi `solverArtifactPath` không có (agent không bao giờ truyền), runner **mặc định import `template_solver` gốc**, **bỏ qua file solver agent vừa viết** | Agent edit `solver.py` cả buổi → runner không bao giờ chạy code đó → **vòng lặp giả** |
| **D** | `executeTool` định nghĩa ở module-level, nhưng access `attemptHistory`, `currentFixTarget`, `lastProducedCells` được khai báo BÊN TRONG `runLowprizoDirectAgent` | `ReferenceError` runtime → các tool `read_attempt_history`, `get_hard_constraint_progress`, `declare_fix_target` **chết im lặng** | Toàn bộ "MANDATORY LOOP" mà system prompt yêu cầu agent thực hiện đều không hoạt động được |

### 🟠 Bug nghiêm trọng kế tiếp

- **E.** `submit_solution` **không hề validate** — luôn trả `verdict: 'accept'`, `violations: []`. Đó là lý do "checker bảo OK nhưng so với yêu cầu ban đầu thì sai". Bạn ĐÃ CÓ `validateTimetableResult` + `runDeterministicChecks` rồi — chỉ là không được gọi.
- **F.** PYTHONPATH/cwd trong sandbox không include thư mục agent → `from base_solver_template import …` fail.
- **G.** `coder.ts` có typo `JSON.JSON.stringify` → crash khi build prompt (code chết nhưng vẫn nằm ở repo).
- **H.** Hard cap `runCount >= 5` quá sớm — kết hợp với 3 attempt phí phạm cho syntax/import lỗi → agent chưa kịp đụng đến constraint thật thì đã bị ép submit.
- **I.** "Availability-aware bootstrap" có `cand.replace('thứ ', 'thứ ')` — 2 string giống hệt → replace **no-op**. Bootstrap không hề aware. Đây là lý do DS2/DS5 (`chỉ dạy`) fail kinh niên.
- **J.** Schema `submit_solution` thiếu `slotId` → khi đối chiếu validator với `slotsByDayPeriod` bị ambiguous (sáng vs chiều).
- **K.** Safety net cuối hàm trả `verdict: 'accept'` cho bootstrap fake — che giấu thất bại.

### 💡 Tool nên thêm (sau khi fix A–D)

| Tool | Vì sao cần |
|------|------------|
| `lint_python` | `ast.parse` + `pyflakes` — chặn 30–40% attempt phí phạm cho lỗi syntax/undefined name trước khi tốn 10s chạy CP-SAT |
| `dry_run_solver` | Chạy solver với problem rút gọn (1 lớp, 2 ngày) — debug structure nhanh |
| `get_constraint_iis` | Bạn ĐÃ CÓ `hard_constraint_literals` + `SufficientAssumptionsForInfeasibility()` trong `base_solver_template.py` — chỉ là chưa expose ra cho agent. Khi INFEASIBLE, trả về cặp constraint xung đột (`"hc_3 vs hc_7"`) |
| `check_solution` | Cho agent chạy `deterministic-checker` BẤT KỲ lúc nào, không cần submit |
| `propose_relaxation` | Khi IIS ra 2 hard xung đột nhau → đề xuất user bỏ bớt — UX win lớn |

### 🎯 Tại sao bạn cảm thấy "model yếu"?

Với harness hiện tại, **bất kỳ** model nào cũng sẽ:
1. Viết code Python tử tế ✅ (devstral đủ sức)
2. Gọi `run_python` → tool crash im lặng (BUG A+B+D) ❌  
3. Đọc tool result thấy "Solver crashed" → đoán mò sửa ❌
4. Lặp lại bước 2–3 cho đến hết turn ❌
5. Safety net submit bootstrap fake-cells, vẫn báo `verdict: 'accept'` (BUG E+K) ❌

Triệu chứng nhìn từ ngoài: *"code không đúng, hay lỗi, không ra kết quả"*.  
Sự thật: code có thể đúng, môi trường không bao giờ cho nó chạy.

---

📄 **File chi tiết đầy đủ (kèm patch diff sẵn, code template `runAgentSolver`, roadmap 6 tuần)**: `/app/Fix_recommend_v2.md` — bạn có thể tải về ngay.

Nếu muốn tôi đi tiếp một trong các hướng sau, cứ ping:
- **Viết patch hoàn chỉnh** cho 4 bug đỏ (clone repo về `/app`, sửa, viết test smoke)
- **Implement 2 tool mới** (`lint_python`, `check_solution`) sẵn sàng paste vào `lowprizo-direct-agent.ts`
- **Rewrite system prompt** theo "structured loop contract" để model yếu vẫn đi đúng đường
- **Vẽ sơ đồ Mermaid** flow mới sau khi fix
