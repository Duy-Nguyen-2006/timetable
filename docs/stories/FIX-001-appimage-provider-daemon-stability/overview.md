# Overview

## Current Behavior
AppImage/Electron builds suffer instability:
- /api/ai/chat returns 400 "Missing baseURL/apiKey/..." even with valid key (apiKey only in header, stripped in some envs).
- Provider HTTP 400 from json_schema + high max_tokens (30000) on OpenRouter/generic models, even with correct key.
- "Coder could not... Unexpected token 'B', "[Bubblewrap"... is not valid JSON" because bwrap print + internal prints pollute daemon stdout JSON protocol.
- Weak provider /test only checks /auth/key + /models for OR, not actual chat request shape.
- Poor error messages do not distinguish missing config vs body rejection vs auth failure.

## Target Behavior
- Robust dual transport for apiKey (header + body) so /api/ai/chat always receives it.
- /api/ai/chat retries once on 400/422 with stripped json_schema, clamped tokens<=12000, no cache_control, minimal headers.
- Coder uses safe 12000 max_tokens.
- Provider test does minimal chat smoke for OR (no schema) and fails explicitly on chat-incompat.
- Daemon stdout: only JSON lines; noise (bwrap, prints) to stderr; parser tolerates/skips non-JSON lines.
- Errors clearly state: internal config missing (with apiKeyReceived flag), auth rejected, or request body rejected (with sanitized provider/host/model/format/tokens diagnostics, no key).

## Affected Users
- All users of packaged AppImage (Linux desktop) running AI timetable generation with custom constraints or any LLM provider.
- Users configuring OpenRouter or generic OpenAI-compatible providers.

## Affected Product Docs
- None yet (harness v0); this stabilizes the AI+execution contract described in README and src/features/timetable/ai/* 

## Non-Goals
- Changing solver logic or constraint DSL.
- Adding new providers.
- Fixing GLib/VSync Electron warnings (cosmetic, non-blocking).
- Docker sandbox path (only bwrap+daemon affected here).
