/**
 * Constraint contract parity check.
 *
 * Phase 4 (IR + dual-backend architecture): verifies that every kind in
 * `constraint-registry.ts` has matching coverage in BOTH backends, and that
 * every IR node type used in `python/macros.py` has matching handlers in
 * `python/ir_compiler.py` AND `python/ir_eval.py`. This prevents
 * "checked but not encoded" drift and one-sided backend implementation drift.
 *
 * Checks performed:
 *   1. Every kind in `SOLVER_ENCODABLE_KIND_LIST` has either:
 *      (a) a string-literal branch in `python/templates/solver_skeleton.py`, OR
 *      (b) an `if kind == "..."` branch in `python/macros.py`
 *   2. Every IR node type (and, or, not, implies, iff, exists, forall,
 *      atLeast, atMost, exactly, compare, consecutive, count) is handled
 *      in BOTH `python/ir_compiler.py` AND `python/ir_eval.py`.
 *   3. Every IR atom type (teaches, teachesOnDay, classSubjectAt,
 *      classBusy, assigned, const) is handled in BOTH backends.
 *   4. Every kind with `hasChecker=true` in the registry has a
 *      `checkerByKind` entry in `deterministic-validator.ts` (legacy).
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
  SOLVER_ENCODABLE_KIND_LIST,
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
const MACROS_PATH = path.join(REPO_ROOT, 'python', 'macros.py');
const IR_COMPILER_PATH = path.join(REPO_ROOT, 'python', 'ir_compiler.py');
const IR_EVAL_PATH = path.join(REPO_ROOT, 'python', 'ir_eval.py');

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
  return false;
}

function findBranchInMacros(macros: string, kind: string): boolean {
  // Macros uses `if kind == "<name>":` form. We accept the literal anywhere.
  const literal = `kind == "${kind}"`;
  return macros.includes(literal);
}

function findMentionInTranslatorPrompt(prompt: string, kind: string): boolean {
  return prompt.includes(`\`${kind}\``) || prompt.includes(`"${kind}"`) || prompt.includes(kind);
}

/**
 * Check that a list of IR node types are handled in a Python file.
 * Heuristic: each node type should appear as either a function arg or
 * an `if "<node>" in expr:` check or a `dict.get("<node>")` call.
 */
function findIRNodeHandler(source: string, nodeType: string): boolean {
  // Direct handlers: `if "<node>" in expr`, `expr["<node>"]`, `expr.get("<node>")`,
  // or `if "<node>" in c:`, `c["<node>"]`, etc.
  const patterns = [
    new RegExp(`["']${nodeType}["']\\s+in\\s+`, 'g'),
    new RegExp(`\\["${nodeType}"\\]`, 'g'),
    new RegExp(`\\.get\\(["']${nodeType}["']`, 'g'),
    new RegExp(`if\\s+["']${nodeType}["']`, 'g'),
    new RegExp(`["']${nodeType}["']\\s*:`),
  ];
  return patterns.some((p) => p.test(source));
}

function findIRAtomHandler(source: string, atomType: string): boolean {
  return findIRNodeHandler(source, atomType);
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

const IR_BOOL_NODES = [
  'and', 'or', 'not', 'implies', 'iff',
  'exists', 'forall',
  'atLeast', 'atMost', 'exactly',
  'compare', 'consecutive',
];

const IR_INT_NODES = ['count', 'sum', 'scale'];
const IR_ATOMS = [
  'teaches', 'teachesOnDay', 'classSubjectAt', 'classBusy', 'assigned', 'const',
];

function main() {
  const strict = process.argv.includes('--strict');
  const full = process.argv.includes('--full');
  const skeleton = readIfExists(SKELETON_PATH);
  const validator = readIfExists(VALIDATOR_PATH);
  const translatorPrompt = existsSync(TRANSLATOR_PROMPT_PATH)
    ? readFileSync(TRANSLATOR_PROMPT_PATH, 'utf8')
    : '';
  const macros = readIfExists(MACROS_PATH);
  const irCompiler = readIfExists(IR_COMPILER_PATH);
  const irEval = readIfExists(IR_EVAL_PATH);
  const fixtureKinds = loadFixtureKinds();

  const issues: Issue[] = [];
  const checkedKinds = [...CHECKED_KINDS];
  const solverKinds = [...SOLVER_ENCODABLE_KIND_LIST];

  // === Check 1: Every SOLVER_ENCODABLE_KIND_LIST kind has skeleton OR macros coverage ===
  for (const kind of solverKinds) {
    const inSkeleton = findBranchInSkeleton(skeleton, kind);
    const inMacros = findBranchInMacros(macros, kind);
    if (!inSkeleton && !inMacros) {
      issues.push({
        kind,
        reason: `solver-encodable kind has no branch in solver_skeleton.py AND no expansion in python/macros.py`,
      });
    }
  }

  // === Check 2: Every IR BoolExpr node has handlers in BOTH backends ===
  for (const node of IR_BOOL_NODES) {
    if (!findIRNodeHandler(irCompiler, node)) {
      issues.push({
        kind: `ir_node:${node}`,
        reason: `IR BoolExpr node "${node}" missing handler in python/ir_compiler.py (compile backend)`,
      });
    }
    if (!findIRNodeHandler(irEval, node)) {
      issues.push({
        kind: `ir_node:${node}`,
        reason: `IR BoolExpr node "${node}" missing handler in python/ir_eval.py (eval backend) — parity broken`,
      });
    }
  }

  // === Check 3: Every IR IntExpr node has handlers in BOTH backends ===
  for (const node of IR_INT_NODES) {
    if (!findIRNodeHandler(irCompiler, node)) {
      issues.push({
        kind: `ir_node:${node}`,
        reason: `IR IntExpr node "${node}" missing handler in python/ir_compiler.py`,
      });
    }
    if (!findIRNodeHandler(irEval, node)) {
      issues.push({
        kind: `ir_node:${node}`,
        reason: `IR IntExpr node "${node}" missing handler in python/ir_eval.py`,
      });
    }
  }

  // === Check 4: Every IR atom has handlers in BOTH backends ===
  for (const atom of IR_ATOMS) {
    if (!findIRAtomHandler(irCompiler, atom)) {
      issues.push({
        kind: `ir_atom:${atom}`,
        reason: `IR atom "${atom}" missing handler in python/ir_compiler.py`,
      });
    }
    if (!findIRAtomHandler(irEval, atom)) {
      issues.push({
        kind: `ir_atom:${atom}`,
        reason: `IR atom "${atom}" missing handler in python/ir_eval.py`,
      });
    }
  }

  // === Check 5 (legacy): hasChecker=true kinds still need validator entries ===
  for (const meta of CONSTRAINT_REGISTRY) {
    if (!meta.hasChecker) continue;
    if (!findCheckerInValidator(validator, meta.kind)) {
      issues.push({
        kind: meta.kind,
        reason: `hasChecker=true but no entry in deterministic-validator checkerByKind map`,
      });
    }
    if (full && translatorPrompt && !findMentionInTranslatorPrompt(translatorPrompt, meta.kind)) {
      issues.push({
        kind: meta.kind,
        reason: `not mentioned in prompts/translator.system.md (full mode)`,
      });
    }
    if (full && !fixtureKinds.has(meta.kind)) {
      issues.push({
        kind: meta.kind,
        reason: `no golden fixture under tests/fixtures/validator/ (full mode)`,
      });
    }
  }

  // Print report.
  console.log(
    `[parity] ${checkedKinds.length} checked kinds, ${solverKinds.length} solver-encodable kinds across ${CONSTRAINT_REGISTRY.length} registry entries`
  );
  console.log(
    `[parity] IR nodes: ${IR_BOOL_NODES.length} bool + ${IR_INT_NODES.length} int = ${IR_BOOL_NODES.length + IR_INT_NODES.length}; IR atoms: ${IR_ATOMS.length}`
  );

  if (issues.length === 0) {
    console.log(
      '[parity] OK — every kind has skeleton/macros coverage, every IR node has matching compile+eval handlers.'
    );
    return;
  }

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
