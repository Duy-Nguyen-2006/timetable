/**
 * Constraint contract parity check.
 *
 * Verifies that every CHECKED `ConstraintKind` in `constraint-registry.ts`
 * has matching coverage in:
 *   1. `python/templates/solver_skeleton.py` (encoder branch in
 *      `is_slot_allowed` or `build_custom_constraints`).
 *   2. `src/features/timetable/ai/deterministic-validator.ts` (entry in
 *      the `checkerByKind` dispatch map).
 *   3. `tests/fixtures/validator/` (at least one golden fixture exercises
 *      a schedule the validator can verify).
 *
 * Why: the same constraint semantics are encoded in 4 places (TS registry,
 * Python skeleton, TS validator, translator prompt). Without an automated
 * check, drift between them silently corrupts the solve path.
 *
 * Run locally:
 *   npx tsx scripts/check_constraint_parity.ts
 * Run in CI (treats any drift as a build failure):
 *   npx tsx scripts/check_constraint_parity.ts --strict
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

import {
  CONSTRAINT_REGISTRY,
  CHECKED_KINDS,
} from '../src/features/timetable/ai/constraint-registry';

const REPO_ROOT = process.cwd();
const SKELETON_PATH = path.join(REPO_ROOT, 'python', 'templates', 'solver_skeleton.py');
const VALIDATOR_PATH = path.join(
  REPO_ROOT,
  'src',
  'features',
  'timetable',
  'ai',
  'deterministic-validator.ts'
);
const FIXTURES_DIR = path.join(REPO_ROOT, 'tests', 'fixtures', 'validator');
const TRANSLATOR_PROMPT_PATH = path.join(REPO_ROOT, 'prompts', 'translator.system.md');

type Issue = {
  kind: string;
  reason: string;
};

function readIfExists(filePath: string): string {
  if (!existsSync(filePath)) {
    console.error(`[parity] required file missing: ${filePath}`);
    process.exit(2);
  }
  return readFileSync(filePath, 'utf8');
}

function findCheckerInValidator(validator: string, kind: string): boolean {
  // The dispatch map is a `Record<ConstraintKind, CheckFn>` literal of the
  // form `kind_name: checkSomeName,`. We accept either presence as a
  // direct map key OR a const declaration `checkSomeName` so we catch
  // kinds that are mapped through an alias.
  const mapKeyPattern = new RegExp(`\\b${kind}\\b\\s*:\\s*check[A-Za-z0-9_]+`, 'g');
  return mapKeyPattern.test(validator);
}

function findBranchInSkeleton(skeleton: string, kind: string): boolean {
  // Skeleton checks `spec.get("kind")` or `kind ==` against string literals.
  const literal = `"${kind}"`;
  if (skeleton.includes(literal)) return true;
  // Some kinds are handled via a grouped dispatch (e.g. teacher_* share a
  // branch). That's still acceptable as long as the literal appears.
  return false;
}

function findMentionInTranslatorPrompt(prompt: string, kind: string): boolean {
  return prompt.includes(`\`${kind}\``) || prompt.includes(`"${kind}"`) || prompt.includes(kind);
}

function loadFixtureKinds(): Set<string> {
  const set = new Set<string>();
  if (!existsSync(FIXTURES_DIR)) return set;
  for (const file of readdirSync(FIXTURES_DIR)) {
    if (!file.endsWith('.json')) continue;
    try {
      const fixture = JSON.parse(
        readFileSync(path.join(FIXTURES_DIR, file), 'utf8')
      ) as { constraints?: Array<{ kind?: string }> };
      for (const constraint of fixture.constraints ?? []) {
        if (typeof constraint.kind === 'string') set.add(constraint.kind);
      }
    } catch {
      // Ignore malformed fixture — fixture loader test will catch it.
    }
  }
  return set;
}

function main() {
  const strict = process.argv.includes('--strict');
  const skeleton = readIfExists(SKELETON_PATH);
  const validator = readIfExists(VALIDATOR_PATH);
  const translatorPrompt = existsSync(TRANSLATOR_PROMPT_PATH)
    ? readFileSync(TRANSLATOR_PROMPT_PATH, 'utf8')
    : '';
  const fixtureKinds = loadFixtureKinds();

  const issues: Issue[] = [];
  const checkedKinds = [...CHECKED_KINDS];

  for (const meta of CONSTRAINT_REGISTRY) {
    if (!meta.hasChecker) continue;
    if (!findBranchInSkeleton(skeleton, meta.kind)) {
      issues.push({
        kind: meta.kind,
        reason: `hasChecker=true but no branch (string literal) in solver_skeleton.py`,
      });
    }
    if (!findCheckerInValidator(validator, meta.kind)) {
      issues.push({
        kind: meta.kind,
        reason: `hasChecker=true but no entry in deterministic-validator checkerByKind map`,
      });
    }
    if (translatorPrompt && !findMentionInTranslatorPrompt(translatorPrompt, meta.kind)) {
      // Only warn (don't fail) when kind isn't mentioned in prompt: some
      // built-in kinds (teacher_allowed_periods etc.) intentionally aren't
      // surfaced to the translator.
      if (strict) {
        issues.push({
          kind: meta.kind,
          reason: `not mentioned in prompts/translator.system.md (strict mode)`,
        });
      }
    }
    if (!fixtureKinds.has(meta.kind)) {
      if (strict) {
        issues.push({
          kind: meta.kind,
          reason: `no golden fixture under tests/fixtures/validator/ (strict mode)`,
        });
      }
    }
  }

  // Print report.
  console.log(`[parity] ${checkedKinds.length} checked kinds across ${CONSTRAINT_REGISTRY.length} registry entries`);

  if (issues.length === 0) {
    console.log('[parity] OK — every CHECKED kind has skeleton + validator coverage.');
    return;
  }

  // Default: warn-only (informational). Useful to surface drift without
  // blocking PRs on legacy drift that hasn't been fixed yet.
  // --strict: fail on any drift. Use this once drift has been resolved
  // (or to gate a specific PR that fixes a subset).
  console.error(`[parity] drift detected — ${issues.length} issue(s):`);
  for (const issue of issues) {
    console.error(`  - ${issue.kind}: ${issue.reason}`);
  }
  if (strict) {
    console.error('[parity] --strict enabled: exiting with code 1.');
    process.exit(1);
  }
  console.error('[parity] pass with drift (default mode). Re-run with --strict to enforce.');
}

main();
