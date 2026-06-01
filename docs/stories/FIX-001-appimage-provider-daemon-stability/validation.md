# Validation

## Proof Strategy
All acceptance criteria from Fix1.md must pass. Primary proof: no more 400-missing-key, no more json_schema 400 on valid keys, no "Unexpected token 'B'" parse crashes in AppImage, Test Connection catches incompat, errors are distinguishable.

## Test Plan
| Layer | Cases |
| --- | --- |
| Unit | Existing coder/planner/repair/translator tests (mock invokeChat); route __chatInternal helpers (new strip/build funcs); local-agent-utils error builders; python syntax/ast; electron docker-check (unchanged). |
| Integration | /api/ai/chat with simulated 400 -> retry path; provider/test for OR now includes smoke; python daemon roundtrip (via bridge or direct). |
| E2E | (dev) Run with OpenRouter key + model that rejects json_schema (e.g. some free); generate small timetable with custom hard constraint -> succeeds. |
| Platform | AppImage package + run on Linux: Test Connection, small AI timetable gen (with/without custom dsl). Confirm no B-token error, no 400-missing, stderr has bwrap logs. |
| Performance | N/A (token clamp may slightly affect very large custom code, but 12k sufficient). |
| Logs/Audit | Verify no API keys in any logs/errors/diagnostics; [PYTHON-DAEMON NON-JSON] warnings appear for noise; server diagnostics present on 4xx. |

## Fixtures
- Valid OpenRouter (or compatible) API key + model supporting chat/completions (deepseek or similar).
- Sample timetable request with at least one hard custom_dsl constraint (to exercise coder path).
- Simulated 400 responses for route retry tests (existing test patterns).

## Commands
```bash
npm run lint
npm run test
npm run test:electron
npm run build:executor
npm run package:linux   # produces AppImage; manual run required for full platform proof
```

## Acceptance Evidence
- [ ] /api/ai/chat never 400-missing when header+body both sent.
- [ ] Provider 400 on json_schema triggers one retry without it; success or clear "body rejected" error (not "key invalid").
- [ ] Coder requests use 12000.
- [ ] OR Test Connection performs chat smoke and reports chat-fail distinctly.
- [ ] AppImage: no "Unexpected token 'B'" or parse daemon crash; bwrap messages only on stderr.
- [ ] Error strings contain "Internal chat config missing: ...apiKeyReceived=", "auth rejected", or "request body rejected" + sanitized fields.
- [ ] No real keys in source, logs, errors, or committed artifacts.
- [ ] All 8 fixes + harness docs landed; git status clean except intended.
