import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AgentInputPayload } from './types';
import type { ConstraintSpec } from './constraint-spec';
import {
  isAllSubjectValue,
  normalizeConstraintSpecsForSolving,
} from './constraint-spec-normalizer';

const baseInput: AgentInputPayload = {
  days: [{ id: 'monday', label: 'Thứ 2' }],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { morning: 5 },
  deletedPeriods: {},
  assignments: [
    {
      id: 'asg_toan_6a',
      teacher: { id: 't1', label: 'Sơn' },
      subject: { id: 's1', label: 'Toán' },
      class: { id: 'c1', label: '6A' },
      weeklyPeriods: 4,
    },
    {
      id: 'asg_van_6a',
      teacher: { id: 't2', label: 'Hương' },
      subject: { id: 's2', label: 'Văn' },
      class: { id: 'c1', label: '6A' },
      weeklyPeriods: 4,
    },
  ],
  constraints: [],
};

const baseSpec = (overrides: Partial<ConstraintSpec>): ConstraintSpec => ({
  id: 'spec_test',
  original: 'mọi môn tối đa 2 tiết liên tiếp',
  severity: 'soft',
  kind: 'subject_max_consecutive',
  params: { subject: '__all__', max: 2 },
  weight: 8,
  ...overrides,
});

describe('isAllSubjectValue', () => {
  it('returns true for empty, __all__, all, and Vietnamese variants', () => {
    for (const value of ['', '__all__', 'all', 'mọi môn', 'Mọi Môn', 'tất cả môn']) {
      assert.equal(isAllSubjectValue(value), true, `expected ${value} to be all-subject`);
    }
  });
  it('returns false for a real subject label', () => {
    assert.equal(isAllSubjectValue('Toán'), false);
    assert.equal(isAllSubjectValue('Văn'), false);
  });
});

describe('normalizeConstraintSpecsForSolving — subject_max_consecutive', () => {
  it('expands __all__ sentinel into one spec per real subject', () => {
    const { specs, issues } = normalizeConstraintSpecsForSolving(baseInput, [
      baseSpec({ params: { subject: '__all__', max: 2 } }),
    ]);
    assert.equal(issues.length, 0);
    assert.equal(specs.length, 2);
    const subjects = specs.map((s) => s.params.subject).sort();
    assert.deepEqual(subjects, ['Toán', 'Văn']);
    for (const spec of specs) {
      assert.equal(spec.params.maxConsecutive, 2);
      assert.equal(spec.params.max, 2);
      assert.match(String(spec.notes ?? ''), /expanded_from_all_subject/);
    }
  });

  it('treats missing subject as all-subject (root cause of 4 tiết Văn)', () => {
    const { specs, issues } = normalizeConstraintSpecsForSolving(baseInput, [
      baseSpec({ params: { max: 2 } as Record<string, unknown> }),
    ]);
    assert.equal(issues.length, 0);
    assert.equal(specs.length, 2);
  });

  it('passes through real subject unchanged but still canonicalizes max', () => {
    const { specs, issues } = normalizeConstraintSpecsForSolving(baseInput, [
      baseSpec({ id: 'van_only', params: { subject: 'Văn', max: 3 } }),
    ]);
    assert.equal(issues.length, 0);
    assert.equal(specs.length, 1);
    assert.equal(specs[0].params.subject, 'Văn');
    assert.equal(specs[0].params.maxConsecutive, 3);
    assert.equal(specs[0].params.max, 3);
  });

  it('honors params.maxConsecutive over params.max', () => {
    const { specs, issues } = normalizeConstraintSpecsForSolving(baseInput, [
      baseSpec({ id: 'van_only', params: { subject: 'Văn', max: 1, maxConsecutive: 2 } }),
    ]);
    assert.equal(issues.length, 0);
    assert.equal(specs[0].params.maxConsecutive, 2);
    assert.equal(specs[0].params.max, 2);
  });

  it('reports invalid_max_consecutive when max is missing or <= 0', () => {
    const { specs, issues } = normalizeConstraintSpecsForSolving(baseInput, [
      baseSpec({ id: 'bad_a', params: { subject: 'Văn' } as Record<string, unknown> }),
      baseSpec({ id: 'bad_b', params: { subject: 'Văn', max: 0 } }),
    ]);
    assert.equal(specs.length, 0);
    assert.equal(issues.length, 2);
    for (const issue of issues) {
      assert.equal(issue.code, 'invalid_max_consecutive');
    }
  });

  it('reports no_subject_targets when expansion yields nothing', () => {
    const emptyInput: AgentInputPayload = {
      ...baseInput,
      assignments: [],
    };
    const { specs, issues } = normalizeConstraintSpecsForSolving(emptyInput, [
      baseSpec({ params: { subject: '__all__', max: 2 } }),
    ]);
    assert.equal(specs.length, 0);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, 'no_subject_targets');
  });

  it('respects classes filter when expanding all subjects', () => {
    const multiClassInput: AgentInputPayload = {
      ...baseInput,
      assignments: [
        ...baseInput.assignments,
        {
          id: 'asg_toan_6b',
          teacher: { id: 't3', label: 'Lan' },
          subject: { id: 's1', label: 'Toán' },
          class: { id: 'c2', label: '6B' },
          weeklyPeriods: 4,
        },
      ],
    };
    const { specs, issues } = normalizeConstraintSpecsForSolving(multiClassInput, [
      baseSpec({ params: { subject: '__all__', max: 2, classes: ['6A'] } }),
    ]);
    assert.equal(issues.length, 0);
    const subjects = specs.map((s) => s.params.subject).sort();
    assert.deepEqual(subjects, ['Toán', 'Văn']);
  });
});

describe('normalizeConstraintSpecsForSolving — other max kinds', () => {
  it('canonicalizes teacher_max_consecutive and class_max_consecutive', () => {
    const { specs, issues } = normalizeConstraintSpecsForSolving(baseInput, [
      {
        id: 'tmc',
        original: 'Sơn tối đa 3 tiết liên tiếp',
        severity: 'hard',
        kind: 'teacher_max_consecutive',
        params: { teacher: 'Sơn', max: 3 },
      },
      {
        id: 'cmc',
        original: '6A tối đa 4 tiết liên tiếp',
        severity: 'hard',
        kind: 'class_max_consecutive',
        params: { class: '6A', max: 4 },
      },
    ]);
    assert.equal(issues.length, 0);
    assert.equal(specs[0].params.maxConsecutive, 3);
    assert.equal(specs[0].params.max, 3);
    assert.equal(specs[1].params.maxConsecutive, 4);
    assert.equal(specs[1].params.max, 4);
  });

  it('passes through unrelated kinds unchanged', () => {
    const passthrough: ConstraintSpec = {
      id: 'block',
      original: 'Sơn không dạy thứ 2',
      severity: 'hard',
      kind: 'teacher_block_day',
      params: { teacher: 'Sơn', day: 'monday' },
    };
    const { specs, issues } = normalizeConstraintSpecsForSolving(baseInput, [passthrough]);
    assert.equal(issues.length, 0);
    assert.deepEqual(specs[0], passthrough);
  });
});
