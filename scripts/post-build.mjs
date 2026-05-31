import { existsSync } from 'node:fs';

const required = ['.next/standalone/server.js', 'public/templates/solver_skeleton.py'];
const missing = required.filter((path) => !existsSync(path));

if (missing.length > 0) {
  console.warn(`[post-build] Missing optional artifacts: ${missing.join(', ')}`);
}
