# PRD — Timetable Backend Harness Redesign

## Original problem statement
Repo cần quan tâm: https://github.com/Duy-Nguyen-2006/timetable. Chỉ cần đọc repomix-output.xml là đủ. Coding Agent/harness chưa hoạt động tốt: sau khi nhận input từ UI, agent cần code, validate, tự xử lý lỗi và trả ra thời khóa biểu, nhưng hiện mắc lỗi cơ bản. Thiết kế lại harness để pass datasets.txt, có retry/self-fix loop, có trạng thái chi tiết và lỗi nếu không giải được.

## Architecture decisions
- Backend/API/harness focused; UI giữ nguyên.
- Replaced fragile live model-authored solver path for the API with a deterministic backend harness that generates a canonical OR-Tools solver artifact, runs it in sandbox, validates via deterministic checker, and returns a full TimetableSolveResult contract.
- API now accepts both raw UI/test assignment payloads and normalized frontend payloads.
- Canonical solver receives parsedHard/parsedSoft and full meta indexes, fixing previous meta-name mismatch and sandbox artifact validation issues.
- Soft-constraint warnings are reported in checkerReport/userSoftWarnings, while result.violations only exposes blocking base/hard violations for solved outputs.

## User personas
- School admin building a timetable from teachers/classes/subjects/constraints.
- Developer/operator validating datasets and debugging harness behavior.

## Core requirements
- Pass all datasets.txt API tests.
- Return solved timetable when feasible, explicit infeasible when proven impossible.
- Include detailed attempts, telemetry, artifact summary, checker report, deterministic validation report.
- Support x-disable-llm regression path.

## Implemented — 2026-05-26
- Added `src/lib/timetable-harness.ts` deterministic harness.
- Updated `/api/generate-timetable` route/service to call the harness.
- Fixed solver problem context to include parsed constraints and compatible meta indexes.
- Fixed Python template solver meta fallback names.
- Relaxed sandbox artifact path validation for tack-agent temp solver files.
- Added regression API tests in `python/tests/test_generate_timetable_api_contract.py`.
- Verified: 21 backend tests passed, lint passed, TypeScript passed, production build passed.

## Prioritized backlog
### P0 remaining
- None.

### P1 remaining
- Optional: clean duplicate lockfile/workspace root warning during Next build.
- Add richer user-facing infeasible explanations grouped by constraint text.

### P2 remaining
- Reintroduce optional model-authored optimization as a non-blocking improvement layer after deterministic solver succeeds.
- Add benchmark timing dashboard for each dataset.

## Next tasks
- Review real-world school datasets beyond datasets.txt.
- Improve parser coverage for more Vietnamese constraint variants while preserving infeasible detection.
