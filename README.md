# Tack Timetable

## Project variants

This repository currently contains **two UI app variants**:

1. **Primary app (active): Next.js App Router**
   - Entry: [`src/app/page.tsx`](src/app/page.tsx)
   - API routes: [`src/app/api/`](src/app/api/)
   - Main timetable feature: [`src/features/timetable/`](src/features/timetable/)

2. **Legacy playground (reference only): Vite app**
   - Folder: [`timetable/`](timetable/)
   - Entry: [`timetable/src/App.jsx`](timetable/src/App.jsx)

### Which one should be used?
- For all current feature development, API integration, and production flow, use the **Next.js app**.
- Use the legacy Vite app only for historical reference or migration comparison.

## Generate timetable flow (current)
- Client call: [`generateTimetableWithAI()`](src/features/timetable/ai/client.ts:13)
- Route handler: [`POST`](src/app/api/generate-timetable/route.ts:32)
- Service loop: [`runAgenticLoop()`](src/app/api/generate-timetable/service.ts:137)
- Python bridge: [`runSolverDirect()`](src/lib/sandbox.ts:157)
- Python runner: [`main()`](python/timetable_solver/runner.py:10)

## Local verification notes
- Focused lint for changed files:
  - `npx eslint src/features/timetable/ai/types.ts src/features/timetable/ai/client.ts src/app/api/generate-timetable/route.ts src/app/api/generate-timetable/service.ts`
- API smoke/integration check script:
  - [`scripts_test_generate_timetable.sh`](scripts_test_generate_timetable.sh)

## Security note
- Do not commit real API keys/tokens.
- Keep `.env*` out of commits and use placeholders in docs.
