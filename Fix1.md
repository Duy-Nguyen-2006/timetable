TASK: Fix AppImage backend instability, provider HTTP 400, and Python daemon JSON parsing.

Context:
This repo is a Next.js + Electron + Python/OR-Tools timetable app.
The AppImage build fails with:
- Provider/API 400 even when API key is correct.
- "Coder could not produce an executable schedule. Last failure: [MAIN] Failed to parse daemon output: Unexpected token 'B', "[Bubblewrap"... is not valid JSON"
- Electron GLib/VSync warnings may appear but are not the root solver failure.

Do NOT hardcode any API key.
Do NOT log real API keys.
Keep backward compatibility with OpenRouter, generic OpenAI-compatible APIs, and OpenAI Responses API.

============================================================
FIX 1 — Make internal chat API key transport robust
============================================================

File: src/features/timetable/ai/chat-client.ts

Problem:
invokeChat destructures apiKey out of payload and sends it only in custom header X-Provider-Key.
In AppImage/Next standalone/Electron, this can fail or be stripped. Then /api/ai/chat sees missing apiKey and returns 400 even though user entered the correct key.

Change:
Send apiKey in BOTH places:
- header: X-Provider-Key
- internal JSON body: apiKey

Patch idea:

export async function invokeChat(payload: ChatPayload): Promise<{ content?: string; usage?: ChatUsage }> {
  const { apiKey, ...rest } = payload;

  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Provider-Key': apiKey,
    },
    body: JSON.stringify({
      ...rest,
      apiKey, // internal server fallback; never forward this field except as Authorization bearer
    }),
  });

  ...
}

Acceptance:
- /api/ai/chat no longer returns 400 Missing baseURL/apiKey/model/messages when config is valid.
- No real key appears in console logs or UI.

============================================================
FIX 2 — Harden /api/ai/chat against provider HTTP 400
============================================================

File: src/app/api/ai/chat/route.ts

Problem:
Current route forwards response_format/json_schema and large max_tokens to all providers.
Many OpenRouter/generic models reject:
- response_format: { type: "json_schema", ... }
- max_tokens too high, especially coder max_tokens=30000
This produces Provider HTTP 400 even with a valid API key.

Required behavior:
1. Keep first request as-is.
2. If provider returns HTTP 400/422, retry once with a compatibility body:
   - remove response_format for chat/completions
   - remove text.format for OpenAI Responses API
   - clamp max_tokens/max_output_tokens to a safe value
   - strip cache_control from messages
   - remove anthropic-beta prompt-caching header on retry
3. If retry succeeds, return ok:true normally.
4. If retry fails, return a clear error saying provider rejected request body, not API key.
5. Add safe diagnostics:
   - provider
   - baseURL host only
   - model
   - status
   - whether response_format was used
   - max token number
   - NEVER log apiKey.

Implementation detail:

Add helpers similar to:

function stripCacheControlFromMessages(messages: unknown): unknown {
  if (!Array.isArray(messages)) return messages;
  return messages.map((message) => {
    if (!message || typeof message !== 'object') return message;
    const { cache_control, ...rest } = message as Record<string, unknown>;
    return rest;
  });
}

function buildCompatibilityRetryBody(
  provider: ProviderType,
  requestBody: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...requestBody };

  if (provider === 'openai-responses') {
    delete next.text;
    const rawMax = Number(next.max_output_tokens ?? 4000);
    next.max_output_tokens = Math.min(
      Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 4000,
      12000
    );
    return next;
  }

  delete next.response_format;
  next.messages = stripCacheControlFromMessages(next.messages);
  const rawMax = Number(next.max_tokens ?? 4000);
  next.max_tokens = Math.min(
    Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 4000,
    12000
  );
  return next;
}

Then in POST:
- Build original chatRequest.
- Call provider.
- If response.ok false and status is 400 or 422:
  - build retryBody
  - retry same URL with Authorization and Content-Type only
  - parse retry result
- Return original detailed error only if retry also fails.

Important:
- Keep parseProviderResponse support for JSON and SSE.
- Keep Authorization: Bearer apiKey only on server side.
- Do not expose raw key in returned JSON.

Acceptance:
- OpenRouter models that reject json_schema still work by falling back to plain strict JSON output.
- Generic chat-completions APIs work even if they do not support json_schema.
- Error message distinguishes:
  - internal missing config
  - provider rejected request body
  - provider auth failure

============================================================
FIX 3 — Reduce coder max_tokens blast radius
============================================================

File: src/features/timetable/ai/coder.ts

Problem:
Coder uses max_tokens: 30000. Many providers reject this with HTTP 400.

Change:
Set coder max_tokens to safer default, e.g. 12000 or 16000.

Patch:
Change:

max_tokens: 30000,

to:

max_tokens: 12000,

Rationale:
The solver skeleton handles most built-in constraints. Coder only writes custom_dsl code, so 30000 is unnecessary and breaks many providers.

Acceptance:
- Coder requests no longer trigger provider 400 due token limit.
- Existing parseModelJson still accepts JSON from model output.

============================================================
FIX 4 — Make provider test reflect real chat compatibility
============================================================

File: src/app/api/provider/test/route.ts

Problem:
OpenRouter test currently checks /auth/key and /models. That proves key/model exist, but not that the model accepts the real request shape used by /api/ai/chat.

Change:
For OpenRouter:
1. Keep /auth/key.
2. Keep /models.
3. Add a minimal /chat/completions smoke call:
   - model
   - messages: [{ role: "user", content: "Return OK" }]
   - max_tokens: 2
   - temperature: 0
   - no response_format
4. If this smoke call fails, report "key valid, model exists, but chat completion failed" with provider status/details.

Do not use json_schema in provider test.

Acceptance:
- Test Connection catches model route incompatibility early.
- It does not falsely say key invalid when model/request body is the issue.

============================================================
FIX 5 — Fix Bubblewrap stdout breaking daemon JSON
============================================================

File: sandbox/bubblewrap_executor.py

Problem:
This line prints to stdout:
print(f"[Bubblewrap] Running {file_path.name} in lightweight sandbox...")

Daemon mode requires stdout to contain only JSON lines.
This log causes:
Unexpected token 'B', "[Bubblewrap"... is not valid JSON

Change:
Send log to stderr or remove it.

Patch:
Change:

print(f"[Bubblewrap] Running {file_path.name} in lightweight sandbox...")

to:

print(f"[Bubblewrap] Running {file_path.name} in lightweight sandbox...", file=sys.stderr)

Acceptance:
- AppImage no longer fails with Unexpected token 'B'.
- Bubblewrap diagnostics still appear in stderr.

============================================================
FIX 6 — Redirect noisy Python executor internals away from daemon stdout
============================================================

File: python/code_executor.py

Problem:
Even after fixing Bubblewrap, any future print inside run_user_code/sandbox can break daemon JSON protocol.

Change:
In daemon(), wrap run_user_code execution with contextlib.redirect_stdout(sys.stderr), then print exactly one JSON line to stdout.

Add import:

import contextlib

In daemon(), change execute branch from:

try:
    result = run_user_code(code, timeout, job_dir)
except Exception:
    result = ...
...
print(json.dumps(result, ensure_ascii=False), flush=True)

to:

try:
    with contextlib.redirect_stdout(sys.stderr):
        result = run_user_code(code, timeout, job_dir)
except Exception:
    result = ...
...
print(json.dumps(result, ensure_ascii=False), flush=True)

Do not redirect stdout around the final JSON print.

Acceptance:
- Daemon stdout only emits JSON.
- Any internal diagnostic print goes to stderr.

============================================================
FIX 7 — Make Electron daemon parser tolerate noisy lines
============================================================

File: electron/main.mjs

Problem:
Current daemon stdout handler parses the first line as JSON. If any non-JSON line appears, the job fails immediately.

Change:
In worker.stdout.on('data'), process all complete lines.
Ignore non-empty lines that do not start with "{".
Only resolve daemonPending when a valid JSON object line is parsed.

Patch shape:

worker.stdout.on('data', (chunk) => {
  daemonStdout += chunk.toString();

  while (true) {
    const newlineIdx = daemonStdout.indexOf('\n');
    if (newlineIdx === -1) return;

    const line = daemonStdout.slice(0, newlineIdx).trim();
    daemonStdout = daemonStdout.slice(newlineIdx + 1);

    if (!line) continue;

    if (!line.startsWith('{')) {
      console.warn('[PYTHON-DAEMON NON-JSON]', line);
      continue;
    }

    if (!daemonPending) continue;

    const { resolve, timer } = daemonPending;
    daemonPending = null;
    clearTimeout(timer);

    try {
      const parsed = JSON.parse(line);
      let resultData;
      if (parsed.resultPath && fs.existsSync(parsed.resultPath)) {
        try {
          resultData = JSON.parse(fs.readFileSync(parsed.resultPath, 'utf8'));
        } catch {
          /* ignore */
        }
      }
      resolve({ ...parsed, ...(resultData ? { resultData } : {}) });
    } catch (e) {
      resolve({
        ok: false,
        status: 'crashed',
        durationMs: 0,
        errorDigest: `[MAIN] Failed to parse daemon output: ${e.message}`,
      });
    }

    return;
  }
});

Acceptance:
- Non-JSON stdout noise no longer kills the daemon job.
- Valid JSON result still resolves correctly.

============================================================
FIX 8 — Improve error messages in UI/backend
============================================================

Files:
- src/app/api/ai/chat/route.ts
- src/features/timetable/ai/chat-client.ts
- optionally TimetableApp.tsx

Requirements:
When /api/ai/chat fails:
- If missing internal fields, return:
  "Internal chat config missing: baseURL/model/messages/apiKeyReceived=false"
  but do not include key.
- If provider returns 401/403:
  say auth/key rejected.
- If provider returns 400/422:
  say request body rejected and include sanitized details.
- If compatibility retry succeeds:
  do not show warning to user, but optionally include a non-fatal diagnostics field.

Acceptance:
- User can tell whether issue is key, model, provider request format, or internal app config.

============================================================
BUILD / TEST
============================================================

Run:

npm run lint
npm run test
npm run test:electron
npm run build:executor
npm run package:linux

Manual tests:
1. Run dev mode with OpenRouter baseURL:
   https://openrouter.ai/api/v1
   model: deepseek/deepseek-v4-flash or another available model.
   Test Connection should pass.
2. Generate a small timetable.
3. Package AppImage.
4. Run AppImage and generate same timetable.
5. Confirm no:
   - Missing baseURL/apiKey/model/messages
   - Provider HTTP 400 caused by json_schema
   - Unexpected token 'B', "[Bubblewrap"... is not valid JSON
6. GLib/VSync warnings may still appear; they are not blocking unless app crashes.
