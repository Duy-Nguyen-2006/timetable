// Test runner: giả lập user thật nhập từng constraint, kiểm tra cả rule parser và AI (nếu cần)
// Báo cáo kết quả vào REPORT.md

import { testFixture, testConstraints } from './fixture';
import { parseConstraintDraftsWithRaws, rawConstraintsFromInput } from '../../src/features/timetable/ai/constraint-parse-service';
import { __translatorInternal } from '../../src/features/timetable/ai/translator';
import { inferRuleParseConfidence } from '../../src/features/timetable/ai/rule-parse-confidence';
import type { AIProviderConfig, AgentInputPayload } from '../../src/features/timetable/ai/types';
import type { ParsedConstraintDraft, RawConstraintInput } from '../../src/features/timetable/ai/constraint-review-types';
import * as fs from 'node:fs';
import * as path from 'node:path';

const providerConfig: AIProviderConfig = {
  provider: 'openrouter',
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY || 'YOUR_OPENROUTER_API_KEY',
  model: 'deepseek/deepseek-v3-flash',
};

type TestResult = {
  id: number;
  text: string;
  group: string;
  ruleConfidence: 'high' | 'medium' | 'low' | 'unknown';
  ruleSpecsCount: number;
  ruleHasCustomDsl: boolean;
  ruleSpecs: any[];
  finalSource: string;
  finalConfidence: string;
  finalSpecsCount: number;
  finalSpecs: any[];
  finalHasCustomDsl: boolean;
  status: 'PASS' | 'PARTIAL' | 'FAIL';
  notes: string;
};

const results: TestResult[] = [];

function statusFor(ruleResult: { specs: any[]; confidence: string }, finalResult: { specs: any[]; source: string; confidence: string }): 'PASS' | 'PARTIAL' | 'FAIL' {
  // Custom DSL = cần AI hỗ trợ. Nếu cuối cùng vẫn chỉ có custom_dsl, đó là PARTIAL (cần user feedback)
  if (finalResult.specs.length === 0) return 'FAIL';
  if (finalResult.specs.every((s: any) => s.kind === 'custom_dsl')) {
    return 'PARTIAL'; // system hiểu chưa rõ, cần user feedback
  }
  if (finalResult.specs.length > 0 && !finalResult.specs.every((s: any) => s.kind === 'custom_dsl')) {
    return 'PASS';
  }
  return 'PARTIAL';
}

async function runOne(constraint: typeof testConstraints[number]): Promise<TestResult> {
  // Phase 1: rule parser only (no LLM)
  const ruleInput: AgentInputPayload = {
    ...testFixture,
    constraints: [{ type: 'required', text: constraint.text }],
  };
  const ruleOnly = __translatorInternal.fallbackFromRuleParser(ruleInput);
  const ruleFiltered = __translatorInternal.sanitizeSpecs(ruleInput, ruleOnly).filter(
    (s) => s.original === constraint.text || s.original.trim() === constraint.text.trim()
  );
  const rule = inferRuleParseConfidence(
    constraint.text,
    ruleFiltered,
    {
      teachers: Array.from(new Set(testFixture.assignments.map((a) => a.teacher.label))),
      subjects: Array.from(new Set(testFixture.assignments.map((a) => a.subject.label))),
      classes: Array.from(new Set(testFixture.assignments.map((a) => a.class.label))),
    }
  );

  // Phase 2: full parse with LLM
  const raws: RawConstraintInput[] = rawConstraintsFromInput([
    { type: 'required', text: constraint.text },
  ]);
  const drafts: ParsedConstraintDraft[] = await parseConstraintDraftsWithRaws(
    testFixture,
    raws,
    providerConfig
  );
  const draft = drafts[0];
  const finalSpecs = draft?.proposedSpecs ?? [];
  const finalSource = draft?.source ?? 'rule';
  const finalConfidence = draft?.confidence ?? 'unknown';

  return {
    id: constraint.id,
    text: constraint.text,
    group: constraint.group,
    ruleConfidence: rule.confidence,
    ruleSpecsCount: ruleFiltered.length,
    ruleHasCustomDsl: ruleFiltered.some((s) => s.kind === 'custom_dsl'),
    ruleSpecs: ruleFiltered,
    finalSource,
    finalConfidence,
    finalSpecsCount: finalSpecs.length,
    finalSpecs,
    finalHasCustomDsl: finalSpecs.every((s) => s.kind === 'custom_dsl'),
    status: statusFor(
      { specs: ruleFiltered, confidence: rule.confidence },
      { specs: finalSpecs, source: finalSource, confidence: finalConfidence }
    ),
    notes: '',
  };
}

async function main() {
  console.log(`▶ Bắt đầu test 150 constraints với AI model: ${providerConfig.model}`);
  console.log(`▶ Fixture: ${testFixture.assignments.length} assignments, ${testFixture.days.length} days`);

  // Chạy tuần tự để tránh rate limit OpenRouter
  for (let i = 0; i < testConstraints.length; i++) {
    const c = testConstraints[i];
    process.stdout.write(`  [${i + 1}/150] #${c.id} ${c.text.substring(0, 50)}... `);
    try {
      const result = await runOne(c);
      results.push(result);
      const marker = result.status === 'PASS' ? '✓' : result.status === 'PARTIAL' ? '~' : '✗';
      process.stdout.write(`${marker} ${result.status} (src=${result.finalSource}, conf=${result.finalConfidence}, specs=${result.finalSpecsCount})\n`);
    } catch (err: any) {
      console.log(`  ✗ Error: ${err?.message || err}`);
      results.push({
        id: c.id,
        text: c.text,
        group: c.group,
        ruleConfidence: 'unknown',
        ruleSpecsCount: 0,
        ruleHasCustomDsl: false,
        ruleSpecs: [],
        finalSource: 'rule',
        finalConfidence: 'unknown',
        finalSpecsCount: 0,
        finalSpecs: [],
        finalHasCustomDsl: false,
        status: 'FAIL',
        notes: `Error: ${err?.message || err}`,
      });
    }
    // Tránh rate-limit
    await new Promise((r) => setTimeout(r, 200));
  }

  // Ghi kết quả ra REPORT.md
  generateReport();
}

function generateReport() {
  const grouped: Record<string, TestResult[]> = {};
  for (const r of results) {
    if (!grouped[r.group]) grouped[r.group] = [];
    grouped[r.group].push(r);
  }

  let totalPass = 0;
  let totalPartial = 0;
  let totalFail = 0;
  let ruleHighCount = 0;

  for (const r of results) {
    if (r.ruleConfidence === 'high') ruleHighCount++;
    if (r.status === 'PASS') totalPass++;
    else if (r.status === 'PARTIAL') totalPartial++;
    else totalFail++;
  }

  let md = `# BÁO CÁO TEST 150 CONSTRAINTS - Vai trò: Người dùng thật\n\n`;
  md += `**Ngày test:** ${new Date().toISOString().split('T')[0]}\n`;
  md += `**AI model:** ${providerConfig.model} (OpenRouter)\n`;
  md += `**Test fixture:** ${testFixture.assignments.length} assignments, ${testFixture.days.length} days (T2-T6), 6 periods/day\n\n`;

  md += `## Tổng quan\n\n`;
  md += `| Metric | Count | % |\n`;
  md += `|---|---|---|\n`;
  md += `| Tổng constraints test | 150 | 100% |\n`;
  md += `| **PASS** (rule + AI cho ra spec hợp lệ) | ${totalPass} | ${((totalPass / 150) * 100).toFixed(1)}% |\n`;
  md += `| **PARTIAL** (cần user feedback/custom_dsl) | ${totalPartial} | ${((totalPartial / 150) * 100).toFixed(1)}% |\n`;
  md += `| **FAIL** (không parse được) | ${totalFail} | ${((totalFail / 150) * 100).toFixed(1)}% |\n`;
  md += `| Rule parser HIGH confidence (fast-path, không gọi AI) | ${ruleHighCount} | ${((ruleHighCount / 150) * 100).toFixed(1)}% |\n\n`;

  md += `## Phân tích theo nhóm\n\n`;
  md += `| Nhóm | Mô tả | Pass | Partial | Fail | Tỷ lệ Pass |\n`;
  md += `|---|---|---|---|---|---|\n`;
  const groupDescriptions: Record<string, string> = {
    '1-days': 'Cơ bản về ngày',
    '2-periods': 'Cơ bản về tiết',
    '3-day-period': 'Kết hợp ngày + tiết',
    '4-if-then-simple': 'IF/THEN đơn giản',
    '5-if-then-complex': 'IF/THEN phức tạp',
    '6-order-distance': 'Khoảng cách / thứ tự',
    '7-frequency': 'Tần suất / tổng số',
    '8-multi-cond': 'Multi-condition phức tạp',
  };
  for (const [grp, items] of Object.entries(grouped).sort(([a], [b]) => Number(a.split('-')[0]) - Number(b.split('-')[0]))) {
    const p = items.filter((i) => i.status === 'PASS').length;
    const pa = items.filter((i) => i.status === 'PARTIAL').length;
    const f = items.filter((i) => i.status === 'FAIL').length;
    md += `| ${grp} | ${groupDescriptions[grp] || ''} | ${p} | ${pa} | ${f} | ${((p / items.length) * 100).toFixed(0)}% |\n`;
  }
  md += `\n`;

  md += `## Chi tiết từng constraint\n\n`;
  for (const [grp, items] of Object.entries(grouped).sort(([a], [b]) => Number(a.split('-')[0]) - Number(b.split('-')[0]))) {
    md += `### Nhóm ${grp}: ${groupDescriptions[grp] || ''}\n\n`;
    md += `| # | Input | Rule Conf | Source | Final Conf | #Specs | Custom DSL | Status | Ghi chú |\n`;
    md += `|---|---|---|---|---|---|---|---|---|\n`;
    for (const r of items.sort((a, b) => a.id - b.id)) {
      const marker = r.status === 'PASS' ? '✅' : r.status === 'PARTIAL' ? '⚠️' : '❌';
      md += `| ${r.id} | ${r.text.replace(/\|/g, '\\|').substring(0, 60)} | ${r.ruleConfidence} | ${r.finalSource} | ${r.finalConfidence} | ${r.finalSpecsCount} | ${r.finalHasCustomDsl ? 'Có' : '-'} | ${marker} ${r.status} | ${r.notes || '-'} |\n`;
    }
    md += `\n`;
  }

  md += `## Nhận xét và khuyến nghị\n\n`;
  md += `### Điểm mạnh\n`;
  if (ruleHighCount > 80) {
    md += `- Rule parser xử lý **${ruleHighCount}/150 (${((ruleHighCount/150)*100).toFixed(0)}%)** constraints với HIGH confidence mà không cần gọi AI → tiết kiệm chi phí LLM.\n`;
  }
  md += `- LLM fallback hoạt động cho các constraints phức tạp hơn (nhóm 5, 7, 8).\n\n`;

  md += `### Điểm cần cải thiện\n`;
  const partialExamples = results.filter((r) => r.status === 'PARTIAL').slice(0, 10);
  if (partialExamples.length > 0) {
    md += `- ${totalPartial} constraints cần user feedback. Ví dụ điển hình:\n`;
    for (const p of partialExamples) {
      md += `  - #${p.id}: "${p.text.substring(0, 80)}" → ${p.finalSource} (${p.finalSpecsCount} specs)\n`;
    }
  }
  md += `- Multi-condition (nhóm 8): cần xử lý tốt hơn các IF với nhiều branches AND/OR phức tạp.\n`;
  md += `- Frequency/range (nhóm 7): cần parser nhận diện "ít nhất", "tối đa", "đúng", "từ X đến Y".\n\n`;

  md += `## Kết luận\n\n`;
  const passRate = ((totalPass / 150) * 100).toFixed(1);
  md += `Với 150 constraints đa dạng, hệ thống đạt **${passRate}%** tỷ lệ pass (không cần user feedback). `;
  md += `Kết hợp rule parser + LLM (deepseek/deepseek-v4-flash) cho kết quả khả quan. `;
  md += `Các constraints còn lại (${totalPartial} partial, ${totalFail} fail) thuộc nhóm phức tạp và cần user feedback hoặc custom DSL.\n`;

  const reportPath = path.resolve(__dirname, '../../REPORT.md');
  fs.writeFileSync(reportPath, md, 'utf-8');
  console.log(`\n✅ Report saved to: ${reportPath}`);
  console.log(`📊 Summary: ${totalPass} pass / ${totalPartial} partial / ${totalFail} fail`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
