import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalDisplayFromRuleParser,
  isNearVerbatimConstraintEcho,
  preferCanonicalNormalizedText,
} from './constraint-canonical-text';
import type { AgentInputPayload } from './types';

const agentInput: AgentInputPayload = {
  days: [
    { id: 'monday', label: 'Thứ 2' },
    { id: 'tuesday', label: 'Thứ 3' },
    { id: 'wednesday', label: 'Thứ 4' },
  ],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { morning: 4 },
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

test('canonicalDisplayFromRuleParser expands if_then with Giáo viên labels', () => {
  const original = 'Nếu Hiếu và Hương dạy thứ 2 thì Thủy không dạy thứ 3';
  const line = canonicalDisplayFromRuleParser(agentInput, original);
  assert.ok(line);
  assert.match(line!, /Giáo viên Hiếu dạy Thứ 2/);
  assert.match(line!, /Giáo viên Hương dạy Thứ 2/);
  assert.match(line!, /Giáo viên Thủy không dạy Thứ 3/);
  assert.doesNotMatch(line!, /Nếu Hiếu và Hương dạy thứ 2 thì Thủy không dạy thứ 3\./);
});

test('isNearVerbatimConstraintEcho detects echo with trailing period', () => {
  const original = 'Nếu Hiếu và Hương dạy thứ 2 thì Thủy không dạy thứ 3';
  assert.equal(
    isNearVerbatimConstraintEcho(original, 'Nếu Hiếu và Hương dạy thứ 2 thì Thủy không dạy thứ 3.'),
    true
  );
});

test('preferCanonicalNormalizedText replaces verbatim custom normalization', () => {
  const original = 'Nếu Hiếu và Hương dạy thứ 2 thì Thủy không dạy thứ 3';
  const preferred = preferCanonicalNormalizedText(
    agentInput,
    original,
    'Nếu Hiếu và Hương dạy thứ 2 thì Thủy không dạy thứ 3.'
  );
  assert.match(preferred, /Giáo viên Hiếu dạy Thứ 2/);
  assert.match(preferred, /Giáo viên Thủy không dạy Thứ 3/);
});
