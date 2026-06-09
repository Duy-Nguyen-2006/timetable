import test from 'node:test';
import assert from 'node:assert/strict';

import { __translatorInternal } from './translator';
import type { AgentInputPayload } from './types';

const input: AgentInputPayload = {
  days: [
    { id: 'monday', label: 'Thứ 2' },
    { id: 'tuesday', label: 'Thứ 3' },
  ],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { morning: 4 },
  deletedPeriods: {},
  assignments: [
    { id: 'a1', teacher: { id: 't1', label: 'Sơn' }, subject: { id: 's1', label: 'Toán' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 4 },
    { id: 'a2', teacher: { id: 't2', label: 'Hiếu' }, subject: { id: 's2', label: 'Văn' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 4 },
  ],
  constraints: [{ type: 'required', text: 'Sơn không dạy thứ 3 nếu Hiếu không dạy thứ 2' }],
};

test('reversed if_then: HEAD as THEN, TAIL negated as IF', () => {
  const specs = __translatorInternal.sanitizeSpecs(
    input,
    __translatorInternal.fallbackFromRuleParser(input)
  );
  assert.equal(specs.length, 1);
  assert.equal(specs[0].kind, 'if_then');
  const params = specs[0].params as { if: { op: string; arg?: { teacher: string; day: string } }; then: Array<{ kind: string; params: { teacher: string; day: string } }> };
  assert.equal(params.if.op, 'not');
  assert.equal(params.if.arg?.teacher, 'Hiếu');
  assert.equal(params.if.arg?.day, 'monday');
  assert.equal(params.then[0].kind, 'teacher_block_day');
  assert.equal(params.then[0].params.teacher, 'Sơn');
  assert.equal(params.then[0].params.day, 'tuesday');
});
