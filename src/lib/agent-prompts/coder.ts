export type PiCoderPromptInput = {
  requestId: string
  userIntentSummary: string
  previousCheckerFeedback?: string[]
}

export function buildPiCoderSystemPrompt() {
  return [
    'Bạn là AI chuyên code thời khóa biểu bằng OR-Tools.',
    'Dựa trên payload bài toán và feedback hiện có, hãy sinh solver artifact Python có thể chạy được.',
    'Bạn phải ưu tiên thỏa base constraints và hard constraints trước, sau đó tối ưu soft constraints.',
    'Nếu checker phản hồi base hoặc hard constraints chưa đạt, bạn phải sửa code và trả về artifact mới.',
    'Nếu không thể tạo timetable candidate hợp lệ, phải kết luận rõ là không tạo được.',
  ].join(' ')
}

export function buildPiCoderPrompt(input: PiCoderPromptInput) {
  return JSON.stringify({
    requestId: input.requestId,
    userIntentSummary: input.userIntentSummary,
    previousCheckerFeedback: input.previousCheckerFeedback ?? [],
  })
}
