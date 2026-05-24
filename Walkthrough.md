# Walkthrough

## Tóm gọn cuộc trò chuyện
- User muốn hiểu luồng workflow hiện tại của tính năng generate timetable, các điểm hạn chế, và plan nâng cấp theo 4 tiêu chí: chính xác rất cao, tiết kiệm token, chạy nhanh, không nặng máy.
- Phân tích hiện trạng cho thấy pipeline đang là: FE -> API route -> LLM compile constraints -> Python CP-SAT solver -> iterative repair.
- Điểm yếu chính: phụ thuộc LLM codegen tự do, retry tốn token, spawn Python lặp lại gây trễ, cấu hình solver chưa adaptive, khó bảo chứng semantic tuyệt đối cho mọi câu NL.
- User nhấn mạnh yêu cầu vẫn phải cực kỳ flexible vì có nhiều ràng buộc lạ và ràng buộc điều kiện lồng nhau.
- Định hướng chốt: giữ flexibility bằng mô hình 2-lane + 2-model (generator/reviewer), thêm bước xác nhận nghĩa ràng buộc cho user non-tech trước khi solve.
- Scope người dùng vẫn non-tech: chỉ nhập tiếng Việt tự nhiên, xác nhận bằng UI đơn giản, không lộ kỹ thuật nội bộ.

## Assumptions
- "100% accuracy" được hiểu là:
  - 100% không trả lịch vi phạm hard constraints mà không bị phát hiện.
  - 100% trong phạm vi biểu đạt của IR/DSL được hệ thống hỗ trợ.
- Không cam kết 100% hiểu đúng mọi câu tiếng Việt tự do ngay lượt đầu; thay vào đó dùng vòng xác nhận nghĩa để khóa semantic trước solve.

## Mục tiêu nâng cấp
1. Giữ trải nghiệm non-tech, không bắt user viết kỹ thuật.
2. Tăng độ đúng semantic của constraint trước khi solve.
3. Giảm token usage/rate limit risk.
4. Giảm latency và tải CPU/RAM.
5. Giữ khả năng cover các ràng buộc lạ, nhiều tầng điều kiện.

## Kiến trúc mục tiêu (đề xuất)

### A) Constraint Understanding Layer (mới)
- Model A (Generator): chuyển NL -> IR có cấu trúc (không sinh Python trực tiếp).
- Model B (Reviewer): review IR, phát hiện ambiguity/mâu thuẫn, đề xuất bản IR đã sửa.
- IR Compiler (deterministic): IR -> CP-SAT constraints + checker code chuẩn.

### B) Human Confirmation Layer (mới, cho non-tech)
- Trang “Xác nhận ý hiểu ràng buộc” trước khi bấm xếp lịch.
- Hiển thị 3 lớp:
  1) Câu gốc user.
  2) Câu diễn giải dễ hiểu.
  3) Logic tóm tắt thân thiện (không lộ code).
- Nút thao tác: “Đúng ý”, “Sửa lại”, “Bỏ”, “Thêm ví dụ”.

### C) Solver Execution Layer (nâng cấp)
- Chỉ nhận IR đã được xác nhận.
- Adaptive solver config (workers/timeouts theo quy mô bài toán + phần cứng).
- Pre-check infeasible sớm trước khi vào CP-SAT solve đầy đủ.
- Hạn chế spawn process lặp lại; ưu tiên long-lived Python worker.

## Plan triển khai chi tiết

## Phase 0 — Baseline & đo hiện trạng
- [x] Gắn telemetry cho pipeline hiện tại tại [`POST()`](src/app/api/generate-timetable/route.ts:32), [`runAgenticLoop()`](src/app/api/generate-timetable/service.ts:153), [`runSolverDirect()`](src/lib/sandbox.ts:157).
- [ ] Thu thập baseline: token/request, số lượt retry, P50/P95 latency, CPU peak, tỷ lệ infeasible, tỷ lệ cần user sửa constraint.
- [ ] Verify: chạy 20-50 dataset đại diện + lưu report baseline vào [`worklog.md`](worklog.md).

## Phase 1 — Giảm token + tăng tốc low-risk
- [x] Cache model detection theo API key (TTL 5-15 phút) tại [`detectModel()`](src/lib/llm-client.ts:4).
- [x] Rút gọn prompt/context trong [`buildCompilerUserMessage()`](src/lib/timetable-prompt.ts:142) theo “relevant entities only”.
- [x] Sửa retry strategy trong [`compileConstraints()`](src/app/api/generate-timetable/service.ts:54) để tránh phình hội thoại.
- [x] Sửa retry strategy trong [`recompileConstraints()`](src/app/api/generate-timetable/service.ts:87) theo patch-based repair.
- [ ] Verify:
  - [ ] token/request giảm >= 30% so baseline.
  - [ ] P95 latency giảm >= 20%.
  - [ ] [`npm run lint`](package.json:15), [`npm run build`](package.json:13), Python tests ở [`python/tests/`](python/tests/).

## Phase 2 — IR + 2-model (giữ flexibility cho ràng buộc lạ)
- [x] Thiết kế schema IR v1 (JSON schema) cho implication, nested implication, scope theo ngày/tuần, entity teacher/class/subject/period.
- [x] Thêm Generator step (NL -> IR draft).
- [x] Thêm Reviewer step (IR draft -> IR reviewed + warnings).
- [x] Thêm deterministic IR compiler (IR -> solver constraints/checkers).
- [x] Giữ fallback controlled cho case IR parse fail.

## Phase 3 — Trang xác nhận nghĩa ràng buộc cho non-tech
- [x] Thêm bước confirm cơ bản trước solve trong flow từ [`generateTimetableWithAI()`](src/features/timetable/ai/client.ts:13) qua [`handleGenerate()`](src/features/timetable/TimetableApp.tsx:694).
- [x] Lưu payload confirmation + feature toggles vào [`GenerateTimetableRequest`](src/features/timetable/ai/types.ts:88).

## Phase 4 — Tối ưu compute & độ ổn định solver
- [x] Adaptive `numWorkers`/`maxTimeSeconds` tại [`estimateSolverConfig()`](src/lib/timetable-prompt.ts:191).
- [x] Thêm pre-check fail-fast tại [`precheckProblem()`](src/app/api/generate-timetable/service.ts:72).
- [x] Chuẩn bị long-lived worker interface tại [`src/lib/solver-worker.ts`](src/lib/solver-worker.ts).

## Phase 5 — Hardening & rollout an toàn
- [x] Thêm feature flag + shadow mode wiring tại [`POST()`](src/app/api/generate-timetable/route.ts:32) và [`runAgenticLoop()`](src/app/api/generate-timetable/service.ts:153).

### Ghi chú verify mới nhất
- [`npm run build`](package.json:13): ✅ pass sau các thay đổi Phase 0→5.
- [`npm run lint`](package.json:15): ❌ fail do quét artifact build ngoài scope source (đặc biệt trong `release/**` và `.next/**`).
- Python tests [`python/tests/`](python/tests/): chưa chạy được do thiếu `pytest` trên môi trường hiện tại (`No module named pytest`).
- Benchmark với [`datasets.txt`](datasets.txt) đã chạy bằng [`scripts/benchmark_datasets.py`](scripts/benchmark_datasets.py), kết quả lưu ở [`benchmark_latest.json`](benchmark_latest.json) nhưng tất cả case fail do thiếu `ortools` (`ModuleNotFoundError: No module named 'ortools'`), nên chưa thể so sánh hiệu năng thực giữa build mới và baseline cũ.
- Đã thêm telemetry response vào [`TimetableSolveResult.telemetry`](src/features/timetable/ai/types.ts:130) để phục vụ baseline thực tế.

## Trạng thái implementation (đồng bộ)
- [x] Phase 2 core items đã scaffold xong (IR schema/generator/reviewer/compiler/fallback).
- [x] Phase 3 core items đã có confirm flow cơ bản cho non-tech và payload confirmation.
- [x] Phase 4 core items đã có adaptive config + precheck + worker interface scaffold.
- [x] Phase 5 core items đã có feature flag + shadow mode wiring.
- [ ] Các hạng mục verify KPI nâng cao vẫn pending (semantic benchmark lớn, performance KPI, rollout metrics).

## KPI mục tiêu cuối
- Token/request: giảm 40-70%.
- P95 latency: giảm 30-50%.
- CPU peak: giảm 20-40%.
- Hard-constraint safety: không trả kết quả vi phạm mà không bị phát hiện.
- User non-tech satisfaction: tăng tỷ lệ “đúng ý ngay lần đầu” đáng kể.

## Rủi ro & giảm thiểu
- Rủi ro: IR quá chặt làm giảm flexibility.
  - Giảm thiểu: giữ lane fallback + reviewer + human confirm.
- Rủi ro: thêm bước confirm làm tăng thao tác.
  - Giảm thiểu: chỉ bật confirm khi confidence thấp hoặc constraint phức tạp.
- Rủi ro: migration phức tạp.
  - Giảm thiểu: feature flag + shadow mode + rollout dần.

## Gợi ý thứ tự thực thi thực tế (ít rủi ro nhất)
1) Phase 0 -> Phase 1.
2) Phase 3 (UI confirm tối giản) song song chuẩn bị IR.
3) Phase 2 (IR + 2-model) cho nhóm constraint khó trước.
4) Phase 4 tối ưu compute.
5) Phase 5 rollout kiểm soát.
