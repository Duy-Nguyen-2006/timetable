// Smoke test: 5 constraints đầu tiên để verify pipeline
import { testFixture, testConstraints } from './fixture';
import { parseConstraintDraftsWithRaws, rawConstraintsFromInput } from '../../src/features/timetable/ai/constraint-parse-service';
import { __translatorInternal } from '../../src/features/timetable/ai/translator';
import { inferRuleParseConfidence } from '../../src/features/timetable/ai/rule-parse-confidence';
import type { AIProviderConfig, AgentInputPayload } from '../../src/features/timetable/ai/types';
import type { RawConstraintInput } from '../../src/features/timetable/ai/constraint-review-types';

const providerConfig: AIProviderConfig = {
  provider: 'openrouter',
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY || 'YOUR_OPENROUTER_API_KEY',
  model: 'deepseek/deepseek-v3-flash',
};

async function main() {
  const subset = testConstraints.slice(0, 5);
  console.log(`▶ Smoke test với 5 constraints đầu tiên\n`);

  for (const c of subset) {
    console.log(`\n[${c.id}] "${c.text}"`);

    // Phase 1: rule parser
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
    console.log(`  Rule: conf=${rule.confidence}, specs=${ruleFiltered.length}, hasCustomDsl=${ruleFiltered.some((s) => s.kind === 'custom_dsl')}`);
    for (const s of ruleFiltered) {
      console.log(`    - kind=${s.kind} params=${JSON.stringify(s.params).substring(0, 100)}`);
    }

    // Phase 2: full parse with LLM
    const raws: RawConstraintInput[] = rawConstraintsFromInput([
      { type: 'required', text: c.text },
    ]);
    try {
      const drafts = await parseConstraintDraftsWithRaws(testFixture, raws, providerConfig);
      const draft = drafts[0];
      if (draft) {
        console.log(`  Final: source=${draft.source}, conf=${draft.confidence}, specs=${draft.proposedSpecs.length}`);
        for (const s of draft.proposedSpecs) {
          console.log(`    - kind=${s.kind} params=${JSON.stringify(s.params).substring(0, 100)}`);
        }
        if (draft.issues.length > 0) {
          console.log(`  Issues: ${draft.issues.map((i) => `[${i.code}] ${i.message}`).join('; ')}`);
        }
      }
    } catch (err: any) {
      console.log(`  ✗ Error: ${err?.message || err}`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
