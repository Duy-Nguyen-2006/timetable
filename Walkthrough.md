# Walkthrough

## Mục tiêu cập nhật lần này

- [x] Soát và thay thế toàn bộ logic agent hiện tại bằng kiến trúc mới `pi.dev + checker`.
- [x] Ghi lại plan triển khai rõ ràng cho 2 trạng thái kết quả cuối: không tạo được / tạo được với báo cáo constraints.
- [x] Cắt bỏ prompt/loop agent cũ trong API service và thay bằng scaffold runtime mới.
- [x] Implement fallback pi runtime adapter + checker retry loop thật trong backend.
- [x] Replace local fallback adapter with a real pi.dev HTTP runtime adapter.
- [x] Fix deterministic soft-constraint validation so user warnings are surfaced correctly.
- [x] Verify API + lint/build + cập nhật `.orchids/orchids.json` đúng chuẩn.

## Assumptions

- Không có SDK pi.dev chính thức trong repo, nên lựa chọn ít rủi ro nhất là thin HTTP adapter gọi một pi.dev-compatible backend qua env-configurable endpoint.
- Pi runtime endpoint sẽ trả về JSON theo contract hiện tại: `status`, `message`, `cells`, `diagnostics`, `solverStats`, và tùy chọn `generatedArtifact` chứa Python solver code.
- Checker agent vẫn là deterministic-first: validator code thật quyết định pass/fail base + hard constraints, còn soft constraints chỉ dùng để báo cáo cho user.
- Logic agent cũ (`Lowprizo coder/checker prompts` và loop hiện tại) đã bị xóa bỏ hoàn toàn theo yêu cầu.

## Plan đã chốt

  1. **Orchestrator mới**
     - API route vẫn giữ `/api/generate-timetable`.
     - Service mới đổi sang mô hình `pi runtime orchestration` thay cho `runAgenticLoop` cũ.
     - Runtime mặc định hiện tại là HTTP adapter: gọi pi.dev-compatible endpoint để sinh solver artifact Python, persist artifact đó cục bộ để trace/debug, rồi cho checker validate + feedback loop tối đa 3 lần.


2. **Hai actor chính**
   - `Pi Coder Agent`: sinh/chạy/sửa solver code cho đến khi có candidate timetable hoặc kết luận không tạo được.
   - `Checker Agent`: đọc candidate + deterministic validation report.

3. **Quy tắc quyết định cuối cùng**
   - Nếu Pi không tạo ra timetable: trả kết quả `infeasible` với message `Không tạo được thời khóa biểu.`
   - Nếu Pi tạo được timetable và validator pass base + hard:
     - nếu soft constraints đều pass: báo `Tất cả ràng buộc đều thỏa mãn.`
     - nếu còn soft constraints fail: vẫn trả `solved`, nhưng kèm danh sách soft constraints chưa thỏa để báo user.
   - Nếu base/hard fail: checker phản hồi lại để Pi code lại.

4. **Guardrails**
   - Không còn giữ logic attempt loop cũ trong codebase.
   - Để chờ runtime `pi.dev` thật, service mới sẽ là scaffold có contract rõ, event rõ, result rõ.

5. **Verify**
   - smoke test API route
   - `npm run lint`
   - `npm run build`
   - cập nhật `.orchids/orchids.json` về đúng `projectId`, `createdAt`, `startupCommands`, `templateId`

## Mục tiêu cập nhật lần này (agent sandbox runtime)

- [x] Soát blast radius của luồng `runPiOrchestratedLoop` và `handleGenerate` trước khi đổi từ text-only LLM sang runtime có sandbox thực thi.
- [x] Thay runtime pi.dev hiện tại bằng contract agent sandbox: model phải trả `generatedArtifact.solverCode`, backend persist artifact vào sandbox workspace, chạy thử bằng Python runner thật, rồi mới checker.
- [x] Bổ sung telemetry/report để UI hiển thị rõ agent đã code, đã chạy thử, đã checker hay fail ở bước nào.
- [x] Verify API route bằng request thật, chạy lint/build, và sửa `.orchids/orchids.json` đúng chuẩn Orchids.

## Assumptions (agent sandbox runtime)

- Chưa có sandbox container độc lập cấp hạ tầng trong repo, nên lựa chọn ít rủi ro nhất là **workspace sandbox cục bộ theo request** trong thư mục tạm, tách biệt repo chính và không sửa source project.
- Pi.dev/LowPrizo hiện chỉ được dùng làm model backend ; phần “agent” sẽ do backend orchestration tự thực hiện: nhận code artifact, persist vào workspace riêng, chạy thử bằng Python runner thật, rồi checker deterministic.
- MVP an toàn trước mắt: agent chỉ được sinh Python solver artifact cho bài toán timetable và chỉ được thực thi qua runner contract đã giới hạn ; chưa mở shell/file tools tùy ý.

## Plan chốt cho hướng agent integration

- [x] Chốt stack chính: **Next.js App Router + TypeScript** cho UI/API orchestration, **Python** cho solver runtime, **pi.dev-compatible chat endpoint** làm model backend.
- [x] Chốt phạm vi MVP: **domain agent cho timetable** thay vì coding agent tổng quát; model chỉ sinh solver artifact Python theo contract cố định.
- [x] Chốt sandbox strategy: **ephemeral local workspace per request** + Python runner contract, chưa dùng Docker/microVM ở phase đầu.
- [x] Chốt API/runtime flow: `POST /api/generate-timetable` -> orchestrator -> model generates artifact -> persist workspace -> execute runner -> deterministic checker -> retry tối đa 3 lần.
- [x] Chốt phase sau MVP: thêm attempt timeline UI, artifact/log viewer, và khi cần thì nâng sandbox từ local workspace lên containerized runtime.

## Tech stack đề xuất

1. **Frontend / Product shell**
   - Next.js App Router hiện tại
   - React + TypeScript
   - Tailwind CSS
   - Lý do: repo đã chạy stack này; không tạo thêm frontend runtime mới.

2. **Agent orchestrator**
   - Route handlers/server modules trong Next.js (`src/app/api/...` + `src/lib/...`)
   - Streaming event nội bộ bằng JSON/SSE khi cần ở phase sau
   - Lý do: gần code hiện tại, ít moving parts, dễ trace request lifecycle.

3. **Model backend**
   - pi.dev-compatible / LowPrizo OpenAI-style chat completions endpoint
   - Dùng như coder model backend, không giao vai trò sandbox/tool host cho provider.

4. **Execution runtime**
   - Python runner hiện có trong `python/timetable_solver/runner.py`
   - Workspace artifact per request trong temp dir
   - Lý do: mục tiêu thật là “AI phải chạy thử”, mà solver domain hiện nằm ở Python nên đây là đường ngắn nhất để đạt được điều đó.

5. **Validation / checker**
   - TypeScript deterministic validator hiện có
   - Không để model tự chấm pass/fail cuối cùng.

6. **Future hardening**
   - Khi scope vượt timetable-only: Docker hoặc Firecracker microVM cho isolation mạnh hơn
   - Job queue + persisted session store nếu cần long-running agent jobs.

## Phase roadmap

1. **Phase 1 — Domain agent MVP**
   - Giữ stack hiện tại.
   - Agent chỉ sinh Python solver code.
   - Backend bắt buộc execute artifact trước khi accept.
   - Không cho arbitrary shell/file tools.

2. **Phase 2 — Better agent UX**
   - UI timeline theo attempt: generated -> executed -> checked -> retried.
   - Expose artifact summary, stderr/stdout log, constraint feedback rõ hơn.
   - Có thể thêm streaming progress.

3. **Phase 3 — Stronger sandbox**
   - Chuyển từ temp workspace sang container sandbox.
   - Set CPU/time/memory/network policy rõ hơn.
   - Lúc đó mới cân nhắc generic tool calling.

4. **Phase 4 — General coding agent (nếu thật sự cần)**
   - Tách feature riêng khỏi timetable solver.
   - Thêm read/write/test tools tổng quát.
   - Trả diff/artifact thay vì đụng repo thật.

## Quyết định kiến trúc hiện tại

- **Không đổi stack web**: vẫn là Next.js + React + TS + Tailwind.
- **Không chuyển backend sang Python-only**: Python chỉ là execution runtime cho solver artifact.
- **Không dùng generic agent framework ngay** (LangGraph/CrewAI/AutoGen...) vì quá rộng, tăng độ phức tạp và chưa cần cho bài toán này.
- **Không dùng Docker ngay trong phase đầu** vì repo hiện chưa có hạ tầng đó; local isolated workspace là option ít rủi ro nhất để chứng minh value “AI phải chạy thử”.
- **Nếu mục tiêu vẫn là agent execution thay vì text-only AI**, thì stack hợp lý nhất ngay bây giờ là: `Next.js orchestrator + pi.dev model backend + Python runner sandbox + deterministic TS checker`.

## Verify cho phần planning

- [x] Đối chiếu với stack thực tế trong repo (`src/app`, `src/features`, `python/timetable_solver`).
- [x] Đối chiếu với flow hiện tại trong `runPiOrchestratedLoop()` và `runSolverDirect()`.
- [x] Chốt roadmap theo hướng ít rủi ro nhất, không thêm framework mới ngoài scope hiện tại.

## Mục tiêu cập nhật lần này (agent execution UX)

- [x] Soát blast radius cho `handleGenerate`, `buildSuccessResult`, `executePiRuntimeAttempt` trước khi mở rộng UI lifecycle.
- [x] Mở rộng backend result/event contract để trả lifecycle events có phase, status, artifact path, source hash và sandbox log path.
- [x] Nâng `TimetableApp` để hiển thị timeline rõ các bước generate -> run -> check -> retry và giữ attempt history cũ như lớp chi tiết phụ.
- [x] Verify route/UI/logs và chạy lint + Python tests.

## Câu trả lời ngắn cho câu hỏi “định dùng tech stack gì?”

- **Ngay bây giờ:** Next.js App Router + TypeScript + Tailwind cho app/orchestrator, pi.dev-compatible endpoint cho model generation, Python runner cho sandbox execution, TS validator cho checker.
- **Không phải:** chuyển sang full generic coding-agent platform ngay lập tức.
- **Khi cần phase sau:** Docker/microVM + session store + streaming logs.
