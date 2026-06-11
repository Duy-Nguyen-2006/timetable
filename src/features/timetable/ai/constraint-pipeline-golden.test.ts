import test from 'node:test';
import assert from 'node:assert/strict';

import { runParsePipeline } from './parse-pipeline';
import type { AgentInputPayload, AIProviderConfig } from './types';

const provider: AIProviderConfig = {
  provider: 'generic-chat-completion-api',
  baseURL: 'https://example.test/v1',
  apiKey: 'test-key',
  model: 'user-configured-model',
};

const input: AgentInputPayload = {
  days: [
    { id: 'monday', label: 'Thứ 2' },
    { id: 'tuesday', label: 'Thứ 3' },
    { id: 'wednesday', label: 'Thứ 4' },
    { id: 'thursday', label: 'Thứ 5' },
    { id: 'friday', label: 'Thứ 6' },
  ],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { morning: 5 },
  deletedPeriods: {},
  assignments: ['Thúy', 'Yên', 'A', 'B', 'C', 'Sơn', 'Lan', 'Lan Anh', 'Lam'].map((teacher, index) => ({
    id: `a${index}`,
    teacher: { id: `t${index}`, label: teacher },
    subject: { id: `s${index}`, label: `Môn ${index}` },
    class: { id: `c${index}`, label: `Lớp ${index}` },
    weeklyPeriods: 2,
  })),
  constraints: [],
};

test('G1 illustration trap maps pair constraint without period and requires confirmation', async () => {
  const result = await runParsePipeline({
    rawText: 'Vào thứ 6, nếu Thúy và Yên đều có tiết dạy thì họ không được cùng 1 tiết, ví dụ cùng tiết 2',
    agentInput: input,
    config: provider,
  });
  assert.equal(result.specs[0].kind, 'teacher_pair_not_same_slot');
  assert.deepEqual(result.specs[0].params.teachers, ['Thúy', 'Yên']);
  assert.deepEqual(result.specs[0].params.scope, { day: 'friday' });
  assert.equal('period' in result.specs[0].params, false);
  assert.equal(result.requiresConfirmation, true);
  assert.equal(result.clarificationReasonCode, 'confirm_interpretation');
  assert.deepEqual(result.hints.droppedIllustrations, ['ví dụ cùng tiết 2']);
  assert.equal(result.interpretationCard?.scopeVi, 'Áp dụng trong thứ 6');
  assert.equal(result.interpretationCard?.thenAtomsVi.length, 1);
  assert.equal(result.interpretationCard?.notesVi.length, 1);
  assert.match(result.interpretationCard?.notesVi[0] ?? '', /minh hoạ/iu);
});

test('G2 if-then multi atom maps condition and two THEN atoms', async () => {
  const result = await runParsePipeline({
    rawText: 'Nếu cô A dạy thứ 3 tiết 4 thì thứ 5 thầy B không dạy tiết 2 và thầy C phải dạy thứ 2',
    agentInput: input,
    config: provider,
  });
  assert.equal(result.specs[0].kind, 'if_then');
  assert.deepEqual(result.specs[0].params.if, {
    op: 'teacher_teaches_at_slot',
    teacher: 'A',
    day: 'tuesday',
    period: 4,
  });
  const thenAtoms = result.specs[0].params.then as Array<{ kind: string; params: Record<string, unknown> }>;
  assert.equal(thenAtoms.length, 2);
  assert.equal(thenAtoms[0].kind, 'teacher_block_slot');
  assert.deepEqual(thenAtoms[0].params, { teacher: 'B', day: 'thursday', period: 2 });
  assert.equal(thenAtoms[1].kind, 'teacher_required_day');
  assert.deepEqual(thenAtoms[1].params, { teacher: 'C', day: 'monday' });
  assert.equal(result.clarificationReasonCode, 'confirm_interpretation');
  assert.equal(result.interpretationCard?.ifAtomVi, 'A dạy thứ 3 tiết 4');
  assert.equal(result.interpretationCard?.thenAtomsVi.length, 2);
  assert.equal(result.interpretationCard?.editableAtomIds.length, 2);
});

test('G3 typo negative maps teacher block slot', async () => {
  const result = await runParsePipeline({
    rawText: 'thầy Sơn khogn day thu 3 tiet 5',
    agentInput: input,
    config: provider,
  });
  assert.equal(result.specs[0].kind, 'teacher_block_slot');
  assert.deepEqual(result.specs[0].params, { teacher: 'Sơn', day: 'tuesday', period: 5 });
});

test('G4 exact entity wins over fuzzy candidates', async () => {
  const result = await runParsePipeline({
    rawText: 'Lan không dạy thứ 2',
    agentInput: input,
    config: provider,
  });
  assert.equal(result.hints.resolvedTeacher, 'Lan');
  assert.equal(result.status, 'mapped_builtin');
  assert.equal(result.specs[0].kind, 'teacher_block_day');
});

test('G4 fuzzy ambiguous entity requires clarification', async () => {
  const result = await runParsePipeline({
    rawText: 'La không dạy thứ 2',
    agentInput: input,
    config: provider,
  });
  assert.equal(result.status, 'needs_clarification');
  assert.equal(result.requiresConfirmation, true);
  assert.deepEqual(result.hints.ambiguousEntity?.candidates, ['Lan', 'Lan Anh', 'Lam']);
});
