/**
 * analyze_constraint_shadow.ts — M6 divergence analyzer
 *
 * Reads the shadow-mode logs emitted by parse-pipeline.ts and computes
 * the metrics required for the M6 CI gate:
 *   - silentFlipRate (must be 0)
 *   - kindMismatchRate
 *   - paramMismatchRate
 *   - clarificationDiffRate
 *
 * Usage:
 *   # Run a parse pass first, then analyze
 *   npx tsx scripts/analyze_constraint_shadow.ts
 *
 * The script can also read from a JSONL log file:
 *   npx tsx scripts/analyze_constraint_shadow.ts --input <path>
 *
 * Exit code is non-zero if silentFlipRate > 0.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { getDefaultShadowLogger, type ShadowLogEntry } from '../src/features/timetable/ai/shadow-mode';

const REPO_ROOT = process.cwd();
const DEFAULT_LOG_PATH = path.join(REPO_ROOT, '.shadow-logs.jsonl');

type Summary = {
  total: number;
  silentFlipCount: number;
  silentFlipRate: number;
  kindMismatchCount: number;
  kindMismatchRate: number;
  paramMismatchCount: number;
  paramMismatchRate: number;
  clarificationDiffCount: number;
  clarificationDiffRate: number;
  matchCount: number;
  matchRate: number;
};

export function summarizeEntries(entries: ReadonlyArray<ShadowLogEntry>): Summary {
  const total = entries.length;
  let silentFlipCount = 0;
  let kindMismatchCount = 0;
  let paramMismatchCount = 0;
  let clarificationDiffCount = 0;
  let matchCount = 0;
  for (const e of entries) {
    if (e.divergence === 'silent_flip') silentFlipCount += 1;
    else if (e.divergence === 'kind_mismatch') kindMismatchCount += 1;
    else if (e.divergence === 'param_mismatch') paramMismatchCount += 1;
    else if (e.divergence === 'clarification_diff') clarificationDiffCount += 1;
    else if (e.divergence === 'match') matchCount += 1;
  }
  return {
    total,
    silentFlipCount,
    silentFlipRate: total > 0 ? silentFlipCount / total : 0,
    kindMismatchCount,
    kindMismatchRate: total > 0 ? kindMismatchCount / total : 0,
    paramMismatchCount,
    paramMismatchRate: total > 0 ? paramMismatchCount / total : 0,
    clarificationDiffCount,
    clarificationDiffRate: total > 0 ? clarificationDiffCount / total : 0,
    matchCount,
    matchRate: total > 0 ? matchCount / total : 0,
  };
}

function main() {
  const args = process.argv.slice(2);
  const inputIdx = args.indexOf('--input');
  const inputPath = inputIdx >= 0 ? args[inputIdx + 1] : DEFAULT_LOG_PATH;

  let entries: ShadowLogEntry[] = [];

  if (inputIdx >= 0 && existsSync(inputPath)) {
    // Read JSONL log
    const lines = readFileSync(inputPath, 'utf8').split('\n').filter(Boolean);
    entries = lines.map((line) => JSON.parse(line));
    console.log(`[analyzer] loaded ${entries.length} entries from ${inputPath}`);
  } else {
    // Read from in-memory default logger (test fixtures)
    entries = [...getDefaultShadowLogger().getEntries()];
    console.log(`[analyzer] read ${entries.length} entries from in-memory default logger`);
  }

  if (entries.length === 0) {
    console.warn('[analyzer] no shadow entries found. Run parse-pipeline first to populate the log.');
    process.exit(0);
  }

  const summary = summarizeEntries(entries);

  console.log('\n=== Shadow Divergence Summary ===');
  console.log(`Total entries:           ${summary.total}`);
  console.log(`Silent flip count:       ${summary.silentFlipCount}`);
  console.log(`Silent flip rate:        ${(summary.silentFlipRate * 100).toFixed(2)}%`);
  console.log(`Kind mismatch count:     ${summary.kindMismatchCount}`);
  console.log(`Kind mismatch rate:      ${(summary.kindMismatchRate * 100).toFixed(2)}%`);
  console.log(`Param mismatch count:    ${summary.paramMismatchCount}`);
  console.log(`Param mismatch rate:     ${(summary.paramMismatchRate * 100).toFixed(2)}%`);
  console.log(`Clarification diff count: ${summary.clarificationDiffCount}`);
  console.log(`Clarification diff rate: ${(summary.clarificationDiffRate * 100).toFixed(2)}%`);
  console.log(`Match count:             ${summary.matchCount}`);
  console.log(`Match rate:              ${(summary.matchRate * 100).toFixed(2)}%`);
  console.log('=================================\n');

  // M6.4 CI gate: silent flip rate must be 0
  if (summary.silentFlipRate > 0) {
    console.error(`[analyzer] FAIL: silent flip rate ${summary.silentFlipRate} > 0. Parser flip is blocked.`);
    process.exit(1);
  }
  if (summary.silentFlipCount > 0) {
    console.error(`[analyzer] FAIL: ${summary.silentFlipCount} silent flip(s) detected.`);
    process.exit(1);
  }

  console.log('[analyzer] PASS: no silent flips detected. M6 gate satisfied.');
  process.exit(0);
}

if (require.main === module) {
  main();
}
