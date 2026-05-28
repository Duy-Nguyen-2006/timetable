import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

import { validateSchedule } from '../src/features/timetable/ai/deterministic-validator';
import { compressPayload } from '../src/features/timetable/ai/input-compressor';
import { injectConstraintCode } from '../src/features/timetable/ai/skeleton-injector';
import type { AgentInputPayload } from '../src/features/timetable/ai/types';
import type { ConstraintSpec } from '../src/features/timetable/ai/constraint-spec';

function buildFixture(): { input: AgentInputPayload; specs: ConstraintSpec[] } {
  const days = [
    { id: 'mon', label: 'Thu 2' },
    { id: 'tue', label: 'Thu 3' },
    { id: 'wed', label: 'Thu 4' },
    { id: 'thu', label: 'Thu 5' },
    { id: 'fri', label: 'Thu 6' },
  ];

  const sessions = [{ id: 'morning', label: 'Sang' }];
  const periodCounts = { mon: 5, tue: 5, wed: 5, thu: 5, fri: 5 };
  const deletedPeriods = {};

  const assignments = [
    ['6A', 'Toan', 'Son', 2],
    ['6A', 'Van', 'Lan', 2],
    ['6A', 'Anh', 'Minh', 1],
    ['6B', 'Toan', 'Son', 2],
    ['6B', 'Van', 'Lan', 2],
    ['6B', 'Anh', 'Minh', 1],
    ['7A', 'Toan', 'Thuy', 2],
    ['7A', 'Van', 'Hoa', 2],
    ['7A', 'Anh', 'Minh', 1],
    ['7B', 'Toan', 'Thuy', 2],
    ['7B', 'Van', 'Hoa', 2],
    ['7B', 'Anh', 'Minh', 1],
  ].map(([classLabel, subjectLabel, teacherLabel, weeklyPeriods], index) => ({
    id: `asg_${index + 1}`,
    class: { id: `c_${classLabel}`, label: classLabel as string },
    subject: { id: `s_${subjectLabel}`, label: subjectLabel as string },
    teacher: { id: `t_${teacherLabel}`, label: teacherLabel as string },
    weeklyPeriods: weeklyPeriods as number,
  }));

  const input: AgentInputPayload = {
    days,
    sessions,
    periodCounts,
    deletedPeriods,
    assignments,
    constraints: [
      { type: 'required', text: 'Sơn tối đa 5 tiết/ngày' },
      { type: 'required', text: 'Thủy tối đa 5 tiết/ngày' },
      { type: 'required', text: 'Lớp 6A không học Toán 2 lần/ngày' },
      { type: 'required', text: 'Sơn và Thủy không cùng tiết thứ 2' },
      { type: 'required', text: 'Sơn Toán 6A đúng 2 tiết' },
    ],
  };

  const specs: ConstraintSpec[] = [
    {
      id: 'c1',
      original: 'Sơn tối đa 5 tiết/ngày',
      severity: 'hard',
      kind: 'teacher_max_per_day',
      params: { teacher: 'Son', maxPerDay: 5 },
    },
    {
      id: 'c2',
      original: 'Thủy tối đa 5 tiết/ngày',
      severity: 'hard',
      kind: 'teacher_max_per_day',
      params: { teacher: 'Thuy', maxPerDay: 5 },
    },
    {
      id: 'c3',
      original: 'Lớp 6A không học Toán 2 lần/ngày',
      severity: 'hard',
      kind: 'class_no_double_subject_day',
      params: { class: '6A', subject: 'Toan' },
    },
    {
      id: 'c4',
      original: 'Sơn và Thủy không cùng tiết thứ 2',
      severity: 'hard',
      kind: 'pair_not_same_slot',
      params: { teachers: ['Son', 'Thuy'], scope: { day: 'mon' } },
    },
    {
      id: 'c5',
      original: 'Sơn Toán 6A đúng 2 tiết',
      severity: 'hard',
      kind: 'weekly_periods_exact',
      params: { teacher: 'Son', subject: 'Toan', class: '6A', weeklyPeriods: 2 },
    },
  ];

  return { input, specs };
}

function main() {
  const startedAt = Date.now();
  const { input, specs } = buildFixture();
  const compressed = compressPayload(input, specs);

  const skeleton = fs.readFileSync('python/templates/solver_skeleton.py', 'utf8');
  const customConstraintCode = `
for constraint in constraints:
    kind = constraint.get("kind")
    params = constraint.get("params", {})
    if kind == "class_no_double_subject_day":
        class_label = params.get("class")
        subject_label = params.get("subject")
        if not class_label or not subject_label:
            continue
        for d in days:
            model.Add(
                sum(
                    slots[(a["id"], d, p)]
                    for a in assignments
                    if a["class"] == class_label and a["subject"] == subject_label
                    for p in periods
                ) <= 1
            )
    elif kind == "pair_not_same_slot":
        teachers = params.get("teachers", [])
        if len(teachers) != 2:
            continue
        scope = params.get("scope", {})
        scope_day = scope.get("day")
        for d in days:
            if scope_day and d != scope_day:
                continue
            for p in periods:
                model.Add(
                    sum(slots[(a["id"], d, p)] for a in assignments if a["teacher"] in teachers) <= 1
                )
`;
  const injected = injectConstraintCode(skeleton, customConstraintCode.trim());
  if (!injected.injected) throw new Error('Failed to inject skeleton marker.');

  fs.writeFileSync('solver_tmp_check.py', injected.solverCode, 'utf8');
  const syntax = spawnSync('python3', ['-m', 'py_compile', 'solver_tmp_check.py'], { encoding: 'utf8' });
  fs.rmSync('solver_tmp_check.py', { force: true });
  if (syntax.status !== 0) throw new Error(`Python syntax check failed: ${syntax.stderr || syntax.stdout}`);

  const runtimePayload = {
    classes: compressed.classes,
    days: compressed.days,
    periods: compressed.periods,
    assignments: compressed.assignments,
    constraints: compressed.constraints,
  };
  fs.writeFileSync('input.json', JSON.stringify(runtimePayload), 'utf8');

  const run = spawnSync('python3', ['python/code_executor.py'], {
    input: injected.solverCode,
    encoding: 'utf8',
  });
  if (run.status !== 0 && !run.stdout.trim()) {
    throw new Error(`Executor failed: ${run.stderr}`);
  }

  const result = JSON.parse(run.stdout.trim().split('\n').at(-1) ?? '{}') as {
    ok: boolean;
    status: string;
    resultPath?: string;
    durationMs: number;
  };
  if (!result.ok || !result.resultPath) {
    throw new Error(`Execution not successful: ${JSON.stringify(result)}`);
  }

  const resultData = JSON.parse(fs.readFileSync(result.resultPath, 'utf8')) as {
    schedule: Array<{ class: string; day: string; period: number | string; subject: string; teacher: string }>;
  };
  const report = validateSchedule(resultData.schedule, specs, { assignments: compressed.assignments });
  if (!report.hardConstraintPass) {
    throw new Error(`Deterministic validator failed: ${JSON.stringify(report.hardViolations)}`);
  }

  const oldPromptChars =
    JSON.stringify(input, null, 2).length +
    3 * injected.solverCode.length +
    3 * JSON.stringify(resultData).length;
  const newPromptChars =
    JSON.stringify(compressed.datasetDigest).length +
    JSON.stringify(compressed.constraints).length +
    injected.solverCode.length * 0.15;

  const oldTokens = Math.ceil(oldPromptChars / 4);
  const newTokens = Math.ceil(newPromptChars / 4);
  const reduction = ((oldPromptChars - newPromptChars) / oldPromptChars) * 100;
  const elapsedMs = Date.now() - startedAt;

  console.log(
    JSON.stringify(
      {
        ok: true,
        elapsedMs,
        executorDurationMs: result.durationMs,
        hardViolations: report.hardViolations.length,
        estimatedTokenReductionPercent: Number(reduction.toFixed(2)),
        oldPromptChars,
        newPromptChars,
        oldTokens,
        newTokens,
      },
      null,
      2
    )
  );
}

main();
