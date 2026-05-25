# Walkthrough

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
