import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { injectConstraintCode } from '../src/features/timetable/ai/skeleton-injector';

type Assignment = {
  id: string;
  class: string;
  subject: string;
  teacher: string;
  weeklyPeriods: number;
};

type ConstraintSpec = {
  id: string;
  original: string;
  severity: 'hard' | 'info';
  kind: string;
  tags?: string[];
  params: Record<string, unknown>;
};

type ExecutorResult = {
  ok: boolean;
  status: string;
  durationMs: number;
  resultPath?: string;
  solveWallTimeMs: number | null;
};

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const PERIOD_COUNT = Number(process.env.BENCH_PERIODS || 7);
const PERIODS = Array.from({ length: PERIOD_COUNT }, (_, index) => index + 1);
const CLASS_COUNT = Number(process.env.BENCH_CLASSES || 8);
const CLASSES = Array.from({ length: CLASS_COUNT }, (_, index) => `C${index + 1}`);
const SUBJECTS = (process.env.BENCH_SUBJECTS || 'Toan,Van,Anh,Ly,Hoa,Sinh,Su,Dia')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const WEEKLY_PERIODS = Number(process.env.BENCH_WEEKLY_PERIODS || 4);
const RUNS = Number(process.env.BENCH_RUNS || 8);
const SOLVER_WORKERS = Number(process.env.BENCH_SOLVER_WORKERS || 1);
const SOLVER_RANDOM_SEED = Number(process.env.BENCH_SOLVER_RANDOM_SEED || 123);

function buildAssignments(): Assignment[] {
  let teacherCounter = 1;
  const assignments: Assignment[] = [];
  for (const klass of CLASSES) {
    for (const subject of SUBJECTS) {
      assignments.push({
        id: `asg_${klass}_${subject}`,
        class: klass,
        subject,
        teacher: `T${teacherCounter++}`,
        weeklyPeriods: WEEKLY_PERIODS,
      });
    }
  }
  return assignments;
}

function buildConstraints(assignments: Assignment[]): ConstraintSpec[] {
  return assignments.map((assignment, index) => ({
    id: `w${index + 1}`,
    original: `${assignment.id} weekly exact`,
    severity: 'hard',
    kind: 'weekly_periods_exact',
    params: {
      assignmentId: assignment.id,
      class: assignment.class,
      subject: assignment.subject,
      teacher: assignment.teacher,
      weeklyPeriods: assignment.weeklyPeriods,
    },
  }));
}

function buildRuntimePayload(assignments: Assignment[], constraints: ConstraintSpec[]) {
  const periodsByDay = Object.fromEntries(DAYS.map((day) => [day, PERIODS]));
  return {
    classes: CLASSES,
    days: DAYS,
    periods: PERIODS,
    periodsByDay,
    assignments,
    constraints,
  };
}

function buildConstraintCode(includeDuplicateWeekly: boolean): string {
  if (!includeDuplicateWeekly) {
    return '';
  }

  return `
for constraint in constraints:
    if constraint.get("kind") != "weekly_periods_exact":
        continue
    params = constraint.get("params", {})
    assignment_id = params.get("assignmentId")
    weekly_periods = int(params.get("weeklyPeriods", 0))
    assignment = None
    for a in assignments:
        if a["id"] == assignment_id:
            assignment = a
            break
    if assignment is None:
        continue
    model.Add(
        sum(
            slots[(assignment["id"], d, p)]
            for d in days
            for p in periods_by_day.get(d, periods)
        ) == weekly_periods
    )
`;
}

function runSingle(includeDuplicateWeekly: boolean, payload: ReturnType<typeof buildRuntimePayload>): ExecutorResult {
  const skeleton = fs.readFileSync(path.join(process.cwd(), 'python', 'templates', 'solver_skeleton.py'), 'utf8');
  const injected = injectConstraintCode(skeleton, buildConstraintCode(includeDuplicateWeekly).trim());
  if (!injected.injected) throw new Error('Unable to inject custom constraint code.');
  const tunedSolverCode = injected.solverCode.replace(
    'solver.parameters.max_time_in_seconds = 60.0',
    `solver.parameters.max_time_in_seconds = 60.0\nsolver.parameters.num_search_workers = ${SOLVER_WORKERS}\nsolver.parameters.random_seed = ${SOLVER_RANDOM_SEED}`
  );

  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weekly-dedupe-bench-'));
  fs.writeFileSync(path.join(jobDir, 'input.json'), JSON.stringify(payload), 'utf8');

  const solverTimedCode = tunedSolverCode
    .replace('status = solver.Solve(model)', 'status = solver.Solve(model)\nsolve_wall_time_ms = solver.WallTime() * 1000.0')
    .replace('result = {', 'result = {\n    "solveWallTimeMs": solve_wall_time_ms,');

  const run = spawnSync('python3', [path.join(process.cwd(), 'python', 'code_executor.py')], {
    cwd: jobDir,
    input: solverTimedCode,
    encoding: 'utf8',
  });

  fs.rmSync(jobDir, { recursive: true, force: true });

  if (run.status !== 0 && !run.stdout.trim()) {
    throw new Error(run.stderr || 'Executor failed with empty stdout.');
  }

  const line = run.stdout.trim().split('\n').at(-1) || '{}';
  const parsed = JSON.parse(line) as { ok: boolean; status: string; durationMs: number; resultPath?: string };

  let solveWallTimeMs: number | null = null;
  if (parsed.resultPath && fs.existsSync(parsed.resultPath)) {
    const resultPayload = JSON.parse(fs.readFileSync(parsed.resultPath, 'utf8')) as { solveWallTimeMs?: number };
    if (typeof resultPayload.solveWallTimeMs === 'number') {
      solveWallTimeMs = resultPayload.solveWallTimeMs;
    }
  }

  return {
    ok: parsed.ok,
    status: parsed.status,
    durationMs: parsed.durationMs,
    resultPath: parsed.resultPath,
    solveWallTimeMs,
  };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function main() {
  const assignments = buildAssignments();
  const duplicateConstraints = buildConstraints(assignments);
  const dedupedConstraints: ConstraintSpec[] = [];
  const duplicatePayload = buildRuntimePayload(assignments, duplicateConstraints);
  const dedupedPayload = buildRuntimePayload(assignments, dedupedConstraints);

  const duplicateDurations: number[] = [];
  const dedupeDurations: number[] = [];
  const duplicateSolveWallTimes: number[] = [];
  const dedupeSolveWallTimes: number[] = [];

  for (let i = 0; i < RUNS; i += 1) {
    const duplicate = runSingle(true, duplicatePayload);
    if (!duplicate.ok) throw new Error(`Duplicate run failed: ${JSON.stringify(duplicate)}`);
    duplicateDurations.push(duplicate.durationMs);
    duplicateSolveWallTimes.push(duplicate.solveWallTimeMs ?? duplicate.durationMs);

    const dedupe = runSingle(false, dedupedPayload);
    if (!dedupe.ok) throw new Error(`Dedupe run failed: ${JSON.stringify(dedupe)}`);
    dedupeDurations.push(dedupe.durationMs);
    dedupeSolveWallTimes.push(dedupe.solveWallTimeMs ?? dedupe.durationMs);
  }

  const duplicateAvg = average(duplicateDurations);
  const dedupeAvg = average(dedupeDurations);
  const duplicateSolveAvg = average(duplicateSolveWallTimes);
  const dedupeSolveAvg = average(dedupeSolveWallTimes);
  const reductionPercent = ((duplicateSolveAvg - dedupeSolveAvg) / duplicateSolveAvg) * 100;

  console.log(
    JSON.stringify(
      {
        ok: true,
        runs: RUNS,
        solver: { workers: SOLVER_WORKERS, randomSeed: SOLVER_RANDOM_SEED },
        duplicateWeekly: {
          durationsMs: duplicateDurations,
          averageMs: Number(duplicateAvg.toFixed(2)),
          solveWallTimeMs: duplicateSolveWallTimes,
          solveWallTimeAverageMs: Number(duplicateSolveAvg.toFixed(2)),
        },
        dedupedWeekly: {
          durationsMs: dedupeDurations,
          averageMs: Number(dedupeAvg.toFixed(2)),
          solveWallTimeMs: dedupeSolveWallTimes,
          solveWallTimeAverageMs: Number(dedupeSolveAvg.toFixed(2)),
        },
        reductionPercent: Number(reductionPercent.toFixed(2)),
      },
      null,
      2
    )
  );
}

main();
