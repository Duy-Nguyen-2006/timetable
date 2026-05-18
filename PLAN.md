# Plan: Nâng cấp AI pipeline cho Timetable Solver

> Mục tiêu: Thay thế pipeline "AI parse → fixed schema → solver" hiện tại bằng pipeline "AI compile code → exec trong sandbox → AI verify".

---

## Tổng quan kiến trúc mới

```
Request (slots, assignments, NL constraints, apiKey)
        │
        ▼
┌────────────────────────────────────────┐
│ Stage 1: AI Constraint Compiler        │  ← prompt mới + few-shot
│ Output: CompilerResult {                │
│   constraints: [                        │
│     { id, description, original,        │
│       priority, weight?, code }         │
│   ],                                    │
│   unparsed: [{ id, original, reason }]  │
│ }                                       │
└────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────┐
│ AST Validator (Python)                  │
│ - Whitelist nodes + names + attributes  │
│ - Reject: import, dunder, I/O...        │
└────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────┐
│ Solver (Python OR-Tools)                │
│ - Base model: x[aid, sid], supply,      │
│   no-clash teacher/class                │
│ - exec(code) với namespace hạn chế      │
│ - Mỗi hard constraint gắn 1 assumption  │
│   literal để extract IIS                │
│ - Tự inject objective_terms cho soft    │
│ - Nếu UNSAT → SufficientAssumptions... │
└────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────┐
│ Stage 2: AI Verifier (chỉ khi solved)   │
│ Input: NL gốc + cells + code đã chạy    │
│ Output: VerifierResult {                │
│   violations: [{ constraintId,          │
│     violated, reason, confidence }],    │
│   overallAssessment                     │
│ }                                       │
└────────────────────────────────────────┘
        │
        ▼
Response (cells, compiled, violations, iis, errors)
```

---

## Phase 0: Environment setup

### 0.1 Tạo `.venv` cho dự án

```bash
cd /home/user/timetable
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r python/requirements.txt
.venv/bin/pip install pytest pytest-timeout
```

### 0.2 Cập nhật `python/requirements.txt`

Thêm:
```
pytest==8.3.3
pytest-timeout==2.3.1
```

### 0.3 Tạo `python/tests/__init__.py` (rỗng) và `python/conftest.py`

```python
# python/conftest.py
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
```

### 0.4 Acceptance

- `.venv/bin/python -c "from ortools.sat.python import cp_model; print('ok')"` → `ok`
- `.venv/bin/pytest python/tests/` → "no tests collected" (chưa có test)

---

## Phase 1: Validator + Solver rewrite

### 1.1 File mới: `python/timetable_solver/validator.py`

**Trách nhiệm:** Parse code AI sinh, walk AST, reject nếu chứa node/name/attribute không trong whitelist.

#### API

```python
def validate_code(code: str) -> tuple[bool, str | None]:
    """
    Returns (is_valid, error_message).
    is_valid=False kèm error_message giải thích lý do reject.
    """
```

#### Whitelist constants

```python
ALLOWED_NODES = {
    ast.Module, ast.Expr, ast.Assign, ast.AugAssign,
    ast.For, ast.If, ast.IfExp, ast.Compare, ast.BoolOp, ast.BinOp, ast.UnaryOp,
    ast.Subscript, ast.Slice, ast.Index,  # Index for py<3.9 compat
    ast.Attribute, ast.Call, ast.Name, ast.Constant,
    ast.List, ast.Dict, ast.Set, ast.Tuple,
    ast.GeneratorExp, ast.ListComp, ast.DictComp, ast.SetComp,
    ast.comprehension, ast.Load, ast.Store, ast.Del,
    ast.arguments, ast.arg, ast.Lambda,
    ast.Pass, ast.Break, ast.Continue,
    ast.And, ast.Or, ast.Not, ast.USub, ast.UAdd,
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow,
    ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.In, ast.NotIn,
    ast.Starred,
}

BANNED_NODES = {
    ast.Import, ast.ImportFrom, ast.Global, ast.Nonlocal,
    ast.With, ast.AsyncWith, ast.Try, ast.TryStar, ast.Raise,
    ast.Yield, ast.YieldFrom, ast.Await,
    ast.AsyncFor, ast.AsyncFunctionDef, ast.FunctionDef, ast.ClassDef,
    ast.Delete,
}

ALLOWED_NAMES = {
    # Namespace
    "model", "x", "assignments", "slots", "objective_terms", "add_assumption",
    # Builtins
    "sum", "len", "range", "zip", "sorted", "set", "list", "dict", "tuple",
    "any", "all", "min", "max", "int", "bool", "str", "enumerate",
    "True", "False", "None", "abs", "map", "filter", "round",
}

# Attribute trên `model.*` được phép
ALLOWED_MODEL_ATTRS = {
    "Add", "AddBoolOr", "AddBoolAnd", "AddImplication",
    "AddAllowedAssignments", "AddForbiddenAssignments",
    "NewBoolVar", "NewIntVar", "NewIntVarFromDomain",
    "AddMaxEquality", "AddMinEquality", "AddAbsEquality",
    "AddMultiplicationEquality", "AddDivisionEquality", "AddModuloEquality",
    "AddElement", "AddLinearConstraint", "AddLinearExpressionInDomain",
    "AddExactlyOne", "AddAtLeastOne", "AddAtMostOne",
    "Maximize", "Minimize",
}
```

#### Quy tắc walk

1. Với mỗi node:
   - Nếu thuộc `BANNED_NODES` → reject ngay.
   - Nếu `type(node) not in ALLOWED_NODES` → reject.
2. Với `ast.Name`:
   - Nếu `node.id` bắt đầu bằng `_` → reject (chặn `__class__`, `_globals` v.v.).
   - Nếu không trong `ALLOWED_NAMES` thì cho phép **nếu đang ở context Store/local** (tên biến trung gian). Có thể tracker `Assign.targets` để chấp nhận tên này về sau.
   - Cách đơn giản hơn: cho phép mọi `Name` không bắt đầu bằng `_`, chỉ chặn dunder.
3. Với `ast.Attribute`:
   - Nếu `attr` bắt đầu bằng `_` → reject.
   - Nếu `value` là `Name("model")` và `attr not in ALLOWED_MODEL_ATTRS` → reject.
   - Cho phép Attribute trên các Name khác (vd `slot["dayId"]` đã là Subscript, không phải Attribute). Nhưng vẫn chặn dunder.
4. Với `ast.Call`:
   - Nếu `func` là `Name` và `name` thuộc danh sách cấm runtime (`exec`, `eval`, `open`, `compile`, `__import__`, `getattr`, `setattr`, `delattr`, `globals`, `locals`, `vars`, `breakpoint`, `input`) → reject.

#### Unit tests cần viết (`python/tests/test_validator.py`)

```python
def test_allow_basic_model_add():
    code = "model.Add(x[('a1', 's1')] == 0)"
    valid, err = validate_code(code)
    assert valid

def test_reject_import():
    code = "import os\nmodel.Add(x[('a1','s1')]==0)"
    valid, err = validate_code(code)
    assert not valid and "import" in err.lower()

def test_reject_dunder():
    code = "model.__class__"
    assert not validate_code(code)[0]

def test_reject_exec():
    assert not validate_code("exec('print(1)')")[0]

def test_reject_open():
    assert not validate_code("open('/etc/passwd')")[0]

def test_reject_getattr():
    assert not validate_code("getattr(model, 'Add')(x[('a','s')]==0)")[0]

def test_allow_comprehension():
    code = "model.Add(sum(x[(a['assignmentId'], s['slotId'])] for a in assignments for s in slots) >= 1)"
    assert validate_code(code)[0]

def test_reject_function_def():
    assert not validate_code("def f(): return 1")[0]

def test_allow_assign_and_loops():
    code = """
ta = [a for a in assignments if a['teacherLabel'] == 'Lan']
for a in ta:
    for s in slots:
        if s['dayId'] == 'saturday':
            model.Add(x[(a['assignmentId'], s['slotId'])] == 0)
"""
    assert validate_code(code)[0]
```

### 1.2 Rewrite `python/timetable_solver/solver.py`

#### Input JSON (mới)

```json
{
  "slots": [{"slotId","dayId","sessionId","period","dayLabel","sessionLabel"}],
  "assignments": [
    {"assignmentId","teacherId","teacherLabel","subjectId","subjectLabel",
     "classId","classLabel","weeklyPeriods"}
  ],
  "aiCompiledConstraints": [
    {"id","description","original","priority","weight","code"}
  ],
  "unparsedConstraints": [{"id","original","reason"}],
  "solverConfig": {"maxTimeSeconds","numWorkers","randomSeed"}
}
```

#### Output JSON (mới)

```json
{
  "status": "solved" | "infeasible" | "error",
  "message": "...",
  "diagnostics": ["..."],
  "cells": [{"slotId","dayId","sessionId","period","entries":[...]}],
  "iisConstraintIds": ["c1","c3"],
  "executionErrors": [{"constraintId":"c2","error":"NameError: ..."}],
  "validationErrors": [{"constraintId":"c4","error":"reject reason"}],
  "solverStats": {...}
}
```

#### Pseudocode chính

```python
def solve_timetable(problem):
    slots = problem["slots"]
    assignments = problem["assignments"]
    ai_constraints = problem.get("aiCompiledConstraints", [])
    config = problem.get("solverConfig", {})

    if not slots or not assignments:
        return _empty_result(...)  # giống logic cũ

    model = cp_model.CpModel()
    x = {(a["assignmentId"], s["slotId"]): model.NewBoolVar(...) 
         for a in assignments for s in slots}
    objective_terms = []

    # === Base constraints ===
    # 1. weekly_periods per assignment
    for a in assignments:
        model.Add(sum(x[(a["assignmentId"], s["slotId"])] for s in slots) 
                  == int(a["weeklyPeriods"]))
    # 2. no-clash teacher
    for s in slots:
        for teacher_id in {a["teacherId"] for a in assignments}:
            model.Add(sum(x[(a["assignmentId"], s["slotId"])] 
                          for a in assignments if a["teacherId"]==teacher_id) <= 1)
    # 3. no-clash class (tương tự)

    # === Apply AI constraints ===
    assumption_map = {}   # assumption_literal -> constraint_id
    execution_errors = []
    validation_errors = []

    namespace_builtins = {
        "sum": sum, "len": len, "range": range, "zip": zip,
        "sorted": sorted, "set": set, "list": list, "dict": dict,
        "tuple": tuple, "any": any, "all": all, "min": min, "max": max,
        "int": int, "bool": bool, "str": str, "enumerate": enumerate,
        "True": True, "False": False, "None": None,
        "abs": abs, "map": map, "filter": filter, "round": round,
    }

    for c in ai_constraints:
        cid = c["id"]
        code = c["code"]

        # 1. Validate AST
        ok, err = validate_code(code)
        if not ok:
            validation_errors.append({"constraintId": cid, "error": err})
            continue

        # 2. Build namespace
        if c["priority"] == "hard":
            # Tạo assumption literal, model.Add(...) trong code phải được
            # wrap để gắn assumption. Cách đơn giản: tạo BoolVar 
            # `assume_<cid>`, ép = 1 qua assumption, và mọi constraint trong
            # code chạy "OnlyEnforceIf(assume_<cid>)".
            # Nhưng cp_model.Add() trả về Constraint object có
            # .OnlyEnforceIf() - không tự động được. 
            # → Đơn giản hơn: dùng model.AddAssumption(boolvar) sau khi
            # gắn các constraint conditional vào nó. Để làm thế, ta cung 
            # cấp helper `add_assumption(constraint, cid)` thay cho việc
            # AI gọi model.Add() trực tiếp cho hard.
            # 
            # NHƯNG vì user muốn AI nearly-full OR-Tools, ta phải gắn
            # assumption ngoài lề: monkey-patch model.Add() để trả về
            # Constraint và auto-call OnlyEnforceIf(assume_lit).
            assume_lit = model.NewBoolVar(f"assume_{cid}")
            assumption_map[assume_lit.Index()] = cid
            # Wrap: tạo ProxyModel để mọi .Add* tự đính kèm OnlyEnforceIf
            proxy = _make_proxy_model(model, assume_lit)
            ns = {
                "model": proxy,
                "x": x, "assignments": assignments, "slots": slots,
                "objective_terms": objective_terms,
                "__builtins__": namespace_builtins,
            }
            try:
                exec(compile(code, f"<{cid}>", "exec"), ns, ns)
            except Exception as e:
                execution_errors.append({"constraintId": cid, 
                                          "error": f"{type(e).__name__}: {e}"})
                # Loại bỏ assumption literal khỏi map nếu có lỗi
                del assumption_map[assume_lit.Index()]
                # Cho phép assume_lit free (không add to AddAssumptions)
                continue
            model.AddAssumption(assume_lit)
        else:  # soft
            ns = {
                "model": model,
                "x": x, "assignments": assignments, "slots": slots,
                "objective_terms": objective_terms,
                "__builtins__": namespace_builtins,
            }
            try:
                exec(compile(code, f"<{cid}>", "exec"), ns, ns)
            except Exception as e:
                execution_errors.append({"constraintId": cid, "error": str(e)})

    if objective_terms:
        model.Maximize(sum(objective_terms))

    # === Solve ===
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(config.get("maxTimeSeconds",20))
    solver.parameters.num_search_workers = int(config.get("numWorkers", 8))
    solver.parameters.random_seed = int(config.get("randomSeed", 1))

    status = solver.Solve(model)

    iis_constraint_ids = []
    if status == cp_model.INFEASIBLE:
        try:
            assumption_indices = solver.SufficientAssumptionsForInfeasibility()
            iis_constraint_ids = [assumption_map[i] for i in assumption_indices 
                                  if i in assumption_map]
        except Exception:
            pass
        return _empty_result(
            "infeasible", 
            "Không thể xếp thời khóa biểu hợp lệ.",
            ["OR-Tools INFEASIBLE."],
            execution_errors=execution_errors,
            validation_errors=validation_errors,
            iis_constraint_ids=iis_constraint_ids,
            solver_stats=_stats(solver, objective_terms)
        )

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return _empty_result("error", "Solver timeout/unknown.", ..., ...)

    # === Build cells ===
    cells_by_slot = {s["slotId"]: {**s, "entries": []} for s in slots}
    for a in assignments:
        for s in slots:
            if solver.Value(x[(a["assignmentId"], s["slotId"])]) == 1:
                cells_by_slot[s["slotId"]]["entries"].append({
                    "assignmentKey": a["assignmentId"],
                    "subject": a["subjectLabel"],
                    "teacher": a["teacherLabel"],
                    "className": a["classLabel"],
                })

    return {
        "status": "solved",
        "message": "Đã tạo thời khóa biểu hợp lệ.",
        "diagnostics": [...],
        "cells": list(cells_by_slot.values()),
        "iisConstraintIds": [],
        "executionErrors": execution_errors,
        "validationErrors": validation_errors,
        "solverStats": _stats(solver, objective_terms),
    }
```

#### Helper: `_make_proxy_model(model, assume_lit)`

Mục tiêu: AI viết `model.Add(...)`, internal tự `.OnlyEnforceIf(assume_lit)`.

```python
class _ProxyModel:
    __slots__ = ("_model", "_assume")
    def __init__(self, model, assume_lit):
        self._model = model
        self._assume = assume_lit

    def __getattr__(self, name):
        attr = getattr(self._model, name)
        if name in {"Add", "AddBoolOr", "AddBoolAnd", "AddImplication",
                    "AddAllowedAssignments", "AddForbiddenAssignments",
                    "AddLinearConstraint", "AddExactlyOne", "AddAtLeastOne",
                    "AddAtMostOne", "AddMaxEquality", "AddMinEquality",
                    "AddAbsEquality", "AddElement"}:
            def wrapped(*args, **kwargs):
                ct = attr(*args, **kwargs)
                try:
                    ct.OnlyEnforceIf(self._assume)
                except Exception:
                    pass  # một số constraint không hỗ trợ
                return ct
            return wrapped
        return attr  # NewBoolVar, NewIntVar, Maximize, Minimize → pass-through
```

#### Edge case quan trọng

- `Maximize/Minimize` từ soft constraint nên gọi trực tiếp `model`, không phải proxy. Code AI cho soft phải dùng `objective_terms.append(...)`, không được gọi `model.Maximize()` (vì sẽ ghi đè objective tổng). Tài liệu hóa rõ trong system prompt.
- Nếu code AI gây `KeyError` cho `x[(...)]` (sai assignmentId/slotId) → bắt exception → log execution_errors → bỏ qua constraint đó.

#### Unit tests (`python/tests/test_solver.py`)

```python
def _minimal_problem(extra_constraints=None):
    return {
        "slots": [
            {"slotId":"d1-m-1","dayId":"d1","sessionId":"morning","period":1},
            {"slotId":"d1-m-2","dayId":"d1","sessionId":"morning","period":2},
        ],
        "assignments": [
            {"assignmentId":"a1","teacherId":"T1","teacherLabel":"Lan",
             "subjectId":"S1","subjectLabel":"Toán","classId":"C1",
             "classLabel":"9A","weeklyPeriods":1}
        ],
        "aiCompiledConstraints": extra_constraints or [],
        "solverConfig": {"maxTimeSeconds":5,"numWorkers":2,"randomSeed":1}
    }

def test_basic_solve():
    r = solve_timetable(_minimal_problem())
    assert r["status"] == "solved"
    assert sum(len(c["entries"]) for c in r["cells"]) == 1

def test_hard_constraint_applied():
    code = ("for s in slots:\n"
            "    if s['period']==1:\n"
            "        model.Add(x[('a1', s['slotId'])] == 0)")
    r = solve_timetable(_minimal_problem([
        {"id":"c1","description":"","original":"","priority":"hard","code":code}
    ]))
    assert r["status"] == "solved"
    # Tiết được xếp phải là period 2
    for c in r["cells"]:
        for e in c["entries"]:
            assert c["period"] == 2

def test_infeasible_iis():
    """Hai constraint xung đột → infeasible → IIS chứa cả 2."""
    code_a = ("model.Add(x[('a1','d1-m-1')] == 0)")
    code_b = ("model.Add(x[('a1','d1-m-2')] == 0)")
    r = solve_timetable(_minimal_problem([
        {"id":"c1","description":"","original":"","priority":"hard","code":code_a},
        {"id":"c2","description":"","original":"","priority":"hard","code":code_b},
    ]))
    assert r["status"] == "infeasible"
    assert set(r["iisConstraintIds"]) == {"c1","c2"}

def test_soft_objective():
    code = ("for s in slots:\n"
            "    if s['period']==1:\n"
            "        objective_terms.append(10 * x[('a1', s['slotId'])])")
    r = solve_timetable(_minimal_problem([
        {"id":"c1","description":"","original":"","priority":"soft","weight":10,"code":code}
    ]))
    assert r["status"] == "solved"
    # Tiết ưu tiên ở period 1
    for c in r["cells"]:
        if c["entries"]:
            assert c["period"] == 1

def test_execution_error_logged():
    code = "model.Add(x[('not_exist','also_not')] == 0)"  # KeyError
    r = solve_timetable(_minimal_problem([
        {"id":"c1","description":"","original":"","priority":"hard","code":code}
    ]))
    assert any(e["constraintId"]=="c1" for e in r["executionErrors"])

def test_validation_error_logged():
    code = "import os"
    r = solve_timetable(_minimal_problem([
        {"id":"c1","description":"","original":"","priority":"hard","code":code}
    ]))
    assert any(e["constraintId"]=="c1" for e in r["validationErrors"])
```

### 1.3 Acceptance Phase 1

- `pytest python/tests/` → tất cả pass
- Có thể chạy thủ công: tạo JSON, pipe stdin cho `runner.py`, output JSON đúng format

---

## Phase 2: AI Constraint Compiler

### 2.1 `src/features/timetable/ai/types.ts` (extend)

Thêm types:

```typescript
export type AICompiledConstraint = {
  id: string
  description: string   // diễn giải tiếng Việt ngắn
  original: string      // text gốc của user
  priority: 'hard' | 'soft'
  weight?: number       // 1-10, bắt buộc nếu priority='soft'
  code: string          // Python OR-Tools
}

export type AIUnparsedConstraint = {
  id: string
  original: string
  reason: string
}

export type CompilerResult = {
  constraints: AICompiledConstraint[]
  unparsed: AIUnparsedConstraint[]
}

export type ConstraintViolation = {
  constraintId: string
  original: string
  violated: boolean
  reason: string
  confidence: number
}

export type VerifierResult = {
  violations: ConstraintViolation[]
  overallAssessment: string
}

export type ExecutionError = { constraintId: string; error: string }
export type ValidationError = { constraintId: string; error: string }
```

Cập nhật `TimetableSolveResult`:

```typescript
export type TimetableSolveResult = {
  status: 'solved' | 'infeasible' | 'error'
  message: string
  diagnostics: string[]
  cells: TimetableSolveCell[]
  compiledConstraints: AICompiledConstraint[]
  unparsedConstraints: AIUnparsedConstraint[]
  executionErrors: ExecutionError[]
  validationErrors: ValidationError[]
  iisConstraintIds: string[]
  violations: ConstraintViolation[]
  overallAssessment: string | null
  solverStats: SolverStats | null
  modelRequestPreview: ModelRequestPreview | null
}
```

### 2.2 `src/features/timetable/ai/prompt.ts` (thêm function mới)

#### `buildCompilerPrompts(input): ModelRequestPreview`

System prompt sẽ dài (~150-200 dòng). Cấu trúc:

```
[ROLE]
Bạn là Constraint Compiler cho bài toán xếp thời khóa biểu trường học Việt Nam.
Đầu vào là danh sách ràng buộc bằng tiếng Việt + entity (giáo viên, lớp, môn, slot).
Đầu ra là JSON gồm các ràng buộc đã được biên dịch sang code Python OR-Tools.

[NAMESPACE THỰC THI]
Mỗi snippet code được exec() trong namespace có sẵn các biến:
- model: cp_model.CpModel()
- x: dict[(assignmentId: str, slotId: str), BoolVar]
- assignments: list[dict] — keys: assignmentId, teacherId, teacherLabel,
  subjectId, subjectLabel, classId, classLabel, weeklyPeriods (int)
- slots: list[dict] — keys: slotId, dayId (vd "monday"), sessionId
  (vd "morning"|"afternoon"|"night"), period (int, 1-indexed)
- objective_terms: list[] — dùng cho soft constraint, append biểu thức weight*var
- Builtins: sum, len, range, zip, sorted, set, list, dict, tuple, any, all,
  min, max, int, bool, str, enumerate, abs, map, filter, round

CẤM:
- import bất kỳ thứ gì
- Truy cập attribute bắt đầu bằng "_" (vd model.__class__)
- Gọi exec/eval/open/getattr/setattr/__import__
- Định nghĩa def/class
- Gọi model.Maximize() hay model.Minimize() trực tiếp 
  (dùng objective_terms cho soft)

[QUY TẮC HARD vs SOFT]
- hard: vi phạm làm bài toán infeasible. Dùng model.Add()
- soft: ưu tiên khi có thể. KHÔNG dùng model.Add(); thay vào đó:
  objective_terms.append(weight * x[...])
  Hệ thống tự gọi model.Maximize(sum(objective_terms))

[OUTPUT FORMAT - JSON SCHEMA]
{
  "constraints": [
    {
      "id": "c1",
      "description": "Diễn giải ngắn (tiếng Việt)",
      "original": "Text ràng buộc gốc của user",
      "priority": "hard" | "soft",
      "weight": 5,   // chỉ khi priority="soft", 1-10
      "code": "Python code, mỗi dòng cách \\n"
    }
  ],
  "unparsed": [
    {"id":"c2","original":"...","reason":"..."}
  ]
}

[QUY TẮC SINH CODE]
1. Luôn lọc bằng *Label thay vì *Id (giá trị user đọc được).
2. Tên biến trung gian phải unique trong từng snippet (vd prefix bằng cid).
3. Snippet phải tự-chứa, không phụ thuộc snippet khác.
4. Nếu không chắc match entity nào → đưa vào unparsed, không đoán bừa.
5. Mỗi snippet ngắn (≤30 dòng). Không lồng nhiều cấp.

[FEW-SHOT EXAMPLES]
### Example 1: hard, giáo viên không dạy ngày cụ thể
Input: "Cô Lan không dạy thứ Bảy"
Output:
{
  "id":"c1",
  "description":"Giáo viên Lan không được xếp tiết vào thứ Bảy",
  "original":"Cô Lan không dạy thứ Bảy",
  "priority":"hard",
  "code":"c1_assigns = [a for a in assignments if a['teacherLabel'] == 'Lan']\nc1_slots = [s for s in slots if s['dayId'] == 'saturday']\nfor a in c1_assigns:\n    for s in c1_slots:\n        model.Add(x[(a['assignmentId'], s['slotId'])] == 0)"
}

### Example 2: soft, ưu tiên môn vào buổi
Input: "Toán nên xếp buổi sáng"
Output:
{
  "id":"c2",
  "description":"Ưu tiên xếp Toán vào buổi sáng",
  "original":"Toán nên xếp buổi sáng",
  "priority":"soft",
  "weight":5,
  "code":"c2_assigns = [a for a in assignments if a['subjectLabel'] == 'Toán']\nc2_slots = [s for s in slots if s['sessionId'] == 'morning']\nfor a in c2_assigns:\n    for s in c2_slots:\n        objective_terms.append(5 * x[(a['assignmentId'], s['slotId'])])"
}

### Example 3: hard, max tiết mỗi ngày của lớp
Input: "Lớp 9A không học quá 5 tiết một ngày"
Output:
{
  "id":"c3",
  "description":"Lớp 9A tối đa 5 tiết mỗi ngày",
  "original":"Lớp 9A không học quá 5 tiết một ngày",
  "priority":"hard",
  "code":"c3_assigns = [a for a in assignments if a['classLabel'] == '9A']\nc3_days = sorted(set(s['dayId'] for s in slots))\nfor day in c3_days:\n    c3_day_slots = [s for s in slots if s['dayId'] == day]\n    model.Add(sum(x[(a['assignmentId'], s['slotId'])] for a in c3_assigns for s in c3_day_slots) <= 5)"
}

### Example 4: hard, max tiết mỗi ngày của giáo viên
Input: "Thầy Nam dạy tối đa 4 tiết/ngày"
Output:
{
  "id":"c4",
  "description":"Giáo viên Nam dạy tối đa 4 tiết mỗi ngày",
  "original":"Thầy Nam dạy tối đa 4 tiết/ngày",
  "priority":"hard",
  "code":"c4_assigns = [a for a in assignments if a['teacherLabel'] == 'Nam']\nc4_days = sorted(set(s['dayId'] for s in slots))\nfor day in c4_days:\n    c4_day_slots = [s for s in slots if s['dayId'] == day]\n    model.Add(sum(x[(a['assignmentId'], s['slotId'])] for a in c4_assigns for s in c4_day_slots) <= 4)"
}

### Example 5: hard, pinned slot
Input: "Chào cờ xếp thứ Hai tiết 1 buổi sáng"
Output:
{
  "id":"c5",
  "description":"Tiết Chào cờ pin vào thứ Hai sáng tiết 1",
  "original":"Chào cờ xếp thứ Hai tiết 1 buổi sáng",
  "priority":"hard",
  "code":"c5_assigns = [a for a in assignments if a['subjectLabel'] == 'Chào cờ']\nc5_target = [s for s in slots if s['dayId']=='monday' and s['sessionId']=='morning' and s['period']==1]\nfor a in c5_assigns:\n    for s in c5_target:\n        model.Add(x[(a['assignmentId'], s['slotId'])] == 1)"
}

### Example 6: hard, 2 tiết liên tiếp trong tuần
Input: "Toán 9A phải có 1 cặp tiết liên tiếp trong tuần"
Output:
{
  "id":"c6",
  "description":"Toán 9A cần ít nhất 1 cặp tiết liên tiếp",
  "original":"Toán 9A phải có 1 cặp tiết liên tiếp trong tuần",
  "priority":"hard",
  "code":"c6_assigns = [a for a in assignments if a['subjectLabel']=='Toán' and a['classLabel']=='9A']\nc6_groups = {}\nfor s in slots:\n    c6_groups.setdefault((s['dayId'], s['sessionId']), []).append(s)\nc6_pairs = []\nfor k, group in c6_groups.items():\n    g = sorted(group, key=lambda s: s['period'])\n    for i in range(len(g)-1):\n        if g[i+1]['period'] == g[i]['period']+1:\n            c6_pairs.append((g[i]['slotId'], g[i+1]['slotId']))\nc6_pair_vars = []\nfor sid1, sid2 in c6_pairs:\n    p = model.NewBoolVar('c6_pair_'+sid1+'_'+sid2)\n    for a in c6_assigns:\n        model.Add(x[(a['assignmentId'], sid1)] >= p)\n        model.Add(x[(a['assignmentId'], sid2)] >= p)\n    c6_pair_vars.append(p)\nif c6_pair_vars:\n    model.Add(sum(c6_pair_vars) >= 1)"
}

### Example 7: hard, forbid slots
Input: "Không xếp tiết tối thứ Bảy"
Output:
{
  "id":"c7",
  "description":"Cấm xếp tiết vào tối thứ Bảy",
  "original":"Không xếp tiết tối thứ Bảy",
  "priority":"hard",
  "code":"c7_slots = [s for s in slots if s['dayId']=='saturday' and s['sessionId']=='night']\nfor a in assignments:\n    for s in c7_slots:\n        model.Add(x[(a['assignmentId'], s['slotId'])] == 0)"
}

### Example 8: unparsed
Input: "Lớp 8A vui vẻ thoải mái" → đưa vào unparsed:
{"id":"c8","original":"Lớp 8A vui vẻ thoải mái","reason":"Không phải ràng buộc lịch học cụ thể."}

[KẾT THÚC PROMPT — chỉ trả JSON, không markdown]
```

User prompt format (truyền entity + danh sách raw constraints):

```json
{
  "entities": {
    "teachers": [...],
    "subjects": [...],
    "classes": [...],
    "dayIds": [...],
    "sessionIds": [...]
  },
  "rawConstraints": [
    {"id":"c1","priority":"required|preferred","text":"..."}
  ],
  "context": "Lưu ý: priority='required' → ưu tiên dịch thành hard. preferred → soft."
}
```

Function signature:

```typescript
export function buildCompilerPrompts(input: any): ModelRequestPreview
```

Implementation tương tự `buildDevstralRequestPreview` cũ, nhưng `messages[0].content` là system prompt ở trên, `messages[1].content` là user prompt format. `response_format` dùng `json_schema` với schema chính xác.

### 2.3 `src/features/timetable/ai/devstral.ts` (extend)

#### `compileConstraintsWithAI(preview, apiKey): Promise<CompilerResult>`

Logic:
1. POST `${LOWPRIZO_API_BASE_URL}/v1/chat/completions` với preview body.
2. Parse `data.choices[0].message.content` → JSON.
3. Validate shape (constraints array, unparsed array).
4. Nếu fail bất kỳ bước nào → fallback: `{constraints: [], unparsed: rawConstraints.map(c => {id:c.id, original:c.text, reason:"AI compile thất bại"})}`

#### `verifySolutionWithAI(args, apiKey): Promise<VerifierResult>`

Input args:
- `rawConstraints: {id, text, priority}[]`
- `cells: TimetableSolveCell[]`
- `compiledConstraints: AICompiledConstraint[]`
- `entities` (như compiler)

Logic: Tạo prompt verifier riêng (system + user), gọi LLM, parse JSON. Fallback trả về `{violations: [], overallAssessment: "Verifier không khả dụng."}`.

#### `buildVerifierPrompts(args)` trong `prompt.ts`

System prompt:
```
[ROLE]
Bạn là Solution Verifier cho bài toán xếp thời khóa biểu.
Đầu vào: danh sách ràng buộc gốc của user + thời khóa biểu (cells).
Nhiệm vụ: kiểm tra từng ràng buộc gốc xem có bị vi phạm bởi cells hay không.

[OUTPUT JSON]
{
  "violations": [
    {
      "constraintId": "c1",
      "original": "Cô Lan không dạy thứ Bảy",
      "violated": true,
      "reason": "Phát hiện cô Lan dạy slot saturday-morning-2",
      "confidence": 0.95
    }
  ],
  "overallAssessment": "1 vi phạm phát hiện được. Các ràng buộc còn lại thỏa mãn."
}

[QUY TẮC]
- Chỉ flag confidence ≥ 0.7
- Nếu không chắc, KHÔNG flag (better silent than wrong)
- overallAssessment 1-2 câu tiếng Việt
```

### 2.4 `src/features/timetable/ai/normalize.ts`

Đơn giản hóa: chỉ build `solverInput` skeleton, KHÔNG include constraints AI nữa. Constraints sẽ được inject từ route sau khi gọi compiler.

```typescript
export function buildSolverInput(input: any) {
  // ... same as before, but constraints field becomes:
  return {
    slots, assignments,
    aiCompiledConstraints: [],   // sẽ inject sau
    unparsedConstraints: [],
    rawConstraints: input.constraints.map((c, i) => ({
      id: `c${i+1}`,
      priority: c.type === 'required' ? 'required' : 'preferred',
      text: c.text
    })),
    solverConfig: {...}
  }
}
```

### 2.5 `src/app/api/generate-timetable/route.ts` (rewrite POST)

```typescript
export async function POST(request: Request) {
  try {
    const input = await request.json()
    const apiKey = readApiKey(input, request)  // helper
    if (!apiKey) return NextResponse.json({error:'...'}, {status:400})

    // 1. Build entities + raw constraints
    const solverInput = buildSolverInput(input)
    const entities = extractEntities(solverInput)

    // 2. Stage 1: AI Compiler
    const compilerPreview = buildCompilerPrompts({ entities, rawConstraints: solverInput.rawConstraints })
    const compileResult = await compileConstraintsWithAI(compilerPreview, apiKey)

    // 3. Inject compiled constraints + run solver
    solverInput.aiCompiledConstraints = compileResult.constraints
    solverInput.unparsedConstraints = compileResult.unparsed

    const solverResult = await runPythonSolver(solverInput)

    // 4. Stage 2: Verifier (chỉ khi solved)
    let verifierResult: VerifierResult = { violations: [], overallAssessment: '' }
    if (solverResult.status === 'solved') {
      verifierResult = await verifySolutionWithAI({
        rawConstraints: solverInput.rawConstraints,
        cells: solverResult.cells,
        compiledConstraints: compileResult.constraints,
        entities
      }, apiKey)
    }

    // 5. Combine response
    return NextResponse.json({
      status: solverResult.status,
      message: solverResult.message,
      diagnostics: solverResult.diagnostics ?? [],
      cells: solverResult.cells ?? [],
      compiledConstraints: compileResult.constraints,
      unparsedConstraints: compileResult.unparsed,
      executionErrors: solverResult.executionErrors ?? [],
      validationErrors: solverResult.validationErrors ?? [],
      iisConstraintIds: solverResult.iisConstraintIds ?? [],
      violations: verifierResult.violations,
      overallAssessment: verifierResult.overallAssessment,
      solverStats: solverResult.solverStats ?? null,
      modelRequestPreview: compilerPreview,
    })
  } catch (error) {
    return NextResponse.json({error: ...}, {status: 500})
  }
}
```

### 2.6 Acceptance Phase 2

Test thủ công với 4-5 prompt qua UI:
- "Cô Lan không dạy thứ Bảy" → compiled, solved, no violations
- "Lớp 9A không học quá 5 tiết/ngày" → compiled, solved
- Hai ràng buộc xung đột → infeasible, iisConstraintIds có 2 phần tử
- Ràng buộc vô nghĩa → unparsed
- Lỗi cú pháp do AI sinh → executionErrors có ghi nhận

---

## Phase 3: UI surface

### 3.1 Trong `TimetableApp.tsx`, sửa phần render result

Thêm các section sau result chính:

#### a) "Cách AI hiểu ràng buộc của bạn"
Hiển thị `compiledConstraints[]` dạng list:
- `description` (tiếng Việt)
- Badge `hard|soft` + weight nếu soft
- Toggle "Xem code" → hiện `code` (read-only, syntax-highlighted)

#### b) "Ràng buộc chưa hiểu được"
Hiển thị `unparsedConstraints[]`:
- `original` + `reason`
- Icon cảnh báo vàng

#### c) "Vi phạm phát hiện" (chỉ khi `violations.length > 0`)
- Background đỏ nhạt
- Mỗi violation: `original` + `reason` + confidence
- Hiển thị `overallAssessment` ở header section

#### d) "Lý do không xếp được" (chỉ khi `status='infeasible'`)
- Liệt kê các `compiledConstraints` có `id ∈ iisConstraintIds`
- Câu chốt: "Các ràng buộc này xung đột nhau. Hãy bỏ hoặc nới lỏng một trong số đó."

#### e) "Lỗi kỹ thuật" (collapsible, chỉ hiện khi có)
- `executionErrors[]` + `validationErrors[]`
- Mục đích: debug cho dev, ẩn mặc định

---

## Phase 4: Hardening + Polish

### 4.1 Safety
- Trong `route.ts`, thêm timeout cho Python subprocess (vd 30s).
- Trong `runPythonSolver`, kill child nếu quá thời gian.

### 4.2 Logging
- Mỗi request log: số constraint nhập, số compiled, số unparsed, status, IIS size, violations count.

### 4.3 Update existing legacy code
- Xóa hàm `normalizeConstraintsWithDevstral` cũ (đã thay bằng compiler).
- Xóa fallback regex cũ trong `devstral.ts`.
- Xóa schema `teacher_unavailable` / `prefer_subject_session` trong `types.ts` (giữ tương thích nếu cần, hoặc xóa hẳn).

---

## Thứ tự build đề xuất

1. **P0**: setup venv + pytest (15ph)
2. **P1.1**: viết `validator.py` + tests (1h)
3. **P1.2**: rewrite `solver.py` + tests (3h)
4. **P2.1**: types + `buildCompilerPrompts` + system prompt (2h)
5. **P2.3**: `compileConstraintsWithAI` + fallback (1h)
6. **P2.5**: rewrite route.ts (1h) — đến đây đã có pipeline end-to-end, test được
7. **P2.3**: `verifySolutionWithAI` + verifier prompt (1.5h)
8. **P3**: UI sections (3h)
9. **P4**: hardening (1h)

Tổng: ~14h coding + test.

---

## Checklist review (sau khi bạn code xong)

- [ ] `.venv` không commit, có trong .gitignore
- [ ] `validator.py` reject mọi case trong test_validator.py
- [ ] `solver.py` pass tất cả test_solver.py
- [ ] System prompt compiler có đủ ≥6 few-shot examples
- [ ] Code AI sinh ra qua AST validator OK trước khi exec
- [ ] Hard constraint có gắn assumption literal, IIS hoạt động
- [ ] Soft constraint chỉ append vào `objective_terms`, không gọi `model.Maximize` trực tiếp
- [ ] Python subprocess có timeout
- [ ] Route trả về đủ field theo `TimetableSolveResult` mới
- [ ] UI hiển thị compiledConstraints, unparsed, violations, iisConstraintIds
- [ ] Fallback khi LLM fail: không crash, vẫn solve được (nếu không có constraint)
- [ ] Không còn reference đến `normalizeConstraintsWithDevstral` cũ

---

## Rủi ro & mitigation

| Rủi ro | Mức | Mitigation |
|--------|-----|------------|
| AI sinh code sai cú pháp | Cao | Try/except quanh exec, log executionErrors, không crash |
| AI lách AST validator | Trung | Whitelist nghiêm ngặt, chặn dunder, chặn getattr |
| Devstral quá yếu cho task này | Cao | Sau khi build P2.1+P2.3, test với 10 prompt thực tế. Nếu fail >30% → cần đổi model hoặc thêm few-shot |
| Infeasible giả (do AI parse sai) | Trung | Verifier ở Stage 2 sẽ phát hiện. Cũng nên hiển thị `compiledConstraints` để user check |
| OnlyEnforceIf không hỗ trợ với mọi loại constraint | Thấp | Try/except trong proxy, fallback giữ constraint hard (không vào IIS map) |
| Code AI làm timeout solver | Trung | maxTimeSeconds=20s mặc định, log nếu timeout |

---

## Câu hỏi/quyết định còn mở

1. Có giữ legacy schema (`teacher_unavailable`/`prefer_subject_session`) làm fallback nếu LLM fail hoàn toàn không? — Đề xuất: **không**, để tránh code chết.
2. Verifier có cần qua AI luôn không, hay làm deterministic check (vd parse re-run code AI để check cells)? — Đề xuất: **bắt đầu bằng AI**, sau này có thể bổ sung deterministic check cho các loại constraint đã biết.
3. UI có cho user edit `compiledConstraints.code` trước khi solve không? — Phase 5 (sau).
