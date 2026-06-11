import test from 'node:test';
import assert from 'node:assert/strict';

import { assertSolvableConstraintState } from './constraint-preflight';
import { checkHardConstraintMechanism } from './constraint-ir';
import {
  buildSpecsFromAnalyzeResult,
  type AnalyzeConstraintResult,
} from './analyze-constraint-service';
import { semanticConstraintToSpecs } from './semantic-to-spec';
import type { SemanticConstraint } from './semantic-constraint';
import { validateSchedule } from './deterministic-validator';
import type { ConstraintSpec } from './constraint-spec';

const ifThenSemantic: SemanticConstraint = {
  type: 'if_then',
  if: { op: 'teacher_teaching_at_slot', teacher: 'Sơn', day: 'monday', period: 1 },
  then: [{ op: 'teacher_block_slot', teacher: 'Hương', day: 'tuesday', period: 3 }],
};

test('semanticConstraintToSpecs converts if_then semantic to executable spec', () => {
  const specs = semanticConstraintToSpecs(ifThenSemantic, {
    rawText: 'Nếu Sơn dạy thứ 2 tiết 1 thì Hương không dạy thứ 3 tiết 3',
    constraintType: 'required',
  });

  assert.equal(specs.length, 1);
  assert.equal(specs[0].kind, 'if_then');
  assert.deepEqual(specs[0].params.if, {
    op: 'teacher_teaches_at_slot',
    teacher: 'Sơn',
    day: 'monday',
    period: 1,
  });
  assert.deepEqual(specs[0].params.then, [
    {
      kind: 'teacher_block_slot',
      params: { teacher: 'Hương', day: 'tuesday', period: 3 },
    },
  ]);
  assert.equal(checkHardConstraintMechanism(specs[0]).ok, true);
});

test('buildSpecsFromAnalyzeResult maps semantic_only to if_then instead of custom_dsl', () => {
  const result: AnalyzeConstraintResult = {
    status: 'semantic_only',
    normalizedText: 'Nếu Sơn dạy thứ 2 tiết 1 thì Hương không dạy thứ 3 tiết 3',
    specs: [],
    semantic: ifThenSemantic,
    confidence: 'high',
    requiresConfirmation: true,
    guardReasons: [],
    clarificationQuestions: [],
    assumptions: [],
    unresolvedQuestions: [],
  };

  const specs = buildSpecsFromAnalyzeResult(
    result,
    'Nếu Sơn dạy thứ 2 tiết 1 thì Hương không dạy thứ 3 tiết 3',
    'required'
  );

  assert.equal(specs.length, 1);
  assert.equal(specs[0].kind, 'if_then');
});

test('if_then converted from semantic enforces THEN block in validator', () => {
  const specs = semanticConstraintToSpecs(ifThenSemantic, {
    rawText: 'Nếu Sơn dạy thứ 2 tiết 1 thì Hương không dạy thứ 3 tiết 3',
    constraintType: 'required',
  });
  const spec = specs[0] as ConstraintSpec;

  const violationReport = validateSchedule(
    [
      { class: '6A', day: 'monday', period: 1, subject: 'Toán', teacher: 'Sơn' },
      { class: '6B', day: 'tuesday', period: 3, subject: 'Văn', teacher: 'Hương' },
    ],
    [spec]
  );
  assert.equal(violationReport.violations.length, 1);

  const okReport = validateSchedule(
    [
      { class: '6A', day: 'monday', period: 1, subject: 'Toán', teacher: 'Sơn' },
      { class: '6B', day: 'tuesday', period: 2, subject: 'Văn', teacher: 'Hương' },
    ],
    [spec]
  );
  assert.equal(okReport.violations.length, 0);
});

test('converted if_then spec passes preflight executability gate', () => {
  const specs = semanticConstraintToSpecs(ifThenSemantic, {
    rawText: 'Nếu Sơn dạy thứ 2 tiết 1 thì Hương không dạy thứ 3 tiết 3',
    constraintType: 'required',
  });
  const preflight = assertSolvableConstraintState(
    [{ id: 'raw1', text: 'Nếu Sơn dạy thứ 2 tiết 1 thì Hương không dạy thứ 3 tiết 3', type: 'required', createdAt: '' }],
    [
      {
        id: 'draft_raw1',
        rawConstraintId: 'raw1',
        original: 'Nếu Sơn dạy thứ 2 tiết 1 thì Hương không dạy thứ 3 tiết 3',
        proposedSpecs: specs,
        status: 'parsed',
        confidence: 'high',
        explanation: '',
        issues: [],
        source: 'ai_reparse',
      },
    ],
    [
      {
        id: 'confirmed_raw1',
        rawConstraintId: 'raw1',
        specs,
        confirmedBy: 'user',
        confirmedAt: new Date().toISOString(),
        summary: 'if_then',
        displayText: 'Nếu Sơn dạy thứ 2 tiết 1 thì Hương không dạy thứ 3 tiết 3',
      },
    ]
  );
  assert.equal(preflight.blockReasons.includes('hard_custom_unexecutable'), false);
});