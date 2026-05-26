# Workspace notes

- Repo: `timetable`
- Local workspace: `/home/duy/Downloads/timetable`
- Primary stack: Next.js (App Router) + React + TypeScript + Tailwind CSS
- Secondary stack: Python timetable solver and validator
- Roo MCP config: [`.mcp.json`](.mcp.json)
- Optional operator context source: `/home/duy/.claude/CLAUDE.md`

## Core rules
- Nêu assumption rõ ràng khi requirement còn mơ hồ.
- Ưu tiên cách đơn giản nhất đủ giải quyết yêu cầu.
- Chỉ sửa đúng phần cần sửa; không refactor ngoài scope.
- Không chép secret/token/password từ `.env*`, `/home/duy/.claude/CLAUDE.md` hoặc nguồn khác vào repo files.
- Khi cần docs/setup/config của thư viện, ưu tiên Context7 MCP.
- Nếu có nhiều implementation options, chọn option ít rủi ro nhất trước.
## Workflow
- Trước khi sửa code, đọc codebase hiện tại bằng công cụ phù hợp (ưu tiên search/read theo scope nhỏ).
- Với task dài, tạo và cập nhật [`Walkthrough.md`](Walkthrough.md) theo checklist có bước verify rõ ràng; làm xong mục nào tick mục đó ngay.
- Verify ngay sau từng đầu mục; không dồn verify về cuối.
- Trước khi sửa function/class/method, chạy impact analysis (call sites, API contract, data flow).
- Trước khi commit/push, chạy detect-changes và các lệnh verify liên quan.
- Nếu index stale, chạy lại phân tích index (vd: `gitnexus analyze`).
- Nếu đổi UI, verify bằng `agent-browser` hoặc screenshot compare.

## Important files
- Agent rules file: [`AGENTS.md`](AGENTS.md)
- Product/docs: [`README.md`](README.md), [`PLAN.md`](PLAN.md) (worklog.md removed as historical)
- Next.js app shell: [`src/app/layout.tsx`](src/app/layout.tsx), [`src/app/page.tsx`](src/app/page.tsx), [`src/app/globals.css`](src/app/globals.css)
- API routes: [`src/app/api/`](src/app/api/)
- Timetable feature UI: [`src/features/timetable/`](src/features/timetable/)
- Reusable components: [`src/components/ui/`](src/components/ui/)
- Core libs: [`src/lib/`](src/lib/)
- Python solver package: [`python/timetable_solver/`](python/timetable_solver/)
- Python tests: [`python/tests/`](python/tests/)
- Prisma schema: [`prisma/schema.prisma`](prisma/schema.prisma)
- Legacy Vite playground (if needed): [`timetable/`](timetable/)

## Environment & secrets
- Env files: `.env`, `.env.local`, `timetable/.env.local`.
- Không commit API keys/tokens thật.
- Nếu cần thêm biến môi trường, cập nhật docs kèm ví dụ placeholder.

## Verify checklist (minimum)
- Frontend (Next.js): `npm run lint` (nếu có), `npm run build`.
- Python solver: chạy tests trong [`python/tests/`](python/tests/).
- API routes thay đổi: test route bằng request thật hoặc integration test.
- UI thay đổi: verify render + interaction chính + responsive cơ bản.

## Deploy notes
- Nếu deploy server thật, xác nhận target host/path trước khi đồng bộ file.
- Không giả định VPS là git repo; ưu tiên `rsync/scp` khi môi trường không hỗ trợ `git pull`.
- Tránh ghi đè nhầm file env hoặc file runtime cấu hình production.

## External context summary
- `/home/duy/.claude/CLAUDE.md` có thể chứa operator-only context (hạ tầng, credentials, notes).
- Chỉ đọc trực tiếp khi task thật sự cần hạ tầng/docs/credential liên quan.
- Không ghi lại secret từ nguồn đó vào commit, docs, logs, hay file trong repo.

## GitHub
- Dùng remote hiện tại của repo `timetable`.
- Nếu cần đổi remote, ghi rõ lý do và xác nhận trước khi push.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **timetable** (1759 symbols, 3105 relationships, 81 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
