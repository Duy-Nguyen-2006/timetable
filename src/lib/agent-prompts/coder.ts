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
    'Nếu solver template chuẩn đã hỗ trợ constraint thì phải giữ nguyên cách encode đó, không thay bằng heuristic yếu hơn.',
    'Base constraints là bắt buộc, hard constraints phải được enforce, soft constraints phải encode thành objective.',
    'Không được bỏ qua hard constraint chỉ vì đã có nghiệm hợp lệ theo base constraints.',
    'Khi gặp constraint đã parse được trong solverProblem.parsedHard hoặc solverProblem.parsedSoft, phải đọc kind + field cụ thể và encode trực tiếp bằng logic quyết định/penalty tương ứng.',
    'Đặc biệt với teacher_block_days, teacher_block_periods, teacher_block_sessions, teacher_block_day_period, teacher_block_session_day, teacher_allow_only_days, teacher_allow_only_sessions, class_block_days, subject_block_periods, subject_pin_periods, subject_only_sessions thì phải map trực tiếp từ parsed constraint sang slot filtering hoặc forbidden assignments.',
    'Nếu checkerFeedback nêu constraint nào fail thì phải ưu tiên sửa đúng constraint đó trước, không trả lại artifact gần như cũ.',
    'Output phải là Python source code hợp lệ, không kèm markdown fence.',
  ].join(' ')
}

export function buildCoderPrompt(input: CoderPromptInput) {
  return JSON.stringify({
    requestId: input.normalized.requestId,
    baseTemplatePath: input.baseTemplatePath,
    solverProblem: input.normalized.problem,
    codingDirectives: {
      preserveCanonicalTemplateBehavior: true,
      preferDeterministicConstraintEncoding: true,
      rejectHeuristicOnlyHandlingForParsedHardConstraints: true,
      prioritizeCheckerFeedbackBeforeOtherRefactors: true,
    },
    previousDiagnostics: input.previousDiagnostics ?? [],
    checkerFeedback: input.checkerFeedback ?? [],
    previousArtifactSummary: input.previousArtifactSummary ?? null,
  })
}
