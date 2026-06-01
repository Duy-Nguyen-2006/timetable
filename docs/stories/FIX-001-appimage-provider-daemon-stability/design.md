# Design

## Domain Model
N/A (stability fixes). Key concepts: ChatPayload (dual key transport), ProviderRequest (compat retry envelope), DaemonProtocol (strict JSON stdout only).

## Application Flow
- AI path: TimetableApp -> runLocalAgent (coder/planner/translator/repair turns) -> invokeChat (now dual key) -> /api/ai/chat (retry+compat on 4xx, better errs) -> provider.
- Execution path (AppImage): local-agent -> python-bridge IPC -> electron main runWithDaemon -> daemon worker (tolerant parser) <-> python/code_executor daemon() (redirect stdout) <-> sandbox/bwrap (print to stderr).

## Interface Contract
- POST /api/ai/chat: accepts apiKey in X-Provider-Key and/or body; returns {ok, content, usage?, error?, diagnostics?}. On retry success includes retriedForCompatibility.
- POST /api/provider/test: for OpenRouter now performs extra minimal chat smoke; errors distinguish model-missing vs chat-failed.
- Python daemon JSON protocol unchanged (one JSON object per job), but tolerant to stderr noise on stdout buffer.
- No new public contracts.

## Data Model
N/A.

## UI / Platform Impact
- AppImage (linux packaged Electron + bundled python) reliability for AI solve.
- Dev mode (no sandbox or direct) unaffected or improved.
- Settings "Test Connection" now catches chat-incompat early for OpenRouter.
- Error strings in UI (aiError) now actionable for key vs body vs config issues.

## Observability
- Server: diagnostics (provider, host, model, usedResponseFormat, maxTokensUsed, retried) on error/success-retry (no keys).
- Electron: console.warn for [PYTHON-DAEMON NON-JSON] lines.
- Python: bwrap and internal prints now on stderr (visible in packaged logs if captured).
- No new metrics.

## Alternatives Considered
1. Always strip json_schema in first request: rejected (keep first as-is per spec, only retry on failure).
2. Raise coder max_tokens even higher or make configurable per provider: out of scope; 12000 sufficient + safer default.
3. Full stdout redirect in all python paths: only daemon() as specified (main() and checks remain for dev).
