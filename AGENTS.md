# AGENTS.md - Tack Timetable

## Context
Dự án là ứng dụng điện tử (Electron + Next.js) kết hợp AI để xếp thời khóa biểu bằng OR-Tools.
Luồng chính: UI nhập liệu -> AI Local Agent (TS) sinh code Python -> Thực thi an toàn trong Sandbox -> Validate -> Trả kết quả.

## Workflow Rules (BẮT BUỘC)
1. **Impact Analysis**: TRƯỚC KHI SỬA BẤT KỲ FILE NÀO, PHẢI DÙNG `gitnexus_impact` hoặc `gitnexus_context` để xem hàm nào đang gọi nó. Không được phép sửa mù quáng.
2. **Refactor**: Nếu đổi tên hàm/class, dùng `gitnexus_rename`, cấm find-and-replace thủ công.
3. **Scope**: Chỉ sửa đúng phần được yêu cầu. Không tự ý refactor toàn bộ hệ thống nếu không được bảo.
4. **Verify**: Mọi thay đổi logic solver phải đi kèm test case.

## Tech Stack
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui.
- **Desktop**: Electron 37 (Main process quản lý Python executor).
- **Backend/AI**: Python 3.11+ (OR-Tools), OpenAI SDK (proxy qua Next.js routes).
- **Testing**: Jest/Vitest (TS), Pytest (Python).

## Critical Architecture
1. **AI Pipeline** (`src/features/timetable/ai/`):
   - Chạy hoàn toàn phía client/browser thông qua `runLocalAgent`.
   - Gồm 6 stage: Translator -> Planner -> Coder -> Sandbox -> Validator -> Repair.

2. **Python Execution**:
   - Code Python được sinh ra chạy qua `python/code_executor.py`.
   - Cơ chế Sandbox (Docker/Bubblewrap) là bắt buộc để bảo mật.

3. **Data Flow**:
   - Dữ liệu đầu vào chuẩn hóa qua `AgentInputPayload`.
   - Kết quả trả về dưới dạng JSON (`result.json`), không parse từ stdout hỗn độn.

## Security & Safety
- **Security**: Tuyệt đối không commit `.env`, API keys, hay secrets. Không hardcode credentials.
- **Sandbox**: Không được phép chạy code AI trực tiếp trên host mà không qua isolation.
- **Typing**: Dùng TypeScript strict. Tránh `any` trừ khi giao tiếp với Python raw JSON.

## Key Files
- **Entry**: `src/app/page.tsx` -> `src/features/timetable/TimetableApp.tsx`
- **AI Core**: `src/features/timetable/ai/local-agent.ts` (Orchestrator chính)
- **Python Bridge**: `src/features/timetable/ai/python-bridge.ts` & `python/code_executor.py`
- **Prompts**: `prompts/*.md` (Source of truth cho behavior AI)
- **Tools**: Dùng GitNexus MCP để phân tích dependency (`gitnexus_impact`, `gitnexus_context`).

## Workflows
1. **Dev**: `npm run dev` (Next.js) + `npm run electron` (nếu cần test native).
2. **Build**: `npm run build` (tạo standalone) -> `electron-builder`.
3. **Verify**: Chạy `npm run lint` và `npm test` trước khi commit.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **timetable** (1987 symbols, 3255 relationships, 80 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/timetable/context` | Codebase overview, check index freshness |
| `gitnexus://repo/timetable/clusters` | All functional areas |
| `gitnexus://repo/timetable/processes` | All execution flows |
| `gitnexus://repo/timetable/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
