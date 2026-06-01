#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const PORT = Number(process.env.SMOKE_PORT || 3000);
const HOST = process.env.SMOKE_HOST || "127.0.0.1";
const READY_TIMEOUT_MS = Number(process.env.SMOKE_READY_TIMEOUT_MS || 60_000);
const START_CMD = process.env.SMOKE_START_COMMAND?.trim() || "";
const LOG_PATH = resolve(repoRoot, "windows-smoke.log");

const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";
const npxCmd = isWin ? "npx.cmd" : "npx";

let cmd, args;
if (START_CMD) {
  if (isWin) {
    cmd = "cmd.exe";
    args = ["/c", START_CMD];
  } else {
    cmd = "sh";
    args = ["-c", START_CMD];
  }
} else {
  cmd = npmCmd;
  args = ["run", "start", "--", "--port", String(PORT), "--hostname", HOST];
}

console.log(`[http-smoke] launching: ${cmd} ${args.join(" ")}`);
console.log(`[http-smoke] target: http://${HOST}:${PORT}`);
console.log(`[http-smoke] log:    ${LOG_PATH}`);

const logStream = createWriteStream(LOG_PATH, { flags: "w" });
const child = spawn(cmd, args, {
  cwd: repoRoot,
  env: { ...process.env, PORT: String(PORT), HOST, HOSTNAME: HOST },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  detached: false,
});

child.stdout.pipe(logStream, { end: false });
child.stderr.pipe(logStream, { end: false });
child.stdout.on("data", (b) => process.stdout.write(b));
child.stderr.on("data", (b) => process.stderr.write(b));

let exitedEarly = false;
let exitInfo = null;
child.on("exit", (code, signal) => {
  exitedEarly = true;
  exitInfo = { code, signal };
});

const probe = async (path) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5_000);
  try {
    const res = await fetch(`http://${HOST}:${PORT}${path}`, {
      signal: ctrl.signal,
      headers: { Accept: "text/html,application/json" },
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, err: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
};

const cleanup = (reason) => {
  if (!child.killed && child.exitCode === null) {
    console.log(`[http-smoke] stopping app (${reason})`);
    try {
      if (isWin) {
        spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        child.kill("SIGTERM");
      }
    } catch { /* ignore */ }
  }
};

try {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastErr = "";
  while (Date.now() < deadline) {
    if (exitedEarly) {
      console.error(`[http-smoke] FAIL: app exited before ready (code=${exitInfo?.code}, signal=${exitInfo?.signal})`);
      process.exit(1);
    }
    const root = await probe("/");
    if (root.ok) {
      console.log(`[http-smoke] / -> ${root.status} OK`);
      const health = await probe("/api/provider/test").catch(() => null);
      if (health) {
        console.log(`[http-smoke] /api/provider/test -> ${health.status}`);
      }
      console.log("[http-smoke] PASS");
      cleanup("done");
      await sleep(500);
      logStream.end();
      process.exit(0);
    }
    lastErr = root.err || `status=${root.status}`;
    await sleep(1_000);
  }

  console.error(`[http-smoke] FAIL: not ready within ${READY_TIMEOUT_MS}ms (last: ${lastErr})`);
  cleanup("timeout");
  await sleep(500);
  logStream.end();
  process.exit(1);
} catch (err) {
  console.error("[http-smoke] FAIL:", err?.stack || err?.message || String(err));
  cleanup("error");
  await sleep(500);
  logStream.end();
  process.exit(1);
}
