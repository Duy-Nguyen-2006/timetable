# Tack Timetable

AI-assisted timetable generator built with Next.js + React + TypeScript, with local Coder/Reviewer loop and Python execution bridge.

## Active app

- App entry: [`src/app/page.tsx`](src/app/page.tsx)
- Layout + global styles: [`src/app/layout.tsx`](src/app/layout.tsx), [`src/app/globals.css`](src/app/globals.css)
- Main feature UI: [`src/features/timetable/TimetableApp.tsx`](src/features/timetable/TimetableApp.tsx)

## Current API routes

- Provider connectivity test: [`POST /api/provider/test`](src/app/api/provider/test/route.ts:9)
- Server-side LLM chat proxy: [`POST /api/ai/chat`](src/app/api/ai/chat/route.ts:19)

## AI execution flow (current)

1. User configures provider in UI ([`SettingsModal`](src/features/timetable/SettingsModal.tsx:21)).
2. Orchestrator runs in browser ([`runLocalAgent`](src/features/timetable/ai/local-agent.ts:18)).
3. Coder and Reviewer call LLM through server route ([`/api/ai/chat`](src/app/api/ai/chat/route.ts:19)).
4. Generated Python is executed through bridge ([`executeGeneratedCode`](src/features/timetable/ai/python-bridge.ts:20)).
5. Result is rendered as timetable table and exported to Excel in UI ([`handleDownloadExcel`](src/features/timetable/TimetableApp.tsx:1135)).

## Important behavior notes

- Reviewer reject is enforced and retried with bounded rounds in [`runLocalAgent`](src/features/timetable/ai/local-agent.ts:18).
- Browser-side fake execution stub has been removed; if IPC is missing, bridge throws explicit error in [`python-bridge.ts`](src/features/timetable/ai/python-bridge.ts:20).

## Run locally

- Install: `npm install`
- Dev: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`

## Security

- Do not commit real secrets from `.env*`.
- Keep provider/API keys out of source files and docs.
