import { TokenBudgetGuard } from './budget-guard';
import { runCoderTurn } from './coder';
import { verifyCpSatRoundTrip } from './cp-sat-roundtrip';
import { validateSchedule } from './deterministic-validator';
import { compressPayload, digestError } from './input-compressor';
import { runPlannerTurn } from './planner';
import { executeGeneratedCode } from './python-bridge';
import { applyRepairPatches, runRepairTurn } from './repair';
import { injectConstraintCode, loadSolverSkeleton, syntaxCheckPython } from './skeleton-injector';
import { runTranslatorTurn } from './translator';
import type { AgentInputPayload, LocalAgentConfig, LocalAgentFinalResult } from './types';
import { WorkspaceBoard } from './workspace';

export interface RunLocalAgentResult {
  success: boolean;
  finalResult?: LocalAgentFinalResult;
  error?: string;
}

const MAX_CODER_RETRIES = 3;
const MAX_REPAIR_ROUNDS = 2;
const MAX_TOTAL_TOOL_CALLS = 15;
const TOKEN_CAP_PER_RUN = 80_000;

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

export async function runLocalAgent(
  input: AgentInputPayload,
  config: LocalAgentConfig
): Promise<RunLocalAgentResult> {
  const timeoutMs = config.timeoutMs ?? 180_000;
  const startedAt = Date.now();
  const deadlineAt = startedAt + timeoutMs;
  const budget = new TokenBudgetGuard(TOKEN_CAP_PER_RUN);
  const board = new WorkspaceBoard();

  let totalToolCalls = 0;
  try {
    emit(config, { type: 'status', message: 'Khởi tạo pipeline v2...', iteration: 0, maxIterations: MAX_CODER_RETRIES });
    emit(config, { type: 'phase', phase: 'translator', message: 'Đang dịch constraints', iteration: 0 });
    emit(config, { type: 'stage_started', stage: 'translator', message: 'Translator started' });

    const translator = await runTranslatorTurn(pickStageConfig(config, 'translator'), input);
    consumeBudget(budget, translator.usageTokens, JSON.stringify(input.constraints), translator.rawResponse ?? '');
    totalToolCalls += 1;
    emit(config, { type: 'stage_completed', stage: 'translator', message: `Translator done (${translator.constraintSpecs.length} specs)` });

    const compressed = compressPayload(input, translator.constraintSpecs);
    const solverConstraintSpecs = translator.constraintSpecs.filter(
      (spec) => !(spec.kind === 'weekly_periods_exact' && spec.tags?.includes('auto_base'))
    );
    board.setConstraintSpecs(translator.constraintSpecs);
    board.setDataset(compressed);

    emit(config, { type: 'phase', phase: 'planner', message: 'Đang tạo kế hoạch solver', iteration: 0 });
    emit(config, { type: 'stage_started', stage: 'planner', message: 'Planner started' });
    const planner = await runPlannerTurn(pickStageConfig(config, 'planner'), {
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
      constraintSpecs: translator.constraintSpecs,
    });
    consumeBudget(budget, planner.usageTokens, JSON.stringify(planner.plan), planner.rawResponse ?? '');
    totalToolCalls += 1;
    board.setPlan(planner.plan);
    emit(config, { type: 'stage_completed', stage: 'planner', message: 'Planner done' });

    const skeleton = await loadSolverSkeleton();
    let previousAttemptSummary = '';

    let repairRound = 0;
    let previousViolationSignature = '';
    let repeatedViolationCount = 0;
    let latestConstraintCode = '';
    let pendingRepairPatches: Array<{ oldStr: string; newStr: string; reason: string }> | null = null;

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
          latestConstraintCode = applyRepairPatches(latestConstraintCode, pendingRepairPatches);
          pendingRepairPatches = null;
          emit(config, {
            type: 'stage_completed',
            stage: 'coder',
            attempt,
            message: 'Applied repair patches from previous round',
          });
        } else {
          emit(config, { type: 'stage_started', stage: 'coder', attempt, message: 'Coder started' });
          const coder = await runCoderTurn(pickStageConfig(config, 'coder'), {
            dataset: compressed,
            plan: planner.plan,
            previousAttemptSummary,
          });
          totalToolCalls += 1;
          consumeBudget(
            budget,
            coder.usageTokens,
            JSON.stringify(compressed.datasetDigest),
            coder.rawResponse ?? ''
          );
          latestConstraintCode = coder.constraint_code;
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

        board.setLatestGeneratedSolver(injected.solverCode);
        emit(config, { type: 'phase', phase: 'running', message: 'Đang chạy solver', iteration: attempt });

        const executePayload = {
          classes: compressed.classes,
          days: compressed.days,
          periodsByDay: compressed.periodsByDay,
          periods: compressed.periods,
          assignments: compressed.assignments,
          constraints: solverConstraintSpecs,
        };

        const execResult = await executeGeneratedCode(injected.solverCode, executePayload, { timeoutMs });
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
        const report = validateSchedule(execResult.resultData.schedule, translator.constraintSpecs, {
          assignments: compressed.assignments,
        });
        const roundTrip = verifyCpSatRoundTrip(execResult.resultData.schedule, compressed.assignments, {
          days: compressed.days,
          periodsByDay: compressed.periodsByDay,
          periods: compressed.periods,
        });

        if (report.hardConstraintPass && report.baseConstraintPass && roundTrip.ok) {
          const finalResult = {
            ...execResult.resultData,
            status: 'solved' as const,
            message: 'Đã tạo thời khóa biểu thành công.',
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
        break;
      }

      if (!lastReport || !lastRoundTrip) {
        return {
          success: false,
          error: 'Coder gave up before producing an executable schedule.',
        };
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
      if (repeatedViolationCount >= 2) {
        throw new Error('Stopped early: stuck detection triggered (same hard violations repeated).');
      }

      const sampleMessages = lastReport.hardViolations.slice(0, 3).map((violation) => violation.message);
      if (!lastRoundTrip.ok) {
        sampleMessages.unshift(lastRoundTrip.message);
      }
      emit(config, {
        type: 'violations_found',
        count: lastReport.hardViolations.length,
        sample: sampleMessages,
      });

      previousAttemptSummary = digestError(sampleMessages.join('\n'));
      board.setViolations(lastReport.hardViolations);

      repairRound += 1;
      if (repairRound > MAX_REPAIR_ROUNDS) {
        return {
          success: false,
          error: `Repair exhausted: ${lastReport.hardViolations.length} hard violations remain.`,
        };
      }

      emit(config, {
        type: 'phase',
        phase: 'fixing',
        message: `Đang repair round ${repairRound}/${MAX_REPAIR_ROUNDS}`,
        iteration: repairRound,
      });
      const repair = await runRepairTurn(pickStageConfig(config, 'repair'), {
        plan: planner.plan,
        constraintCode: latestConstraintCode,
        violations: lastReport.hardViolations,
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
  normalizeRoundTripMessage,
};
