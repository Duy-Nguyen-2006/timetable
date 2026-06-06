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
import { staticValidateCode } from './static-code-validator';
import { runTranslatorTurn } from './translator';
import type { AgentInputPayload, LocalAgentConfig, LocalAgentFinalResult } from './types';
import { WorkspaceBoard } from './workspace';
import {
  MAX_CODER_RETRIES,
  MAX_RUNTIME_REPAIR_ROUNDS,
  MAX_TOTAL_TOOL_CALLS,
  MAX_VIOLATION_REPAIR_ROUNDS,
  TOKEN_CAP_PER_RUN,
} from './local-agent-limits';
import { SOLVER_ENCODABLE_KINDS } from './constraint-registry';
import { getCachedStage } from './stage-cache';
import { PIPELINE_VERSIONS } from './pipeline-versions';
import {
  buildCoderExhaustedMessage,
  buildExhaustionError,
  buildFinalMessage,
  buildRepeatedViolationMessage,
  buildViolationSignature,
  consumeBudget,
  constraintSignature,
  dedupeConstraintSpecs,
  emit,
  pickStageConfig,
  resolveSolverRuntime,
  shouldRepairExecutableFailure,
  stableHash,
  hashKey,
  normalizeRoundTripMessage,
  usedLlmTokens,
} from './local-agent-utils';

export interface RunLocalAgentOptions {
  /** Bỏ qua translator khi đã có specs đã xác nhận. */
  preTranslatedConstraintSpecs?: ConstraintSpec[];
}

export interface RunLocalAgentResult {
  success: boolean;
  finalResult?: LocalAgentFinalResult;
  error?: string;
}

export async function runLocalAgent(
  input: AgentInputPayload,
  config: LocalAgentConfig,
  options?: RunLocalAgentOptions
): Promise<RunLocalAgentResult> {
  // Cross-tier (VAL-CROSS-012): missing code_executor binary must surface a Vietnamese
  // error and prevent the solver from running silently.
  if (typeof process !== 'undefined' && process.versions?.node) {
    const candidates = [
      'python-dist/linux/code_executor',
      'python-dist/macos/code_executor',
      'python-dist/win32/code_executor.exe',
      'python-dist/code_executor',
      'python-dist/code_executor.exe',
    ];
    const fs = await import('node:fs');
    const path = await import('node:path');
    const repoRoot = process.cwd();
    const found = candidates.some((rel) => {
      try {
        return fs.existsSync(path.join(repoRoot, rel));
      } catch {
        return false;
      }
    });
    if (!found) {
      const msg = 'đã có lỗi: code_executor binary missing. Chạy `npm run build:executor` để tạo lại.';
      emit(config, { type: 'status', message: msg, iteration: 0, maxIterations: MAX_CODER_RETRIES });
      return { success: false, error: msg };
    }
  }

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

    let deduped: ConstraintSpec[];
    const preTranslated = options?.preTranslatedConstraintSpecs;
    if (preTranslated?.length) {
      deduped = dedupeConstraintSpecs(preTranslated);
      emit(config, {
        type: 'stage_completed',
        stage: 'translator',
        message: `Dùng ${deduped.length} ràng buộc đã xác nhận (bỏ qua translator)`,
      });
    } else {
      const translatorCacheKey = `translator:${hashKey({
        model: pickStageConfig(config, 'translator').model,
        promptVersion: PIPELINE_VERSIONS.prompt.translator,
        registryVersion: PIPELINE_VERSIONS.constraintRegistry,
        constraintTexts: input.constraints.map((constraint) => ({
          type: constraint.type,
          text: constraint.text,
          weight: constraint.weight ?? null,
        })),
        contextLabels: {
          teachers: [...new Set(input.assignments.map((assignment) => assignment.teacher.label))],
          subjects: [...new Set(input.assignments.map((assignment) => assignment.subject.label))],
          classes: [...new Set(input.assignments.map((assignment) => assignment.class.label))],
        },
        days: input.days,
        sessions: input.sessions,
        periodCounts: input.periodCounts,
        deletedPeriods: input.deletedPeriods,
      })}`;
      const translatorCached = await getCachedStage(translatorCacheKey, () =>
        runTranslatorTurn(pickStageConfig(config, 'translator'), input)
      );
      const translator = translatorCached.value;
      consumeBudget(
        budget,
        translatorCached.hit ? 0 : translator.usageTokens,
        JSON.stringify(input.constraints),
        translator.rawResponse ?? ''
      );
      if (!translatorCached.hit && usedLlmTokens(translator)) totalToolCalls += 1;
      deduped = dedupeConstraintSpecs(translator.constraintSpecs);
      emit(config, {
        type: 'stage_completed',
        stage: 'translator',
        message: `Translator done (${translator.constraintSpecs.length} specs, ${deduped.length} after dedupe)`,
      });
    }
    const unsupportedHardSpecs = deduped.filter(
      (spec) => spec.severity === 'hard' && spec.kind !== 'custom_dsl' && !SOLVER_ENCODABLE_KINDS.has(spec.kind)
    );
    if (unsupportedHardSpecs.length > 0) {
      const preview = unsupportedHardSpecs
        .slice(0, 5)
        .map((spec) => `${spec.kind} (${spec.id})`)
        .join(', ');
      const msg = `Không thể chạy solver: ${unsupportedHardSpecs.length} ràng buộc bắt buộc chưa được mã hoá CP-SAT (${preview}).`;
      emit(config, { type: 'error', message: msg, fatal: true });
      return { success: false, error: msg };
    }

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
      `planner:${stableHash({
        model: pickStageConfig(config, 'planner').model,
        promptVersion: PIPELINE_VERSIONS.prompt.planner,
        registryVersion: PIPELINE_VERSIONS.constraintRegistry,
        input: plannerInput,
      })}`,
      () => runPlannerTurn(pickStageConfig(config, 'planner'), plannerInput)
    );
    const planner = plannerCached.value;
    consumeBudget(budget, plannerCached.hit ? 0 : planner.usageTokens, JSON.stringify(planner.plan), planner.rawResponse ?? '');
    if (!plannerCached.hit && usedLlmTokens(planner)) totalToolCalls += 1;
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
    let lastExecStatus: string | undefined;

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
              // Key coder cache on the things that actually change the LLM output:
              //   - model, prompt/template/registry versions
              //   - only custom_dsl hard specs (built-in constraints are zero-LLM)
              //   - plan
              // DO NOT include the full skeleton text in the key (was 1269 lines,
              // making the cache key multi-KB and unlikely to ever collide). The
              // template version is already a sufficient fingerprint.
              const coderStageConfig = pickStageConfig(config, 'coder');
              const customHardSpecs = compressed.constraints.filter(
                (spec) => spec.kind === 'custom_dsl' && spec.severity === 'hard'
              );
              const cacheKey = `coder:${hashKey({
                model: coderStageConfig.model,
                promptVersion: PIPELINE_VERSIONS.prompt.coder,
                templateVersion: PIPELINE_VERSIONS.solverTemplate,
                registryVersion: PIPELINE_VERSIONS.constraintRegistry,
                customHardSpecs,
                plan: planner.plan,
              })}`;
              const cached = await getCachedStage(
                cacheKey,
                () => runCoderTurn(coderStageConfig, coderInput)
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
          if (!coderCacheHit && usedLlmTokens(coder)) totalToolCalls += 1;
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

        const staticErrors = staticValidateCode(latestConstraintCode);
        if (staticErrors.length > 0) {
          previousAttemptSummary = `Static validation failed: ${staticErrors.join('; ')}`;
          board.setErrorDigest(previousAttemptSummary);
          coderRetry += 1;
          emit(config, {
            type: 'error',
            message: `Static validation failed at attempt ${attempt}: ${previousAttemptSummary}`,
            fatal: false,
          });
          continue;
        }

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

        lastExecStatus = execResult.status;

        if (!execResult.ok || !execResult.resultData) {
          const codeSnippet = latestConstraintCode.split('\n').slice(0, 50).join('\n');
          previousAttemptSummary = [
            `Error: ${execResult.errorDigest || 'Solver execution failed.'}`,
            `Code that failed (first 50 lines):`,
            codeSnippet,
            `---`,
            `Fix the error above. Do NOT use variables outside the allowed set.`,
            `Allowed: model, slots, data, assignments, days, periods, periods_by_day, constraints, custom_specs, schedule`,
          ].join('\n');
          board.setErrorDigest(execResult.errorDigest || 'Solver execution failed.');
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
              error: buildExhaustionError(lastExecStatus, previousAttemptSummary),
            };
          }

          pendingRepairPatches = repair.patches;
          continue;
        }

        return {
          success: false,
          error: buildExhaustionError(lastExecStatus, previousAttemptSummary),
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