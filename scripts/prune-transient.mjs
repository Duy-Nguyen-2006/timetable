#!/usr/bin/env node
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const TRANSIENT_DIR = /^[A-Za-z0-9._-]+-[0-9a-f]{16}$/u;

function pruneTransient(root) {
  if (!existsSync(root)) return 0;
  let removed = 0;
  const stack = [root];
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
          console.log(`[prune-transient] removed ${full}`);
          removed += 1;
        } catch (error) {
          console.warn(`[prune-transient] failed ${full}: ${error?.message ?? error}`);
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
  return removed;
}

const targets = [
  path.join(process.cwd(), 'node_modules'),
  path.join(process.cwd(), '.next', 'standalone'),
];
let total = 0;
for (const target of targets) {
  total += pruneTransient(target);
}
console.log(`[prune-transient] total removed: ${total}`);

