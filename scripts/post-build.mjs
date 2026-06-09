import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const required = ['.next/standalone/server.js', 'public/templates/solver_skeleton.py'];
const missing = required.filter((p) => !existsSync(p));

if (missing.length > 0) {
  console.warn(`[post-build] Missing optional artifacts: ${missing.join(', ')}`);
}

const requiredPrompts = [
  'public/prompts/translator.system.md',
];
const missingPrompts = requiredPrompts.filter((p) => !existsSync(p));
if (missingPrompts.length > 0) {
  console.error(`[post-build] CRITICAL: Missing prompt files required for AI pipeline: ${missingPrompts.join(', ')}`);
  console.error('[post-build] The AppImage will fail to generate timetables without these prompts.');
  process.exit(1);
}

const standaloneDir = path.join(process.cwd(), '.next', 'standalone');
const standaloneNextDir = path.join(standaloneDir, '.next');
mkdirSync(standaloneNextDir, { recursive: true });

const staticDir = path.join(process.cwd(), '.next', 'static');
if (existsSync(staticDir)) {
  cpSync(staticDir, path.join(standaloneNextDir, 'static'), { recursive: true });
  console.log('[post-build] copied .next/static into standalone runtime.');
}

const publicDir = path.join(process.cwd(), 'public');
if (existsSync(publicDir)) {
  cpSync(publicDir, path.join(standaloneDir, 'public'), { recursive: true });
  console.log('[post-build] copied public assets into standalone runtime.');
}

const nextServerRuntimeDir = path.join('node_modules', 'next', 'dist', 'compiled', 'next-server');
const sourceNextServerRuntimeDir = path.join(process.cwd(), nextServerRuntimeDir);
const standaloneNextServerRuntimeDir = path.join(standaloneDir, nextServerRuntimeDir);
const requiredNextServerRuntimeFiles = [
  'app-route.runtime.prod.js',
  'app-route.runtime.prod.js.map',
  'app-route-experimental.runtime.prod.js',
  'app-route-experimental.runtime.prod.js.map',
  'app-route-turbo.runtime.prod.js',
  'app-route-turbo.runtime.prod.js.map',
  'app-route-turbo-experimental.runtime.prod.js',
  'app-route-turbo-experimental.runtime.prod.js.map',
];

if (existsSync(sourceNextServerRuntimeDir)) {
  mkdirSync(standaloneNextServerRuntimeDir, { recursive: true });
  for (const filename of requiredNextServerRuntimeFiles) {
    const source = path.join(sourceNextServerRuntimeDir, filename);
    if (!existsSync(source)) continue;
    cpSync(source, path.join(standaloneNextServerRuntimeDir, filename));
  }
  console.log('[post-build] ensured Next app-route runtimes in standalone runtime.');
}

const TRANSIENT_DIR = /^[A-Za-z0-9._-]+-[0-9a-f]{16}$/u;
function pruneTransient(root) {
  if (!existsSync(root)) return;
  let stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (TRANSIENT_DIR.test(entry.name)) {
        try {
          rmSync(full, { recursive: true, force: true });
          console.log(`[post-build] removed transient npm dir: ${full}`);
        } catch (error) {
          console.warn(`[post-build] failed to remove ${full}: ${error?.message ?? error}`);
        }
        continue;
      }
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      try {
        if (statSync(full).isDirectory()) stack.push(full);
      } catch {
        // broken symlink - skip
      }
    }
  }
}
pruneTransient(path.join(process.cwd(), '.next', 'standalone'));

// Verify the bundled code_executor binary exists for the current platform (#25).
// On Windows the binary is code_executor.exe.
const binaryName = process.platform === 'win32' ? 'code_executor.exe' : 'code_executor';
const distRoot = path.join(process.cwd(), 'python-dist');
const candidates = [
  path.join(distRoot, binaryName),
  path.join(distRoot, process.platform, binaryName),
];
const hasExecutor = candidates.some((p) => existsSync(p));

// Khi packaging (REQUIRE_EXECUTOR=1), thiếu executor là lỗi cứng vì bundled
// runtime sẽ fail trên máy người dùng. Khi chạy `npm run build` thuần,
// chỉ warning để dev local không bị chặn.
const requireExecutor = process.env.REQUIRE_EXECUTOR === '1';

if (!hasExecutor) {
  const message =
    `[post-build] code_executor binary not found in python-dist (looked for ${binaryName}). ` +
    `Run "npm run build:executor" before packaging, or the bundled runtime mode will fail.`;
  if (requireExecutor) {
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
} else {
  console.log('[post-build] code_executor binary present.');
}
