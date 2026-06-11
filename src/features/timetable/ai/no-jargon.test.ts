import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const USER_FACING_FILES = [
  'analyze-constraint-service.ts',
  'rule-parse-confidence.ts',
  '../constraints/ConstraintDraftCard.tsx',
  'constraint-draft-validator.ts',
];

const JARGON_PATTERN = /\bRule parser\b|\bparser chưa\b|\bcustom_dsl\b|\bdiễn đạt lại rõ hơn\b/iu;

test('user-facing constraint copy does not expose internal jargon', () => {
  const baseDir = join(import.meta.dirname);
  const violations: string[] = [];

  for (const relativePath of USER_FACING_FILES) {
    const source = readFileSync(join(baseDir, relativePath), 'utf8');
    const messageLines = source
      .split('\n')
      .map((line, index) => ({ line, index: index + 1 }))
      .filter(({ line }) => /message:|clarificationQuestions:|prompt:/u.test(line));

    for (const { line, index } of messageLines) {
      if (JARGON_PATTERN.test(line)) {
        violations.push(`${relativePath}:${index}: ${line.trim()}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Found user-facing jargon:\n${violations.join('\n')}`
  );
});