/**
 * Tests for Section 12 risk-mitigation modules:
 *  - Synonym miss log
 *  - IR vocabulary cap
 *
 * And Stage 1 Resolver shared function (Section 4).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveConstraintHints } from './constraint-resolver';
import { synonymMissLog, logRetrievalMiss } from './synonym-miss-log';
import { validateIRVocabulary, rejectUnknownIR, IR_VOCABULARY } from './ir-vocabulary-cap';
import type { ConstraintIR } from './constraint-ir';

// ─── Stage 1 Resolver ──────────────────────────────────────────────────────

const baseInput = {
  userText: 'Thầy Sơn không dạy thứ 2',
  teachers: ['Sơn', 'Hạnh', 'Thúy'],
  subjects: ['Toán', 'Văn', 'Anh'],
  classes: ['6A', '6B', '7A'],
  assignments: [],
};

test('resolveConstraintHints extracts teacher from text', () => {
  const hints = resolveConstraintHints(baseInput);
  assert.equal(hints.resolvedTeacher, 'Sơn');
  assert.equal(hints.inferredScope, 'teacher');
});

test('resolveConstraintHints detects block keyword', () => {
  const hints = resolveConstraintHints(baseInput);
  assert.equal(hints.mentionsBlock, true);
});

test('resolveConstraintHints handles if-then', () => {
  const hints = resolveConstraintHints({
    ...baseInput,
    userText: 'Nếu thầy Sơn dạy thứ 2 thì cô Thúy không dạy thứ 3',
  });
  assert.equal(hints.mentionsIfThen, true);
  assert.equal(hints.inferredScope, 'global');
});

test('resolveConstraintHints extracts numeric hints', () => {
  const hints = resolveConstraintHints({
    ...baseInput,
    userText: 'Thầy Sơn dạy tối đa 4 tiết mỗi ngày',
  });
  assert.equal(hints.extractedNumber, 4);
  assert.equal(hints.mentionsMax, true);
});

test('resolveConstraintHints flags ambiguous entity', () => {
  const hints = resolveConstraintHints({
    ...baseInput,
    userText: 'Lan không dạy thứ 2',
    teachers: ['Lan Anh', 'Lan An'],
  });
  assert.ok(hints.ambiguousEntity);
  assert.equal(hints.ambiguousEntity?.kind, 'teacher');
});

test('resolveConstraintHints infers class scope when class match', () => {
  const hints = resolveConstraintHints({
    ...baseInput,
    userText: 'Lớp 6A không học thứ 2',
  });
  assert.equal(hints.inferredScope, 'class');
});

test('resolveConstraintHints handles the Dung case', () => {
  const hints = resolveConstraintHints({
    ...baseInput,
    userText: 'Dung không dạy quá 3 tiết cho 1 lớp trong cùng 1 ngày',
    teachers: ['Dung', 'Sơn'],
  });
  assert.equal(hints.resolvedTeacher, 'Dung');
  assert.equal(hints.extractedNumber, 3);
  assert.equal(hints.mentionsMax, true);
  assert.equal(hints.mentionsBlock, true);
});

// ─── Synonym miss log ──────────────────────────────────────────────────────

test('synonymMissLog records misses', () => {
  synonymMissLog.clear();
  logRetrievalMiss('foo', 'foo', [], 0, 'teacher');
  logRetrievalMiss('bar', 'bar', [], 0, 'subject');
  assert.equal(synonymMissLog.size(), 2);
  synonymMissLog.clear();
  assert.equal(synonymMissLog.size(), 0);
});

test('synonymMissLog deduplicates by normalized text', () => {
  synonymMissLog.clear();
  logRetrievalMiss('foo bar', 'foo bar', [], 0, 'teacher');
  logRetrievalMiss('foo bar', 'foo bar', [], 0, 'teacher');
  logRetrievalMiss('FOO BAR', 'foo bar', [], 0, 'teacher');
  assert.equal(synonymMissLog.size(), 1, 'should dedupe by normalized text');
  synonymMissLog.clear();
});

test('logRetrievalMiss only logs below threshold', () => {
  synonymMissLog.clear();
  const cands = [
    {
      kind: 'teacher_block_day' as any,
      scope: 'teacher' as any,
      embedding: null,
      triggers: [],
      synonyms: [],
      fewShots: [],
      negativeFewShots: [],
      requiredParams: [],
    },
  ];
  // High score → no log
  logRetrievalMiss('high', 'high', cands, 10, 'teacher');
  // Low score → log
  logRetrievalMiss('low', 'low', cands, 1, 'teacher');
  assert.equal(synonymMissLog.size(), 1);
  assert.equal(synonymMissLog.getAll()[0].text, 'low');
  synonymMissLog.clear();
});

// ─── IR vocabulary cap ─────────────────────────────────────────────────────

test('IR_VOCABULARY contains the documented ops', () => {
  assert.ok(IR_VOCABULARY.boolOps.includes('and'));
  assert.ok(IR_VOCABULARY.boolOps.includes('or'));
  assert.ok(IR_VOCABULARY.boolOps.includes('not'));
  assert.ok(IR_VOCABULARY.boolOps.includes('implies'));
  assert.ok(IR_VOCABULARY.boolOps.includes('iff'));
  assert.ok(IR_VOCABULARY.atomOps.includes('teaches'));
  assert.ok(IR_VOCABULARY.atomOps.includes('teachesOnDay'));
});

test('validateIRVocabulary accepts known IR', () => {
  const ir: ConstraintIR = {
    id: 'c1', severity: 'hard', original: 'test',
    expr: {
      and: [
        { teachesOnDay: { teacher: 'A', day: 'monday' } },
        { or: [{ const: true }, { const: false }] },
      ],
    },
  };
  const v = validateIRVocabulary(ir);
  assert.equal(v.ok, true);
  assert.equal(v.unknownOps.length, 0);
});

test('validateIRVocabulary flags unknown atom op', () => {
  const ir = {
    id: 'c1', severity: 'hard', original: 'test',
    expr: { unknownOp: { teacher: 'A', day: 'monday' } },
  } as unknown as ConstraintIR;
  const v = validateIRVocabulary(ir);
  assert.equal(v.ok, false);
  assert.ok(v.unknownOps.includes('unknownOp'));
});

test('validateIRVocabulary flags unknown domain kind', () => {
  const ir: ConstraintIR = {
    id: 'c1', severity: 'hard', original: 'test',
    expr: {
      forall: {
        var: 'x',
        in: 'unknown_domain' as any,
        body: { const: true },
      },
    },
  };
  const v = validateIRVocabulary(ir);
  assert.equal(v.ok, false);
  assert.ok(v.unknownDomainKinds.includes('unknown_domain'));
});

test('rejectUnknownIR returns informative message', () => {
  const ir = {
    id: 'c1', severity: 'hard', original: 'test',
    expr: { fakeOp: {} },
  } as unknown as ConstraintIR;
  const msg = rejectUnknownIR(ir);
  assert.ok(msg.length > 0);
  assert.match(msg, /IR không hợp lệ/);
});

test('rejectUnknownIR returns empty for valid IR', () => {
  const ir: ConstraintIR = {
    id: 'c1', severity: 'hard', original: 'test',
    expr: { const: true },
  };
  const msg = rejectUnknownIR(ir);
  assert.equal(msg, '');
});
