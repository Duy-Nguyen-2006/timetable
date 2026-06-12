// Test AI analyze: chọn 1 số constraints từ kết quả PARTIAL/FAIL trước đó, gọi analyzeConstraint
// Mục đích: đánh giá chất lượng AI fallback khi rule parser không đủ

import { testFixture, testConstraints } from './fixture';
import { analyzeConstraint } from '../../src/features/timetable/ai/analyze-constraint-service';
import { parseConstraintDraftsWithRaws, rawConstraintsFromInput } from '../../src/features/timetable/ai/constraint-parse-service';
import { __translatorInternal } from '../../src/features/timetable/ai/translator';
import { inferRuleParseConfidence } from '../../src/features/timetable/ai/rule-parse-confidence';
import type { AIProviderConfig, AgentInputPayload } from '../../src/features/timetable/ai/types';
import type { RawConstraintInput } from '../../src/features/timetable/ai/constraint-review-types';
import * as fs from 'node:fs';
import * as path from 'node:path';

const providerConfig: AIProviderConfig = {
  provider: 'openrouter',
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY || 'YOUR_OPENROUTER_API_KEY',
  model: 'deepseek/deepseek-v3-flash',
};

type AnalyzeResult = {
  id: number;
  text: string;
  group: string;
  firstPassStatus: string;  // rule-only result
  analyzeStatus: string;     // AI analyze result
  analyzeConfidence: string;
  analyzeSpecsCount: number;
  aiImproved: boolean;       // true if AI fixed a problem
  displayText: string;
};

async function main() {
  // Test 5 constraints: chọn 1 số PARTIAL + FAIL từ kết quả trước
  const sampleIds = [4, 11, 17, 23, 25];
  const samples = testConstraints.filter((c) => sampleIds.includes(c.id));
  console.log(`▶ Test AI Analyze với ${samples.length} constraints PARTIAL/FAIL\n`);

  const results: AnalyzeResult[] = [];

  for (const c of samples) {
    process.stdout.write(`  [${c.id}] "${c.text.substring(0, 50)}" ... `);
    try {
      // Phase 1: rule parser only
      const ruleInput: AgentInputPayload = {
        ...testFixture,
        constraints: [{ type: 'required', text: c.text }],
      };
      const ruleOnly = __translatorInternal.fallbackFromRuleParser(ruleInput);
      const ruleFiltered = __translatorInternal.sanitizeSpecs(ruleInput, ruleOnly).filter(
        (s) => s.original === c.text || s.original.trim() === c.text.trim()
      );
      const rule = inferRuleParseConfidence(c.text, ruleFiltered, {
        teachers: Array.from(new Set(testFixture.assignments.map((a) => a.teacher.label))),
        subjects: Array.from(new Set(testFixture.assignments.map((a) => a.subject.label))),
        classes: Array.from(new Set(testFixture.assignments.map((a) => a.class.label))),
      });
      const firstPassStatus = ruleFiltered.every((s) => s.kind === 'custom_dsl') || ruleFiltered.length === 0
        ? 'PARTIAL_OR_FAIL'
        : 'PASS';

      // Phase 2: AI analyze (như user click "AI phân tích")
      const analyzeResult = await analyzeConstraint(
        c.text,
        'required',
        undefined,
        testFixture,
        providerConfig
      );

      const analyzeSpecs = analyzeResult.specs ?? [];
      const analyzeStatus =
        analyzeSpecs.length === 0
          ? 'FAIL'
          : analyzeSpecs.every((s) => s.kind === 'custom_dsl')
            ? 'NEEDS_CLARIFICATION'
            : 'PASS';

      const aiImproved =
        firstPassStatus === 'PARTIAL_OR_FAIL' && analyzeStatus === 'PASS';

      results.push({
        id: c.id,
        text: c.text,
        group: c.group,
        firstPassStatus,
        analyzeStatus,
        analyzeConfidence: analyzeResult.confidence,
        analyzeSpecsCount: analyzeSpecs.length,
        aiImproved,
        displayText: analyzeResult.normalizedText,
      });

      const marker = aiImproved ? '✅ AI fixed' : analyzeStatus === 'PASS' ? '✓ pass' : '⚠️ still partial';
      console.log(`${marker} (analyze=${analyzeStatus}, conf=${analyzeResult.confidence}, specs=${analyzeSpecs.length})`);
    } catch (err: any) {
      console.log(`✗ Error: ${err?.message || err}`);
      results.push({
        id: c.id,
        text: c.text,
        group: c.group,
        firstPassStatus: 'unknown',
        analyzeStatus: 'ERROR',
        analyzeConfidence: 'unknown',
        analyzeSpecsCount: 0,
        aiImproved: false,
        displayText: err?.message || String(err),
      });
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  // Tổng hợp
  const total = results.length;
  const aiFixedCount = results.filter((r) => r.aiImproved).length;
  const stillPartial = results.filter((r) => r.analyzeStatus === 'NEEDS_CLARIFICATION').length;
  const aiPassed = results.filter((r) => r.analyzeStatus === 'PASS').length;

  console.log(`\n=== Kết quả AI Analyze ===`);
  console.log(`  AI fixed (từ PARTIAL/FAIL → PASS): ${aiFixedCount}/${total}`);
  console.log(`  AI passed (any first pass):         ${aiPassed}/${total}`);
  console.log(`  Vẫn cần user feedback:              ${stillPartial}/${total}`);

  // Append vào REPORT.md
  appendAnalyzeResults(results, aiFixedCount, aiPassed, stillPartial);
}

function appendAnalyzeResults(results: AnalyzeResult[], aiFixed: number, aiPassed: number, stillPartial: number) {
  const reportPath = path.resolve(__dirname, '../../REPORT.md');
  let md = fs.readFileSync(reportPath, 'utf-8');
  md += `\n\n---\n\n## Phụ lục: Test nút "AI phân tích" với 10 constraints PARTIAL/FAIL\n\n`;
  md += `Mục đích: mô phỏng user click "AI phân tích" trên UI để xem AI có cải thiện kết quả không.\n\n`;
  md += `| # | Input | First pass | AI analyze | Conf | #Specs | AI cải thiện? | Display text |\n`;
  md += `|---|---|---|---|---|---|---|---|\n`;
  for (const r of results) {
    const marker = r.aiImproved ? '✅ Có' : r.analyzeStatus === 'PASS' ? '✓ Đã pass' : '⚠️ Vẫn cần feedback';
    md += `| ${r.id} | ${r.text.replace(/\|/g, '\\|').substring(0, 50)} | ${r.firstPassStatus} | ${r.analyzeStatus} | ${r.analyzeConfidence} | ${r.analyzeSpecsCount} | ${marker} | ${r.displayText.replace(/\|/g, '\\|').substring(0, 60)} |\n`;
  }
  md += `\n**Tổng kết:**\n`;
  md += `- AI cải thiện (từ PARTIAL/FAIL → PASS): **${aiFixed}/${results.length}**\n`;
  md += `- AI cho spec hợp lệ (bao gồm cả first-pass đã PASS): **${aiPassed}/${results.length}**\n`;
  md += `- Vẫn cần user feedback (needs_clarification): **${stillPartial}/${results.length}**\n`;
  fs.writeFileSync(reportPath, md, 'utf-8');
  console.log(`\n✅ Đã append vào REPORT.md`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
