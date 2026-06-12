#!/usr/bin/env -S npx tsx
/**
 * Rule-only benchmark for constraints_dataset_2.txt (no LLM).
 * PASS = at least one non-custom_dsl spec; PARTIAL = only custom_dsl; FAIL = no specs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { __translatorInternal } from '../../src/features/timetable/ai/translator';
import { inferRuleParseConfidence } from '../../src/features/timetable/ai/rule-parse-confidence';
import type { AgentInputPayload } from '../../src/features/timetable/ai/types';

import {
  dataset2Fixture,
  loadDataset2Constraints,
  ruleParseContextFromFixture,
  subjectNames,
} from './fixture-dataset2';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

type Status = 'PASS' | 'PARTIAL' | 'FAIL';

function classify(specs: { kind: string }[]): Status {
  if (specs.length === 0) return 'FAIL';
  if (specs.every((s) => s.kind === 'custom_dsl')) return 'PARTIAL';
  if (specs.some((s) => s.kind !== 'custom_dsl')) return 'PASS';
  return 'PARTIAL';
}

function parseOne(text: string) {
  const input: AgentInputPayload = {
    ...dataset2Fixture,
    constraints: [{ type: 'required', text }],
  };
  const raw = __translatorInternal.fallbackFromRuleParser(input);
  const specs = __translatorInternal.sanitizeSpecs(input, raw).filter(
    (s) => s.original === text || s.original.trim() === text.trim()
  );
  const conf = inferRuleParseConfidence(text, specs, ruleParseContextFromFixture(dataset2Fixture));
  return { specs, confidence: conf.confidence, status: classify(specs) };
}

function main() {
  const lines = loadDataset2Constraints();
  let pass = 0;
  let partial = 0;
  let fail = 0;
  let high = 0;
  const byKind = new Map<string, number>();
  const partialSamples: string[] = [];
  const failSamples: string[] = [];

  for (const text of lines) {
    const { specs, confidence, status } = parseOne(text);
    if (status === 'PASS') pass++;
    else if (status === 'PARTIAL') partial++;
    else fail++;
    if (confidence === 'high') high++;
    for (const s of specs) {
      byKind.set(s.kind, (byKind.get(s.kind) ?? 0) + 1);
    }
    if (status === 'PARTIAL' && partialSamples.length < 25) partialSamples.push(text);
    if (status === 'FAIL' && failSamples.length < 25) failSamples.push(text);
  }

  const total = lines.length;
  const pct = (n: number) => ((n / total) * 100).toFixed(1);

  console.log(`\n📊 Dataset 2 rule-only benchmark (n=${total})`);
  console.log(`   PASS:    ${pass} (${pct(pass)}%)`);
  console.log(`   PARTIAL: ${partial} (${pct(partial)}%)`);
  console.log(`   FAIL:    ${fail} (${pct(fail)}%)`);
  console.log(`   HIGH confidence: ${high} (${pct(high)}%)`);

  const topKinds = [...byKind.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log('\nTop kinds:');
  for (const [k, n] of topKinds) console.log(`  ${k}: ${n}`);

  const md = [
    '',
    '## Benchmark rule-only sau Phase 4–8 (2026-06-12)',
    '',
    `**Phương pháp:** \`npx tsx tests/constraints-user-sim/run-dataset2-rule.ts\` — chỉ rule parser (không LLM).`,
    `**Fixture:** 20 GV, ${dataset2Fixture.assignments.length} assignments, 5 ngày, ${subjectNames.length} môn.`,
    '',
    '| Metric | Count | % |',
    '|---|---|---|',
    `| Tổng (unique lines) | ${total} | 100% |`,
    `| **PASS** | **${pass}** | **${pct(pass)}%** |`,
    `| PARTIAL (custom_dsl only) | ${partial} | ${pct(partial)}% |`,
    `| FAIL (no specs) | ${fail} | ${pct(fail)}% |`,
    `| Rule HIGH confidence | ${high} | ${pct(high)}% |`,
    '',
    '**Top kinds (sample):** ' + topKinds.map(([k, n]) => `${k}(${n})`).join(', '),
    '',
  ].join('\n');

  const reportPath = path.join(repoRoot, 'REPORT.md');
  let report = fs.readFileSync(reportPath, 'utf8');
  if (!report.includes('## Benchmark rule-only sau Phase 4–8')) {
    report += md;
    fs.writeFileSync(reportPath, report, 'utf8');
    console.log(`\n✅ Appended benchmark to ${reportPath}`);
  }

  if (partialSamples.length) {
    console.log('\nPARTIAL samples:');
    for (const t of partialSamples.slice(0, 8)) console.log('  -', t);
  }
  if (failSamples.length) {
    console.log('\nFAIL samples:');
    for (const t of failSamples.slice(0, 8)) console.log('  -', t);
  }
}

main();
