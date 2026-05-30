import test from 'node:test';
import assert from 'node:assert/strict';

import { __translatorInternal, runTranslatorTurn } from './translator';
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

test('fallback parser returns at least one spec per constraint', () => {
  const result = __translatorInternal.fallbackFromRuleParser(sampleInput);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'c1');
});

test('runTranslatorTurn skips model when fallback covers all hard constraints', async () => {
  let called = false;
  const result = await runTranslatorTurn(
    { baseURL: '', apiKey: 'x', model: 'm' },
    sampleInput,
    async () => {
      called = true;
      return { content: '{}', usage: { total_tokens: 0 } };
    }
  );

  assert.equal(called, false);
  assert.equal(result.usageTokens, 0);
  assert.equal(result.constraintSpecs[0].kind, 'teacher_block_day');
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
  assert.equal(specs[4].kind, 'pair_not_same_slot');
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
