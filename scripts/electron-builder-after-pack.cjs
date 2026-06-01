'use strict';

const { existsSync, readdirSync, rmSync, statSync } = require('node:fs');
const path = require('node:path');

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
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (TRANSIENT_DIR.test(entry.name)) {
        try {
          rmSync(full, { recursive: true, force: true });
          removed += 1;
        } catch (error) {
          console.warn(`[afterPack] failed to remove ${full}: ${error && error.message ? error.message : error}`);
        }
        continue;
      }
      try {
        if (statSync(full).isDirectory()) stack.push(full);
      } catch {
        // ignore
      }
    }
  }
  return removed;
}

module.exports = async function afterPack(context) {
  const root = context && context.appOutDir;
  if (!root) return;
  const removed = pruneTransient(root);
  if (removed > 0) {
    console.log(`[afterPack] pruned ${removed} transient npm rename dir(s) under ${root}`);
  }
};
