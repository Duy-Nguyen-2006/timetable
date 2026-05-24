import type { InputPayload } from '@/lib/timetable-prompt'
import type { GeneratedSolverArtifact, SolverExecutionOutput, VerifierAssessment } from '@/features/timetable/ai/types'

type SolverAuthorPromptInput = {
  payload: InputPayload
  baseSolverCode: string
  previousArtifact?: GeneratedSolverArtifact | null
  previousRun?: SolverExecutionOutput | null
  previousVerification?: VerifierAssessment | null
  attempt: number
  maxAttempts: number
}

type SolverVerifyPromptInput = {
  payload: InputPayload
  artifact: GeneratedSolverArtifact
  runOutput: SolverExecutionOutput
}

function summarizePayload(payload: InputPayload) {
  const teachers = [...new Set(payload.assignments.map((a) => a.teacherLabel))]
  const subjects = [...new Set(payload.assignments.map((a) => a.subjectLabel))]
  const classes = [...new Set(payload.assignments.map((a) => a.classLabel))]
  const days = [...new Map(payload.slots.map((s) => [s.dayId, { id: s.dayId, label: s.dayLabel }])).values()]
  const sessions = [...new Map(payload.slots.map((s) => [s.sessionId, { id: s.sessionId, label: s.sessionLabel }])).values()]
  const periods = [...new Set(payload.slots.map((s) => s.period))].sort((a, b) => a - b)

  return {
    slotCount: payload.slots.length,
    assignmentCount: payload.assignments.length,
    teachers,
    subjects,
    classes,
    days,
    sessions,
    periods,
    hardConstraints: payload.hardConstraints,
    softConstraints: payload.softConstraints,
  }
}

export const SOLVER_AUTHOR_SYSTEM_PROMPT = `Bạn là Agent 1 chuyên viết code Python OR-Tools cho bài toán xếp thời khóa biểu.

MỤC TIÊU:
- Dựa trên payload và solver base có sẵn, viết RA MÃ PYTHON HOÀN CHỈNH có thể chạy được.
- Bạn không trả JSON constraint snippets.
- Bạn chỉ trả về JSON object có các field:
  - solverCode: string, là toàn bộ nội dung file Python hoàn chỉnh.
  - entrypoint: string, tên hàm solve chính. Mặc định là solve_timetable.
  - summary: string, mô tả ngắn thay đổi.
  - assumptions: string[], các giả định nếu có.

RÀNG BUỘC KỸ THUẬT:
- File Python phải tự chứa đầy đủ code solve.
- Hàm entrypoint phải nhận một biến problem kiểu dict và trả JSON-serializable dict.
- Không in log ngoài kết quả cuối nếu file được dùng bởi runner.
- Ưu tiên sửa dựa trên base solver code hiện có thay vì viết lại vô tổ chức.
- Nếu có previousRun hoặc previousVerification, phải dùng chúng để sửa code.
- Không trả markdown.`

export const SOLVER_VERIFY_SYSTEM_PROMPT = `Bạn là Agent 2 chuyên verify output của solver thời khóa biểu.

MỤC TIÊU:
- Đọc yêu cầu gốc, code solver đã generate, và output chạy thực tế.
- Quyết định một trong ba verdict:
  - solved: output hợp lệ và thỏa yêu cầu ở mức chấp nhận được.
  - retryable: output chưa ổn, cần Agent 1 sửa code rồi chạy lại.
  - infeasible: có đủ bằng chứng rằng bộ ràng buộc hiện tại không thể giải được.

Bạn chỉ trả JSON object với các field:
- verdict: "solved" | "retryable" | "infeasible"
- confidence: number từ 0 đến 1
- rationale: string tiếng Việt ngắn gọn
- unmetRequirements: string[]
- repairInstructions: string[]
- confidentlyInfeasible: boolean

QUY TẮC:
- Nếu chỉ là lỗi code/runtime hoặc lịch chưa thỏa đủ yêu cầu thì verdict = retryable.
- Chỉ chọn infeasible nếu bằng chứng mạnh từ output solver/diagnostics.
- Không trả markdown.`

export function buildSolverAuthorUserMessage(input: SolverAuthorPromptInput): string {
  return JSON.stringify({
    task: 'Viết hoặc sửa full solver code cho bài toán xếp thời khóa biểu',
    attempt: input.attempt,
    maxAttempts: input.maxAttempts,
    payloadSummary: summarizePayload(input.payload),
    payload: input.payload,
    baseSolverCode: input.baseSolverCode,
    previousArtifact: input.previousArtifact
      ? {
          entrypoint: input.previousArtifact.entrypoint,
          summary: input.previousArtifact.summary,
          assumptions: input.previousArtifact.assumptions,
          solverCode: input.previousArtifact.solverCode,
        }
      : null,
    previousRun: input.previousRun,
    previousVerification: input.previousVerification,
    requirement: [
      'Dùng base constraints chắc chắn đúng làm nền.',
      'Tự bổ sung code để xử lý hard/soft constraints từ payload.',
      'Kết quả trả về phải cùng schema với solver hiện tại: status, message, diagnostics, cells, iisConstraintIds, executionErrors, validationErrors, violations, solverStats.',
      'Nếu không solve được thì trả status hợp lệ và diagnostics có ý nghĩa.',
    ],
  })
}

export function buildSolverVerifyUserMessage(input: SolverVerifyPromptInput): string {
  return JSON.stringify({
    task: 'Verify output solver timetable',
    payloadSummary: summarizePayload(input.payload),
    payload: input.payload,
    generatedSolver: {
      entrypoint: input.artifact.entrypoint,
      summary: input.artifact.summary,
      assumptions: input.artifact.assumptions,
      solverCode: input.artifact.solverCode,
    },
    runOutput: input.runOutput,
    requirement: [
      'Đối chiếu hard constraints và soft constraints gốc.',
      'Nếu output chưa đáng tin hoặc còn sai, yêu cầu coder sửa tiếp.',
      'Nếu output đã ổn thì verdict solved.',
      'Nếu có bằng chứng mạnh là vô nghiệm thì verdict infeasible.',
    ],
  })
}
