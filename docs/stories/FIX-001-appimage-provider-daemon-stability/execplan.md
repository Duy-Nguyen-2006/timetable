# Exec Plan

## Goal
Eliminate the three root causes of AppImage AI timetable failures: missing apiKey in some transports, provider 400 from strict request features, and daemon JSON pollution from prints. Make provider test and errors diagnostic.

## Scope
In scope:
- All 8 fixes exactly as specified in Fix1.md (dual key, route retry+compat, 12000 tokens, OR smoke chat, bwrap stderr, daemon redirect+import, tolerant parser loop, error strings).
- Harness artifacts: story packet, trace, matrix update.
- Lint + relevant tests + build checks.

Out of scope:
- Changing json_schema usage in success paths (retry only).
- New tests for every compat case.
- Docker executor path.
- UI polish beyond error strings.
- Releasing new AppImage.

## Risk Classification
Risk flags:
- External systems (LLM providers OpenRouter/generic/OpenAI)
- Public contracts (/api/ai/chat, /api/provider/test, daemon JSON protocol)
- Cross-platform (AppImage/Electron + python bundling)
- Existing behavior (AI agent loop, solver execution in packaged)

Hard gates:
- External provider behavior
- Cross-platform desktop runtime

Lane: high-risk (confirmed via intake #8)

## Work Phases
1. Discovery: read Fix1.md + required harness docs + run harness query + gitnexus analyze + impact (callers of invokeChat, daemon paths, route).
2. Design: high-risk templates + story add via harness-cli.
3. Validation planning: update TEST_MATRIX, define acceptance from Fix1.
4. Implementation: 8 targeted edits (chat-client, route, coder, provider-test, 2x python, electron) + harness docs. Impact re-checks before each symbol edit.
5. Verification: lint, unit tests, electron tests, build:executor; manual smoke where possible.
6. Harness update: story status, trace, matrix, detect_changes equiv.

## Stop Conditions
Pause for human confirmation if:
- Any edit would require changing public API shapes beyond error strings.
- Validation commands fail in unexpected way requiring spec change.
- GitNexus impact shows new HIGH blast after partial edits (none expected).
