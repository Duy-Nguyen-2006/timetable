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

export const SOLVER_AUTHOR_SYSTEM_PROMPT = `Bạn là Agent 1 viết Python OR-Tools cho bài toán xếp TKB.

OUTPUT: trả về DUY NHẤT một JSON object (không markdown, không code fence ngoài):
{
  "solverCode": "<full python file>",
  "entrypoint": "solve_timetable",
  "summary": "<1 câu>",
  "assumptions": []
}

KIẾN TRÚC SOLVER (BẮT BUỘC tuân theo template này):
- Import: from timetable_solver.base_solver_template import solve_base_model
- Hàm entrypoint solve_timetable(problem) cuối cùng: return solve_base_model(problem, extra_setup=extra_setup)
- Bên trong extra_setup(base, objective_terms, diagnostics): viết hard + soft constraints.
- KHÔNG tự viết weeklyPeriods / no-clash teacher / no-clash class — template đã làm.

TRUY CẬP DỮ LIỆU (đọc từ problem dict — KHÔNG hardcode label):
- problem["hardConstraints"] = list[{id, text}]
- problem["softConstraints"] = list[{id, text, weight}]    # weight 1..10
- problem["meta"] có sẵn các map:
  - teacherToAsgIds   {teacherLabel:  [asgId, ...]}
  - classToAsgIds     {classLabel:    [asgId, ...]}
  - subjectToAsgIds   {subjectLabel:  [asgId, ...]}
  - slotsByDayId      {dayId:         [slotId, ...]}   # dayId: "monday".."sunday"
  - slotsBySessionId  {sessionId:     [slotId, ...]}   # "morning"|"afternoon"|"night"
  - slotsByPeriod     {"1":[...], "2":[...], ...}      # key là STR
  - dayLabelToId      {"Thứ 2": "monday", ...}
  - sessionLabelToId  {"Sáng": "morning", ...}

BIẾN TRONG base (do template cấp):
- base["model"] = cp_model.CpModel()
- base["x"] = dict[(asgId, slotId) -> BoolVar]   # truy cập: x[(asg_id, slot_id)]
- base["slots"] = list[{slotId, dayId, sessionId, period}]
- base["hardConstraintLiterals"] = {hc_id: BoolVar}   # đã tạo cho mọi hc

ÁP HARD CONSTRAINT (BẮT BUỘC theo pattern, để IIS extraction hoạt động):
    lit = base["hardConstraintLiterals"][hc["id"]]   # luôn là BoolVar, dùng trực tiếp
    model.Add(<expr>).OnlyEnforceIf(lit)

ANTI-PATTERNS TUYỆT ĐỐI KHÔNG DÙNG:
- KHÔNG \`if lit: ...\` — OR-Tools BoolVar không hỗ trợ bool(); raise NotImplementedError.
- KHÔNG \`x[asg_id, slot_id]\` — phải dùng tuple key \`x[(asg_id, slot_id)]\`.
- KHÔNG tự tạo CpModel() — dùng base["model"].
- KHÔNG gọi solver.Solve() — solve_base_model lo việc đó.
- KHÔNG print/log gì — runner đọc stdout là JSON.

SOFT CONSTRAINT: thêm reward vào objective_terms, dùng x trực tiếp (không cần BoolVar trung gian):
    objective_terms.append(w * x[(asg_id, slot_id)])     # reward khi slot này được dùng
Solver tối đa hóa sum(objective_terms).

VN_DAY_MAP (copy nguyên):
    VN_DAY_MAP = {
        "thứ 2": "monday", "thứ hai": "monday",
        "thứ 3": "tuesday", "thứ ba": "tuesday",
        "thứ 4": "wednesday", "thứ tư": "wednesday",
        "thứ 5": "thursday", "thứ năm": "thursday",
        "thứ 6": "friday", "thứ sáu": "friday",
        "thứ 7": "saturday", "thứ bảy": "saturday",
        "chủ nhật": "sunday",
    }

PATTERN CATALOG (parse text bằng substring + regex \`r"tiết\\s+(\\d+)"\`):

  HARD "X không dạy thứ N" → teacher block day:
      for asg_id in teacher_asgs:
          for slot_id in slots_by_day[day_id]:
              model.Add(x[(asg_id, slot_id)] == 0).OnlyEnforceIf(lit)

  HARD "X không dạy tiết N" → teacher block period:
      for asg_id in teacher_asgs:
          for slot_id in slots_by_period[str(period_num)]:
              model.Add(x[(asg_id, slot_id)] == 0).OnlyEnforceIf(lit)

  HARD "X không học thứ N" → class block day (giống trên, dùng class_to_asgs).

  SOFT "X nên xếp tiết N-M" hoặc "tiết N":
      for asg_id in subj_asgs:
          for p in preferred_periods:
              for slot_id in slots_by_period.get(str(p), []):
                  objective_terms.append(w * x[(asg_id, slot_id)])

  SOFT "X liên tiếp N tiết" (N tiết cùng ngày liền kề):
      for asg_id in subj_asgs:
          for day_id, day_sids in slots_by_day.items():
              day_slots_sorted = sorted([slot_map[s] for s in day_sids if s in slot_map], key=lambda s: s["period"])
              for i in range(len(day_slots_sorted) - block_size + 1):
                  window = day_slots_sorted[i:i+block_size]
                  if any(window[j+1]["period"] != window[j]["period"] + 1 for j in range(block_size - 1)):
                      continue
                  reward = model.NewBoolVar(f"blk_{sc['id']}_{asg_id}_{day_id}_{i}")
                  for slot_obj in window:
                      model.Add(x[(asg_id, slot_obj["slotId"])] >= reward)
                  objective_terms.append(w * reward)

MATCH ENTITY (case-insensitive substring):
    text = hc["text"].lower().strip()
    asg_ids = next((ids for label, ids in teacher_to_asgs.items() if label.lower() in text), [])

NẾU PATTERN KHÔNG MATCH → bỏ qua hc đó (không raise). Checker sẽ flag nếu vi phạm.

TEMPLATE HOÀN CHỈNH (copy nguyên rồi sửa logic parse nếu cần):

\`\`\`python
import re
from timetable_solver.base_solver_template import solve_base_model

VN_DAY_MAP = {
    "thứ 2": "monday", "thứ hai": "monday",
    "thứ 3": "tuesday", "thứ ba": "tuesday",
    "thứ 4": "wednesday", "thứ tư": "wednesday",
    "thứ 5": "thursday", "thứ năm": "thursday",
    "thứ 6": "friday", "thứ sáu": "friday",
    "thứ 7": "saturday", "thứ bảy": "saturday",
    "chủ nhật": "sunday",
}

def solve_timetable(problem):
    hard_constraints = problem.get("hardConstraints", [])
    soft_constraints = problem.get("softConstraints", [])
    meta = problem.get("meta", {}) or {}
    teacher_to_asgs = meta.get("teacherToAsgIds", {})
    class_to_asgs   = meta.get("classToAsgIds", {})
    subject_to_asgs = meta.get("subjectToAsgIds", {})
    slots_by_day    = meta.get("slotsByDayId", {})
    slots_by_period = meta.get("slotsByPeriod", {})

    def find_day(text):
        for k, v in VN_DAY_MAP.items():
            if k in text:
                return v
        return None

    def find_period(text):
        m = re.search(r"tiết\\s+(\\d+)", text)
        return int(m.group(1)) if m else None

    def find_asgs(text, label_map):
        for label, ids in label_map.items():
            if label.lower() in text:
                return ids
        return []

    def extra_setup(base, objective_terms, diagnostics):
        model = base["model"]
        x = base["x"]
        slots = base["slots"]
        hc_lits = base.get("hardConstraintLiterals", {})
        slot_map = {s["slotId"]: s for s in slots}

        # ── Hard constraints ──────────────────────────────────────────────────
        for hc in hard_constraints:
            lit = hc_lits.get(hc["id"])
            if lit is None:
                continue
            text = hc["text"].lower().strip()
            day_id = find_day(text)
            period_num = find_period(text)

            if "không dạy" in text or "khong day" in text:
                asg_ids = find_asgs(text, teacher_to_asgs)
                if asg_ids and day_id:
                    for asg_id in asg_ids:
                        for slot_id in slots_by_day.get(day_id, []):
                            model.Add(x[(asg_id, slot_id)] == 0).OnlyEnforceIf(lit)
                elif asg_ids and period_num is not None:
                    for asg_id in asg_ids:
                        for slot_id in slots_by_period.get(str(period_num), []):
                            model.Add(x[(asg_id, slot_id)] == 0).OnlyEnforceIf(lit)

            elif "không học" in text or "khong hoc" in text:
                asg_ids = find_asgs(text, class_to_asgs)
                if asg_ids and day_id:
                    for asg_id in asg_ids:
                        for slot_id in slots_by_day.get(day_id, []):
                            model.Add(x[(asg_id, slot_id)] == 0).OnlyEnforceIf(lit)
                elif asg_ids and period_num is not None:
                    for asg_id in asg_ids:
                        for slot_id in slots_by_period.get(str(period_num), []):
                            model.Add(x[(asg_id, slot_id)] == 0).OnlyEnforceIf(lit)

        # ── Soft constraints ──────────────────────────────────────────────────
        for sc in soft_constraints:
            text = sc["text"].lower().strip()
            w = int(sc.get("weight", 5))

            if "xếp tiết" in text or "xep tiet" in text or "nên tiết" in text:
                rng = re.search(r"tiết\\s+(\\d+)\\s*[\\-–]\\s*(\\d+)", text)
                if rng:
                    lo, hi = int(rng.group(1)), int(rng.group(2))
                    periods = list(range(lo, hi + 1))
                else:
                    single = re.search(r"tiết\\s+(\\d+)", text)
                    periods = [int(single.group(1))] if single else []
                if not periods:
                    continue
                asg_ids = (
                    find_asgs(text, subject_to_asgs)
                    or find_asgs(text, teacher_to_asgs)
                    or find_asgs(text, class_to_asgs)
                )
                for asg_id in asg_ids:
                    for p in periods:
                        for slot_id in slots_by_period.get(str(p), []):
                            objective_terms.append(w * x[(asg_id, slot_id)])

            elif "liên tiếp" in text or "lien tiep" in text:
                m = re.search(r"(\\d+)\\s*tiết", text)
                block_size = int(m.group(1)) if m else 2
                asg_ids = (
                    find_asgs(text, subject_to_asgs)
                    or find_asgs(text, teacher_to_asgs)
                    or find_asgs(text, class_to_asgs)
                )
                for asg_id in asg_ids:
                    for day_id, day_sids in slots_by_day.items():
                        day_slots_sorted = sorted(
                            [slot_map[s] for s in day_sids if s in slot_map],
                            key=lambda s: s["period"],
                        )
                        for i in range(len(day_slots_sorted) - block_size + 1):
                            window = day_slots_sorted[i:i + block_size]
                            if any(window[j+1]["period"] != window[j]["period"] + 1 for j in range(block_size - 1)):
                                continue
                            reward = model.NewBoolVar(f"blk_{sc['id']}_{asg_id}_{day_id}_{i}")
                            for slot_obj in window:
                                model.Add(x[(asg_id, slot_obj["slotId"])] >= reward)
                            objective_terms.append(w * reward)

    return solve_base_model(problem, extra_setup=extra_setup)
\`\`\`

NẾU previousRun có lỗi Python: ĐỌC traceback, sửa CHÍNH XÁC dòng lỗi, giữ phần còn lại.
NẾU previousVerification có vi phạm: bổ sung pattern parse cho text constraint chưa khớp.`

export const SOLVER_VERIFY_SYSTEM_PROMPT = `Bạn là Agent 2 (Checker) chuyên kiểm tra kết quả xếp thời khóa biểu.

NHIỆM VỤ:
Đối chiếu output cells với danh sách hard/soft constraints gốc của người dùng.
Tìm vi phạm cụ thể: constraint nào bị vi phạm, ở slot nào, giáo viên/lớp nào.

QUYẾT ĐỊNH verdict:
- solved: tất cả hard constraints thỏa mãn, soft constraints đạt mức chấp nhận.
- retryable: còn hard constraint bị vi phạm, hoặc output rỗng/thiếu dữ liệu.
- infeasible: có bằng chứng mạnh từ solver (OR-Tools INFEASIBLE, IIS) rằng bộ ràng buộc mâu thuẫn.

Chỉ trả JSON object với các field:
- verdict: "solved" | "retryable" | "infeasible"
- confidence: number 0-1
- rationale: string tiếng Việt, mô tả ngắn kết quả kiểm tra
- unmetRequirements: string[] — mỗi phần tử là MỘT vi phạm cụ thể kèm bằng chứng
  Ví dụ: "hc_1 vi phạm: Cô A (T1) xuất hiện ở slot mon-morning-1 nhưng hard constraint là Cô A không dạy thứ 2"
- repairInstructions: string[] — hướng dẫn cụ thể cho Coder sửa
  Ví dụ: "Thêm constraint forbid: x[(asg_i, mon-morning-*)] == 0 cho tất cả assignment của T1"
- confidentlyInfeasible: boolean

QUY TẮC:
- Chỉ báo vi phạm khi có bằng chứng rõ trong cells. Không suy đoán.
- Nếu cells rỗng nhưng solver không báo infeasible → retryable (Coder chưa xếp được).
- Nếu OR-Tools báo INFEASIBLE và có IIS → confidentlyInfeasible = true.
- Không trả markdown.`

export function buildSolverAuthorUserMessage(input: SolverAuthorPromptInput): string {
  return JSON.stringify({
    task: 'Viết hoặc sửa full solver code cho bài toán xếp thời khóa biểu',
    attempt: input.attempt,
    maxAttempts: input.maxAttempts,
    payloadSummary: summarizePayload(input.payload),
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
      'Gọi create_base_model(problem) từ base template để có 3 base constraints: weeklyPeriods, no-clash teacher, no-clash class.',
      'Đọc problem["hardConstraints"] (list[{id, text}]) lúc runtime để áp dụng hard constraints bằng model.Add(). KHÔNG hardcode constraint text.',
      'Đọc problem["softConstraints"] (list[{id, text, weight}]) lúc runtime để tạo penalty. weight lớn hơn = penalty coefficient lớn hơn trong objective Maximize.',
      'Kết quả trả về phải cùng schema: status, message, diagnostics, cells, iisConstraintIds, executionErrors, validationErrors, violations, solverStats.',
      'Nếu không solve được thì trả status hợp lệ và diagnostics có ý nghĩa.',
    ],
  })
}

function buildCellsSummary(cells: SolverVerifyPromptInput['runOutput']['cells']) {
  if (!Array.isArray(cells) || cells.length === 0) return []
  return cells
    .filter((c) => c.entries && c.entries.length > 0)
    .map((c) => ({
      slotId: c.slotId,
      dayId: c.dayId,
      sessionId: c.sessionId,
      period: c.period,
      entries: c.entries.map((e) => ({ teacher: e.teacher, subject: e.subject, class: e.className })),
    }))
}

export function buildSolverVerifyUserMessage(input: SolverVerifyPromptInput): string {
  return JSON.stringify({
    task: 'Kiểm tra kết quả thời khóa biểu theo constraints gốc',
    hardConstraints: input.payload.hardConstraints,
    softConstraints: input.payload.softConstraints,
    payloadSummary: summarizePayload(input.payload),
    solverStatus: input.runOutput.status,
    solverMessage: input.runOutput.message,
    solverDiagnostics: input.runOutput.diagnostics,
    iisConstraintIds: input.runOutput.iisConstraintIds,
    executionErrors: input.runOutput.executionErrors,
    cellsSummary: buildCellsSummary(input.runOutput.cells),
    totalCells: input.runOutput.cells?.length ?? 0,
    totalAssignedSlots: input.runOutput.cells?.reduce((s, c) => s + (c.entries?.length ?? 0), 0) ?? 0,
    requirement: [
      'Duyệt từng hard constraint, tìm vi phạm trong cellsSummary.',
      'Vi phạm = teacher/class/subject xuất hiện ở slot trái với constraint text.',
      'Nếu không vi phạm nào → verdict solved.',
      'Nếu OR-Tools báo INFEASIBLE (solverStatus=infeasible) và iisConstraintIds không rỗng → confidentlyInfeasible=true.',
      'Nếu cells rỗng nhưng solverStatus không phải infeasible → retryable.',
    ],
  })
}
