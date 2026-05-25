import type { DeterministicValidationReport, SolverExecutionOutput } from '@/features/timetable/ai/types'
import type { SolverProblemContext } from '@/lib/timetable-problem'

export type CheckerPromptInput = {
  normalized: SolverProblemContext
  solverResult: SolverExecutionOutput
  deterministicReport: DeterministicValidationReport
  artifactSummary?: string | null
}

export function buildCheckerSystemPrompt() {
  return [
    'Bạn là Checker Agent.',
    'Không viết code, không tự phát minh constraint.',
    'Chỉ kết luận từ input chuẩn hóa, deterministic report, solver result.',
    'Nếu base/hard fail thì verdict phải là retry.',
  ].join(' ')
}

export function buildCheckerPrompt(input: CheckerPromptInput) {
  return JSON.stringify({
    requestId: input.normalized.requestId,
    deterministicReport: input.deterministicReport,
    solverResult: input.solverResult,
    artifactSummary: input.artifactSummary ?? null,
  })
}
