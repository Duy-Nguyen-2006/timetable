#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  const txt = readFileSync(file, "utf8");
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined || process.env[k] === "") {
      process.env[k] = v;
    }
  }
}

loadEnvFile(resolve(repoRoot, ".env.local"));
loadEnvFile(resolve(repoRoot, ".env"));

const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
const baseUrl = (process.env.OPENROUTER_BASE_URL || process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
const model = process.env.MODEL_NAME || process.env.AI_MODEL || process.env.LLM_MODEL || "deepseek/deepseek-v4-flash";

function maskKey(k) {
  if (!k) return "(missing)";
  if (k.length <= 12) return "***";
  return k.slice(0, 8) + "..." + k.slice(-4);
}

console.log("[smoke] base:", baseUrl);
console.log("[smoke] model:", model);
console.log("[smoke] key:", maskKey(apiKey));

if (!apiKey) {
  console.error("[smoke] FAIL: no API key found in env (.env.local OPENROUTER_API_KEY)");
  process.exit(2);
}

const body = {
  model,
  max_tokens: 64,
  messages: [
    { role: "system", content: "You are a smoke test. Reply with the single word: OK" },
    { role: "user", content: "ping" },
  ],
};

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
    body: JSON.stringify(body),
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
