## Mục tiêu: Đẩy Lowprizo Direct Agent (devstral-latest) đạt 100% hard constraints trên toàn 6 datasets (first-run only, no long-term memory)

- [x] Dùng GitNexus (sau `gitnexus analyze`) + đọc source để map chính xác luồng `runLowprizoDirectAgent` + `executeTool` + `get_hard_constraint_progress` + MANDATORY LOOP.
- [x] Chẩn đoán root cause còn thiếu 100%: bootstrap mù availability (đặc biệt "chỉ dạy thứ 3 4 5" trên DS2/DS5) là điểm yếu lớn nhất cho first-run.
- [x] GitNexus impact + context trên `createSandbox` (và bootstrap logic) → risk **LOW**, chỉ ảnh hưởng test scripts + agent harness.
- [x] Triển khai thay đổi tối thiểu + high-leverage: **availability-aware bootstrap** (parse hard constraints, bias initial cells theo ngày được phép cho teacher bị hạn chế).
- Sau edit: test ngay trên hard datasets, đo improvement trên DS2/DS5.

- [x] GitNexus impact (LOW risk) cho bước tiếp theo.
- [x] Thêm tool `declare_fix_target` + enforcement state machine trong loop.
- [x] **Prompt compression + external instructions** (thử nghiệm):
  - Tạo file `AGENT_INSTRUCTIONS.txt` + nén mạnh system prompt.
  - **Kết quả**: Regress rõ rệt trên hard datasets (0/2 success).
  - Đã revert (lựa chọn A của user), quay về prompt explicit hơn.
  - Sau revert: Hard datasets (DS2 + DS5) phục hồi tốt → 2/2 success (32 cells và 12 cells, hard true).
- Mục tiêu: Tìm cân bằng giữa độ dài prompt và khả năng model tuân thủ loop. (Kết luận tạm: devstral cần prompt explicit rõ ràng hơn là file ngoài).

### Current Status (as of this push - 2026-05-26)
**Kết quả test toàn bộ 6 datasets (devstral-latest, first-run, tất cả cải tiến hiện tại):**
- **4/6 thành công** (cells + hard constraints satisfied)
  - DS1, DS2, DS5, DS6: ✅ Pass (cells tốt, hard OK)
  - DS3, DS4: ❌ Fail (0 cells, kẹt max turns, không submit được dù đã retry)
- Hard datasets gốc (DS2 + DS5 với "chỉ dạy thứ 3 4 5"): Đã ổn định pass tốt sau bootstrap + tool nhỏ.
- Vấn đề còn lại: Agent vẫn hay kẹt ở 0 cells trên một số dataset (DS3/DS4). Bootstrap + declare_fix_target + prescriptive feedback giúp nhiều nhưng chưa đủ cover hết pattern của mọi dataset.

**Những gì đã cải thiện rõ rệt:**
- Feedback từ runner rất rich (violations, guidance, best-so-far).
- Within-run memory (`read_attempt_history`).
- Tool nhỏ `get_hard_constraint_progress` (prescriptive, đặc biệt cho availability).
- Availability-aware bootstrap (cells ban đầu đã bias theo "chỉ dạy").
- `declare_fix_target` + MANDATORY LOOP guidance (tăng kỷ luật "fix một cái một lúc").

**Vấn đề hiện tại cần chuyên gia fix:**
- DS3 và DS4 vẫn produce 0 cells và không submit.
- Model (devstral-latest) đôi khi vẫn ignore advice hoặc không biết khi nào nên submit dù có cells + hard gần ổn.
- Bootstrap vẫn chưa đủ general cho mọi kiểu constraint "chặt" khác nhau giữa các dataset.
- Enforcement của loop vẫn chủ yếu dựa vào prompt + guidance (chưa đủ mạnh để model luôn tuân thủ 100%).

Đây là snapshot code + harness hiện tại. Tôi đã thử tất cả các hướng nghĩ ra (tool nhỏ, bootstrap, state machine nhẹ, rich feedback, safety net). Kết quả tốt nhất đạt được là 4/6 ổn định.

### Chi tiết thay đổi then chốt (low-risk)
- Vị trí: ngay sau khi viết `HARD_CONSTRAINTS.txt` trong `runLowprizoDirectAgent` (lowprizo-direct-agent.ts).
- Hành vi mới: quét hard constraints tìm pattern "chỉ dạy" + teacher → build allowed day list → generate initial cells ưu tiên ngày hợp lệ → ghi đè `solver.py`.
- Kết quả mong đợi: run_python đầu tiên đã có cells khá tốt về availability → MANDATORY LOOP + prescriptive tool chỉ cần fix nốt các hard còn lại → tăng tỉ lệ submit thành công 100% ngay lần chạy đầu.

### Verify checklist (bắt buộc sau mỗi edit)
- [ ] Chạy `scripts/test-hard-datasets.ts` (DS2 + DS5) ngay sau edit.
- [ ] Kiểm tra: cells > 0, hard violations giảm mạnh so với baseline, có dùng `get_hard_constraint_progress`, recommended_next_step được follow.
- [ ] Nếu cần: chạy full 6 datasets.
- [ ] Ghi nhận % success + failure mode cụ thể vào worklog / phản hồi.

## Mục tiêu cập nhật lần này (Electron Linux log fix)

- [x] Soát cấu hình khởi tạo Electron trên Linux và khoanh vùng nguyên nhân log GL/VSync + GLib-GObject.
- [x] Sửa ở scope hẹp trong `electron/main.mjs` để tránh lỗi runtime/cleanup handler không an toàn.
- [x] Verify bằng kiểm tra tĩnh và lệnh phù hợp sau khi sửa.

## Assumptions (Electron Linux log fix)

- Các log `GetVSyncParametersIfAvailable()` là cảnh báo Chromium/Electron trên Linux/Wayland hoặc GPU stack, không nhất thiết làm app crash.
- Log `GLib-GObject ... has no handler with id` nhiều khả năng đến từ lifecycle cleanup của native window/signal khi app quit trên Linux.
- Ưu tiên fix ít rủi ro nhất: giảm phụ thuộc GPU trên Linux và thêm cleanup an toàn cho process/window, không refactor flow app.

## Mục tiêu cập nhật lần này (backend cleanup + provider integration)

- [x] Soát blast radius của `runPiOrchestratedLoop`, `executePiRuntimeAttempt`, `buildPiDevRequestBody`, `disableLlm` trước khi sửa.
- [x] Dọn legacy còn sót của flow `coder agent`/LowPrizo: naming, status copy, dead flag `disableLlm`, config path cũ không còn cần thiết.
- [x] Chuẩn hóa provider backend theo hướng nhận input -> prompt coder -> generate artifact -> chạy sandbox -> checker -> báo cáo kết quả.
- [x] Verify route thật bằng request JSON và SSE, chạy lint + Python tests, kiểm tra logs, cập nhật `.orchids/orchids.json` đúng policy nếu cần.

## Assumptions

- Ưu tiên option ít rủi ro nhất: giữ backend hiện tại theo kiểu **OpenAI-compatible SDK với `baseURL` trỏ `https://api.lowprizo.com/v1`** thay vì refactor sang package SDK mới chưa có sẵn trong repo.
- Chưa bàn sâu về OS/container sandbox; scope lần này tập trung vào orchestration/backend contract và cleanup legacy.
- Theo yêu cầu hiện tại, có thể tạm test bằng API key runtime truyền qua request; không persist thêm secret vào repo files ngoài `.env` local đang có sẵn.

## Blast radius / impact analysis

- `runPiOrchestratedLoop`
  - direct caller: `src/app/api/generate-timetable/route.ts`
  - ảnh hưởng: toàn bộ `/api/generate-timetable` flow cho cả JSON và SSE
  - risk: **medium**
- `executePiRuntimeAttempt`
  - chỉ dùng nội bộ trong `src/app/api/generate-timetable/service.ts`
  - ảnh hưởng: provider request, response parsing, artifact generation, sandbox execution
  - risk: **medium-low**
- `buildPiDevRequestBody`
  - chỉ được gọi từ `executePiRuntimeAttempt`
  - ảnh hưởng: prompt contract và schema JSON output từ model
  - risk: **medium**
- `disableLlm`
  - còn xuất hiện ở `TimetableApp.tsx`, `ai/client.ts`, `route.ts`, `service.ts`
  - ảnh hưởng: wiring UI -> API request cũ
  - risk: **low-medium**

## Checklist triển khai

1. **Cleanup legacy backend**
   - [x] Bỏ `disableLlm` khỏi client, route, service nếu không còn tác dụng.
   - [x] Dọn wording/log/status còn ghi `pi.dev` theo hướng trung tính hoặc `LowPrizo`.
   - [x] Đơn giản hóa helper/path config cũ chỉ còn phục vụ diagnostics.
   - [x] Rà README/Walkthrough để phản ánh đúng kiến trúc mới.

2. **Chuẩn hóa provider/orchestration**
   - [x] Giữ model call theo `OpenAI` SDK + `baseURL` custom.
   - [x] Siết request body/prompt để rõ vai trò coder agent chuyên code thời khóa biểu bằng OR-Tools.
   - [x] Giữ execution loop: generate artifact -> sandbox -> deterministic checker -> retry/report.
   - [x] Chuẩn hóa message/report output cho UI.

3. **Verify**
- [x] `npm run lint`
- [x] `/home/duy/Downloads/timetable/.venv/bin/python -m pytest /home/duy/Downloads/timetable/python/tests`
- [x] Chạy dev server nếu cần và smoke test `/api/generate-timetable` bằng request thật.
- [x] Kiểm tra terminal logs / browser logs nếu có lỗi runtime.
- [x] Đọc `.orchids/orchids.json`, cập nhật `createdAt` + startup nếu startup contract thay đổi.

## Mục tiêu cập nhật lần này (landing page polish)

- [x] Soát scope preview hiện tại và xác nhận lỗi browser được báo là từ Orchids lifecycle, không phải runtime error của app.
- [ ] Chỉ sửa `Home` trong `src/app/page.tsx` để bổ sung landing page hữu ích, risk thấp.

---

## Mục tiêu cập nhật lần này (Tích hợp Pi Coding Agent làm engine chính cho tạo thời khóa biểu)

**Ngày:** 2026-05-26  
**Mục tiêu:** Thay thế internal "Pi Runtime" (coder + checker custom loop) bằng **@earendil-works/pi-coding-agent** (Pi thật) — agent mạnh, có tool system, loop tốt hơn, dễ mở rộng domain tools.

### Yêu cầu từ user (đã xác nhận)
- Pi nhận input từ UI hiện tại → tự động tạo/fix thời khóa biểu (generate Python solver + chạy + validate lặp).
- **Chạy hoàn toàn autonomous** (không cần user approve từng tool call).
- **Bắt buộc sandbox**: cwd = thư mục tạm, chỉ custom tools được phép ghi file (không để agent đụng file thật trên máy user).
- Dùng **Lowprizo (devstral-latest)** làm model (OpenAI-compatible, giống hiện tại).
- Không cần chat UI đẹp (chạy ngầm như flow hiện tại).

### Assumptions
- Ưu tiên thay thế dần nhưng theo hướng "thay thế chính": Giữ code cũ một thời gian ngắn để so sánh/rollback, sau đó dọn.
- Sử dụng `createAgentSession` + **custom ResourceLoader + inline Extension** để:
  - Chỉ expose đúng các tool domain an toàn.
  - Ép `cwd` vào sandbox dir tạm.
  - Map event của Pi sang `AgentEvent` hiện tại để UI gần như không đổi.
- Pi hỗ trợ tốt OpenAI-compatible → cấu hình runtime key + baseURL qua AuthStorage / custom provider.
- Vẫn giữ Python sandbox execution hiện tại (`runSolverDirect`) làm một custom tool của Pi.

### Blast radius (quan trọng)
- `src/app/api/generate-timetable/service.ts` + `route.ts` — flow chính.
- `src/features/timetable/ai/client.ts` + types — nhận event.
- `src/lib/sandbox.ts`, `generated-solver-artifacts.ts` — vẫn tái sử dụng.
- Rủi ro cao nếu Pi agent gọi tool bash/edit/write không bị chặn → **phải có custom tool + không expose builtin mutating tools**.
- Electron main process gần như không đụng (chạy trong API server process là đủ cho MVP).

### Lịch sử: Tích hợp Pi Coding Agent (đã deprecated)

Trước đây thử dùng `@earendil-works/pi-coding-agent` + Lowprizo devstral, nhưng gặp nhiều vấn đề:
- Tool calling hay bị 403 hoặc model không chịu gọi submit.
- Structured mode (Hướng A) model trả output cực ngắn.

**Kết luận cuối cùng (user chọn option 3):** Bỏ Pi SDK hoàn toàn. Xây custom direct agent dùng OpenAI SDK thuần + header sanitization để bypass WAF.

Chi tiết xem phần cập nhật mới hơn ở dưới.

### Cập nhật Hướng A (Structured Action - user chọn "A" sau option 3)
- [x] Refactor `src/lib/pi-timetable-agent.ts` sang Hướng A: bỏ customTools nặng, session chỉ dùng built-in 'read'/'ls', harness parse ACTION_JSON từ text response của model, execute qua executeAgentAction (sandbox strict), feed observation bằng followUp/prompt loop.
- [x] Prompt rút gọn cực ngắn (đúng yêu cầu "ngắn gọn + đầy đủ"), 4 actions rõ, base/hard/soft constraints.
- [x] Parser tolerant (```json + last {..} + smart quotes + trailing comma).
- [x] Giữ event compat (pi_coder_*, sandbox_*, result) + fallback rõ ràng.
- [x] GitNexus: impact on runTimetableWithPiAgent = **LOW** risk (2 direct callers: service + test script; signature & events preserved). detect-changes = high (do ảnh hưởng flows trong generate-timetable POST).
- [x] Test thực (scripts/test-pi-agent.ts + keytest.txt + Lowprizo devstral): harness chạy sạch 12 turns, emit đúng events, sandbox /tmp/tack-pi-xxx được tạo+cleanup. Tuy nhiên model response chỉ len=1 mỗi turn → parse không trigger submit_solution → fallback (vấn đề model/harness tương tác đã biết từ lịch sử convo; không crash).
- Verify: `npx tsc --noEmit` (chỉ lỗi pre-existing ở service.ts, không liên quan), gitnexus_detect_changes, test script chạy thành công (có log events).
- Trạng thái hiện tại: Hướng A active, code sẵn sàng cho tuning prompt/steer hoặc hybrid tool+text nếu model tiếp tục terse. Legacy engine vẫn fallback an toàn khi engine != 'pi-agent'.

**Kết luận test Hướng A + nhiều biến thể khác (05/2026):**

Sau khi test triệt để 4+ phương án (Pi native tools, Pi structured/Hướng A, pure OpenAI SDK + native tool calling, pure OpenAI + json_object, pure chat + ACTION marker):

- **Tất cả biến thể dùng Lowprizo devstral-latest đều bị chặn hoặc không hoạt động**:
  - Native `tools` → 403 ngay lập tức (Cloudflare/Lowprizo chặn).
  - `response_format: json_object` → 403.
  - Pure chat + marker (rất tối giản) → vẫn 403.
  - Pi SDK (cả tool lẫn structured) → model trả output cực ngắn hoặc không gọi submit.

**Quyết định chốt (user chọn "3" - tích hợp ngay):**
- Đã xóa hoàn toàn file cũ `src/lib/pi-timetable-agent.ts` và `scripts/test-pi-agent.ts`.
- Thay bằng `src/lib/lowprizo-direct-agent.ts` (native OpenAI tool calling + 5 tools sạch).
- Service route `engine: "pi-agent"` sang implementation mới.
- Service giờ route `engine: "pi-agent"` sang implementation mới (native OpenAI tool calling + 5 tools: read/write/edit/delete/run_python + submit_solution).
- Header được sanitize để bypass Cloudflare WAF trên Lowprizo (vấn đề thực sự không phải server chặn, mà là OpenAI SDK default headers).
- Payload hỗ trợ thêm `baseURL` + `model` để dễ chuyển sang OpenRouter/Claude khi cần.
- Event tương thích (pi_coder_*, sandbox_*, result) → UI không bị ảnh hưởng.
- Test thực tế đã xác nhận model gọi tool, edit file, run solver thành công.

File `src/lib/lowprizo-direct-agent.ts` + test script đã sẵn sàng. Chỉ cần truyền `baseURL` + `model` phù hợp là dùng được ngay.

Đây là kết quả sau khi tự test tất cả phương án có thể nghĩ ra theo yêu cầu của user.

---

## Mục tiêu cập nhật lần này (landing page polish)
- [ ] Verify UI render trên route `/`, kiểm tra terminal/browser logs, chạy lint sau khi hoàn tất.

## Blast radius / impact analysis (landing page)

- `Home`
  - entry: `src/app/page.tsx` cho route `/`
  - ảnh hưởng: landing page, API key gating, settings dialog, CTA vào `TimetableApp`
  - risk: **low**
- `TimetableApp`
  - caller: `Home`
  - ảnh hưởng: toàn bộ ứng dụng tạo thời khóa biểu
  - risk: **medium**
  - quyết định: **không sửa trong lượt này** để tránh tăng scope

## Checklist triển khai (landing page)

1. **Landing page polish**
   - [x] Thêm các điểm nổi bật/quick info để trang chủ bớt trống và rõ giá trị hơn.
   - [x] Giữ nguyên flow CTA hiện tại, không đổi contract với `TimetableApp`.
   - [x] Đảm bảo responsive cơ bản.

2. **Verify**
   - [x] Mở preview route `/` và kiểm tra render.
   - [x] Kiểm tra terminal/browser logs.
   - [x] `npm run lint`

## Mục tiêu cập nhật lần này (build verification)

- [x] Xác nhận lại assumption: LowPrizo không có SDK native trong repo; integration hiện tại là OpenAI-compatible client với custom `baseURL`.
- [x] Thử chạy `npm run build` để kiểm tra production build, nhưng platform Orchids chặn build command cho Next.js.
- [x] Dùng `npx tsc --noEmit` làm production-signal thay thế và sửa các lỗi type app trực tiếp liên quan.
- [x] Re-run verify và cập nhật lại kết quả trong walkthrough.

## Blast radius / impact analysis (build verification)

- `Home`
  - entry: `src/app/page.tsx`
  - ảnh hưởng: render/hydration route `/`
  - risk: **low**
- `.orchids/orchids.json`
  - ảnh hưởng: startup metadata của Orchids
  - risk: **low**

## Ghi chú triển khai

- Mục tiêu backend sau cleanup vẫn là: **nhận payload -> build system/user prompt -> model sinh solver artifact -> backend chạy artifact -> deterministic checker chốt accept/retry/infeasible -> trả kết quả + diagnostics**.
- Integration provider hiện tại là **OpenAI-compatible client** trỏ tới `PI_DEV_BASE_URL`; không có SDK native riêng của LowPrizo trong repo này.
- Lượt này chỉ bổ sung UI cho landing page và verify build, không mở rộng refactor ngoài scope.

## Cleanup audit

- [x] `examples/websocket/frontend.tsx`, `examples/websocket/server.ts` là demo độc lập, không thấy app chính import; nhiều khả năng thừa nếu không còn nhu cầu giữ ví dụ websocket.
- [x] `__pycache__/`, `.pytest_cache/`, `tsconfig.tsbuildinfo`, `debug.log`, `dev.log`, `build/`, `release/` là cache/artifact output; có thể xóa an toàn khỏi working tree.
- [x] `electron/main.mjs` và `python-dist/` **không** phải file thừa vì còn nằm trong flow package Electron.
- [x] `scripts_test_generate_timetable.sh`, `test_datasets.py`, `datasets.txt`, `benchmark_latest*.json` **không nên xóa vội** vì vẫn phục vụ benchmark/test tooling.
- [x] `mini-services/.gitkeep` gần như placeholder trống; xóa được nhưng giá trị cleanup thấp.
- [x] Đã xóa `examples/websocket/*`, `__pycache__/`, `.pytest_cache/`, `build/`, `release/`, `tsconfig.tsbuildinfo`, `debug.log`, `dev.log`, `mini-services/.gitkeep`.
- [x] Verify sau cleanup: `npx tsc --noEmit` pass, `npm run lint` pass với 1 warning cũ ở `scripts/benchmark-datasets.mjs`.
