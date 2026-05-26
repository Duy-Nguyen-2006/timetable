Có. Nhìn vào code hiện tại, tôi nghĩ **vấn đề chính không chỉ là model yếu**, mà là “agent guide” đang yêu cầu đúng flow nhưng **tool layer chưa ép flow đó bằng code**. Prompt đang bảo model “hãy loop”, nhưng executor vẫn cho model đi sai đường, submit sai schema, hoặc chạy solver sai contract.

## 1. Fix gấp: `run_python` đang gọi sai contract của `runSolverDirect`

`runSolverDirect` yêu cầu input dạng `{ problem, solverArtifactPath?, entrypoint? }`, nhưng trong `lowprizo-direct-agent.ts` có chỗ safety net gọi `runSolverDirect(solverPath as any)`, tức truyền string path trực tiếp. `sandbox.ts` cho thấy runner cần `SolverProblem | SolverExecutionRequest`, không phải path string.  

Sửa hướng này:

```ts
const result = await runSolverDirect({
  problem: problem.problem,
  solverArtifactPath: full,
  entrypoint: 'solve_timetable',
})
```

Nhưng phải lưu file đúng chỗ `generated_solver.py`, vì `validateArtifactPath()` đang chỉ chấp nhận artifact nằm trong workspace generated solver. 

Nên đổi `createSandbox()` thành dùng `getGeneratedSolverWorkspace(requestId)` thay vì `/tmp/tack-agent-*`, rồi bắt agent luôn edit `generated_solver.py`.

---

## 2. Fix schema cells: agent đang submit dạng sai

Type thật của `TimetableSolveCell` là:

```ts
{
  slotId,
  dayId,
  sessionId,
  period,
  entries: [{ assignmentKey, subject, teacher, className }]
}
```

Nhưng tool `submit_solution` lại mô tả cells kiểu flat `{ day, period, classId, subjectId, teacherId }`. Đây là lệch schema rất nặng: model có thể “ra kết quả” nhưng UI/checker không hiểu đúng.  

Đề xuất bỏ luôn `cells` khỏi `submit_solution`. Thay bằng tool:

```ts
submit_last_valid_solution({
  message: string
})
```

Tool này tự lấy `lastRun.data.cells`, tự validate lại, rồi mới submit. Đừng để model tự copy cells vào JSON.

---

## 3. Fix bootstrap: đang lấy nhầm object

`buildSolverProblemContext()` trả về object có `problem.problem.days`, `problem.problem.assignments`, `problem.problem.hardConstraints`. Nhưng trong `lowprizo-direct-agent.ts` lại dùng kiểu `(problem as any).days`, `(problem as any).assignments`, `(problem as any).hardConstraints`, nên bootstrap thông minh rất dễ rỗng. 

Sửa:

```ts
const dayList = problem.problem.days
const asgList = problem.problem.assignments
const hcList = problem.problem.hardConstraints
```

Nếu không sửa chỗ này, “availability-aware bootstrap” nghe rất hay nhưng có thể không hoạt động như bạn tưởng.

---

## 4. Đừng để prompt enforce loop, hãy enforce bằng state machine

Hiện prompt bắt model làm:

`run_python → get_hard_constraint_progress → declare_fix_target → edit → run lại`

Nhưng `executeTool()` vẫn cho `write_file` / `edit_file` chạy bất cứ lúc nào. `currentFixTarget` có set nhưng gần như chưa được dùng để chặn hành vi sai.  

Thêm state machine thật:

```ts
type AgentState =
  | 'need_read'
  | 'need_run'
  | 'need_progress'
  | 'need_fix_target'
  | 'can_edit'
  | 'must_submit'
```

Ví dụ rule:

```ts
if (state === 'need_progress' && name !== 'get_hard_constraint_progress') {
  return { ok: false, error: 'Next required tool: get_hard_constraint_progress' }
}

if (state === 'need_fix_target' && name !== 'declare_fix_target') {
  return { ok: false, error: 'Next required tool: declare_fix_target' }
}

if (state === 'must_submit' && name !== 'submit_last_valid_solution') {
  return { ok: false, error: 'Valid solution found. Submit now.' }
}
```

Điểm mấu chốt: **model yếu thì đừng “nhắc”, hãy “khóa đường sai”.**

---

## 5. Fix counter: đang đếm số lần run bằng cách rất dễ sai

Code hiện tại đếm `runCount` bằng cách scan `messages` xem tool content có chứa `"run_python"` hay không. Nhưng tool result JSON không nhất thiết chứa chuỗi đó. Nên safety net `runCount >= 3` / `>= 5` có thể không chạy đúng. 

Sửa thành:

```ts
const runCount = attemptHistory.filter(a => a.action === 'run_python').length
```

Vì `attemptHistory` đã push action `run_python` trong executor rồi. 

---

## 6. Thêm deterministic validation sau mỗi run, không chỉ tin output solver

Repo đã có `timetable-validator.ts` và `deterministic-checker.ts`. Validator có thể check base conflict, assignment coverage, slot validity, hard/soft constraints; deterministic checker còn trả `violations`, `uncheckedIds`, `repair`.  

Trong `run_python`, sau khi có `data`, nên làm:

```ts
const validation = validateTimetableResult(problem, data)

const broken = validation.checks
  .filter(c => (c.severity === 'base' || c.severity === 'hard') && !c.passed)
  .map(c => ({
    id: c.constraintId,
    original: c.original,
    reason: c.reason,
    suggestion: c.suggestion,
  }))
```

Rồi feedback cho model bằng dữ liệu này, thay vì chỉ `violations` từ solver.

---

## 7. Fix meta key mismatch trong Python template

Trong TS, meta đang build các key như `teacherToAssignmentIds`, `classToAssignmentIds`, `subjectToAssignmentIds`. 
Nhưng Python `template_solver.py` đang dùng mapping kiểu `teacher_to_asgs`, `class_to_asgs`, `subject_to_asgs` để encode constraints. 

Sửa nhanh ở Python:

```py
teacher_to_asgs = (
    meta.get("teacherToAsgIds")
    or meta.get("teacherToAssignmentIds")
    or {}
)
class_to_asgs = (
    meta.get("classToAsgIds")
    or meta.get("classToAssignmentIds")
    or {}
)
subject_to_asgs = (
    meta.get("subjectToAsgIds")
    or meta.get("subjectToAssignmentIds")
    or {}
)
```

Hoặc sửa ở TS để xuất cả alias cũ và mới.

---

## 8. Đừng bắt model code OR-Tools từ số 0 nếu đã có solver template

`base_solver_template.py` đã có base model: mỗi assignment đủ `weeklyPeriods`, giáo viên không trùng slot, lớp không trùng slot, assumption literals để tìm infeasible. 
`template_solver.py` cũng đã encode khá nhiều constraint như teacher block/allow, subject period/session, block consecutive, teacher max consecutive, min off days, class daily subject, subjects not consecutive. 

Nên flow mới nên là:

```txt
Input
→ parse constraints
→ chạy deterministic template trước
→ validate
→ nếu pass hard: submit luôn
→ nếu fail do unparsed/edge case: mới gọi LLM để patch generated_solver.py
→ run
→ validate
→ loop bằng state machine
→ submit_last_valid_solution
```

Tức là LLM không nên là “người viết solver chính”, mà là **repair agent** cho phần deterministic solver chưa cover.

---

## Thứ tự sửa tôi khuyên

1. **Sửa `runSolverDirect` call + artifact path** trong `lowprizo-direct-agent.ts`. Đây là lỗi nền.
2. **Đổi `submit_solution` thành `submit_last_valid_solution`**, không cho model tự submit cells.
3. **Sửa schema cells** về `slotId/dayId/sessionId/entries`.
4. **Sửa bootstrap dùng `problem.problem.*`**.
5. **Thêm state machine enforce loop**.
6. **Gắn `validateTimetableResult()` sau mỗi run**.
7. **Sửa meta alias giữa TS và Python template**.
8. Sau đó mới tính tới tăng model / đổi model.

Kết luận: phần “guide” nên ngắn hơn, nhưng tool phải mạnh hơn. Với model kiểu `devstral-latest`, bạn nên thiết kế theo hướng **deterministic solver first + LLM repair**, chứ đừng để model tự do code OR-Tools rồi hy vọng nó tự biết submit đúng.
