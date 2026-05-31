# Data Models

Active contributors: Duy

This page documents the core TypeScript interfaces that define the contract between the UI, the Local Agent pipeline, and the Python execution host. These types are the single source of truth for what "a timetable problem" and "a timetable solution" look like.

## Primary payload types

### `AgentInputPayload`

Location: `src/features/timetable/ai/types.ts`

The normalized input that flows from `TimetableApp` into `runLocalAgent`.

```ts
interface AgentInputPayload {
  days: Array<{ id: string; label: string }>;
  sessions: Array<{ id: string; label: string }>;
  periodCounts: Record<string, number>;
  deletedPeriods: Record<string, boolean>;
  assignments: NormalizedAssignment[];
  constraints: ConstraintItemInput[];
  previousSchedule?: ScheduleEntry[];
  metadata?: { schoolName?: string; semester?: string };
}
```

- `days` and `sessions` define the grid axes.
- `periodCounts[dayId]` tells how many periods exist on that day (some days may be shorter).
- `deletedPeriods` marks cells the user has explicitly removed from the grid.
- `assignments` are the teacher–subject–class triples with their weekly period counts.
- `constraints` are the raw natural-language items (with `required` / `preferred` type) that the Translator will turn into `ConstraintSpec[]`.

### `NormalizedAssignment`

```ts
interface NormalizedAssignment {
  id: string;
  teacher: NormalizedEntity;
  subject: NormalizedEntity;
  class: NormalizedEntity;
  weeklyPeriods: number;
}
```

This is the fundamental unit the solver allocates into slots.

### `ConstraintItemInput`

```ts
interface ConstraintItemInput {
  type: 'required' | 'preferred';
  text: string;
  weight?: number;
}
```

The raw form coming from the UI before the Translator runs.

## Core domain model

### `ConstraintSpec` + `ConstraintKind`

Location: `src/features/timetable/ai/constraint-spec.ts`

```ts
type ConstraintSpec = {
  id: string;
  original: string;           // the user's natural language text
  severity: 'hard' | 'soft' | 'info';
  kind: ConstraintKind;       // one of 35 literal values
  params: Record<string, unknown>;
  weight?: number;
  tags?: ('auto_base' | 'user_required' | 'user_preferred')[];
  notes?: string;
  pythonPredicate?: string;   // only for kind === 'custom_dsl'
};
```

`ConstraintKind` is a 35-member union covering teacher, subject, class, assignment, session, conditional, and custom rules. The full list and semantics are documented in the [Constraint System](../features/constraint-system.md) page.

### `Plan`

Produced by the Planner stage. Tells the Coder how to structure the CP-SAT model.

```ts
type Plan = {
  decisionVars: string;
  domainSize: { classes: number; days: number; periods: number; estimated?: number; estimatedVars?: number };
  constraintOrder: string[];
  reifiedNeeded: string[];
  objective: 'none' | 'maximize_soft' | 'minimize_gaps';
  templatesUsed: string[];
  objectiveFunction?: string;
  provenPatterns?: string[];
  risks: string[];
};
```

### `ScheduleEntry`

A single cell in a timetable:

```ts
type ScheduleEntry = {
  assignmentId?: string;
  class: string;
  day: string;
  period: number | string;
  subject: string;
  teacher: string;
};
```

## Execution and validation contracts

### `ExecutionResult`

Returned from the Python host (`code_executor.py`) after every sandbox run.

Key fields:
- `phase`: `'compile' | 'run' | 'parse'`
- `ok`, `status` (optimal/feasible/infeasible/timeout/crashed/...)
- `resultData.schedule`: the actual `ScheduleEntry[]` (if any)
- `resultData.customChecks`: per-constraint results from `validator_engine.py`
- `stdout`, `stderr`, `errorDigest`

### `DeterministicValidationReport`

Produced by both the TypeScript `validateSchedule` and the Python `validator_engine.py`.

```ts
type DeterministicValidationReport = {
  ok: boolean;
  baseConstraintPass: boolean;
  hardConstraintPass: boolean;
  softConstraintPass: boolean;
  hardCoverageComplete: boolean;   // true only if every hard constraint had a real checker
  violations: Violation[];
  hardViolations: Violation[];
  softViolations: Violation[];
  uncheckedConstraintIds: string[];
  hardUncheckedConstraintIds: string[];
};
```

### `Violation`

```ts
type Violation = {
  constraintId: string;
  kind: ConstraintKind | 'base_constraint';
  message: string;
  offendingEntries: ScheduleEntry[];
};
```

### `LocalAgentFinalResult`

The object ultimately returned to the UI after a successful (or partially successful) agent run.

Contains:
- the final `schedule`
- `solverStatus`
- both `deterministicReport` (TS) and `checkerReport` (Python)
- the merged `violations` list
- `iisConstraintIds` and `conflictingConstraints`
- `attemptHistorySummary` (what each stage did on each attempt)

## Lifecycle and event types

- `AgentLifecyclePhase` — the coarse phases shown in the UI progress bar.
- `AgentLifecycleEvent` — rich events for the live step list.
- `AgentEvent` — the low-level union (`stage_started`, `violations_found`, `execution_result`, `final_result`, etc.) emitted by the orchestrator.

These types are the contract between `runLocalAgent` and the React component that renders progress.

## Python-side mirrors

The Python layer (`validator_engine.py`, `code_executor.py`, solver skeleton) consumes JSON that is intentionally structurally compatible with the TypeScript types above. There is no shared `.proto` or code generation; the two sides are kept in sync by tests and by the dual implementation of every constraint checker.

When adding a new `ConstraintKind`, you must update:
1. The TypeScript union + `ConstraintSpec` in `constraint-spec.ts`
2. The Python `ConstraintKind` literal (or registry) in `validator_engine.py`
3. Both the TS and Python checker implementations
4. The translator prompt + fallback rules (if the kind is expressible in natural language)
5. The solver skeleton template (if it needs new helper code)

The `hardCoverageComplete` flag in the validation report exists specifically to catch the case where a hard constraint was added to the union but never given a real checker on one or both sides.
