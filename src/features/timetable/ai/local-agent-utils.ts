import os from 'node:os';
import type { TokenBudgetGuard } from './budget-guard';
import type { ConstraintSpec } from './constraint-spec';
import type { LocalAgentConfig, LocalAgentFinalResult } from './types';
import { MAX_RUNTIME_REPAIR_ROUNDS } from './local-agent-limits';

export type SolverRuntimeConfig = { timeoutMs: number; workers: number };

export function emit(
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

export function pickStageConfig(
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

export function getAvailableCpuCount(): number {
  if (typeof navigator !== 'undefined' && Number(navigator.hardwareConcurrency) > 0) {
    return Number(navigator.hardwareConcurrency);
  }
  return os.cpus().length || 2;
}

export function resolveSolverRuntime(config: LocalAgentConfig): SolverRuntimeConfig {
  const cpuCount = getAvailableCpuCount();
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

export function buildFinalMessage(status: string | undefined): string {
  if (status === 'optimal') return 'Đã tạo thời khóa biểu tối ưu.';
  if (status === 'feasible') return 'Đã tìm được lịch hợp lệ, nhưng chưa chứng minh là tối ưu.';
  return 'Đã tạo thời khóa biểu thành công.';
}

export function consumeBudget(
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

export function buildViolationSignature(
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

export function normalizeRoundTripMessage(message: string): string {
  return message
    .replace(/asg_\d+/g, 'ASG')
    .replace(/\b\d{3,}\b/g, 'N')
    .trim();
}

export function buildCoderExhaustedMessage(lastFailureSummary: string): string {
  const detail = lastFailureSummary.trim();
  if (!detail) return 'Coder could not produce an executable schedule.';
  return `Coder could not produce an executable schedule. Last failure: ${detail}`;
}

export function buildRepeatedViolationMessage(sampleMessages: string[]): string {
  const detail = sampleMessages.filter(Boolean).slice(0, 3).join(' | ');
  if (!detail) {
    return 'Không tạo được thời khóa biểu sau khi agent sửa lặp lại cùng một lỗi.';
  }
  return `Không tạo được thời khóa biểu sau khi agent sửa lặp lại cùng một lỗi: ${detail}`;
}

export function shouldRepairExecutableFailure(
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

export function sortObjectDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectDeep);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortObjectDeep(item)])
  );
}

export function stableHash(value: unknown): string {
  return JSON.stringify(sortObjectDeep(value));
}

export function constraintSignature(spec: ConstraintSpec): string {
  return JSON.stringify({
    kind: spec.kind,
    severity: spec.severity,
    params: sortObjectDeep(spec.params),
    weight: spec.weight ?? null,
    pythonPredicate: spec.pythonPredicate ?? null,
  });
}

export function dedupeConstraintSpecs(specs: ConstraintSpec[]): ConstraintSpec[] {
  const seen = new Set<string>();
  return specs.filter((spec) => {
    const sig = constraintSignature(spec);
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}
