import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCustomDraftFromNormalization, severityFromConstraintType } from './custom-normalization-draft';
import type { RawConstraintInput } from '../ai/constraint-review-types';
import type { AgentInputPayload } from '../ai/types';

const agentInput: AgentInputPayload = {
  days: [
    { id: 'monday', label: 'Thứ 2' },
    { id: 'tuesday', label: 'Thứ 3' },
    { id: 'wednesday', label: 'Thứ 4' },
  ],
  sessions: [],
  periodCounts: {},
  deletedPeriods: {},
  assignments: [
    {
      id: 'a1',
      teacher: { id: 't1', label: 'Hiếu' },
      subject: { id: 's1', label: 'Toán' },
      class: { id: 'c1', label: '6A' },
      weeklyPeriods: 4,
    },
    {
      id: 'a2',
      teacher: { id: 't2', label: 'Hương' },
      subject: { id: 's2', label: 'Văn' },
      class: { id: 'c1', label: '6A' },
      weeklyPeriods: 4,
    },
    {
      id: 'a3',
      teacher: { id: 't3', label: 'Thủy' },
      subject: { id: 's3', label: 'GDTC' },
      class: { id: 'c1', label: '6A' },
      weeklyPeriods: 2,
    },
  ],
  constraints: [],
};

const raw: RawConstraintInput = {
  id: 'r1',
  text: 'Nếu cô Thúy dạy thứ 4 thì cô Hạnh nghỉ',
  type: 'required',
  createdAt: '2026-01-01T00:00:00.000Z',
};

test('buildCustomDraftFromNormalization stores normalized custom text as custom_dsl spec', () => {
  const draft = buildCustomDraftFromNormalization(raw, {
    status: 'normalized',
    normalizedText: 'Nếu cô Thúy dạy Thứ 4 thì cô Hạnh không dạy.',
    detectedEntities: {
      teachers: ['Thúy', 'Hạnh'],
      subjects: [],
      classes: [],
      assignments: [],
      days: ['wednesday'],
      periods: [],
    },
    confidence: 0.9,
    needsClarification: false,
    clarificationQuestions: [],
  });

  assert.equal(draft.rawConstraintId, 'r1');
  assert.equal(draft.status, 'parsed');
  assert.equal(draft.confidence, 'high');
  assert.equal(draft.displayText, 'Nếu cô Thúy dạy Thứ 4 thì cô Hạnh không dạy.');
  assert.equal(draft.proposedSpecs.length, 1);
  assert.equal(draft.proposedSpecs[0].kind, 'custom_dsl');
  assert.equal(draft.proposedSpecs[0].params.normalizedText, 'Nếu cô Thúy dạy Thứ 4 thì cô Hạnh không dạy.');
  assert.equal(draft.semanticRepresentation?.type, 'unsupported_precise_text');
});

test('buildCustomDraftFromNormalization carries clarification questions', () => {
  const draft = buildCustomDraftFromNormalization(raw, {
    status: 'needs_clarification',
    normalizedText: 'Xếp lịch cân đối.',
    detectedEntities: {
      teachers: [],
      subjects: [],
      classes: [],
      assignments: [],
      days: [],
      periods: [],
    },
    confidence: 0.3,
    needsClarification: true,
    clarificationQuestions: ['Ràng buộc này áp dụng cho lớp nào?'],
  });

  assert.equal(draft.status, 'needs_review');
  assert.equal(draft.confidence, 'low');
  assert.equal(draft.issues[0].code, 'needs_user_clarification');
  assert.equal(draft.clarificationQuestions?.[0]?.prompt, 'Ràng buộc này áp dụng cho lớp nào?');
});

test('severityFromConstraintType maps preferred to soft', () => {
  assert.equal(severityFromConstraintType('required'), 'hard');
  assert.equal(severityFromConstraintType('preferred'), 'soft');
});

test('buildCustomDraftFromNormalization uses canonical if_then display when agentInput provided', () => {
  const raw: RawConstraintInput = {
    id: 'r2',
    text: 'Nếu Hiếu và Hương dạy thứ 2 thì Thủy không dạy thứ 3',
    type: 'required',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const draft = buildCustomDraftFromNormalization(
    raw,
    {
      status: 'normalized',
      normalizedText: 'Nếu Hiếu và Hương dạy thứ 2 thì Thủy không dạy thứ 3.',
      detectedEntities: {
        teachers: ['Hiếu', 'Hương', 'Thủy'],
        subjects: [],
        classes: [],
        assignments: [],
        days: ['monday', 'tuesday'],
        periods: [],
      },
      confidence: 0.9,
      needsClarification: false,
      clarificationQuestions: [],
    },
    agentInput
  );

  assert.match(draft.displayText ?? '', /Giáo viên Hiếu dạy Thứ 2/);
  assert.match(draft.displayText ?? '', /Giáo viên Thủy không dạy Thứ 3/);
});
