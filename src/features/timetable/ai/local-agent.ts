import type {
  AgentEvent,
  AgentInputPayload,
  AIProviderConfig,
  ExecutionResult,
  LocalAgentConfig,
} from './types';
import { runCoderTurn } from './coder';
import { runReviewer } from './reviewer';
import { executeGeneratedCode } from './python-bridge';

export interface RunLocalAgentResult {
  success: boolean;
  finalResult?: any;
  error?: string;
}

export async function runLocalAgent(
  input: AgentInputPayload,
  config: LocalAgentConfig
): Promise<RunLocalAgentResult> {
  const onEvent = config.onEvent || (() => {});
  const timeoutMs = config.timeoutMs ?? 180_000;

  let attempt = 0;
  const previousAttempts: any[] = [];

  onEvent({ type: 'status', message: 'Bắt đầu Coder Agent...', iteration: 0 });

  // =========================================
  // CODER SELF-DEBUG LOOP (unbounded, only 180s per run)
  // =========================================
  let lastSuccessfulOutput: any = null;

  while (true) {
    attempt += 1;
    onEvent({ type: 'coder_started', attempt, message: `Coder attempt #${attempt}` });

    try {
      const coderResult = await runCoderTurn(config, input, previousAttempts);

      onEvent({
        type: 'coder_code_generated',
        attempt,
        codeLength: coderResult.code.length,
      });

      onEvent({ type: 'running_code', attempt });

      const execResult: ExecutionResult = await executeGeneratedCode(
        coderResult.code,
        input,
        { timeoutMs }
      );

      onEvent({ type: 'execution_result', attempt, result: execResult });

      previousAttempts.push({
        code: coderResult.code,
        result: execResult,
      });

      if (execResult.success && execResult.has_solution && execResult.result) {
        lastSuccessfulOutput = execResult.result;
        break; // Coder tự tin → chuyển sang Reviewer
      }

      // Feed error back to Coder
      onEvent({
        type: 'coder_self_fix',
        attempt,
        errorSummary: execResult.stderr || execResult.stdout || 'Unknown error',
      });
    } catch (err: any) {
      onEvent({ type: 'error', message: `Coder error: ${err.message}` });
      return { success: false, error: err.message };
    }
  }

  // =========================================
  // REVIEWER (chỉ chạy khi Coder đã có kết quả thành công)
  // =========================================
  onEvent({ type: 'reviewer_started', message: 'Đang review kết quả...' });

  const reviewerResult = await runReviewer(
    config,
    lastSuccessfulOutput,
    input.constraints
  );

  onEvent({
    type: 'reviewer_result',
    approved: reviewerResult.approved,
    feedback: reviewerResult.feedback,
  });

  if (!reviewerResult.approved) {
    // Reviewer reject → đưa feedback về cho Coder (vòng lặp mới)
    onEvent({ type: 'error', message: 'Reviewer rejected. Feeding back to Coder...' });
    // In a full implementation we would loop back here.
    // For v1 we just return the feedback.
    return {
      success: false,
      error: `Reviewer rejected: ${reviewerResult.feedback}`,
    };
  }

  onEvent({ type: 'final_result', result: lastSuccessfulOutput });

  return {
    success: true,
    finalResult: lastSuccessfulOutput,
  };
}
