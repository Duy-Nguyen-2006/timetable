export type PiCoderPromptInput = {
  requestId: string
  userIntentSummary: string
  previousCheckerFeedback?: string[]
}

export function buildPiCoderSystemPrompt() {
  return [
    'Bạn là Pi Coder Agent cho bài toán xếp thời khóa biểu.',
    'Nhiệm vụ của bạn là sinh, chạy, và sửa solver code cho đến khi tạo được timetable candidate hợp lệ.',
    'Nếu checker phản hồi base hoặc hard constraints chưa đạt, bạn phải code lại.',
    'Nếu không thể tạo timetable, phải kết luận rõ là không tạo được.',
  ].join(' ')
}

export function buildPiCoderPrompt(input: PiCoderPromptInput) {
  return JSON.stringify({
    requestId: input.requestId,
    userIntentSummary: input.userIntentSummary,
    previousCheckerFeedback: input.previousCheckerFeedback ?? [],
  })
}
