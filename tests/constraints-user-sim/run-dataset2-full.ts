#!/usr/bin/env -S npx tsx
/**
 * Full benchmark: rule fast-path + OpenRouter LLM for constraints_dataset_2.txt
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-or-... npm run bench:dataset2:full
 *   OPENROUTER_API_KEY=... npx tsx tests/constraints-user-sim/run-dataset2-full.ts --limit 30
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { parseConstraintDraftsWithRaws, rawConstraintsFromInput } from '../../src/features/timetable/ai/constraint-parse-service';
import type { AIProviderConfig } from '../../src/features/timetable/ai/types';

import { dataset2Fixture, loadDataset2Constraints } from './fixture-dataset2';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

type Status = 'PASS' | 'PARTIAL' | 'FAIL';

function classify(specs: { kind: string }[]): Status {
  if (specs.length === 0) return 'FAIL';
  if (specs.every((s) => s.kind === 'custom_dsl')) return 'PARTIAL';
  if (specs.some((s) => s.kind !== 'custom_dsl')) return 'PASS';
  return 'PARTIAL';
}

function providerFromEnv(): AIProviderConfig {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Set OPENROUTER_API_KEY (never commit the key to git).');
  }
  return {
    provider: 'openrouter',
    baseURL: process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1',
    apiKey,
    model: process.env.OPENROUTER_MODEL?.trim() || 'deepseek/deepseek-v4-flash',
  };
}

async function main() {
  const idx = process.argv.indexOf('--limit');
  const limit = idx >= 0 ? Number(process.argv[idx + 1] ?? 0) : 0;

  const provider = providerFromEnv();
  let lines = loadDataset2Constraints();
  if (limit > 0) lines = lines.slice(0, limit);

  console.log(`▶ Dataset2 full pipeline: n=${lines.length}, model=${provider.model}`);

  let pass = 0;
  let partial = 0;
  let fail = 0;
  let ruleOnly = 0;
  let llmUsed = 0;
  const results: Array<{ text: string; status: Status; source: string; kinds: string[] }> = [];

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    process.stdout.write(`  [${i + 1}/${lines.length}] `);
    const raws = rawConstraintsFromInput([{ type: 'required', text }]).map((r) => ({
      ...r,
      id: r.id || randomUUID(),
    }));
    try {
      const drafts = await parseConstraintDraftsWithRaws(dataset2Fixture, raws, provider);
      const draft = drafts[0];
      const specs = draft?.proposedSpecs ?? [];
      const status = classify(specs);
      const source = draft?.source ?? 'unknown';
      if (source === 'rule') ruleOnly++;
      else llmUsed++;
      if (status === 'PASS') pass++;
      else if (status === 'PARTIAL') partial++;
      else fail++;
      results.push({
        text,
        status,
        source,
        kinds: specs.map((s) => s.kind),
      });
      process.stdout.write(`${status} (${source})\n`);
    } catch (err) {
      fail++;
      results.push({ text, status: 'FAIL', source: 'error', kinds: [] });
      process.stdout.write(`FAIL (${err instanceof Error ? err.message : String(err)})\n`);
    }
    await new Promise((r) => setTimeout(r, 350));
  }

  const total = lines.length;
  const pct = (n: number) => ((n / total) * 100).toFixed(1);

  console.log(`\n📊 Full pipeline (rule + LLM)`);
  console.log(`   PASS:    ${pass} (${pct(pass)}%)`);
  console.log(`   PARTIAL: ${partial} (${pct(partial)}%)`);
  console.log(`   FAIL:    ${fail} (${pct(fail)}%)`);
  console.log(`   Rule fast-path: ${ruleOnly}, LLM path: ${llmUsed}`);

  const outPath = path.join(repoRoot, 'tests/constraints-user-sim/dataset2-full-results.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        provider: { model: provider.model, baseURL: provider.baseURL },
        total,
        pass,
        partial,
        fail,
        ruleOnly,
        llmUsed,
        results,
      },
      null,
      2
    )
  );

  const md = [
    '',
    '## Benchmark full pipeline (rule + OpenRouter LLM)',
    '',
    `**Ngày:** ${new Date().toISOString().split('T')[0]}`,
    `**Model:** ${provider.model}`,
    `**Lệnh:** \`OPENROUTER_API_KEY=... npm run bench:dataset2:full\`${limit > 0 ? ` (limit=${limit})` : ''}`,
    '',
    '| Metric | Count | % |',
    '|---|---|---|',
    `| Tổng | ${total} | 100% |`,
    `| **PASS** | **${pass}** | **${pct(pass)}%** |`,
    `| PARTIAL | ${partial} | ${pct(partial)}% |`,
    `| FAIL | ${fail} | ${pct(fail)}% |`,
    `| Rule fast-path | ${ruleOnly} | ${pct(ruleOnly)}% |`,
    `| LLM path | ${llmUsed} | ${pct(llmUsed)}% |`,
    '',
  ].join('\n');

  const reportPath = path.join(repoRoot, 'REPORT.md');
  let report = fs.readFileSync(reportPath, 'utf8');
  const marker = '## Benchmark full pipeline (rule + OpenRouter LLM)';
  if (report.includes(marker)) {
    report = report.split(marker)[0].trimEnd() + md;
  } else {
    report += md;
  }
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`\n✅ Results: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
