/**
 * Tests for Section 6 (small slot-fill prompt) and Section 15 (end-to-end pipeline).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSlotFillPrompt, SMALL_SYSTEM_PROMPT, buildSlotFillUserMessage } from './slot-fill-prompt';
import { retrieveTopK, type ConstraintResolverHints } from './constraint-retriever';
import { resolveConstraintHints } from './constraint-resolver';
import { runParsePipeline } from './parse-pipeline';
import { getDefaultShadowLogger, resetDefaultShadowLogger } from './shadow-mode';
import type { AgentInputPayload, AIProviderConfig } from './types';

function makeHints(overrides: Partial<ConstraintResolverHints> = {}): ConstraintResolverHints {
  return {
    normalizedText: '',
    resolvedTeacher: null,
    resolvedTeachers: [],
    resolvedSubject: null,
    resolvedSubjects: [],
    resolvedClass: null,
    resolvedClasses: [],
    extractedNumber: null,
    extractedPeriods: [],
    extractedDays: [],
    inferredScope: null,
    mentionsBlock: false,
    mentionsMax: false,
    mentionsMin: false,
    mentionsConsecutive: false,
    mentionsOnly: false,
    mentionsPreferred: false,
    mentionsIfThen: false,
    ...overrides,
  };
}

const baseInput: AgentInputPayload = {
  days: [
    { id: 'monday', label: 'Thứ 2' },
    { id: 'tuesday', label: 'Thứ 3' },
  ],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { morning: 5 },
  deletedPeriods: {},
  assignments: [
    { id: 'a1', teacher: { id: 't1', label: 'Sơn' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 4 },
  ],
  constraints: [],
};

const provider: AIProviderConfig = {
  provider: 'generic-chat-completion-api',
  baseURL: 'https://example.test/v1',
  apiKey: 'test-key',
  model: 'test-model',
};

// ─── Section 6: Small slot-fill prompt ─────────────────────────────────────

test('SMALL_SYSTEM_PROMPT is small (< 20 lines)', () => {
  const lines = SMALL_SYSTEM_PROMPT.split('\n').filter((l) => l.trim().length > 0);
  assert.ok(lines.length <= 20, `expected <= 20 lines, got ${lines.length}`);
});

test('buildSlotFillPrompt injects resolved entities', () => {
  const hints = makeHints({
    normalizedText: 'thay son khong day thu 2',
    resolvedTeachers: ['Sơn'],
    inferredScope: 'teacher' as any,
    mentionsBlock: true,
  });
  const candidates = retrieveTopK(hints, 'teacher', 3);
  const { system, user } = buildSlotFillPrompt('Thầy Sơn không dạy thứ 2', hints, candidates);
  // System prompt is small
  assert.ok(system.length < 1500, `system prompt should be small, got ${system.length}`);
  // User prompt has the resolved entities
  assert.ok(user.includes('Sơn'));
  // Has the retrieved candidates
  assert.ok(user.includes('teacher'));
  // Has top-k sections
  assert.ok(user.includes('Top-k ứng viên'));
});

test('buildSlotFillPrompt is much smaller than legacy prompt', () => {
  // Legacy mega prompt is ~3000+ chars. New prompt should be < 3000.
  const hints = makeHints({
    normalizedText: 'thay son khong day thu 2',
    resolvedTeachers: ['Sơn'],
    inferredScope: 'teacher' as any,
  });
  const candidates = retrieveTopK(hints, 'teacher', 5);
  const { system, user } = buildSlotFillPrompt('Thầy Sơn không dạy thứ 2', hints, candidates);
  // The few-shot examples (FS1/FS2/FS3) add ~400 chars; total is still
  // much smaller than the old mega prompt (~8000+ chars).
  assert.ok(system.length + user.length < 4000, `total prompt size: ${system.length + user.length}`);
});

test('buildSlotFillUserMessage includes extracted number', () => {
  const hints = makeHints({
    normalizedText: 'thay son toi da 4 tiet',
    resolvedTeachers: ['Sơn'],
    extractedNumber: 4,
    mentionsMax: true,
  });
  const candidates = retrieveTopK(hints, 'teacher', 3);
  const user = buildSlotFillUserMessage('Thầy Sơn tối đa 4 tiết', hints, candidates);
  assert.ok(user.includes('4'));
  assert.ok(user.includes('max'));
});

test('buildSlotFillPrompt accepts previousAttempts', () => {
  const hints = makeHints({ resolvedTeachers: ['Sơn'], inferredScope: 'teacher' as any });
  const candidates = retrieveTopK(hints, 'teacher', 3);
  const { user } = buildSlotFillPrompt('Thầy Sơn không dạy thứ 2', hints, candidates, {
    previousAttempts: [{ displayText: 'Cô Thúy không dạy thứ 2', source: 'rule', confidence: 'low' }],
  });
  assert.ok(user.includes('KHÔNG lặp lại'));
  assert.ok(user.includes('Cô Thúy'));
});

// ─── Section 15: End-to-end pipeline ───────────────────────────────────────

test('runParsePipeline runs all 6 stages', async () => {
  const result = await runParsePipeline({
    rawText: 'Thầy Sơn không dạy thứ 2',
    agentInput: baseInput,
    config: provider,
  });
  // Should have at least 5 stage diagnostics
  const stages = new Set(result.diagnostics.map((d) => d.stage));
  assert.ok(stages.has('resolver'));
  assert.ok(stages.has('retriever'));
  assert.ok(stages.has('ambiguity'));
  assert.ok(stages.has('slot_fill'));
  assert.ok(stages.has('back_translation'));
  assert.ok(stages.has('done'));
});

test('runParsePipeline resolves teacher scope from entity', async () => {
  const result = await runParsePipeline({
    rawText: 'Thầy Sơn không dạy thứ 2',
    agentInput: baseInput,
    config: provider,
  });
  assert.equal(result.hints.inferredScope, 'teacher');
  assert.deepEqual(result.hints.resolvedTeachers, ['Sơn']);
  assert.ok(result.candidates.length > 0);
  assert.ok(result.candidates.some((c) => c.kind === 'teacher_block_day'));
});

test('runParsePipeline handles the Dung case (custom IR)', async () => {
  const result = await runParsePipeline({
    rawText: 'Dung không dạy quá 3 tiết cho 1 lớp trong cùng 1 ngày',
    agentInput: {
      ...baseInput,
      assignments: [
        { id: 'a1', teacher: { id: 't1', label: 'Dung' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 4 },
      ],
    },
    config: provider,
  });
  // Dung case is custom IR territory — should either map to nearest builtin (teacher_max_per_day)
  // or fall to custom_dsl
  assert.ok(result.hints.resolvedTeachers.includes('Dung'));
  assert.ok(result.requiresConfirmation, 'Dung case should require user confirmation');
});

test('runParsePipeline flags ambiguous entity', async () => {
  const result = await runParsePipeline({
    rawText: 'Lan không dạy thứ 2',
    agentInput: {
      ...baseInput,
      assignments: [
        { id: 'a1', teacher: { id: 't1', label: 'Lan Anh' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 4 },
        { id: 'a2', teacher: { id: 't2', label: 'Lan An' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c2', label: '6B' }, weeklyPeriods: 4 },
      ],
    },
    config: provider,
  });
  assert.equal(result.status, 'needs_clarification');
  assert.equal(result.requiresConfirmation, true);
});

test('runParsePipeline handles if-then', async () => {
  const result = await runParsePipeline({
    rawText: 'Nếu thầy Sơn dạy thứ 2 thì cô Hương không dạy thứ 3',
    agentInput: {
      ...baseInput,
      assignments: [
        ...baseInput.assignments,
        { id: 'a2', teacher: { id: 't2', label: 'Hương' }, subject: { id: 's2', label: 'Văn' }, class: { id: 'c2', label: '6B' }, weeklyPeriods: 4 },
      ],
    },
    config: provider,
  });
  // if-then → scope = global
  assert.equal(result.hints.inferredScope, 'global');
  assert.equal(result.hints.mentionsIfThen, true);
});

test('runParsePipeline logs IR-first shadow divergence without changing legacy result', async () => {
  resetDefaultShadowLogger();
  const result = await runParsePipeline({
    rawText: 'Thủy phải có tiết 4',
    agentInput: {
      ...baseInput,
      assignments: [
        { id: 'a1', teacher: { id: 't1', label: 'Thủy' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 4 },
      ],
    },
    config: provider,
  });

  assert.equal(result.status, 'needs_clarification');
  const entries = getDefaultShadowLogger().getEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].new?.specs[0].kind, 'teacher_required_period');
  assert.equal(entries[0].divergence, 'clarification_diff');
  assert.ok(result.diagnostics.some((d) => d.message === 'shadow=clarification_diff'));
  resetDefaultShadowLogger();
});
