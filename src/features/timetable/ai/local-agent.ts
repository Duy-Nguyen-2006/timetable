import { runDeterministicSolver } from './deterministic-solver';
import { getDeterministicEligibility } from './deterministic-solver-eligibility';
import type { ConstraintSpec } from './constraint-spec';
import type { AgentInputPayload, LocalAgentConfig, LocalAgentFinalResult } from './types';
import {
  dedupeConstraintSpecs,
  emit,
  resolveSolverRuntime,
  stableHash,
} from './local-agent-utils';

export interface RunLocalAgentOptions {
  /** Specs đã xác nhận (bỏ qua translator LLM). */
  preTranslatedConstraintSpecs?: ConstraintSpec[];
}

export interface RunLocalAgentResult {
  success: boolean;
  finalResult?: LocalAgentFinalResult;
  error?: string;
}

/**
 * Default solve path: chỉ chạy deterministic solver trên specs đã xác nhận.
 *
 * Pipeline AI codegen (planner/coder/repair) đã bị gỡ — batch specs không
 * eligible cho deterministic solver sẽ fail-closed thay vì âm thầm rơi
 * vào nhánh cũ.
 */
export async function runLocalAgent(
  input: AgentInputPayload,
  config: LocalAgentConfig,
  options?: RunLocalAgentOptions
): Promise<RunLocalAgentResult> {
  // Cross-tier (VAL-CROSS-012): missing code_executor binary must surface a Vietnamese
  // error and prevent the solver from running silently.
  if (typeof process !== 'undefined' && process.versions?.node) {
    const candidates = [
      'linux/code_executor',
      'macos/code_executor',
      'win32/code_executor.exe',
      'code_executor',
      'code_executor.exe',
    ];
    const fs = await import('node:fs');
    const path = await import('node:path');
    const found = candidates.some((rel) => {
      try {
        return fs.existsSync(path.join(process.cwd(), 'python-dist', rel));
      } catch {
        return false;
      }
    });
    if (!found) {
      const msg = 'đã có lỗi: code_executor binary missing. Chạy `npm run build:executor` để tạo lại.';
      emit(config, { type: 'status', message: msg, iteration: 0, maxIterations: 1 });
      return { success: false, error: msg };
    }
  }

  try {
    emit(config, { type: 'status', message: 'Khởi tạo pipeline v2...', iteration: 0, maxIterations: 1 });
    emit(config, { type: 'phase', phase: 'translator', message: 'Dùng confirmed specs, bỏ qua translator LLM', iteration: 0 });

    const preTranslated = options?.preTranslatedConstraintSpecs;
    if (!preTranslated?.length) {
      const msg = 'Cần xác nhận (confirm) constraints trước khi chạy solver.';
      emit(config, { type: 'error', message: msg, fatal: true });
      return { success: false, error: msg };
    }
    const deduped = dedupeConstraintSpecs(preTranslated);
    const eligibility = getDeterministicEligibility(deduped);
    if (!eligibility.ok) {
      emit(config, { type: 'error', message: eligibility.reason, fatal: true });
      return { success: false, error: eligibility.reason };
    }
    return runDeterministicSolver(input, config, {
      constraintSpecs: deduped,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown local-agent error';
    emit(config, { type: 'error', message, fatal: true });
    return { success: false, error: message };
  }
}

/**
 * Re-export helpers used by workspace storage, run cache, và test nội bộ.
 * Một số helper còn sót từ pipeline AI codegen cũ (buildViolationSignature,
 * shouldRepairExecutableFailure, …) đã được dọn.
 */
export const __localAgentInternal = {
  dedupeConstraintSpecs,
  resolveSolverRuntime,
  stableHash,
};
