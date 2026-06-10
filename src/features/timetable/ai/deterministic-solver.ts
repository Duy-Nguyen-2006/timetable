/**
 * deterministic-solver.ts
 *
 * Default solve path: chạy CP-SAT solver bằng code cố định (skeleton Python
 * được fill bằng empty `build_custom_constraints`), validate deterministic,
 * và verify round-trip — KHÔNG dùng planner/coder/repair LLM.
 *
 * Đây là module được tách ra từ `local-agent.ts` để:
 *   - Có thể test độc lập.
 *   - Frontend/route có thể gọi thẳng nếu muốn (Option B trong PLAN.md).
 *   - Dễ audit/rollback so với pipeline AI codegen cũ.
 *
 * Eligibility của constraint batch do `getDeterministicEligibility` quyết
 * định. Nếu không eligible, hàm này trả `{ success: false, error }` —
 * caller (`local-agent.ts`) chịu trách nhiệm fail-closed.
 */

import { verifyCpSatRoundTrip } from './cp-sat-roundtrip';
import type { ConstraintSpec, ScheduleEntry } from './constraint-spec';
import { validateSchedule } from './deterministic-validator';
import { compressPayload } from './input-compressor';
import { executeSolverCode } from './python-bridge';
import { injectEmptyCustomConstraintBlock, loadSolverSkeleton } from './skeleton-injector';
import type { AgentInputPayload, ExecutionResult, LocalAgentConfig, LocalAgentFinalResult } from './types';
import { buildFinalMessage, emit, resolveSolverRuntime } from './local-agent-utils';
import { normalizeConstraintSpecsForSolving } from './constraint-spec-normalizer';

export type DeterministicSolverOptions = {
  /** Specs đã xác nhận (bao gồm cả auto_base). */
  constraintSpecs: ConstraintSpec[];
};

export type DeterministicSolverResult = {
  success: boolean;
  finalResult?: LocalAgentFinalResult;
  error?: string;
  warnings?: string[];
};

/**
 * Gắn `assignmentId` cho schedule entry nếu match duy nhất 1 assignment.
 * Tránh round-trip fail vì entry từ Python skeleton không có id.
 */
function attachAssignmentIds(
  schedule: ScheduleEntry[],
  assignments: Array<{
    id: string;
    class: string;
    subject: string;
    teacher: string;
    weeklyPeriods: number;
  }>
): ScheduleEntry[] {
  return schedule.map((entry) => {
    if (entry.assignmentId) return entry;
    const matchingAssignments = assignments.filter(
      (assignment) =>
        assignment.class === entry.class &&
        assignment.subject === entry.subject &&
        assignment.teacher === entry.teacher
    );
    return matchingAssignments.length === 1
      ? { ...entry, assignmentId: matchingAssignments[0].id }
      : entry;
  });
}

function mapSolverStatus(
  status: ExecutionResult['status']
): 'optimal' | 'feasible' | 'timeout_with_solution' {
  if (status === 'timeout_with_solution') return 'timeout_with_solution';
  if (status === 'feasible') return 'feasible';
  return 'optimal';
}

export async function runDeterministicSolver(
  input: AgentInputPayload,
  config: LocalAgentConfig,
  options: DeterministicSolverOptions
): Promise<DeterministicSolverResult> {
  const runtime = resolveSolverRuntime(config, options.constraintSpecs);
  const timeoutMs = config.timeoutMs ?? runtime.timeoutMs;
  const deduped = options.constraintSpecs;

  emit(config, {
    type: 'phase',
    phase: 'running',
    message: 'Đang chạy solver trực tiếp (không dùng AI)',
    iteration: 0,
  });

  const compressed = compressPayload(input, deduped);
  // auto_base constraints (weekly_periods_exact tagged 'auto_base') bị skeleton
  // xử lý riêng, không đưa vào slot-level constraints.
  let solverConstraintSpecs = deduped.filter(
    (spec) => !(spec.kind === 'weekly_periods_exact' && spec.tags?.includes('auto_base'))
  );

  // Safety net: normalize confirmed specs one more time before sending to
  // Python. This catches "mọi môn" / missing subject / wrong maxConsecutive
  // key that survived the parse → confirm → gate pipeline.
  const normalized = normalizeConstraintSpecsForSolving(input, solverConstraintSpecs);
  if (normalized.issues.length > 0) {
    const msg = `Specs không hợp lệ trước khi xếp lịch: ${normalized.issues
      .map((i) => i.message)
      .join('; ')}`;
    emit(config, { type: 'error', message: msg, fatal: true });
    return { success: false, error: msg };
  }
  solverConstraintSpecs = normalized.specs;

  const skeleton = await loadSolverSkeleton();
  const injected = injectEmptyCustomConstraintBlock(skeleton);
  if (!injected.injected) {
    const msg = 'Solver skeleton marker not found.';
    emit(config, { type: 'error', message: msg, fatal: true });
    return { success: false, error: msg };
  }

  const executePayload = {
    classes: compressed.classes,
    days: compressed.days,
    periodsByDay: compressed.periodsByDay,
    periods: compressed.periods,
    assignments: compressed.assignments,
    constraints: solverConstraintSpecs,
    ...(input.previousSchedule ? { warmStartSchedule: input.previousSchedule } : {}),
  };

  const execResult = await executeSolverCode(injected.solverCode, executePayload, {
    timeoutMs,
    solverWorkers: runtime.workers,
    // Section 14.8: pass seed for solver determinism (same input → same output)
    solverSeed: runtime.seed,
  } as Parameters<typeof executeSolverCode>[2]);
  emit(config, { type: 'execution_result', attempt: 1, result: execResult });
  if (!execResult.ok || !execResult.resultData) {
    const msg = execResult.errorDigest || 'Solver execution failed.';
    emit(config, { type: 'error', message: msg, fatal: true });
    return { success: false, error: msg };
  }

  const scheduleWithAssignmentIds = attachAssignmentIds(
    execResult.resultData.schedule,
    compressed.assignments
  );

  const report = validateSchedule(scheduleWithAssignmentIds, deduped, {
    assignments: compressed.assignments,
  });
  const roundTrip = verifyCpSatRoundTrip(scheduleWithAssignmentIds, compressed.assignments, {
    days: compressed.days,
    periodsByDay: compressed.periodsByDay,
    periods: compressed.periods,
  });

  // FAIL-CLOSED cho hard unchecked: deterministic eligibility đã filter
  // trước khi gọi solver, nhưng vẫn double-check ở đây phòng rule mới.
  const hardUncheckedIds = report.uncheckedConstraintIds.filter((id) => {
    const spec = deduped.find((item) => item.id === id);
    return spec?.severity === 'hard';
  });

  if (
    !report.baseConstraintPass ||
    report.hardViolations.length > 0 ||
    !roundTrip.ok ||
    hardUncheckedIds.length > 0
  ) {
    const errors = [
      ...report.hardViolations.slice(0, 3).map((violation) => violation.message),
      ...(!roundTrip.ok ? [roundTrip.message] : []),
      ...(hardUncheckedIds.length > 0
        ? [`Hard constraints chưa được deterministic check: ${hardUncheckedIds.join(', ')}`]
        : []),
    ];
    const msg = errors.join('\n') || 'Solver validation failed.';
    emit(config, { type: 'error', message: msg, fatal: true });
    return { success: false, error: msg };
  }

  const solverStatus = mapSolverStatus(execResult.status);
  const softCount = report.softViolations.length;
  const finalResult: LocalAgentFinalResult = {
    ...execResult.resultData,
    schedule: scheduleWithAssignmentIds,
    status: 'solved',
    solverStatus,
    message:
      execResult.status === 'timeout_with_solution'
        ? 'Hết thời gian nhưng đã tìm được lịch hợp lệ.'
        : softCount > 0
          ? `Đã xếp lịch thành công nhưng còn ${softCount} vi phạm ràng buộc ưu tiên.`
          : buildFinalMessage(execResult.status),
    deterministicReport: report,
    checkerReport: report,
    softViolations: report.softViolations,
    softViolationCount: softCount,
    hardViolations: report.hardViolations,
    // FIX.md §4: surface soft violations into the top-level `violations`
    // list so the UI can warn even when the solve itself succeeded.
    violations: [...report.hardViolations, ...report.softViolations],
    diagnostics: [
      'Deterministic fast-path: no AI planner/coder/repair used.',
      ...(softCount > 0
        ? [`Còn ${softCount} vi phạm ràng buộc ưu tiên. Nếu muốn cấm tuyệt đối, hãy đổi thành "Bắt buộc".`]
        : []),
    ],
    executionErrors: [],
    validationErrors: [],
    iisConstraintIds: [],
    conflictingConstraints: [],
    attemptHistorySummary: [
      {
        stage: 'deterministic_fast_path',
        summary: 'Solver chạy trực tiếp từ constraints đã xác nhận.',
        at: new Date().toISOString(),
      },
    ],
  };
  emit(config, { type: 'final_result', result: finalResult });
  return { success: true, finalResult };
}
