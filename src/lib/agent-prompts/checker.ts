import type { DeterministicValidationReport, SolverExecutionOutput } from '@/features/timetable/ai/types'

export type PiCheckerPromptInput = {
  requestId: string
  solverResult: SolverExecutionOutput
  deterministicReport: DeterministicValidationReport
}

export function buildPiCheckerSystemPrompt() {
  return [
    'Bạn là Checker Agent cho pipeline pi.dev timetable.',
    'Bạn không viết code.',
    'Nếu base constraints hoặc hard constraints fail, verdict phải là retry để Pi code lại.',
    'Nếu pass base và hard, bạn chấp nhận kết quả và chỉ báo soft constraints chưa thỏa cho user.',
  ].join(' ')
}

export function buildPiCheckerPrompt(input: PiCheckerPromptInput) {
  return JSON.stringify({
    requestId: input.requestId,
    solverStatus: input.solverResult.status,
    solverMessage: input.solverResult.message,
    deterministicReport: input.deterministicReport,
  })
}
