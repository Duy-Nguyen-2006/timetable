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
- Client call: [`generateTimetableWithAI()`](src/features/timetable/ai/client.ts:5)
- Route handler: [`POST`](src/app/api/generate-timetable/route.ts:43)
- Service orchestrator: [`runPiOrchestratedLoop()`](src/app/api/generate-timetable/service.ts:215)
- Deterministic checker: [`validateTimetableResult()`](src/lib/timetable-validator.ts:194)
- Python runner: [`main()`](python/timetable_solver/runner.py:33)

## Current architecture status
- Legacy in-repo agent loop has been removed.
- The backend now runs a **`pi.dev + checker` orchestration** backed by a real server-side HTTP adapter.
- Current runtime behavior: call the configured LowPrizo/OpenAI-compatible chat completion endpoint, ask it to return a strict JSON solver result, persist the returned Python solver artifact locally for traceability, then let the deterministic checker either accept it, report soft warnings, or request a recode loop up to 3 attempts.
- `LOWPRIZO_API_BASE_URL` or `PI_DEV_BASE_URL`: base URL for the pi.dev-compatible backend. For LowPrizo, use `https://api.lowprizo.com/v1`.
- `PI_DEV_GENERATE_PATH`: path for the generation endpoint. For LowPrizo, use `/chat/completions`.
- `PI_DEV_MODEL`: model name for runtime generation. Default: `devstral-latest`.

- Client requests must still send the user's API key via `x-lowprizo-api-key` or `apiKey` in the request body.
- If the runtime endpoint or API key is missing/invalid, `/api/generate-timetable` now returns a clear runtime/configuration error instead of silently falling back to the local solver.

## Final decision rules for the new pipeline
1. If Pi does **not** produce a timetable candidate, return: **`Không tạo được thời khóa biểu.`**
2. If Pi produces a timetable and base + hard constraints pass:
   - if all soft constraints pass, return: **`Tất cả ràng buộc đều thỏa mãn.`**
   - if some soft constraints fail, still return a solved timetable and surface those soft warnings to the user.
3. If base or hard constraints fail, the checker must ask Pi to code again.

## Local verification notes
- Lint: `npm run lint`
- API smoke test: `curl -X POST http://127.0.0.1:3000/api/generate-timetable ...`
- `npm run build` is blocked in this environment for Next.js projects, so build verification could not be executed here.

## Security note
- Do not commit real API keys/tokens.
- Keep `.env*` out of commits and use placeholders in docs.
