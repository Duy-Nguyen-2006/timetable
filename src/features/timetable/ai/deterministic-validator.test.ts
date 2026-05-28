import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ConstraintKind, ConstraintSpec, ScheduleEntry } from './constraint-spec';
import { validateSchedule } from './deterministic-validator';

type CheckerCase = {
  kind: ConstraintKind;
  spec: ConstraintSpec;
  pass: ScheduleEntry[];
  fail: ScheduleEntry[];
};

const entry = (
  klass: string,
  day: string,
  period: number,
  subject: string,
  teacher: string
): ScheduleEntry => ({
  class: klass,
  day,
  period,
  subject,
  teacher,
});

const spec = (
  id: string,
  kind: ConstraintKind,
  params: Record<string, unknown>,
  severity: ConstraintSpec['severity'] = 'hard'
): ConstraintSpec => ({
  id,
  original: id,
  severity,
  kind,
  params,
});

const checkerCases: CheckerCase[] = [
  {
    kind: 'teacher_block_day',
    spec: spec('teacher_block_day', 'teacher_block_day', { teacher: 'Sơn', day: 'mon' }),
    pass: [entry('6A', 'tue', 1, 'Toán', 'Sơn')],
    fail: [entry('6A', 'mon', 1, 'Toán', 'Sơn')],
  },
  {
    kind: 'teacher_block_period',
    spec: spec('teacher_block_period', 'teacher_block_period', { teacher: 'Sơn', period: 3 }),
    pass: [entry('6A', 'mon', 1, 'Toán', 'Sơn')],
    fail: [entry('6A', 'mon', 3, 'Toán', 'Sơn')],
  },
  {
    kind: 'teacher_block_slot',
    spec: spec('teacher_block_slot', 'teacher_block_slot', {
      teacher: 'Sơn',
      day: 'mon',
      period: 2,
    }),
    pass: [entry('6A', 'mon', 1, 'Toán', 'Sơn')],
    fail: [entry('6A', 'mon', 2, 'Toán', 'Sơn')],
  },
  {
    kind: 'teacher_max_per_day',
    spec: spec('teacher_max_per_day', 'teacher_max_per_day', {
      teacher: 'Sơn',
      maxPerDay: 2,
    }),
    pass: [entry('6A', 'mon', 1, 'Toán', 'Sơn'), entry('6A', 'mon', 2, 'Văn', 'Sơn')],
    fail: [
      entry('6A', 'mon', 1, 'Toán', 'Sơn'),
      entry('6A', 'mon', 2, 'Văn', 'Sơn'),
      entry('6A', 'mon', 3, 'Anh', 'Sơn'),
    ],
  },
  {
    kind: 'teacher_max_consecutive',
    spec: spec('teacher_max_consecutive', 'teacher_max_consecutive', {
      teacher: 'Sơn',
      maxConsecutive: 2,
    }),
    pass: [entry('6A', 'mon', 1, 'Toán', 'Sơn'), entry('6A', 'mon', 2, 'Văn', 'Sơn')],
    fail: [
      entry('6A', 'mon', 1, 'Toán', 'Sơn'),
      entry('6A', 'mon', 2, 'Văn', 'Sơn'),
      entry('6A', 'mon', 3, 'Anh', 'Sơn'),
    ],
  },
  {
    kind: 'subject_pin_period',
    spec: spec('subject_pin_period', 'subject_pin_period', { subject: 'Toán', periods: [1, 2] }),
    pass: [entry('6A', 'mon', 1, 'Toán', 'Sơn'), entry('6B', 'mon', 2, 'Toán', 'Thúy')],
    fail: [entry('6A', 'mon', 3, 'Toán', 'Sơn')],
  },
  {
    kind: 'subject_consecutive',
    spec: spec('subject_consecutive', 'subject_consecutive', { subject: 'Toán', length: 2 }),
    pass: [entry('6A', 'mon', 1, 'Toán', 'Sơn'), entry('6A', 'mon', 2, 'Toán', 'Sơn')],
    fail: [
      entry('6A', 'mon', 1, 'Toán', 'Sơn'),
      entry('6A', 'mon', 3, 'Toán', 'Sơn'),
    ],
  },
  {
    kind: 'class_no_double_subject_day',
    spec: spec('class_no_double_subject_day', 'class_no_double_subject_day', {
      class: '6A',
      subject: 'Toán',
    }),
    pass: [entry('6A', 'mon', 1, 'Toán', 'Sơn'), entry('6A', 'tue', 1, 'Toán', 'Sơn')],
    fail: [entry('6A', 'mon', 1, 'Toán', 'Sơn'), entry('6A', 'mon', 2, 'Toán', 'Sơn')],
  },
  {
    kind: 'weekly_periods_exact',
    spec: spec('weekly_periods_exact', 'weekly_periods_exact', {
      teacher: 'Sơn',
      subject: 'Toán',
      class: '6A',
      weeklyPeriods: 2,
    }),
    pass: [entry('6A', 'mon', 1, 'Toán', 'Sơn'), entry('6A', 'tue', 1, 'Toán', 'Sơn')],
    fail: [entry('6A', 'mon', 1, 'Toán', 'Sơn')],
  },
  {
    kind: 'if_then',
    spec: spec('if_then', 'if_then', {
      if: { op: 'teacher_teaches_on_day', teacher: 'Sơn', day: 'mon' },
      then: [{ kind: 'teacher_block_day', params: { teacher: 'Thúy', day: 'mon' } }],
    }),
    pass: [entry('6A', 'tue', 1, 'Toán', 'Sơn'), entry('6B', 'mon', 1, 'Văn', 'Thúy')],
    fail: [entry('6A', 'mon', 1, 'Toán', 'Sơn'), entry('6B', 'mon', 1, 'Văn', 'Thúy')],
  },
  {
    kind: 'pair_not_same_slot',
    spec: spec('pair_not_same_slot', 'pair_not_same_slot', { teachers: ['Sơn', 'Thúy'] }),
    pass: [entry('6A', 'mon', 1, 'Toán', 'Sơn'), entry('6B', 'mon', 2, 'Văn', 'Thúy')],
    fail: [entry('6A', 'mon', 1, 'Toán', 'Sơn'), entry('6B', 'mon', 1, 'Văn', 'Thúy')],
  },
  {
    kind: 'custom_dsl',
    spec: spec('custom_dsl', 'custom_dsl', { naturalLanguage: 'custom expression' }, 'soft'),
    pass: [entry('6A', 'mon', 1, 'Toán', 'Sơn')],
    fail: [entry('6A', 'mon', 1, 'Toán', 'Sơn')],
  },
];

describe('checker matrix', () => {
  for (const checkerCase of checkerCases) {
    it(`${checkerCase.kind} passes valid schedule`, () => {
      const report = validateSchedule(checkerCase.pass, [checkerCase.spec]);

      assert.deepEqual(report.violations, []);
      if (checkerCase.kind === 'custom_dsl') {
        assert.deepEqual(report.uncheckedConstraintIds, [checkerCase.spec.id]);
      }
    });

    it(`${checkerCase.kind} catches invalid schedule`, () => {
      const report = validateSchedule(checkerCase.fail, [checkerCase.spec]);

      if (checkerCase.kind === 'custom_dsl') {
        assert.deepEqual(report.violations, []);
        assert.deepEqual(report.uncheckedConstraintIds, [checkerCase.spec.id]);
        return;
      }

      assert.ok(report.violations.length > 0);
    });
  }
});

describe('validator edge cases', () => {
  it('teacher_max_consecutive passes when teacher has no scheduled entries', () => {
    const report = validateSchedule([entry('6A', 'mon', 1, 'Toán', 'Sơn')], [
      spec('teacher_max_consecutive_empty', 'teacher_max_consecutive', {
        teacher: 'Minh',
        maxConsecutive: 1,
      }),
    ]);
    assert.equal(report.violations.length, 0);
  });

  it('teacher_max_consecutive detects overrun 7 with max 6', () => {
    const localSchedule = Array.from({ length: 7 }, (_, index) =>
      entry('6A', 'mon', index + 1, 'Toán', 'Sơn')
    );
    const report = validateSchedule(localSchedule, [
      spec('teacher_max_consecutive_overrun', 'teacher_max_consecutive', {
        teacher: 'Sơn',
        maxConsecutive: 6,
      }),
    ]);
    assert.equal(report.violations.length, 1);
  });

  it('teacher_max_consecutive handles split sessions without false positive', () => {
    const localSchedule = [
      entry('6A', 'mon', 1, 'Toán', 'Sơn'),
      entry('6A', 'mon', 2, 'Toán', 'Sơn'),
      entry('6A', 'mon', 5, 'Toán', 'Sơn'),
      entry('6A', 'mon', 6, 'Toán', 'Sơn'),
    ];
    const report = validateSchedule(localSchedule, [
      spec('teacher_max_consecutive_split', 'teacher_max_consecutive', {
        teacher: 'Sơn',
        maxConsecutive: 2,
      }),
    ]);
    assert.equal(report.violations.length, 0);
  });

  it('subject_consecutive accepts long run divisible by block length', () => {
    const localSchedule = [
      entry('6A', 'mon', 1, 'Toán', 'Sơn'),
      entry('6A', 'mon', 2, 'Toán', 'Sơn'),
      entry('6A', 'mon', 3, 'Toán', 'Sơn'),
      entry('6A', 'mon', 4, 'Toán', 'Sơn'),
    ];
    const report = validateSchedule(localSchedule, [
      spec('subject_consecutive_long_run', 'subject_consecutive', { subject: 'Toán', length: 2 }),
    ]);
    assert.equal(report.violations.length, 0);
  });

  it('weekly_periods_exact skips validation with auto_base tag', () => {
    const autoBaseSpec = spec('weekly_periods_auto_base', 'weekly_periods_exact', {
      assignmentId: 'asg_1',
      weeklyPeriods: 10,
    });
    autoBaseSpec.tags = ['auto_base'];

    const report = validateSchedule([entry('6A', 'mon', 1, 'Toán', 'Sơn')], [autoBaseSpec]);
    assert.equal(report.violations.length, 0);
  });
});
