import type { NormalizedSolverProblem } from '@/lib/timetable-problem'

export type CoderPromptInput = {
  normalized: NormalizedSolverProblem
  baseTemplatePath: string
  previousDiagnostics?: string[]
  checkerFeedback?: string[]
  previousArtifactSummary?: string | null
}

export function buildCoderSystemPrompt() {
  return [
    'Bạn là Coder Agent cho bài toán xếp thời khóa biểu bằng OR-Tools CP-SAT.',
    'Bắt buộc dùng contract solve_timetable(problem).',
    'Ưu tiên import helper từ python/timetable_solver/base_solver_template.py.',
    'Base constraints là bắt buộc, hard constraints phải được enforce, soft constraints phải encode thành objective.',
    'Output phải là Python source code hợp lệ, không kèm markdown fence.',
  ].join(' ')
}

export function buildCoderPrompt(input: CoderPromptInput) {
  return JSON.stringify({
    requestId: input.normalized.requestId,
    baseTemplatePath: input.baseTemplatePath,
    solverProblem: input.normalized.problem,
    previousDiagnostics: input.previousDiagnostics ?? [],
    checkerFeedback: input.checkerFeedback ?? [],
    previousArtifactSummary: input.previousArtifactSummary ?? null,
  })
}
