import test from 'node:test';
import assert from 'node:assert/strict';

import { __translatorInternal } from './translator';
import type { AgentInputPayload } from './types';
import type { ConstraintSpec } from './constraint-spec';

const sampleInput: AgentInputPayload = {
  days: [
    { id: 'mon', label: 'Thứ 2' },
    { id: 'tue', label: 'Thứ 3' },
  ],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { mon: 5, tue: 5 },
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
  constraints: [{ type: 'required', text: 'Sơn không dạy thứ 2' }],
};

test('sanitize converts unknown teacher to custom_dsl', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'ABC không dạy thứ 2',
      severity: 'hard',
      kind: 'teacher_block_day',
      params: { teacher: 'ABC', day: 'mon' },
    },
  ];
  const result = __translatorInternal.sanitizeSpecs(sampleInput, specs);
  assert.equal(result[0].kind, 'custom_dsl');
});

test('sanitize converts unknown day to custom_dsl', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'Sơn không dạy chủ nhật',
      severity: 'hard',
      kind: 'teacher_block_day',
      params: { teacher: 'Sơn', day: 'sun' },
    },
  ];
  const result = __translatorInternal.sanitizeSpecs(sampleInput, specs);
  assert.equal(result[0].kind, 'custom_dsl');
});

test('translator periods expands session counts instead of sending count values only', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    sessions: [
      { id: 'morning', label: 'Sáng' },
      { id: 'afternoon', label: 'Chiều' },
    ],
    periodCounts: { morning: 5, afternoon: 4 },
  };

  assert.deepEqual(__translatorInternal.buildTranslatorPeriods(input), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('translator periods uses active union from periodsByDay', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    days: [
      { id: 'mon', label: 'Thứ 2' },
      { id: 'tue', label: 'Thứ 3' },
    ],
    sessions: [
      { id: 'morning', label: 'Sáng' },
      { id: 'afternoon', label: 'Chiều' },
    ],
    periodCounts: { morning: 2, afternoon: 1 },
    deletedPeriods: { 'mon-morning-2': true, 'tue-afternoon-1': true },
  };

  assert.deepEqual(__translatorInternal.buildTranslatorPeriods(input), [1, 2, 3]);
});

test('translator periodsByDay reflects session offsets and deleted periods', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    days: [
      { id: 'mon', label: 'Thứ 2' },
      { id: 'tue', label: 'Thứ 3' },
    ],
    sessions: [
      { id: 'morning', label: 'Sáng' },
      { id: 'afternoon', label: 'Chiều' },
    ],
    periodCounts: { morning: 2, afternoon: 1 },
    deletedPeriods: { 'mon-morning-2': true },
  };

  assert.deepEqual(__translatorInternal.buildTranslatorPeriodsByDay(input), {
    mon: [1, 3],
    tue: [1, 2, 3],
  });
});

test('fallback parser splits independent clauses', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    assignments: [
      ...sampleInput.assignments,
      {
        id: 'asg_2',
        teacher: { id: 't2', label: 'Hương' },
        subject: { id: 's2', label: 'Văn' },
        class: { id: 'c2', label: '6B' },
        weeklyPeriods: 2,
      },
    ],
    constraints: [{ type: 'required', text: 'Sơn không dạy thứ 2 và Hương không dạy tiết 1' }],
  };

  const specs = __translatorInternal.fallbackFromRuleParser(input);
  assert.equal(specs.length, 2);
  assert.deepEqual(specs.map((spec) => spec.id), ['c1', 'c2']);
  assert.equal(specs[0].kind, 'teacher_block_day');
  assert.equal(specs[1].kind, 'teacher_block_period');
});

test('fallback parser does not split if_then clauses', () => {
  const clauses = __translatorInternal.splitFallbackConstraintText(
    'Nếu Sơn và Hương dạy thứ 2 thì Hương không dạy thứ 3'
  );

  assert.equal(clauses.length, 1);
});

test('fallback parser preserves preferred weights on generated soft specs', () => {
  const result = __translatorInternal.fallbackFromRuleParser({
    ...sampleInput,
    constraints: [{ type: 'preferred', text: 'Sơn không dạy thứ 2', weight: 8 }],
  });

  assert.equal(result[0].severity, 'soft');
  assert.equal(result[0].weight, 8);
  assert.equal(result[0].params.weight, 8);
});

test('sanitize preserves preferred weights on model specs', () => {
  const result = __translatorInternal.sanitizeSpecs(
    { ...sampleInput, constraints: [{ type: 'preferred', text: 'Sơn không dạy thứ 2', weight: 3 }] },
    [{ id: 'm1', original: 'Sơn không dạy thứ 2', severity: 'soft', kind: 'teacher_block_day', params: { teacher: 'Sơn', day: 'mon' } }]
  );

  assert.equal(result[0].weight, 3);
  assert.equal(result[0].params.weight, 3);
});

test('fallback parser returns at least one spec per constraint', () => {
  const result = __translatorInternal.fallbackFromRuleParser(sampleInput);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'c1');
});

test('fallback parser ignores room/resource capacity constraints', () => {
  const result = __translatorInternal.fallbackFromRuleParser({
    ...sampleInput,
    constraints: [{ type: 'required', text: 'Phòng Toán tối đa 1 lớp cùng tiết' }],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].kind, 'custom_dsl');
  assert.equal(result[0].severity, 'info');
  assert.equal(result[0].notes, 'ignored:room_constraint');
});

test('fallback parser covers remaining constraint kinds', () => {
  const input: AgentInputPayload = {
    days: [
      { id: 'mon', label: 'Thứ 2' },
      { id: 'tue', label: 'Thứ 3' },
      { id: 'wed', label: 'Thứ 4' },
    ],
    sessions: [{ id: 'morning', label: 'Sáng' }],
    periodCounts: { morning: 5 },
    deletedPeriods: {},
    assignments: [
      {
        id: 'asg_1',
        teacher: { id: 't1', label: 'Sơn' },
        subject: { id: 's1', label: 'Toán' },
        class: { id: 'c1', label: '6A' },
        weeklyPeriods: 2,
      },
      {
        id: 'asg_2',
        teacher: { id: 't2', label: 'Thúy' },
        subject: { id: 's2', label: 'Văn' },
        class: { id: 'c2', label: '6B' },
        weeklyPeriods: 2,
      },
      {
        id: 'asg_3',
        teacher: { id: 't3', label: 'Hòa' },
        subject: { id: 's3', label: 'Anh' },
        class: { id: 'c1', label: '6A' },
        weeklyPeriods: 2,
      },
    ],
    constraints: [
      { type: 'required', text: 'Sơn tối đa 4 tiết/ngày' },
      { type: 'required', text: 'Toán phải liên tiếp 2 tiết' },
      { type: 'required', text: 'Toán chỉ xếp tiết 1 2' },
      { type: 'required', text: 'Lớp 6A không học Toán 2 lần/ngày' },
      { type: 'required', text: 'Sơn và Thúy không cùng tiết thứ 2' },
      { type: 'required', text: 'Sơn Toán 6A đúng 2 tiết' },
      { type: 'required', text: 'Nếu Sơn dạy thứ 2 thì Thúy không dạy thứ 3' },
    ],
  };

  const specs = __translatorInternal.fallbackFromRuleParser(input);
  assert.equal(specs.length, input.constraints.length);
  assert.equal(specs[0].kind, 'teacher_max_per_day');
  assert.equal(specs[1].kind, 'subject_consecutive');
  assert.equal(specs[2].kind, 'subject_pin_period');
  assert.equal(specs[3].kind, 'class_no_double_subject_day');
  assert.equal(specs[4].kind, 'teacher_pair_not_same_slot');
  assert.equal(specs[5].kind, 'weekly_periods_exact');
  assert.equal(specs[6].kind, 'if_then');
});

test('fallback parser expands teacher allow-only days into blocked days', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    days: [
      { id: 'monday', label: 'Thứ 2' },
      { id: 'tuesday', label: 'Thứ 3' },
      { id: 'wednesday', label: 'Thứ 4' },
      { id: 'thursday', label: 'Thứ 5' },
      { id: 'friday', label: 'Thứ 6' },
    ],
    constraints: [{ type: 'required', text: 'Sơn chỉ dạy thứ 3 4 5' }],
  };

  const specs = __translatorInternal.fallbackFromRuleParser(input);

  assert.deepEqual(
    specs.map((spec) => ({ kind: spec.kind, params: spec.params })),
    [
      { kind: 'teacher_block_day', params: { teacher: 'Sơn', day: 'monday' } },
      { kind: 'teacher_block_day', params: { teacher: 'Sơn', day: 'friday' } },
    ]
  );
});

test('sanitize reparses model custom_dsl into built-ins when fallback parser understands it', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    days: [
      { id: 'monday', label: 'Thứ 2' },
      { id: 'tuesday', label: 'Thứ 3' },
      { id: 'wednesday', label: 'Thứ 4' },
      { id: 'thursday', label: 'Thứ 5' },
      { id: 'friday', label: 'Thứ 6' },
    ],
    constraints: [{ type: 'required', text: 'Sơn chỉ dạy thứ 3 4 5' }],
  };
  const specs: ConstraintSpec[] = [
    {
      id: 'model_custom',
      original: 'Sơn chỉ dạy thứ 3 4 5',
      severity: 'hard',
      kind: 'custom_dsl',
      params: { naturalLanguage: 'Sơn chỉ dạy thứ 3 4 5' },
    },
  ];

  const result = __translatorInternal.sanitizeSpecs(input, specs);

  assert.deepEqual(
    result.map((spec) => ({ kind: spec.kind, params: spec.params })),
    [
      { kind: 'teacher_block_day', params: { teacher: 'Sơn', day: 'monday' } },
      { kind: 'teacher_block_day', params: { teacher: 'Sơn', day: 'friday' } },
    ]
  );
});

test('fallback parser handles teacher session constraints without custom_dsl', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    days: [
      { id: 'monday', label: 'Thứ 2' },
      { id: 'tuesday', label: 'Thứ 3' },
      { id: 'wednesday', label: 'Thứ 4' },
      { id: 'thursday', label: 'Thứ 5' },
      { id: 'friday', label: 'Thứ 6' },
    ],
    sessions: [
      { id: 'morning', label: 'Sáng' },
      { id: 'afternoon', label: 'Chiều' },
    ],
    periodCounts: { morning: 4, afternoon: 3 },
    constraints: [
      { type: 'required', text: 'Sơn không dạy chiều thứ 5' },
      { type: 'required', text: 'Sơn chỉ dạy chiều' },
    ],
  };

  const specs = __translatorInternal.fallbackFromRuleParser(input);

  assert.deepEqual(
    specs.map((spec) => ({ kind: spec.kind, params: spec.params })),
    [
      { kind: 'teacher_block_slot', params: { teacher: 'Sơn', day: 'thursday', period: 5 } },
      { kind: 'teacher_block_slot', params: { teacher: 'Sơn', day: 'thursday', period: 6 } },
      { kind: 'teacher_block_slot', params: { teacher: 'Sơn', day: 'thursday', period: 7 } },
      { kind: 'teacher_block_period', params: { teacher: 'Sơn', period: 1 } },
      { kind: 'teacher_block_period', params: { teacher: 'Sơn', period: 2 } },
      { kind: 'teacher_block_period', params: { teacher: 'Sơn', period: 3 } },
      { kind: 'teacher_block_period', params: { teacher: 'Sơn', period: 4 } },
    ]
  );
});

test('sanitize reparses invalid period specs from model output', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    sessions: [
      { id: 'morning', label: 'Sáng' },
      { id: 'afternoon', label: 'Chiều' },
    ],
    periodCounts: { morning: 4, afternoon: 3 },
    constraints: [{ type: 'required', text: 'Sơn chỉ dạy chiều' }],
  };
  const result = __translatorInternal.sanitizeSpecs(input, [
    {
      id: 'c1',
      original: 'Sơn chỉ dạy chiều',
      severity: 'hard',
      kind: 'teacher_block_period',
      params: { teacher: 'Sơn', period: -1 },
    },
  ]);

  assert.deepEqual(
    result.map((spec) => ({ kind: spec.kind, params: spec.params })),
    [
      { kind: 'teacher_block_period', params: { teacher: 'Sơn', period: 1 } },
      { kind: 'teacher_block_period', params: { teacher: 'Sơn', period: 2 } },
      { kind: 'teacher_block_period', params: { teacher: 'Sơn', period: 3 } },
      { kind: 'teacher_block_period', params: { teacher: 'Sơn', period: 4 } },
    ]
  );
});

test('sanitize reparses model day block when original targets a session day', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    days: [
      { id: 'monday', label: 'Thứ 2' },
      { id: 'thursday', label: 'Thứ 5' },
    ],
    sessions: [{ id: 'afternoon', label: 'Chiều' }],
    periodCounts: { afternoon: 3 },
    constraints: [{ type: 'required', text: 'Sơn không dạy chiều thứ 5' }],
  };

  const result = __translatorInternal.sanitizeSpecs(input, [
    {
      id: 'c1',
      original: 'Sơn không dạy chiều thứ 5',
      severity: 'hard',
      kind: 'teacher_block_day',
      params: { teacher: 'Sơn', day: 'thursday' },
    },
  ]);

  assert.deepEqual(
    result.map((spec) => ({ kind: spec.kind, params: spec.params })),
    [
      { kind: 'teacher_block_slot', params: { teacher: 'Sơn', day: 'thursday', period: 1 } },
      { kind: 'teacher_block_slot', params: { teacher: 'Sơn', day: 'thursday', period: 2 } },
      { kind: 'teacher_block_slot', params: { teacher: 'Sơn', day: 'thursday', period: 3 } },
    ]
  );
});

test('sanitize drops hard custom_dsl when allow-only session is already the whole dataset', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    sessions: [{ id: 'afternoon', label: 'Chiều' }],
    periodCounts: { afternoon: 3 },
    assignments: [
      ...sampleInput.assignments,
      {
        id: 'asg_2',
        teacher: { id: 't2', label: 'Dung' },
        subject: { id: 's2', label: 'Văn' },
        class: { id: 'c1', label: '6A' },
        weeklyPeriods: 3,
      },
    ],
    constraints: [{ type: 'required', text: 'Dung chỉ dạy chiều' }],
  };

  const result = __translatorInternal.sanitizeSpecs(input, [
    {
      id: 'c1',
      original: 'Dung chỉ dạy chiều',
      severity: 'hard',
      kind: 'custom_dsl',
      params: { naturalLanguage: 'Dung chỉ dạy chiều' },
    },
  ]);

  assert.deepEqual(result, []);
});

test('fallback parser handles subject session constraints without custom_dsl', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    sessions: [
      { id: 'morning', label: 'Sáng' },
      { id: 'afternoon', label: 'Chiều' },
    ],
    periodCounts: { morning: 4, afternoon: 3 },
    constraints: [{ type: 'required', text: 'Toán buổi sáng' }],
  };

  const specs = __translatorInternal.fallbackFromRuleParser(input);

  assert.deepEqual(
    specs.map((spec) => ({ kind: spec.kind, params: spec.params })),
    [
      { kind: 'subject_pin_period', params: { subject: 'Toán', periods: [1, 2, 3, 4] } },
    ]
  );
});

test('fallback parser converts subject blocked periods into allowed periods', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    sessions: [{ id: 'morning', label: 'Sáng' }],
    periodCounts: { morning: 4 },
    constraints: [{ type: 'required', text: 'GDTC không xếp tiết 1' }],
    assignments: [
      ...sampleInput.assignments,
      {
        id: 'asg_2',
        teacher: { id: 't2', label: 'Thủy' },
        subject: { id: 's2', label: 'GDTC' },
        class: { id: 'c1', label: '6A' },
        weeklyPeriods: 2,
      },
    ],
  };

  const specs = __translatorInternal.fallbackFromRuleParser(input);

  assert.deepEqual(
    specs.map((spec) => ({ kind: spec.kind, params: spec.params })),
    [
      { kind: 'subject_pin_period', params: { subject: 'GDTC', periods: [2, 3, 4] } },
    ]
  );
});

test('sanitize marks weekly_periods_exact as auto_base when assignmentId matches weeklyPeriods', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'asg_1 đúng 3 tiết',
      severity: 'hard',
      kind: 'weekly_periods_exact',
      params: { assignmentId: 'asg_1', weeklyPeriods: 3 },
    },
  ];
  const result = __translatorInternal.sanitizeSpecs(sampleInput, specs);
  assert.equal(result[0].severity, 'info');
  assert.equal(result[0].tags?.includes('auto_base'), true);
});

test('sanitize does not mark auto_base when weeklyPeriods mismatch', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'asg_1 đúng 2 tiết',
      severity: 'hard',
      kind: 'weekly_periods_exact',
      params: { assignmentId: 'asg_1', weeklyPeriods: 2 },
    },
  ];
  const result = __translatorInternal.sanitizeSpecs(sampleInput, specs);
  assert.equal(result[0].severity, 'hard');
  assert.equal(result[0].tags?.includes('auto_base'), false);
});

test('sanitize infers assignmentId and marks auto_base when weekly spec is uniquely matched', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'Son Toan 6A dung 3 tiet',
      severity: 'hard',
      kind: 'weekly_periods_exact',
      params: { teacher: 'Sơn', subject: 'Toán', class: '6A', weeklyPeriods: 3 },
    },
  ];
  const result = __translatorInternal.sanitizeSpecs(sampleInput, specs);
  assert.equal(result[0].params.assignmentId, 'asg_1');
  assert.equal(result[0].severity, 'info');
  assert.equal(result[0].tags?.includes('auto_base'), true);
});


test('fallback parser downgrades Dataset 7 base model constraints instead of custom_dsl', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    days: [
      { id: 'monday', label: 'Thứ 2' },
      { id: 'tuesday', label: 'Thứ 3' },
      { id: 'wednesday', label: 'Thứ 4' },
      { id: 'thursday', label: 'Thứ 5' },
      { id: 'friday', label: 'Thứ 6' },
    ],
    sessions: [{ id: 'morning', label: 'Sáng' }],
    periodCounts: { morning: 4 },
    assignments: [
      sampleInput.assignments[0],
      {
        id: 'asg_2',
        teacher: { id: 't2', label: 'Hương' },
        subject: { id: 's2', label: 'Văn' },
        class: { id: 'c1', label: '6A' },
        weeklyPeriods: 2,
      },
    ],
    constraints: [
      { type: 'required', text: 'Mỗi lớp có đúng 1 môn trong mỗi slot' },
      { type: 'required', text: 'Mỗi giáo viên không được dạy quá 1 lớp trong cùng 1 slot' },
      { type: 'required', text: 'Mỗi assignment phải xếp đúng số tiết/tuần' },
      { type: 'required', text: 'Mỗi lớp không được học cùng 1 môn quá 1 tiết trong cùng 1 ngày' },
    ],
  };

  const specs = __translatorInternal.fallbackFromRuleParser(input);

  assert.deepEqual(specs.map((spec) => spec.kind), [
    'custom_dsl',
    'custom_dsl',
    'custom_dsl',
    'class_no_double_subject_day',
    'class_no_double_subject_day',
  ]);
  assert.deepEqual(specs.map((spec) => spec.severity), ['info', 'info', 'info', 'hard', 'hard']);
  assert.equal(specs.some((spec) => spec.severity === 'hard' && spec.kind === 'custom_dsl'), false);
  assert.equal(specs.slice(0, 3).every((spec) => spec.tags?.includes('auto_base')), true);
  assert.deepEqual(
    specs.slice(3).map((spec) => spec.params),
    [
      { class: '6A', subject: 'Toán', maxPerDay: 1 },
      { class: '6A', subject: 'Văn', maxPerDay: 1 },
    ]
  );
});

test('fallback parser extracts maxPerDay for per-class and global same-subject daily limits', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    days: [
      { id: 'mon', label: 'Thứ 2' },
      { id: 'tue', label: 'Thứ 3' },
      { id: 'wed', label: 'Thứ 4' },
    ],
    assignments: [
      sampleInput.assignments[0],
      {
        id: 'asg_2',
        teacher: { id: 't2', label: 'Mai' },
        subject: { id: 's2', label: 'Văn' },
        class: { id: 'c1', label: '6A' },
        weeklyPeriods: 2,
      },
      {
        id: 'asg_3',
        teacher: { id: 't3', label: 'Lan' },
        subject: { id: 's3', label: 'Toán' },
        class: { id: 'c2', label: '6B' },
        weeklyPeriods: 2,
      },
    ],
    constraints: [
      { type: 'required', text: 'Lớp 6A không quá 2 tiết cùng môn trong một ngày' },
      { type: 'required', text: 'Mỗi lớp không được học cùng 1 môn quá 2 tiết trong cùng 1 ngày' },
    ],
  };

  const specs = __translatorInternal.fallbackFromRuleParser(input);

  assert.deepEqual(specs[0], {
    id: 'c1',
    original: 'Lớp 6A không quá 2 tiết cùng môn trong một ngày',
    severity: 'hard',
    kind: 'class_no_double_subject_day',
    params: { class: '6A', maxPerDay: 2 },
  });
  assert.deepEqual(
    specs.slice(1).map((spec) => spec.params),
    [
      { class: '6A', subject: 'Toán', maxPerDay: 2 },
      { class: '6A', subject: 'Văn', maxPerDay: 2 },
      { class: '6B', subject: 'Toán', maxPerDay: 2 },
    ]
  );
});

test('fallback parser marks unparsed hard constraints explicitly', () => {
  const specs = __translatorInternal.fallbackFromRuleParser({
    ...sampleInput,
    constraints: [{ type: 'required', text: 'Ràng buộc cứng chưa hỗ trợ' }],
  });

  assert.equal(specs[0].kind, 'custom_dsl');
  assert.equal(specs[0].notes, 'fallback_parser:UNPARSED_HARD');
});

test('fallback parser maps "tránh môn nặng cùng 1 buổi" to class_max_heavy_subjects_per_session', () => {
  const heavyInput: AgentInputPayload = {
    ...sampleInput,
    sessions: [
      { id: 'morning', label: 'Sáng' },
      { id: 'afternoon', label: 'Chiều' },
    ],
    periodCounts: { morning: 4, afternoon: 3 },
    assignments: [
      { id: 'a1', teacher: { id: 't1', label: 'GV A' }, subject: { id: 's1', label: 'KHTN' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 3 },
      { id: 'a2', teacher: { id: 't2', label: 'GV B' }, subject: { id: 's2', label: 'Toán' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 4 },
      { id: 'a3', teacher: { id: 't3', label: 'GV C' }, subject: { id: 's3', label: 'Văn' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 4 },
      { id: 'a4', teacher: { id: 't4', label: 'GV D' }, subject: { id: 's4', label: 'Tiếng Anh' }, class: { id: 'c1', label: '6A' }, weeklyPeriods: 3 },
    ],
    constraints: [
      { type: 'required', text: 'Tránh các môn nặng gồm KHTN, Toán, Văn, Tiếng Anh tất cả cùng dạy vào 1 buổi ở cùng 1 lớp' },
    ],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(heavyInput);
  assert.equal(specs.length, 1);
  assert.equal(specs[0].kind, 'class_max_heavy_subjects_per_session');
  assert.ok(specs[0].params.subjects);
  assert.ok(Array.isArray(specs[0].params.subjects));
});

test('sanitize downgrades model-emitted Dataset 7 base custom_dsl constraints', () => {
  const specs: ConstraintSpec[] = [
    {
      id: 'm1',
      original: 'Mỗi lớp có đúng 1 môn trong mỗi slot',
      severity: 'hard',
      kind: 'custom_dsl',
      params: { naturalLanguage: 'Mỗi lớp có đúng 1 môn trong mỗi slot' },
    },
    {
      id: 'm2',
      original: 'Mỗi giáo viên không được dạy quá 1 lớp trong cùng 1 slot',
      severity: 'hard',
      kind: 'custom_dsl',
      params: { naturalLanguage: 'Mỗi giáo viên không được dạy quá 1 lớp trong cùng 1 slot' },
    },
    {
      id: 'm3',
      original: 'Mỗi assignment phải xếp đúng số tiết/tuần',
      severity: 'hard',
      kind: 'custom_dsl',
      params: { naturalLanguage: 'Mỗi assignment phải xếp đúng số tiết/tuần' },
    },
  ];

  const result = __translatorInternal.sanitizeSpecs(sampleInput, specs);

  assert.deepEqual(result.map((spec) => spec.severity), ['info', 'info', 'info']);
  assert.equal(result.some((spec) => spec.severity === 'hard' && spec.kind === 'custom_dsl'), false);
  assert.equal(result.every((spec) => spec.tags?.includes('auto_base')), true);
});

// =========================================================================
// Tier 1 — IF-clause period fix (VAL-T1-001, 002, 003, 004)
// =========================================================================

const ifThenInput = (): AgentInputPayload => ({
  days: [
    { id: 'mon', label: 'Thứ 2' },
    { id: 'tue', label: 'Thứ 3' },
  ],
  sessions: [{ id: 'morning', label: 'Sáng' }],
  periodCounts: { mon: 5, tue: 5 },
  deletedPeriods: {},
  assignments: [
    {
      id: 'asg_son',
      teacher: { id: 't1', label: 'Sơn' },
      subject: { id: 's1', label: 'Toán' },
      class: { id: 'c1', label: '6A' },
      weeklyPeriods: 3,
    },
    {
      id: 'asg_huong',
      teacher: { id: 't2', label: 'Hương' },
      subject: { id: 's2', label: 'Văn' },
      class: { id: 'c1', label: '6A' },
      weeklyPeriods: 3,
    },
    {
      id: 'asg_dung',
      teacher: { id: 't3', label: 'Dung' },
      subject: { id: 's3', label: 'Anh' },
      class: { id: 'c1', label: '6A' },
      weeklyPeriods: 3,
    },
  ],
  constraints: [],
});

test('VAL-T1-001: IF-AND-THEN with 2-slot IF preserves period in params.if', () => {
  const input: AgentInputPayload = {
    ...ifThenInput(),
    constraints: [
      { type: 'required', text: 'Nếu Sơn và Hương dạy thứ 2 tiết 2 thì Dung không dạy thứ 3 tiết 1' },
    ],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);

  assert.equal(specs.length, 1);
  assert.equal(specs[0].kind, 'if_then');
  const cond = specs[0].params.if as { op: string; args: Array<{ op: string; teacher: string; day: string; period: number }> };
  assert.equal(cond.op, 'and');
  assert.equal(cond.args.length, 2);
  for (const arg of cond.args) {
    assert.equal(arg.op, 'teacher_teaches_at_slot');
    assert.equal(arg.day, 'mon');
    assert.equal(arg.period, 2);
  }
  const teachers = cond.args.map((arg) => arg.teacher).sort();
  assert.deepEqual(teachers, ['Hương', 'Sơn']);
  const thenList = specs[0].params.then as Array<{ kind: string; params: Record<string, unknown> }>;
  assert.equal(thenList[0].kind, 'teacher_block_slot');
  assert.equal(thenList[0].params.teacher, 'Dung');
  assert.equal(thenList[0].params.day, 'tue');
  assert.equal(thenList[0].params.period, 1);
});

test('VAL-T1-002: single-teacher IF with slot emits teacher_teaches_at_slot (no AND)', () => {
  const input: AgentInputPayload = {
    ...ifThenInput(),
    constraints: [
      { type: 'required', text: 'Nếu Sơn dạy thứ 2 tiết 2 thì Dung không dạy thứ 3' },
    ],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);

  assert.equal(specs.length, 1);
  assert.equal(specs[0].kind, 'if_then');
  const cond = specs[0].params.if as { op: string; teacher: string; day: string; period: number };
  assert.equal(cond.op, 'teacher_teaches_at_slot');
  assert.equal(cond.teacher, 'Sơn');
  assert.equal(cond.day, 'mon');
  assert.equal(cond.period, 2);
  const thenList = specs[0].params.then as Array<{ kind: string; params: Record<string, unknown> }>;
  assert.equal(thenList[0].kind, 'teacher_block_day');
  assert.equal(thenList[0].params.teacher, 'Dung');
  assert.equal(thenList[0].params.day, 'tue');
});

test('VAL-T1-003: AND-of-day-only IF (no period) emits and of teacher_teaches_on_day', () => {
  const input: AgentInputPayload = {
    ...ifThenInput(),
    constraints: [
      { type: 'required', text: 'Nếu Sơn và Hương dạy thứ 2 thì Dung không dạy thứ 3' },
    ],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);

  assert.equal(specs.length, 1);
  assert.equal(specs[0].kind, 'if_then');
  const cond = specs[0].params.if as { op: string; args: Array<{ op: string; teacher: string; day: string; period?: number }> };
  assert.equal(cond.op, 'and');
  assert.equal(cond.args.length, 2);
  for (const arg of cond.args) {
    assert.equal(arg.op, 'teacher_teaches_on_day');
    assert.equal(arg.day, 'mon');
    assert.equal((arg as { period?: number }).period, undefined);
  }
  const thenList = specs[0].params.then as Array<{ kind: string; params: Record<string, unknown> }>;
  assert.equal(thenList[0].kind, 'teacher_block_day');
});

test('VAL-T1-004: reverse-direction IF does not swap if/then and stays as if_then', () => {
  const input: AgentInputPayload = {
    ...ifThenInput(),
    constraints: [
      { type: 'required', text: 'Nếu Dung không dạy thứ 3 thì Sơn dạy thứ 2 tiết 2' },
    ],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);

  assert.equal(specs[0].kind, 'if_then');
  const cond = specs[0].params.if as { op: string; teacher: string; day: string };
  assert.equal(cond.op, 'teacher_teaches_on_day');
  assert.equal(cond.teacher, 'Dung');
  assert.equal(cond.day, 'tue');
  const thenList = specs[0].params.then as Array<{ kind: string; params: Record<string, unknown> }>;
  assert.ok(Array.isArray(thenList));
  assert.ok(thenList.length > 0, 'THEN must be non-empty');
  for (const t of thenList) {
    assert.notEqual(t.kind, 'custom_dsl', 'THEN must not contain synthetic custom_dsl');
  }
});

// =========================================================================
// Tier 1 — Diacritics / titles (VAL-T1-011) and multi-line paste (VAL-T1-012)
// =========================================================================

test('VAL-T1-011a: diacritics + title prefix "Cô Lan" yields bare name in params.teacher', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    assignments: [
      ...sampleInput.assignments,
      {
        id: 'asg_lan',
        teacher: { id: 't_lan', label: 'Lan' },
        subject: { id: 's_lan', label: 'Văn' },
        class: { id: 'c_lan', label: '6B' },
        weeklyPeriods: 2,
      },
    ],
    constraints: [{ type: 'required', text: 'Cô Lan không dạy thứ 2' }],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);

  assert.equal(specs.length, 1);
  assert.equal(specs[0].kind, 'teacher_block_day');
  assert.equal(specs[0].params.teacher, 'Lan');
  // parseConstraint hardcodes 'monday' for "thứ 2"
  assert.equal(specs[0].params.day, 'monday');
});

test('VAL-T1-011b: diacritics + title prefix "Thầy B" yields bare name in params.teacher', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    assignments: [
      {
        id: 'asg_b',
        teacher: { id: 't_b', label: 'B' },
        subject: { id: 's_b', label: 'Toán' },
        class: { id: 'c_b', label: '6A' },
        weeklyPeriods: 3,
      },
    ],
    constraints: [{ type: 'required', text: 'Thầy B không dạy thứ 3 tiết 4' }],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);

  assert.equal(specs.length, 1);
  assert.equal(specs[0].kind, 'teacher_block_slot');
  assert.equal(specs[0].params.teacher, 'B');
  // parseConstraint hardcodes 'tuesday' for "thứ 3"
  assert.equal(specs[0].params.day, 'tuesday');
  assert.equal(specs[0].params.period, 4);
});

test('VAL-T1-011c: digit-suffixed teacher name "Sơn 2" round-trips with bare name', () => {
  const input: AgentInputPayload = {
    ...sampleInput,
    assignments: [
      {
        id: 'asg_son2',
        teacher: { id: 't_son2', label: 'Sơn 2' },
        subject: { id: 's_son2', label: 'Toán' },
        class: { id: 'c_son2', label: '6A' },
        weeklyPeriods: 3,
      },
    ],
    constraints: [{ type: 'required', text: 'Sơn 2 không dạy thứ 2' }],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);

  assert.equal(specs.length, 1);
  assert.equal(specs[0].kind, 'teacher_block_day');
  assert.equal(specs[0].params.teacher, 'Sơn 2');
  // parseConstraint hardcodes 'monday' for "thứ 2"
  assert.equal(specs[0].params.day, 'monday');
});

test('VAL-T1-012a: multi-line paste split on newline yields 2 specs', () => {
  const input: AgentInputPayload = {
    ...ifThenInput(),
    constraints: [
      {
        type: 'required',
        text: 'Sơn không dạy thứ 2\nHương không dạy tiết 1',
      },
    ],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);

  assert.equal(specs.length, 2);
  assert.deepEqual(specs.map((spec) => spec.id), ['c1', 'c2']);
  assert.equal(specs[0].kind, 'teacher_block_day');
  assert.equal(specs[0].params.teacher, 'Sơn');
  // parseConstraint hardcodes 'monday' for "thứ 2"
  assert.equal(specs[0].params.day, 'monday');
  assert.equal(specs[1].kind, 'teacher_block_period');
  assert.equal(specs[1].params.teacher, 'Hương');
  assert.equal(specs[1].params.period, 1);
});

test('VAL-T1-012b: multi-line paste split on semicolon yields 2 specs', () => {
  const input: AgentInputPayload = {
    ...ifThenInput(),
    constraints: [
      {
        type: 'required',
        text: 'Sơn không dạy thứ 2; Hương không dạy tiết 1',
      },
    ],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);

  assert.equal(specs.length, 2);
  assert.equal(specs[0].kind, 'teacher_block_day');
  assert.equal(specs[0].params.teacher, 'Sơn');
  assert.equal(specs[1].kind, 'teacher_block_period');
  assert.equal(specs[1].params.teacher, 'Hương');
});

// =========================================================================
// Tier 1 — Determinism (VAL-T1-009): same input → deep-equal specs
// =========================================================================

test('VAL-T1-009: determinism — two invocations of fallback parser return deep-equal specs', () => {
  const input: AgentInputPayload = {
    ...ifThenInput(),
    constraints: [
      { type: 'required', text: 'Nếu Sơn và Hương dạy thứ 2 tiết 2 thì Dung không dạy thứ 3 tiết 1' },
    ],
  };
  const first = __translatorInternal.fallbackFromRuleParser(input);
  const second = __translatorInternal.fallbackFromRuleParser(input);

  assert.equal(first.length, second.length);
  assert.deepEqual(first, second);
});
