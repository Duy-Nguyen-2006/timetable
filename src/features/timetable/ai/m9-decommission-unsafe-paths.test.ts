/**
 * m9-decommission-unsafe-paths.test.ts — M9 safety net tests
 *
 * Per Plan_v2.md M9 acceptance criteria:
 *  - No solve route can access raw natural language constraints directly
 *  - No dynamic Python code generation from constraints
 *  - Old constraints are migrated or blocked
 *  - Tests prove removed paths do not compile/import
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  assertSolvableConstraintState,
} from './constraint-preflight';
import { validateConfirmedSolveRequest, constraintItemsToRaw } from './solver-constraint-gate';
import type { ConfirmedConstraint, ParsedConstraintDraft } from './constraint-review-types';
import type { AgentInputPayload } from './types';
import type { ConstraintSpec } from './constraint-spec';

const baseInput: Omit<AgentInputPayload, 'constraints'> = {
  days: [{ id: 'monday', label: 'Thứ 2' }],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { monday: 5 },
  deletedPeriods: {},
  assignments: [
    {
      id: 'asg_1',
      teacher: { id: 't1', label: 'Sơn' },
      subject: { id: 's1', label: 'Toán' },
      class: { id: 'c1', label: '6A' },
      weeklyPeriods: 3,
    },
  ],
};

// ─── M9.1: pythonPredicate removed from user-input executable path ─────
test('M9.1: custom_dsl with pythonPredicate (no IR expr) is blocked at solver gate', () => {
  // Per M9.1, pythonPredicate should NOT make a custom_dsl executable
  // for user input. Only params.expr (IR) is accepted.
  const spec: ConstraintSpec = {
    id: 'm9_custom_python',
    original: 'Ràng buộc custom dùng pythonPredicate',
    severity: 'hard',
    kind: 'custom_dsl',
    params: {},
    pythonPredicate: 'return True',
  } as any;

  const preflight = assertSolvableConstraintState(
    [{ id: 'r_m9', text: 'unsafe', type: 'required', createdAt: '' }],
    [],
    [{
      id: 'conf_m9',
      rawConstraintId: 'r_m9',
      specs: [spec],
      confirmedBy: 'user',
      confirmedAt: new Date().toISOString(),
      summary: 'python-only custom',
      displayText: 'python-only custom',
    }]
  );

  assert.equal(preflight.canSolve, false, 'custom_dsl with pythonPredicate only must be blocked');
  assert.ok(
    preflight.blockReasons.includes('hard_custom_unexecutable'),
    'reason should be hard_custom_unexecutable'
  );
});

test('M9.1: custom_dsl with valid IR expr is allowed at solver gate', () => {
  const spec: ConstraintSpec = {
    id: 'm9_custom_ir',
    original: 'Ràng buộc custom có IR',
    severity: 'hard',
    kind: 'custom_dsl',
    params: { expr: { const: true } },
  };

  const preflight = assertSolvableConstraintState(
    [{ id: 'r_m9_ir', text: 'IR custom', type: 'required', createdAt: '' }],
    [],
    [{
      id: 'conf_m9_ir',
      rawConstraintId: 'r_m9_ir',
      specs: [spec],
      confirmedBy: 'user',
      confirmedAt: new Date().toISOString(),
      summary: 'IR-only custom',
      displayText: 'IR-only custom',
    }]
  );

  assert.equal(preflight.canSolve, true, 'custom_dsl with valid IR must be allowed');
});

// ─── M9.2: No hardcoded allowlists in the parser path ─────────────────
test('M9.2: solver-constraint-gate uses centralized BUILT_IN_KIND_SET', async () => {
  const fs = await import('node:fs/promises');
  const gatePath = path.join(__dirname, 'solver-constraint-gate.ts');
  const source = await fs.readFile(gatePath, 'utf8');
  // The gate must not have a hardcoded list of kinds
  assert.ok(
    !source.match(/new Set\(\[\s*['"]teacher_block_day['"]/),
    'solver gate should not have a hardcoded kind list'
  );
});

// ─── M9.3: Semantic direction decisions must go through the shared analyzer ──
test('M9.3: parser paths import the shared semantic-direction analyzer', async () => {
  const fs = await import('node:fs/promises');
  const paths = [
    'built-in-suggestion.ts',
    'constraint-retriever.ts',
    'ir-first-parser.ts',
    'analyze-constraint-service.ts',
    'constraint-reparse-service.ts',
    'negative-guard.ts',
    'shadow-mode.ts',
  ];
  for (const p of paths) {
    const full = path.join(__dirname, p);
    if (!existsSync(full)) continue;
    const content = await fs.readFile(full, 'utf8');
    assert.ok(
      content.includes("from './semantic-direction'") || content.includes("from '../semantic-direction'"),
      `${p} must import from semantic-direction for unified direction detection`
    );
  }
});

// ─── M9.4: Solve path does not call LLM/codegen ───────────────────────
test('M9.4: solver-constraint-gate.ts has zero LLM/chat imports', async () => {
  const fs = await import('node:fs/promises');
  const gatePath = path.join(__dirname, 'solver-constraint-gate.ts');
  const source = await fs.readFile(gatePath, 'utf8');
  for (const banned of ['chat-client', 'analyze-constraint-service', 'constraint-reparse-service', 'python-bridge', 'local-agent']) {
    assert.ok(
      !source.includes(`from './${banned}'`),
      `solver-constraint-gate.ts MUST NOT import ${banned}`
    );
  }
});

// ─── M9.5: validateConfirmedSolveRequest end-to-end safety ────────────
test('M9.5: mixed valid+invalid hard results in whole solve blocked', () => {
  const validSpec: ConstraintSpec = {
    id: 'm9_v1', original: 'Sơn không dạy thứ 2', severity: 'hard',
    kind: 'teacher_block_day', params: { teacher: 'Sơn', day: 'monday' },
  };
  const unsafeSpec: ConstraintSpec = {
    id: 'm9_u1', original: 'Có IR thôi', severity: 'hard',
    kind: 'custom_dsl',
    params: { naturalLanguage: 'chỉ có text, không có IR' },
  };
  const confirmed: ConfirmedConstraint[] = [
    { id: 'c1', rawConstraintId: 'r1', specs: [validSpec], confirmedBy: 'user', confirmedAt: '', summary: '', displayText: 'Sơn không dạy thứ 2' },
    { id: 'c2', rawConstraintId: 'r2', specs: [unsafeSpec], confirmedBy: 'user', confirmedAt: '', summary: '', displayText: 'unsafe' },
  ];
  const raw = constraintItemsToRaw([
    { id: 'r1', type: 'required', text: 'Sơn không dạy thứ 2' },
    { id: 'r2', type: 'required', text: 'unsafe' },
  ]);
  const gate = validateConfirmedSolveRequest(raw, [], { input: baseInput, confirmedConstraints: confirmed });
  assert.equal(gate.ok, false, 'Mixed valid + unsafe custom_dsl must block the whole solve');
});
