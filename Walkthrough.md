# Walkthrough

## Trạng thái kiến trúc mới
- Flow generate timetable đã chuyển khỏi mô hình compiler snippet / IR scaffold.
- [`runAgenticLoop()`](src/app/api/generate-timetable/service.ts) hiện là orchestrator 2-agent:
  1. preprocess input + lấy base solver template,
  2. Agent 1 viết/sửa full generated solver artifact,
  3. hệ thống chạy artifact bằng Python runner,
  4. Agent 2 verify output dựa trên yêu cầu gốc,
  5. feedback quay lại Agent 1 đến khi solved / confidently infeasible / hết lượt.

## Quyết định kiến trúc đã chốt
- Giữ [`buildInputPayload()`](src/lib/timetable-prompt.ts) làm mapping UI payload sang payload chuẩn.
- Giữ preprocess nhưng đổi vai trò: structural validation + authoring context cho solver artifact.
- Bỏ luồng chính dùng IR / deterministic constraint compiler / checker snippet.
- Không còn ép AI trả JSON array compiled constraints.
- Generated solver artifact được quản lý qua [`src/lib/generated-solver-artifacts.ts`](src/lib/generated-solver-artifacts.ts).
- Prompt Agent 1 / Agent 2 được tách sang [`src/lib/timetable-agent-prompts.ts`](src/lib/timetable-agent-prompts.ts).
- Python runner [`python/timetable_solver/runner.py`](python/timetable_solver/runner.py) hỗ trợ dynamic-load solver artifact theo path + entrypoint.

## File chính đã thay đổi
- [`src/app/api/generate-timetable/service.ts`](src/app/api/generate-timetable/service.ts): refactor orchestration sang 2-agent generated solver loop.
- [`src/app/api/generate-timetable/route.ts`](src/app/api/generate-timetable/route.ts): bỏ wiring `useIRPipeline` / `shadowMode` khỏi request path.
- [`src/features/timetable/ai/types.ts`](src/features/timetable/ai/types.ts): thêm type artifact/verifier mới và bỏ feature flags IR khỏi request type.
- [`src/features/timetable/TimetableApp.tsx`](src/features/timetable/TimetableApp.tsx): không gửi feature flags IR cũ nữa.
- [`src/lib/timetable-prompt.ts`](src/lib/timetable-prompt.ts): chỉ giữ payload mapping và solver config helper; đã loại prompt/compiler helper cũ khỏi file.
- [`src/lib/preprocess.ts`](src/lib/preprocess.ts): thêm `authoringContext` cho generated solver flow.
- [`src/lib/sandbox.ts`](src/lib/sandbox.ts): hỗ trợ `SolverExecutionRequest` có `solverArtifactPath` / `entrypoint`.
- [`src/lib/solver-worker.ts`](src/lib/solver-worker.ts): cập nhật contract theo runtime mới.
- [`python/timetable_solver/base_solver_template.py`](python/timetable_solver/base_solver_template.py): base OR-Tools helper/template để Agent 1 dùng làm nền.
- [`python/timetable_solver/runner.py`](python/timetable_solver/runner.py): dynamic loader cho generated solver artifact.
- [`eslint.config.mjs`](eslint.config.mjs): ignore `release/**` để lint không quét artifact build.

## Các lớp cũ đã loại khỏi main flow
- [`src/features/timetable/ai/ir.ts`](src/features/timetable/ai/ir.ts) đã bị xóa khỏi workspace.
- [`src/lib/ir-compiler.ts`](src/lib/ir-compiler.ts) đã bị xóa khỏi workspace.
- [`CONSTRAINT_COMPILER_PROMPT`](src/lib/timetable-prompt.ts), [`buildCompilerUserMessage()`](src/lib/timetable-prompt.ts), và [`VIOLATION_ENRICH_PROMPT`](src/lib/timetable-prompt.ts) đã bị loại khỏi [`src/lib/timetable-prompt.ts`](src/lib/timetable-prompt.ts).

## Verify đã chạy
- Targeted generated-artifact runner verification với Dataset 1: ✅ solved qua [`python/timetable_solver/runner.py`](python/timetable_solver/runner.py) và generated artifact [`python/timetable_solver/generated/generated_solver.py`](python/timetable_solver/generated/generated_solver.py).
- [`npm run lint`](package.json): ✅ pass với 0 errors, còn 3 warnings ngoài scope chính.
- [`npm run build`](package.json): ✅ pass.
- [`./.venv/bin/pytest python/tests`](python/tests): ✅ 35 passed.
- [`npm run dist:linux`](package.json): ✅ pass, tạo AppImage và deb.

## Release artifacts mới nhất
- [`release/Tack-Timetable-3.0.8-x86_64.AppImage`](release/Tack-Timetable-3.0.8-x86_64.AppImage)
- [`release/Tack-Timetable-3.0.8-amd64.deb`](release/Tack-Timetable-3.0.8-amd64.deb)

## Cảnh báo còn lại
- Lint còn 3 warnings không chặn:
  - unused eslint-disable trong [`scripts/benchmark-datasets.mjs`](scripts/benchmark-datasets.mjs),
  - anonymous default export trong legacy [`timetable/postcss.config.js`](timetable/postcss.config.js),
  - anonymous default export trong legacy [`timetable/tailwind.config.js`](timetable/tailwind.config.js).
- Next build vẫn cảnh báo [`scripts/post-build.js`](scripts/post-build.js) bị parse như ES module do [`package.json`](package.json) chưa khai báo `type: module`; không chặn build.
- Electron builder vẫn dùng default icon; không chặn release.

## Kết luận
- Main generation path đã chuyển sang kiến trúc 2-agent generated solver loop.
- IR/compiler snippet path cũ đã bị remove/bypass khỏi main flow.
- Verify chính, tests, build và Linux release đều pass.
