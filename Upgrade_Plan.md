# Upgrade Plan — Timetable AI Pipeline Stability

**Ngày tạo:** 2026-06-01  
**Mục tiêu:** Giảm tỉ lệ lỗi pipeline từ ~40% xuống <10%, fix các crash trong AppImage build.

---

## PHẦN A — FIX CRITICAL BUGS (Ưu tiên cao nhất)

### A1. Bubblewrap stdout phá daemon JSON protocol

**File:** `sandbox/bubblewrap_executor.py` dòng ~140  
**Hiện trạng:** Dòng `print(f"[Bubblewrap] Running ...")` đã được redirect sang `sys.stderr` — **ĐÃ FIX**.  
**Kiểm tra:** Confirm không còn print nào khác ra stdout trong file này.

---

### A2. code_executor.py daemon mode — bọc redirect_stdout

**File:** `python/code_executor.py`, hàm `daemon()` dòng ~340  
**Vấn đề:** Bất kỳ `print()` nào trong `run_user_code()` hoặc sandbox subprocess đều phá JSON protocol.  
**Thay đổi:**

```python
# Trong daemon(), branch execute:
try:
    with contextlib.redirect_stdout(sys.stderr):
        result = run_user_code(code, timeout, job_dir)
except Exception:
    result = {...}

# Chỉ dòng cuối mới print JSON ra stdout:
sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")
sys.stdout.flush()
```

**Lý do:** Đảm bảo 100% stdout daemon chỉ chứa JSON, bất kể code bên trong có print gì.

---

### A3. Electron daemon parser đã tolerant non-JSON — VERIFY

**File:** `electron/main.mjs` dòng ~92  
**Hiện trạng:** Code đã có logic skip non-JSON lines (`if (!line.startsWith('{'))`) — **ĐÃ FIX**.  
**Kiểm tra:** Confirm logic hoạt động đúng khi có nhiều non-JSON lines liên tiếp.

---

### A4. chat-client.ts — gửi apiKey cả header lẫn body

**File:** `src/features/timetable/ai/chat-client.ts`  
**Hiện trạng:** Code đã gửi `apiKey` trong cả `X-Provider-Key` header VÀ JSON body — **ĐÃ FIX**.  
**Kiểm tra:** Confirm `/api/ai/chat` route đọc apiKey từ cả 2 nguồn.

---

### A5. /api/ai/chat — compatibility retry khi provider trả 400/422

**File:** `src/app/api/ai/chat/route.ts`  
**Hiện trạng:** Đã có `buildCompatibilityRetryBody()` và `stripCacheControlFromMessages()` — **ĐÃ FIX**.  
**Kiểm tra:** Confirm retry logic thực sự được gọi khi response status 400/422.

---

### A6. Coder max_tokens quá cao

**File:** `src/features/timetable/ai/coder.ts`  
**Vấn đề:** `max_tokens: 30000` khiến nhiều provider reject.  
**Thay đổi:**

```typescript
max_tokens: 12000,
```

**Lý do:** Coder chỉ sinh custom_dsl code (vài trăm dòng max). 12000 tokens đủ cho ~400 dòng Python.

---

### A7. Provider test route — thêm smoke chat call

**File:** `src/app/api/provider/test/route.ts`  
**Vấn đề:** Test chỉ check key + model list, không verify model có accept chat request hay không.  
**Thay đổi:** Sau khi verify key/model, thêm 1 minimal chat call:

```typescript
// Smoke test: gửi 1 message đơn giản, max_tokens=2, không response_format
const smokeBody = {
  model,
  messages: [{ role: 'user', content: 'Return OK' }],
  max_tokens: 2,
  temperature: 0,
};

const smokeResponse = await fetchWithTimeout(
  `${baseURL}/chat/completions`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(smokeBody),
  }
);

if (!smokeResponse.ok) {
  return NextResponse.json({
    ok: false,
    message: `Key hợp lệ, model tồn tại, nhưng chat completion thất bại (HTTP ${smokeResponse.status}). Model có thể không hỗ trợ chat format.`,
    details: { keyValid: true, modelExists: true, chatWorks: false },
  });
}
```

---

### A8. Error messages phân biệt rõ nguyên nhân

**File:** `src/app/api/ai/chat/route.ts`  
**Thay đổi:** Khi trả error, phân loại:

| Status | Message |
|--------|---------|
| Missing config | `"Internal config missing: baseURL/model/messages, apiKeyReceived=false"` |
| 401/403 | `"Provider auth rejected. Check API key."` |
| 400/422 sau retry | `"Provider rejected request body: {model}, max_tokens={n}, response_format={used}"` |
| Timeout | `"Provider timeout after {n}ms"` |

**Không bao giờ** log apiKey value.

---

## PHẦN B — GIẢM TỈ LỆ LỖI CODER (Harness improvements)

### B1. Strip leaked schema fields khỏi constraint code

**File:** `src/features/timetable/ai/skeleton-injector.ts`  
**Hiện trạng:** Đã thêm `stripLeakedSchemaFields()` strip `covered_constraint_ids`, `plan_summary`, `assumptions` — **ĐÃ FIX**.

---

### B2. Static pre-validation trước execution

**File mới:** `src/features/timetable/ai/static-code-validator.ts`  
**Mục đích:** Bắt lỗi code TRƯỚC khi gửi cho Python executor, tiết kiệm 1 round trip.

**Checks:**
1. **Undefined variable detection** — Parse code tìm biến không nằm trong allowed set (`model`, `slots`, `data`, `assignments`, `days`, `periods`, `periods_by_day`, `constraints`, `custom_specs`, `schedule`, `len`, `range`, `int`, `str`, `set`, `list`, `dict`, `tuple`, `frozenset`)
2. **Schema field leak** — Detect `covered_constraint_ids`, `plan_summary`, `assumptions` dùng như biến
3. **Import statement** — Detect `import` statements (không được phép trong sandbox)
4. **Infinite loop pattern** — Detect `while True` không có `break`
5. **model.Add vs model.add** — Detect sai method name (CP-SAT dùng `Add...` viết hoa)

**Integration vào local-agent.ts:**

```typescript
// Sau normalizeConstraintCodeBody, trước executeGeneratedCode:
const staticErrors = staticValidateCode(latestConstraintCode);
if (staticErrors.length > 0) {
  previousAttemptSummary = `Static validation failed: ${staticErrors.join('; ')}`;
  coderRetry += 1;
  continue; // Không tốn 1 execution round
}
```

---

### B3. Cải thiện previousAttemptSummary cho coder retry

**File:** `src/features/timetable/ai/local-agent.ts`  
**Vấn đề:** Khi coder retry, `previousAttemptSummary` chỉ chứa error message ngắn. LLM không đủ context để fix.  
**Thay đổi:**

```typescript
// Thay vì chỉ:
previousAttemptSummary = execResult.errorDigest || 'Solver execution failed.';

// Gửi kèm:
previousAttemptSummary = [
  `Error: ${execResult.errorDigest}`,
  `Code that failed (first 50 lines):`,
  latestConstraintCode.split('\n').slice(0, 50).join('\n'),
  `---`,
  `Fix the error above. Do NOT use variables outside the allowed set.`,
  `Allowed: model, slots, data, assignments, days, periods, periods_by_day, constraints, custom_specs, schedule`,
].join('\n');
```

**Giới hạn:** Chỉ gửi 50 dòng đầu để không phình token budget.

---

### B4. Tăng violation repair budget

**File:** `src/features/timetable/ai/local-agent-limits.ts`  
**Thay đổi:**

```typescript
export const MAX_CODER_RETRIES = 3;           // giữ nguyên
export const MAX_RUNTIME_REPAIR_ROUNDS = 1;   // giữ nguyên
export const MAX_VIOLATION_REPAIR_ROUNDS = 3;  // 2 -> 3
export const MAX_TOTAL_TOOL_CALLS = 18;        // 15 -> 18 (cho thêm 1 violation round)
export const TOKEN_CAP_PER_RUN = 100_000;      // 80k -> 100k
```

**Lý do:** Violation repair là nơi thường fix được (code chạy nhưng sai logic). Thêm 1 round tăng success rate đáng kể.

---

### B5. Mở rộng constraint registry — giảm custom_dsl

**File:** `python/solver_skeleton.py` (registry section)  
**Mục đích:** Thêm 5 pattern phổ biến vào built-in registry để LLM không phải code:

| Kind mới | Mô tả | Params |
|----------|--------|--------|
| `teacher_prefer_consecutive` | GV muốn dạy liên tiếp trong ngày | `teacherId` |
| `class_max_subjects_per_day` | Tối đa N môn khác nhau/ngày | `classId`, `maxSubjects` |
| `teacher_min_gap` | GV cần nghỉ ít nhất N tiết giữa 2 buổi | `teacherId`, `minGap` |
| `subject_spread_days` | Môn phải rải đều các ngày | `classId`, `subjectId`, `minDays` |
| `teacher_no_last_period` | GV không dạy tiết cuối | `teacherId`, `excludedPeriods` |

**Cập nhật translator prompt** để map natural language vào các kind mới thay vì tạo `custom_dsl`.

---

### B6. Coder system prompt — thêm negative examples

**File:** `prompts/coder.system.md`  
**Thêm section:**

```markdown
## TUYỆT ĐỐI KHÔNG

- KHÔNG dùng `covered_constraint_ids` trong Python code (đây là JSON response field)
- KHÔNG dùng `plan_summary` hay `assumptions` trong Python code
- KHÔNG import bất kỳ module nào
- KHÔNG dùng `print()`, `open()`, `exec()`, `eval()`
- KHÔNG tạo biến ngoài scope cho phép
- KHÔNG viết `model.add(...)` (phải viết hoa: `model.Add(...)`)

## Ví dụ SAI (sẽ crash):

```python
covered_constraint_ids = ["c1", "c2"]  # SAI - đây là JSON field
import itertools  # SAI - không được import
model.add(constraint)  # SAI - phải là model.Add(...)
```
```

---

## PHẦN C — INFRASTRUCTURE HARDENING

### C1. code_executor.py — thêm JSON output validation

**File:** `python/code_executor.py`  
**Vấn đề:** Nếu `run_user_code` trả result không serialize được, daemon crash.  
**Thay đổi:**

```python
# Trước khi write JSON:
try:
    output_line = json.dumps(result, ensure_ascii=False)
except (TypeError, ValueError) as exc:
    result = {
        "phase": "serialize",
        "ok": False,
        "status": "crashed",
        "durationMs": 0,
        "errorDigest": f"Result not JSON-serializable: {exc}",
        "stdout": "",
        "stderr": "",
    }
    output_line = json.dumps(result, ensure_ascii=False)

sys.stdout.write(output_line + "\n")
sys.stdout.flush()
```

---

### C2. Electron daemon — thêm health check

**File:** `electron/main.mjs`  
**Thay đổi:** Sau spawn daemon, gửi 1 ping job để verify daemon sẵn sàng:

```javascript
// Sau spawnDaemon():
const pingJob = JSON.stringify({ type: 'syntax-check', code: 'pass' }) + '\n';
worker.stdin.write(pingJob);
// Đợi response trong 5s, nếu không có -> kill và respawn
```

---

### C3. Timeout alignment giữa Node và Python

**File:** `electron/main.mjs` + `python/code_executor.py`  
**Vấn đề:** Node timeout và Python timeout có thể lệch -> Node kill daemon trước khi Python trả result.  
**Thay đổi:** Gửi `timeoutSeconds` trong mỗi job, Python dùng giá trị đó. Node timeout = Python timeout + 10s buffer.

---

## PHẦN D — THỨ TỰ THỰC HIỆN

| Bước | Task | File(s) | Ưu tiên |
|------|------|---------|---------|
| 1 | A2 — redirect_stdout trong daemon | `python/code_executor.py` | CRITICAL |
| 2 | A6 — giảm max_tokens coder | `src/features/timetable/ai/coder.ts` | CRITICAL |
| 3 | A7 — smoke test provider | `src/app/api/provider/test/route.ts` | HIGH |
| 4 | A8 — error messages rõ ràng | `src/app/api/ai/chat/route.ts` | HIGH |
| 5 | B2 — static pre-validation | `src/features/timetable/ai/static-code-validator.ts` | HIGH |
| 6 | B3 — cải thiện previousAttemptSummary | `src/features/timetable/ai/local-agent.ts` | HIGH |
| 7 | B4 — tăng repair budget | `src/features/timetable/ai/local-agent-limits.ts` | MEDIUM |
| 8 | B5 — mở rộng registry | `python/solver_skeleton.py` + translator prompt | MEDIUM |
| 9 | B6 — negative examples trong coder prompt | `prompts/coder.system.md` | MEDIUM |
| 10 | C1 — JSON output validation | `python/code_executor.py` | MEDIUM |
| 11 | C2 — daemon health check | `electron/main.mjs` | LOW |
| 12 | C3 — timeout alignment | `electron/main.mjs` + `python/code_executor.py` | LOW |

---

## PHẦN E — KIỂM TRA SAU NÂNG CẤP

```bash
npm run lint
npm run test
npm run build:executor
npm run dev  # Test manual với OpenRouter
```

**Test cases:**
1. Tạo thời khóa biểu nhỏ (3 lớp, 5 GV) — phải pass lần đầu
2. Thêm 1 custom constraint phức tạp — coder phải sinh code đúng
3. Dùng model reject json_schema — compatibility retry phải work
4. Kill daemon giữa chừng — phải tự respawn
5. Build AppImage và chạy lại test 1-4

---

## PHẦN F — KHÔNG LÀM (Out of scope)

- **Skawld SDK integration** — Chưa cần. Pipeline hiện tại đủ nếu harness tốt. Xem xét lại khi cần multi-turn conversation hoặc persistent learning.
- **Cache partial results** — Không implement vì lỗi do LLM hallucinate, không phải do thiếu cache. Stage cache hiện tại đã đủ.
- **Thay đổi LLM model** — Nằm ngoài scope code. User tự chọn model phù hợp.
- **Room constraints** — Đã bị ignore ở translator, giữ nguyên.
