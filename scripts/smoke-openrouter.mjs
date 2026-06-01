#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

if (typeof process.loadEnvFile === "function") {
  for (const file of [".env.local", ".env"]) {
    const p = resolve(repoRoot, file);
    if (existsSync(p)) {
      try { process.loadEnvFile(p); } catch { /* ignore */ }
    }
  }
}

const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
const baseUrl = (process.env.OPENROUTER_BASE_URL || process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
const model = process.env.MODEL_NAME || process.env.AI_MODEL || process.env.LLM_MODEL || "deepseek/deepseek-v4-flash";

const maskKey = (k) => (!k ? "(missing)" : k.length <= 12 ? "***" : `${k.slice(0, 8)}...${k.slice(-4)}`);

console.log("[smoke] base:", baseUrl);
console.log("[smoke] model:", model);
console.log("[smoke] key:", maskKey(apiKey));

if (!apiKey) {
  console.error("[smoke] FAIL: no API key found in env (OPENROUTER_API_KEY)");
  process.exit(2);
}

const ctrl = new AbortController();
const timer = setTimeout(() => ctrl.abort(), 60_000);

try {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://github.com/local-smoke-test",
      "X-Title": "timetable smoke test",
    },
    body: JSON.stringify({
      model,
      max_tokens: 64,
      messages: [
        { role: "system", content: "You are a smoke test. Reply with the single word: OK" },
        { role: "user", content: "ping" },
      ],
    }),
    signal: ctrl.signal,
  });

  const text = await res.text();
  console.log("[smoke] http status:", res.status);

  if (!res.ok) {
    console.error("[smoke] FAIL body:", text.slice(0, 2000));
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("[smoke] FAIL: non-JSON response:", text.slice(0, 500));
    process.exit(1);
  }

  const reply = data?.choices?.[0]?.message?.content;
  if (typeof reply !== "string") {
    console.error("[smoke] FAIL: missing choices[0].message.content");
    console.error(JSON.stringify(data, null, 2).slice(0, 2000));
    process.exit(1);
  }

  console.log("[smoke] reply:", reply.trim());
  console.log("[smoke] usage:", JSON.stringify(data.usage || {}));
  console.log("[smoke] PASS");
} catch (err) {
  console.error("[smoke] FAIL:", err?.message || String(err));
  process.exit(1);
} finally {
  clearTimeout(timer);
}
