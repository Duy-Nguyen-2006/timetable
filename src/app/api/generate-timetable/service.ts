import { randomUUID } from 'node:crypto'

import type { AgentEvent, SolverRequestPayload, TimetableSolveResult } from '@/features/timetable/ai/types'
import { runLowprizoDirectAgent } from '@/lib/lowprizo-direct-agent'

type ProgressEmitter = (event: AgentEvent) => void

/**
 * Main entry for timetable generation via AI agent.
 *
 * Always delegates to the modern direct agent implementation:
 * - Native OpenAI tool calling (no Pi SDK)
 * - Lowprizo devstral-latest (only model used)
 * - Strict per-request sandbox: /tmp/tack-agent-<uuid>
 * - 8 tools: read_file, write_file, edit_file, delete_file, run_python (OR-Tools + validator with rich violations), submit_solution, read_attempt_history, get_hard_constraint_progress, declare_fix_target
 * - Availability-aware bootstrap for "chỉ dạy" constraints
 * - MANDATORY LOOP + prescriptive feedback + safety nets for first-run success
 *
 * The previous orchestrated "Pi coder + checker" architecture has been fully removed:
 * - Old runPiOrchestratedLoop legacy body (~900 lines of coder/checker retry loop)
 * - buildPiCoderPrompt / buildPiCheckerPrompt + their system prompts
 * - @earendil-works/pi-coding-agent dependency
 * - All PiRuntime* attempt records, lifecycle events specific to the old split, etc.
 *
 * `engine?: 'pi-agent' | 'legacy'` (or absent) all route to the same direct implementation
 * for backward compatibility on the wire. No more dual architecture to confuse reviewers.
 */
export async function runPiOrchestratedLoop(
  input: SolverRequestPayload,
  apiKey: string,
  model: string,
  emit?: ProgressEmitter,
  requestId = randomUUID(),
): Promise<TimetableSolveResult> {
  // Always use the direct native-tools agent. The old orchestrated path is gone.
  return runLowprizoDirectAgent(input, {
    apiKey,
    baseURL: input.baseURL,
    model: input.model || model,
    onProgress: emit ? (e) => emit(e as any) : undefined,
    debug: !!input.debug,
  })
}
