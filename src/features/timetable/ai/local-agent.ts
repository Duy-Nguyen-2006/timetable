import { TokenBudgetGuard } from './budget-guard';
import { runCoderTurn } from './coder';
import type { ConstraintSpec, ScheduleEntry } from './constraint-spec';
import { verifyCpSatRoundTrip } from './cp-sat-roundtrip';
import { validateSchedule } from './deterministic-validator';
import { compressPayload, digestError } from './input-compressor';
import { runPlannerTurn } from './planner';
import { executeGeneratedCode } from './python-bridge';
import { applyRepairPatches, runRepairTurn } from './repair';
import { astCheckPython, injectConstraintCode, loadSolverSkeleton, syntaxCheckPython } from './skeleton-injector';
import { runTranslatorTurn } from './translator';
import type { AgentInputPayload, LocalAgentConfig, LocalAgentFinalResult } from './types';
import { WorkspaceBoard } from './workspace';

export interface RunLocalAgentResult {
  success: boolean;
  finalResult?: LocalAgentFinalResult;
  error?: string;
}

const MAX_CODER_RETRIES = 3;
const MAX_RUNTIME_REPAIR_ROUNDS = 1;
const MAX_VIOLATION_REPAIR_ROUNDS = 2;
const MAX_TOTAL_TOOL_CALLS = 15;
const TOKEN_CAP_PER_RUN = 80_000;
const STAGE_CACHE_MAX_ENTRIES = 20;
const stageCache = new Map<string, unknown>();

type SolverRuntimeConfig = { timeoutMs: number; workers: number };

function emit(
  config: LocalAgentConfig,
  event:
    | { type: 'status'; message: string; iteration: number; maxIterations?: number }
    | { type: 'phase'; phase: 'thinking' | 'translator' | 'planner' | 'coding' | 'running' | 'checking' | 'fixing' | 'idle'; message: string; iteration: number }
    | { type: 'stage_started'; stage: string; attempt?: number; message: string }
    | { type: 'stage_completed'; stage: string; attempt?: number; message: string }
    | { type: 'violations_found'; count: number; sample?: string[] }
    | { type: 'execution_result'; attempt: number; result: any }
    | { type: 'final_result'; result: LocalAgentFinalResult }
    | { type: 'error'; message: string; fatal?: boolean }
) {
  config.onEvent?.(event as any);
}

function pickStageConfig(
  config: LocalAgentConfig,
  stage: 'translator' | 'planner' | 'coder' | 'repair'
): LocalAgentConfig {
  const model =
    stage === 'translator'
      ? config.modelTranslator
      : stage === 'planner'
      ? config.modelPlanner
      : stage === 'coder'
      ? config.modelCoder
      : config.modelRepair;
  return {
    ...config,
    model: model || config.model,
  };
}

function stableHash(value: unknown): string {
  return JSON.stringify(sortObjectDeep(value));
}

async function getCachedStage<T>(key: string, producer: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
  if (stageCache.has(key)) {
    return { value: stageCache.get(key) as T, hit: true };
  }
  const value = await producer();
  stageCache.set(key, value);
  if (stageCache.size > STAGE_CACHE_MAX_ENTRIES) {
    const firstKey = stageCache.keys().next().value;
    if (firstKey) stageCache.delete(firstKey);
  }
  return { value, hit: false };
}

function resolveSolverRuntime(config: LocalAgentConfig): SolverRuntimeConfig {
  const cpuCount = typeof navigator !== 'undefined' && Number(navigator.hardwareConcurrency) > 0
    ? Number(navigator.hardwareConcurrency)
    : 2;
  const profile = config.solverProfile ?? 'balanced';
  const defaults: Record<string, SolverRuntimeConfig> = {
    fast: { timeoutMs: 20_000, workers: Math.max(1, Math.floor(cpuCount / 2)) },
    balanced: { timeoutMs: 60_000, workers: Math.max(1, cpuCount - 1) },
    deep: { timeoutMs: 180_000, workers: cpuCount },
  };
  const resolved = defaults[profile] ?? defaults.balanced;
  return {
    timeoutMs: config.timeoutMs ?? resolved.timeoutMs,
    workers: Math.min(8, Math.max(1, Math.floor(config.solverWorkers ?? resolved.workers))),
  };
}

function buildFinalMessage(status: string | undefined): string {
  if (status === 'optimal') return 'Đã tạo thời khóa biểu tối ưu.';
  if (status === 'feasible') return 'Đã tìm được lịch hợp lệ, nhưng chưa chứng minh là tối ưu.';
  return 'Đã tạo thời khóa biểu thành công.';
}

function consumeBudget(
  budget: TokenBudgetGuard,
  usageTokens: number | undefined,
  ...fallbackChunks: string[]
): void {
  if (typeof usageTokens === 'number' && Number.isFinite(usageTokens) && usageTokens > 0) {
    budget.consumeUsage(usageTokens);
  } else {
    budget.consumeText(...fallbackChunks);
  }
  budget.ensureWithinLimit();
}

function buildViolationSignature(
  hardViolations: Array<{ constraintId: string; kind: string }>,
  roundTripOk: boolean,
  roundTripMessage: string
): string {
  const signature = hardViolations
    .map((violation) => `${violation.constraintId}:${violation.kind}`)
    .sort()
    .join('|');
  const roundTripSignature = roundTripOk
    ? 'rt:ok'
    : `rt:fail:${normalizeRoundTripMessage(roundTripMessage)}`;
  return `${signature}||${roundTripSignature}`;
}

function normalizeRoundTripMessage(message: string): string {
  return message
    .replace(/asg_\d+/g, 'ASG')
    .replace(/\b\d{3,}\b/g, 'N')
    .trim();
}

function buildCoderExhaustedMessage(lastFailureSummary: string): string {
  const detail = lastFailureSummary.trim();
  if (!detail) return 'Coder could not produce an executable schedule.';
  return `Coder could not produce an executable schedule. Last failure: ${detail}`;
}

function buildRepeatedViolationMessage(sampleMessages: string[]): string {
  const detail = sampleMessages.filter(Boolean).slice(0, 3).join(' | ');
  if (!detail) {
    return 'Không tạo được thời khóa biểu sau khi agent sửa lặp lại cùng một lỗi.';
  }
  return `Không tạo được thời khóa biểu sau khi agent sửa lặp lại cùng một lỗi: ${detail}`;
}

function shouldRepairExecutableFailure(
  latestConstraintCode: string,
  lastFailureSummary: string,
  repairRound: number
): boolean {
  return Boolean(
    latestConstraintCode.trim() &&
    lastFailureSummary.trim() &&
    repairRound < MAX_RUNTIME_REPAIR_ROUNDS
  );
}

function sortObjectDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectDeep);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortObjectDeep(item)])
  );
}

function constraintSignature(spec: ConstraintSpec): string {
  return JSON.stringify({
    kind: spec.kind,
    severity: spec.severity,
    params: sortObjectDeep(spec.params),
    weight: spec.weight ?? null,
    pythonPredicate: spec.pythonPredicate ?? null,
  });
}

function dedupeConstraintSpecs(specs: ConstraintSpec[]): ConstraintSpec[] {
  const seen = new Set<string>();
  return specs.filter((spec) => {
    const sig = constraintSignature(spec);
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}

export async function runLocalAgent(
  input: AgentInputPayload,
  config: LocalAgentConfig
): Promise<RunLocalAgentResult> {
  const runtime = resolveSolverRuntime(config);
  const timeoutMs = runtime.timeoutMs;
  const startedAt = Date.now();
  const deadlineAt = startedAt + timeoutMs;
  const budget = new TokenBudgetGuard(TOKEN_CAP_PER_RUN);
  const board = new WorkspaceBoard();

  let totalToolCalls = 0;
  try {
    emit(config, { type: 'status', message: 'Khởi tạo pipeline v2...', iteration: 0, maxIterations: MAX_CODER_RETRIES });
    emit(config, { type: 'phase', phase: 'translator', message: 'Đang dịch constraints', iteration: 0 });
    emit(config, { type: 'stage_started', stage: 'translator', message: 'Translator started' });

    const translatorCacheKey = `translator:${stableHash({
      model: pickStageConfig(config, 'translator').model,
      assignments: input.assignments,
      constraints: input.constraints,
      days: input.days,
      sessions: input.sessions,
      periodCounts: input.periodCounts,
      deletedPeriods: input.deletedPeriods,
    })}`;
    const translatorCached = await getCachedStage(translatorCacheKey, () =>
      runTranslatorTurn(pickStageConfig(config, 'translator'), input)
    );
    const translator = translatorCached.value;
    consumeBudget(budget, translatorCached.hit ? 0 : translator.usageTokens, JSON.stringify(input.constraints), translator.rawResponse ?? '');
    if (!translatorCached.hit) totalToolCalls += 1;
    const deduped = dedupeConstraintSpecs(translator.constraintSpecs);
    emit(config, { type: 'stage_completed', stage: 'translator', message: `Translator done (${translator.constraintSpecs.length} specs, ${deduped.length} after dedupe)` });
    const compressed = compressPayload(input, deduped);
    const solverConstraintSpecs = deduped.filter(
      (spec) => !(spec.kind === 'weekly_periods_exact' && spec.tags?.includes('auto_base'))
    );
    const hasCustomConstraintSpecs = solverConstraintSpecs.some(
      (spec) => spec.kind === 'custom_dsl' && spec.severity === 'hard'
    );
    board.setConstraintSpecs(deduped);
    board.setDataset(compressed);

    emit(config, { type: 'phase', phase: 'planner', message: 'Đang tạo kế hoạch solver', iteration: 0 });
    emit(config, { type: 'stage_started', stage: 'planner', message: 'Planner started' });
    const plannerInput = {
      datasetDigest: {
        classes: compressed.datasetDigest.classCount,
        days: compressed.datasetDigest.dayCount,
        periods: compressed.datasetDigest.periodCount,
        estimated:
          compressed.datasetDigest.classCount *
          compressed.datasetDigest.dayCount *
          Math.max(1, compressed.datasetDigest.periodCount) *
          Math.max(1, compressed.datasetDigest.totalAssignments),
      },
      constraintSpecs: deduped,
    };
    const plannerCached = await getCachedStage(
      `planner:${stableHash({ model: pickStageConfig(config, 'planner').model, input: plannerInput })}`,
      () => runPlannerTurn(pickStageConfig(config, 'planner'), plannerInput)
    );
    const planner = plannerCached.value;
    consumeBudget(budget, plannerCached.hit ? 0 : planner.usageTokens, JSON.stringify(planner.plan), planner.rawResponse ?? '');
    if (!plannerCached.hit) totalToolCalls += 1;
    board.setPlan(planner.plan);
    emit(config, { type: 'stage_completed', stage: 'planner', message: 'Planner done' });

    const skeleton = await loadSolverSkeleton();
    let previousAttemptSummary = '';

    // Tách rõ 2 vòng repair: runtime/compile error tối đa 1 round,
    // violations tối đa 2 round để tránh tổng token repair phình lên 2+2.
    let runtimeRepairRound = 0;
    let violationRepairRound = 0;
    let previousViolationSignature = '';
    let repeatedViolationCount = 0;
    let latestConstraintCode = '';
    let latestCoveredConstraintIds = new Set<string>();
    let lastCheckedCustomIds = new Set<string>();
    let pendingRepairPatches: Array<{ oldStr: string; newStr: string; reason: string; replaceAll?: boolean }> | null = null;
    let lastSuccessfulSchedule: ScheduleEntry[] | null = input.previousSchedule ?? null;

    while (true) {
      let coderRetry = 0;
      let lastReport: ReturnType<typeof validateSchedule> | null = null;
      let lastRoundTrip: ReturnType<typeof verifyCpSatRoundTrip> | null = null;

      while (coderRetry < MAX_CODER_RETRIES) {
        if (Date.now() > deadlineAt) {
          throw new Error(`Agent timeout after ${Math.ceil((Date.now() - startedAt) / 1000)}s.`);
        }
        if (totalToolCalls >= MAX_TOTAL_TOOL_CALLS) {
          throw new Error(`Stopped by MAX_TOTAL_TOOL_CALLS=${MAX_TOTAL_TOOL_CALLS}.`);
        }

        const attempt = coderRetry + 1;
        emit(config, { type: 'phase', phase: 'coding', message: `Coder attempt ${attempt}`, iteration: attempt });

        if (pendingRepairPatches?.length && latestConstraintCode) {
          try {
            latestConstraintCode = applyRepairPatches(latestConstraintCode, pendingRepairPatches);
            // Sau repair, có thể có constraint IDs mới được cover. Cập nhật
            // covered set dựa trên các comment id còn lại trong code.
            // (fix bug #1 — trước đây giữ nguyên covered cũ, dễ false-positive.)
            const refreshed = new Set<string>(latestCoveredConstraintIds);
            for (const spec of deduped) {
              if (spec.kind !== 'custom_dsl') continue;
              const re = new RegExp(`(^|[^A-Za-z0-9_])${spec.id}([^A-Za-z0-9_]|$)`, 'm');
              if (re.test(latestConstraintCode)) refreshed.add(spec.id);
            }
            latestCoveredConstraintIds = refreshed;
            board.addAttempt(
              'repair_patch_applied',
              `round=${Math.max(runtimeRepairRound, violationRepairRound)} patches=${pendingRepairPatches.length}`
            );
            pendingRepairPatches = null;
            emit(config, {
              type: 'stage_completed',
              stage: 'coder',
              attempt,
              message: 'Applied repair patches from previous round',
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Repair patch failed';
            previousAttemptSummary = digestError(`Repair patch apply failed: ${message}`);
            board.setErrorDigest(previousAttemptSummary);
            pendingRepairPatches = null;
            coderRetry += 1;
            emit(config, {
              type: 'error',
              message: `Repair patch apply failed at attempt ${attempt}: ${message}`,
              fatal: false,
            });
            continue;
          }
        } else {
          emit(config, { type: 'stage_started', stage: 'coder', attempt, message: 'Coder started' });
          let coder: Awaited<ReturnType<typeof runCoderTurn>>;
          const coderInput = {
            dataset: compressed,
            plan: planner.plan,
            previousAttemptSummary,
          };
          let coderCacheHit = false;
          try {
            const cacheableCoder = !previousAttemptSummary.trim();
            if (cacheableCoder) {
              const cached = await getCachedStage(
                `coder:${stableHash({
                  model: pickStageConfig(config, 'coder').model,
                  constraintSpecs: compressed.constraints,
                  plan: planner.plan,
                  skeletonVersion: skeleton,
                })}`,
                () => runCoderTurn(pickStageConfig(config, 'coder'), coderInput)
              );
              coder = cached.value;
              coderCacheHit = cached.hit;
            } else {
              coder = await runCoderTurn(pickStageConfig(config, 'coder'), coderInput);
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Coder returned an invalid model response.';
            previousAttemptSummary = digestError(message);
            board.setErrorDigest(previousAttemptSummary);
            totalToolCalls += 1;
            coderRetry += 1;
            emit(config, {
              type: 'error',
              message: `Coder attempt ${attempt} failed: ${previousAttemptSummary}`,
              fatal: false,
            });
            continue;
          }
          if (!coderCacheHit) totalToolCalls += 1;
          consumeBudget(
            budget,
            coderCacheHit ? 0 : coder.usageTokens,
            JSON.stringify(compressed.datasetDigest),
            coder.rawResponse ?? ''
          );
          latestConstraintCode = coder.constraint_code;
          latestCoveredConstraintIds = new Set(coder.covered_constraint_ids);
          emit(config, { type: 'stage_completed', stage: 'coder', attempt, message: 'Coder output received' });
        }

        board.setLatestConstraintCode(latestConstraintCode);

        const injected = injectConstraintCode(skeleton, latestConstraintCode);
        if (!injected.injected) {
          throw new Error('Solver skeleton marker not found.');
        }

        const syntax = await syntaxCheckPython(injected.solverCode);
        if (!syntax.ok) {
          previousAttemptSummary = digestError(syntax.error || 'Python syntax error');
          board.setErrorDigest(previousAttemptSummary);
          coderRetry += 1;
          continue;
        }

        const astCheck = hasCustomConstraintSpecs && latestConstraintCode.trim()
          ? await astCheckPython(latestConstraintCode)
          : { ok: true };
        if (!astCheck.ok) {
          previousAttemptSummary = digestError(astCheck.error || 'AST check rejected the generated code.');
          board.setErrorDigest(previousAttemptSummary);
          coderRetry += 1;
          emit(config, {
            type: 'error',
            message: `AST check failed at attempt ${attempt}: ${previousAttemptSummary}`,
            fatal: false,
          });
          continue;
        }

        board.setLatestGeneratedSolver(injected.solverCode);
        emit(config, { type: 'phase', phase: 'running', message: 'Đang chạy solver', iteration: attempt });

        const executePayload = {
          classes: compressed.classes,
          days: compressed.days,
          periodsByDay: compressed.periodsByDay,
          periods: compressed.periods,
          assignments: compressed.assignments,
          constraints: solverConstraintSpecs,
          ...(lastSuccessfulSchedule ? { warmStartSchedule: lastSuccessfulSchedule } : {}),
        };

        let execResult: Awaited<ReturnType<typeof executeGeneratedCode>>;
        try {
          execResult = await executeGeneratedCode(injected.solverCode, executePayload, {
            timeoutMs,
            solverWorkers: runtime.workers,
          });
        } catch (error) {
          previousAttemptSummary = digestError(
            error instanceof Error ? error.message : 'Solver execution failed.'
          );
          board.setErrorDigest(previousAttemptSummary);
          coderRetry += 1;
          emit(config, {
            type: 'error',
            message: `Solver execution attempt ${attempt} failed: ${previousAttemptSummary}`,
            fatal: false,
          });
          continue;
        }
        totalToolCalls += 1;
        emit(config, { type: 'execution_result', attempt, result: execResult });

        if (!execResult.ok || !execResult.resultData) {
          previousAttemptSummary = execResult.errorDigest || 'Solver execution failed.';
          board.setErrorDigest(previousAttemptSummary);
          coderRetry += 1;
          continue;
        }

        emit(config, {
          type: 'phase',
          phase: 'checking',
          message: 'Đang deterministic validate',
          iteration: attempt,
        });
        const scheduleWithAssignmentIds = execResult.resultData.schedule.map((entry) => {
          if (entry.assignmentId) return entry;

          const matchingAssignments = compressed.assignments.filter(
            (assignment) =>
              assignment.class === entry.class &&
              assignment.subject === entry.subject &&
              assignment.teacher === entry.teacher
          );

          if (matchingAssignments.length !== 1) return entry;
          return { ...entry, assignmentId: matchingAssignments[0].id };
        });

        const report = validateSchedule(scheduleWithAssignmentIds, deduped, {
          assignments: compressed.assignments,
        });
        const roundTrip = verifyCpSatRoundTrip(scheduleWithAssignmentIds, compressed.assignments, {
          days: compressed.days,
          periodsByDay: compressed.periodsByDay,
          periods: compressed.periods,
        });

        if (roundTrip.ok && scheduleWithAssignmentIds.length > 0) {
          lastSuccessfulSchedule = scheduleWithAssignmentIds;
        }
        // Merge custom_dsl predicate results from sandbox
        const customChecks =
          ((execResult.resultData as { customChecks?: Array<{
            id: string; checked: boolean; ok: boolean;
            violations: Array<{ constraintId: string; kind: string; message: string }>;
          }> }).customChecks) ?? [];
        const checkedCustomIds = new Set(
          customChecks.filter((c) => c.checked).map((c) => c.id)
        );
        const customHardViolations = customChecks
          .filter((c) => c.checked && !c.ok)
          .flatMap((c) => c.violations)
          .filter((v) => {
            const spec = deduped.find((s) => s.id === v.constraintId);
            return spec?.severity === 'hard';
          });

        const hardUncheckedIds = report.uncheckedConstraintIds.filter((id) => {
          if (checkedCustomIds.has(id)) return false;
          const spec = deduped.find((item) => item.id === id);
          return spec?.severity === 'hard';
        });

        const allHardViolations = [...report.hardViolations, ...customHardViolations];

        if (
          report.baseConstraintPass &&
          allHardViolations.length === 0 &&
          roundTrip.ok &&
          hardUncheckedIds.length === 0
        ) {
          const solverStatus: 'optimal' | 'feasible' | 'timeout_with_solution' = execResult.status === 'timeout_with_solution'
            ? 'timeout_with_solution'
            : execResult.status === 'feasible'
              ? 'feasible'
              : 'optimal';
          const finalResult = {
            ...execResult.resultData,
            schedule: scheduleWithAssignmentIds,
            status: 'solved' as const,
            solverStatus,
            message: execResult.status === 'timeout_with_solution'
              ? 'Hết thời gian nhưng đã tìm được lịch hợp lệ.'
              : buildFinalMessage(execResult.status),
            deterministicReport: report,
            checkerReport: report,
            violations: [],
            diagnostics: [],
            executionErrors: [],
            validationErrors: [],
            iisConstraintIds: [],
            conflictingConstraints: [],
            attemptHistorySummary: board.snapshot().attempts,
          };
          emit(config, { type: 'final_result', result: finalResult });
          return { success: true, finalResult };
        }

        lastReport = report;
        lastRoundTrip = roundTrip;
        lastCheckedCustomIds = checkedCustomIds;
        break;
      }

      if (!lastReport || !lastRoundTrip) {
        if (shouldRepairExecutableFailure(latestConstraintCode, previousAttemptSummary, runtimeRepairRound)) {
          if (totalToolCalls >= MAX_TOTAL_TOOL_CALLS) {
            throw new Error(`Stopped by MAX_TOTAL_TOOL_CALLS=${MAX_TOTAL_TOOL_CALLS}.`);
          }

          runtimeRepairRound += 1;
          emit(config, {
            type: 'phase',
            phase: 'fixing',
            message: `Đang repair lỗi chạy code ${runtimeRepairRound}/${MAX_RUNTIME_REPAIR_ROUNDS}`,
            iteration: runtimeRepairRound,
          });

          const repair = await runRepairTurn(pickStageConfig(config, 'repair'), {
            plan: planner.plan,
            constraintCode: latestConstraintCode,
            violations: [],
            compileOrRunError: previousAttemptSummary,
          });
          totalToolCalls += 1;
          consumeBudget(budget, repair.usageTokens, previousAttemptSummary, repair.rawResponse ?? '');

          if (!repair.patches.length) {
            return {
              success: false,
              error: buildCoderExhaustedMessage(previousAttemptSummary),
            };
          }

          pendingRepairPatches = repair.patches;
          continue;
        }

        return {
          success: false,
          error: buildCoderExhaustedMessage(previousAttemptSummary),
        };
      }

      const sampleMessages = lastReport.hardViolations.slice(0, 3).map((violation) => violation.message);
      if (!lastRoundTrip.ok) {
        sampleMessages.unshift(lastRoundTrip.message);
      }

      const uncoveredHardUncheckedIds = lastReport.hardUncheckedConstraintIds.filter(
        (id) => !lastCheckedCustomIds.has(id)
      );

      if (uncoveredHardUncheckedIds.length > 0) {
        sampleMessages.unshift(
          `Hard constraints chưa được deterministic check (cần code/sửa parser): ${uncoveredHardUncheckedIds.join(', ')}`
        );
      }

      const violationSignature = buildViolationSignature(
        lastReport.hardViolations.map((violation) => ({
          constraintId: violation.constraintId,
          kind: violation.kind,
        })),
        lastRoundTrip.ok,
        lastRoundTrip.message
      );
      if (violationSignature === previousViolationSignature) {
        repeatedViolationCount += 1;
      } else {
        previousViolationSignature = violationSignature;
        repeatedViolationCount = 1;
      }
      if (repeatedViolationCount >= 2 && violationRepairRound >= MAX_VIOLATION_REPAIR_ROUNDS) {
        return {
          success: false,
          error: buildRepeatedViolationMessage(sampleMessages),
        };
      }

      emit(config, {
        type: 'violations_found',
        count: lastReport.hardViolations.length,
        sample: sampleMessages,
      });

      previousAttemptSummary = digestError(sampleMessages.join('\n'));
      board.setViolations(lastReport.hardViolations);

      violationRepairRound += 1;
      if (violationRepairRound > MAX_VIOLATION_REPAIR_ROUNDS) {
        return {
          success: false,
          error: `Repair exhausted: ${lastReport.hardViolations.length} hard violations remain.`,
        };
      }

      emit(config, {
        type: 'phase',
        phase: 'fixing',
        message: `Đang repair round ${violationRepairRound}/${MAX_VIOLATION_REPAIR_ROUNDS}`,
        iteration: violationRepairRound,
      });
      // Khi vẫn còn uncovered hard constraints, build pseudo-violations để
      // repair LLM biết rõ thiếu coverage thay vì nhận empty violations.
      // (fix bug #1 / #10)
      const repairViolations = [...lastReport.hardViolations];
      for (const id of uncoveredHardUncheckedIds) {
        const spec = deduped.find((item) => item.id === id);
        repairViolations.push({
          constraintId: id,
          kind: 'base_constraint',
          message: `Hard constraint ${id} (${spec?.kind ?? 'custom_dsl'}) chưa có code coverage. Vui lòng bổ sung block code cho ${id}: ${spec?.original ?? ''}`,
          offendingEntries: [],
        });
      }
      const repair = await runRepairTurn(pickStageConfig(config, 'repair'), {
        plan: planner.plan,
        constraintCode: latestConstraintCode,
        violations: repairViolations,
        compileOrRunError: '',
      });
      totalToolCalls += 1;
      consumeBudget(budget, repair.usageTokens, previousAttemptSummary, repair.rawResponse ?? '');
      pendingRepairPatches = repair.patches;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown local-agent error';
    emit(config, { type: 'error', message, fatal: true });
    return { success: false, error: message };
  }
}

export const __localAgentInternal = {
  buildViolationSignature,
  buildCoderExhaustedMessage,
  buildRepeatedViolationMessage,
  normalizeRoundTripMessage,
  shouldRepairExecutableFailure,
  constraintSignature,
  dedupeConstraintSpecs,
  resolveSolverRuntime,
  stableHash,
};