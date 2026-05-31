import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const required = ['.next/standalone/server.js', 'public/templates/solver_skeleton.py'];
const missing = required.filter((p) => !existsSync(p));

if (missing.length > 0) {
  console.warn(`[post-build] Missing optional artifacts: ${missing.join(', ')}`);
}

// Verify the bundled code_executor binary exists for the current platform (#25).
// On Windows the binary is code_executor.exe.
const binaryName = process.platform === 'win32' ? 'code_executor.exe' : 'code_executor';
const distRoot = path.join(process.cwd(), 'python-dist');
const candidates = [
  path.join(distRoot, binaryName),
  path.join(distRoot, process.platform, binaryName),
];
const hasExecutor = candidates.some((p) => existsSync(p));

if (!hasExecutor) {
  console.warn(
    `[post-build] code_executor binary not found in python-dist (looked for ${binaryName}). ` +
      `Run "npm run build:executor" before packaging, or the bundled runtime mode will fail.`
  );
} else {
  console.log('[post-build] code_executor binary present.');
}
