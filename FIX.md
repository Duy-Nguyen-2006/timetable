# FIX.md — Sửa pipeline ràng buộc timetable backend

## 0. Kết luận kiểm tra

Reviewer kia bắt đúng lỗi gốc: ràng buộc kiểu **“mọi môn / tối đa N tiết liên tiếp”** có thể đi vào solver dưới dạng `subject_max_consecutive` nhưng `params.subject` là sentinel (`__all__`, `all`) hoặc bị thiếu. Các path enforce/verify hiện đang so khớp subject bằng string cụ thể, nên sentinel/missing subject tạo thành **no-op**: solver không add constraint/penalty, validator cũng không báo vi phạm.

Có vài điểm cần đính chính:

1. Text UI “Môn mọi môn” **không chứng minh chắc chắn** parser set `subject = '__all__'`. Trong humanizer hiện tại, nếu `subject` bị thiếu thì nó cũng in fallback là “mọi môn”. Tuy vậy cả 2 case (`__all__` và missing subject) đều đang nguy hiểm.
2. Deterministic translator path đã có logic expand “mọi môn” ra từng môn cụ thể. Bug chính nằm ở các path AI analyze/reparse/manual/confirmed specs chưa normalize lại trước solve.
3. Docker fallback không hoàn toàn im lặng ở backend: Electron main có emit `solver-runtime:notice`. Việc còn lại là kiểm tra UI có subscribe và show warning thật không.
4. Các lỗi custom_dsl/CEGAR/IR là thật trong code skeleton/IR, nhưng một số lỗi không phải nguyên nhân trực tiếp của case 4 tiết Văn nếu app đang chạy deterministic built-in path. Vẫn nên sửa vì dễ gây lỗi về sau.

---

## 1. P0 — Sửa lỗi `subject_max_consecutive` với “mọi môn”

### 1.1. Vấn đề hiện tại

Các producer có thể tạo spec kiểu:

```ts
{
  kind: 'subject_max_consecutive',
  severity: 'soft',
  params: {
    subject: '__all__', // hoặc 'all', hoặc thiếu subject
    max: 2,
    maxConsecutive: 2
  },
  weight: 8
}
```

Nhưng solver Python đang xử lý theo subject cụ thể:

```py
asgs = [a for a in assignments if a["class"] == c and a["subject"] == subject]
if not asgs:
    continue
```

Nếu `subject = '__all__'`, không assignment nào match. Nếu thiếu subject, cũng không match. Kết quả: không add hard constraint, không add soft penalty.

Validator TS cũng lọc:

```ts
if (entry.subject !== subject) continue;
```

nên `__all__` / missing subject cũng không phát hiện vi phạm.

### 1.2. Cách sửa đúng: normalize/expand trước khi solve

Tạo file mới:

```txt
src/features/timetable/ai/constraint-spec-normalizer.ts
```

Nhiệm vụ của file này:

- Chuẩn hóa alias “mọi môn” về universal subject.
- Expand universal subject thành nhiều spec subject cụ thể.
- Chuẩn hóa `max` và `maxConsecutive`.
- Chặn malformed spec trước khi solver chạy.

Code skeleton gợi ý:

```ts
import type { AgentInputPayload } from './types';
import type { ConstraintSpec } from './constraint-spec';
import { normalizeConstraintText } from './translator-text';

const ALL_SUBJECT_SENTINELS = new Set([
  '',
  '__all__',
  'all',
  'all_subjects',
  'all subjects',
  'mọi môn',
  'moi mon',
  'tất cả môn',
  'tat ca mon',
]);

export type SpecNormalizationIssue = {
  code: string;
  constraintId?: string;
  message: string;
};

function normalizedValue(value: unknown): string {
  return normalizeConstraintText(String(value ?? '').trim());
}

export function isAllSubjectValue(value: unknown): boolean {
  const raw = String(value ?? '').trim();
  if (!raw) return true;
  return ALL_SUBJECT_SENTINELS.has(raw) || ALL_SUBJECT_SENTINELS.has(normalizedValue(raw));
}

function uniqueSubjects(input: AgentInputPayload, classes?: string[]): string[] {
  const classSet = Array.isArray(classes) && classes.length ? new Set(classes.map(String)) : null;
  const subjects = new Set<string>();
  for (const a of input.assignments) {
    if (classSet && !classSet.has(a.class.label)) continue;
    subjects.add(a.subject.label);
  }
  return [...subjects].sort((a, b) => a.localeCompare(b, 'vi'));
}

function canonicalMax(params: Record<string, unknown>): number | null {
  const raw = params.maxConsecutive ?? params.max;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return null;
  return Math.floor(value);
}

function normalizeSubjectMaxConsecutive(
  spec: ConstraintSpec,
  input: AgentInputPayload
): { specs: ConstraintSpec[]; issues: SpecNormalizationIssue[] } {
  const max = canonicalMax(spec.params);
  if (max === null) {
    return {
      specs: [],
      issues: [{
        code: 'invalid_max_consecutive',
        constraintId: spec.id,
        message: `Ràng buộc ${spec.id} thiếu maxConsecutive/max hợp lệ.`,
      }],
    };
  }

  const classes = Array.isArray(spec.params.classes)
    ? spec.params.classes.map(String).filter(Boolean)
    : undefined;

  const subject = spec.params.subject;
  const subjects = isAllSubjectValue(subject)
    ? uniqueSubjects(input, classes)
    : [String(subject).trim()].filter(Boolean);

  if (!subjects.length) {
    return {
      specs: [],
      issues: [{
        code: 'no_subject_targets',
        constraintId: spec.id,
        message: `Ràng buộc ${spec.id} không tìm được môn áp dụng.`,
      }],
    };
  }

  const normalized = subjects.map((subjectLabel, index) => ({
    ...spec,
    id: subjects.length === 1 ? spec.id : `${spec.id}_${index + 1}`,
    params: {
      ...spec.params,
      subject: subjectLabel,
      maxConsecutive: max,
      max,
      ...(classes?.length ? { classes } : {}),
    },
    notes: [spec.notes, isAllSubjectValue(subject) ? `expanded_from_all_subject:${spec.id}` : '']
      .filter(Boolean)
      .join(';'),
  }));

  return { specs: normalized, issues: [] };
}

export function normalizeConstraintSpecsForSolving(
  input: AgentInputPayload,
  specs: ConstraintSpec[]
): { specs: ConstraintSpec[]; issues: SpecNormalizationIssue[] } {
  const out: ConstraintSpec[] = [];
  const issues: SpecNormalizationIssue[] = [];

  for (const spec of specs) {
    if (spec.kind === 'subject_max_consecutive') {
      const result = normalizeSubjectMaxConsecutive(spec, input);
      out.push(...result.specs);
      issues.push(...result.issues);
      continue;
    }

    out.push(spec);
  }

  return { specs: out, issues };
}
```

### 1.3. Gắn normalizer vào các điểm bắt buộc

#### File: `src/features/timetable/ai/constraint-parse-service.ts`

Sau khi có specs từ translator/rule parser, gọi:

```ts
const normalized = normalizeConstraintSpecsForSolving(input, specs);
if (normalized.issues.length) {
  // draft needs_review, không cho confirm xanh
}
const specsForDraft = normalized.specs;
```

#### File: `src/features/timetable/ai/analyze-constraint-service.ts`

Sau khi map LLM response thành `ConstraintSpec[]`, bắt buộc normalize trước khi return:

```ts
const normalized = normalizeConstraintSpecsForSolving(agentInput, specs);
if (normalized.issues.length) {
  return {
    status: 'needs_clarification',
    normalizedText: rawText,
    specs: [],
    confidence: 'low',
    clarificationQuestions: normalized.issues.map((i) => i.message),
    assumptions: [],
    unresolvedQuestions: normalized.issues.map((i) => i.message),
    rawResponse: content,
    usageTokens: response.usage?.total_tokens,
  };
}
resolvedSpecs = normalized.specs;
```

Quan trọng: không chỉ normalize LLM specs. Sau deterministic fallback cũng normalize lại lần nữa để mọi path giống nhau.

#### File: `src/features/timetable/ai/reparse-candidate-validator.ts`

Trước `validateConstraintSpecs(...)`, normalize:

```ts
const normalized = normalizeConstraintSpecsForSolving(input, specs);
if (normalized.issues.length) {
  return { ok: false, issues: normalized.issues.map(...), status: 'needs_review' };
}
const validation = validateConstraintSpecs(input, normalized.specs, ...);
return { ok: true, specs: normalized.specs };
```

#### File: `src/features/timetable/ai/solver-constraint-gate.ts`

Sau khi flatten `confirmedConstraints` thành `preTranslatedSpecs`, normalize lại lần cuối:

```ts
const normalized = normalizeConstraintSpecsForSolving(input, preTranslatedSpecs);
if (normalized.issues.length) {
  return {
    ok: false,
    status: 422,
    error: 'Một số ràng buộc đã xác nhận chưa hợp lệ để xếp lịch.',
    messages: normalized.issues.map((i) => i.message),
    warnings,
  };
}
preTranslatedSpecs = normalized.specs;
```

Quy tắc: malformed soft cũng phải block hoặc warning đỏ, không được âm thầm bỏ qua.

#### File: `src/features/timetable/ai/deterministic-solver.ts`

Trước khi gửi specs sang Python, normalize lần cuối như safety net.

---

## 2. P0 — Sửa solver Python để không còn no-op âm thầm

File:

```txt
python/templates/solver_skeleton.py
```

### 2.1. Thêm helper sentinel subject

Đặt gần đầu file, sau import:

```py
ALL_SUBJECT_SENTINELS = {
    '', '__all__', 'all', 'all_subjects', 'all subjects',
    'mọi môn', 'moi mon', 'tất cả môn', 'tat ca mon',
}

def _norm_text(value):
    return str(value or '').strip().lower()

def _is_all_subject(value):
    return _norm_text(value) in ALL_SUBJECT_SENTINELS

def _subjects_for_class(raw_subject, class_name):
    if _is_all_subject(raw_subject):
        return sorted({a['subject'] for a in assignments if a['class'] == class_name})
    return [str(raw_subject or '').strip()]
```

### 2.2. Sửa `_add_subject_max_consecutive`

Đổi đọc max:

```py
max_consecutive = int(params.get('maxConsecutive', params.get('max', 1)) or 1)
```

Đổi logic target subject:

```py
added_terms = 0
noop_targets = []

for c in target_classes:
    for current_subject in _subjects_for_class(subject, c):
        if not current_subject:
            continue

        asgs = [
            a for a in assignments
            if a['class'] == c and a['subject'] == current_subject
        ]
        if not asgs:
            noop_targets.append({'class': c, 'subject': current_subject})
            continue

        # giữ logic window hiện tại, nhưng dùng current_subject thay cho subject
        # ...
        added_terms += 1

if added_terms == 0:
    msg = f"subject_max_consecutive produced no terms: subject={subject!r}, classes={target_classes!r}"
    if soft_terms_ref is None:
        raise ValueError(msg)
    unsupported_soft_kinds.append({
        'id': spec.get('id'),
        'kind': 'subject_max_consecutive',
        'reason': msg,
    })
```

Lưu ý: soft no-op không nên im lặng. Ít nhất phải ghi vào result diagnostics.

---

## 3. P0 — Sửa deterministic validator để bắt được vi phạm

File:

```txt
src/features/timetable/ai/deterministic-validator.ts
```

### 3.1. Đọc cả `maxConsecutive` và `max`

Đổi:

```ts
const parsedMax = Number(spec.params.maxConsecutive);
```

thành:

```ts
const parsedMax = Number(spec.params.maxConsecutive ?? spec.params.max);
```

Nếu thiếu max, không được default lung tung. Với hard thì tạo violation/unchecked fail-closed. Với soft thì tạo soft warning.

### 3.2. Support universal subject

Trong `checkSubjectMaxConsecutive`, thay filter subject đơn bằng grouping theo subject thật:

```ts
const rawSubject = spec.params.subject;
const allSubjects = isAllSubjectValue(rawSubject);
const subject = String(rawSubject ?? '').trim();

for (const entry of schedule) {
  if (!allSubjects && entry.subject !== subject) continue;
  const period = toPeriod(entry.period);
  if (period === null) continue;

  const key = allSubjects
    ? `${entry.class}::${entry.day}::${entry.subject}`
    : `${entry.class}::${entry.day}`;

  appendToGroup(grouped, key, entry);
}
```

Message violation phải ghi rõ môn thật:

```ts
message: `Lớp ${klass} có môn ${actualSubject} ${streak} tiết liên tiếp trong ${day}, vượt tối đa ${max}.`
```

---

## 4. P0 — Surface soft violations ra UI/result

File chính:

```txt
src/features/timetable/ai/deterministic-solver.ts
src/features/timetable/ai/local-agent.ts
src/features/timetable/solver-ui.ts
src/features/timetable/components/PreviewPage.tsx
```

### 4.1. Vấn đề

`validateSchedule(...)` đã có `softViolations`, `softConstraintPass`, nhưng final result có thể trả `violations: []`, làm UI tưởng mọi thứ xanh.

### 4.2. Cách sửa

Trong result trả về, thêm field:

```ts
softViolations: report.softViolations,
softViolationCount: report.softViolations.length,
hardViolations: report.hardViolations,
```

`violations` không nên luôn là `[]`. Có thể set:

```ts
violations: [...report.hardViolations, ...report.softViolations]
```

Message:

```ts
const softCount = report.softViolations.length;
const message = softCount > 0
  ? `Đã xếp lịch thành công nhưng còn ${softCount} vi phạm ràng buộc ưu tiên.`
  : 'Đã xếp lịch thành công.';
```

UI cần hiển thị warning:

```txt
Xếp lịch thành công, nhưng còn N vi phạm ràng buộc ưu tiên.
Nếu muốn cấm tuyệt đối, hãy đổi ràng buộc đó thành “Bắt buộc”.
```

Không fail solve chỉ vì soft violation.

---

## 5. P1 — Chuẩn hóa `max` vs `maxConsecutive`

### 5.1. Vấn đề

Hiện các module không thống nhất:

- Registry yêu cầu `max`.
- Solver đọc `maxConsecutive`, default 1.
- TS validator đọc `maxConsecutive`, default 1.
- Macros đọc `max` rồi `maxConsecutive`, default 999.

Cùng một spec có thể bị hiểu khác nhau.

### 5.2. Quyết định chuẩn

Dùng canonical key:

```txt
maxConsecutive
```

Giữ `max` chỉ để backward compatible trong 1-2 release.

### 5.3. File cần sửa

```txt
src/features/timetable/ai/constraint-registry.ts
src/features/timetable/constraints/constraint-form-schema.ts
src/features/timetable/constraints/constraint-wizard-prefill.ts
src/features/timetable/ai/translator.ts
src/features/timetable/ai/built-in-suggestion.ts
src/features/timetable/ai/constraint-humanizer.ts
src/features/timetable/ai/deterministic-validator.ts
python/templates/solver_skeleton.py
python/macros.py
python/validator_engine.py
```

### 5.4. Patch cụ thể

Trong registry:

```ts
// cũ
requiredParams: ['subject', 'max']

// mới
requiredParams: ['subject', 'maxConsecutive']
```

Trong mọi reader:

```ts
const max = Number(params.maxConsecutive ?? params.max);
```

Không dùng default 1/999/0 nếu param thiếu. Missing max là parse error/needs_review.

Trong mọi producer, viết cả 2 key tạm thời:

```ts
params: {
  subject,
  maxConsecutive: 2,
  max: 2,
}
```

Sau khi ổn định thì bỏ `max`.

---

## 6. P1 — Sửa `python/macros.py` và `python/validator_engine.py`

### 6.1. File: `python/macros.py`

Sửa branch `subject_max_consecutive`:

- Đọc max bằng `maxConsecutive ?? max`.
- Không default 999.
- Support universal subject bằng cách expand sang từng subject thật hoặc tạo IR quantifier over `subjects`.
- Không emit `classSubjectAt(subject='__all__')`.

Gợi ý đơn giản nhất: nếu `subject` là universal, tạo `and` của nhiều IR con, mỗi IR con là một subject cụ thể trong env/input.

### 6.2. File: `python/validator_engine.py`

Thêm checker `subject_max_consecutive` vào `_check_single`.

Pseudo:

```py
if kind == 'subject_max_consecutive':
    return _check_subject_max_consecutive(spec, schedule)
```

Checker:

```py
def _check_subject_max_consecutive(spec, schedule):
    params = spec.get('params', {})
    max_c = int(params.get('maxConsecutive', params.get('max')))
    raw_subject = params.get('subject', '')
    all_subjects = _is_all_subject(raw_subject)

    groups = {}
    for e in schedule:
        if not all_subjects and e.get('subject') != raw_subject:
            continue
        key = (e.get('class'), e.get('day'), e.get('subject') if all_subjects else raw_subject)
        groups.setdefault(key, []).append(e)

    # sort periods, detect streak > max_c
```

---

## 7. P1 — Sửa IR path drift/mismatch

### 7.1. File: `python/templates/solver_skeleton.py`

#### Bug A: import `DerivedVars` sai chỗ

Hiện skeleton cố import `DerivedVars` từ `ir_compiler`. Phải sửa thành:

```py
from ir_compiler import compile_constraint
from ir_derived import DerivedVars as _DV
```

Fallback `sys.path` cũng sửa tương tự.

#### Bug B: skeleton chỉ đọc top-level `expr`, trong khi TS thường đặt IR ở `params.expr`

Thêm helper:

```py
def _get_ir_expr(spec):
    if isinstance(spec.get('expr'), dict):
        return spec.get('expr')
    params = spec.get('params') or {}
    if isinstance(params.get('expr'), dict):
        return params.get('expr')
    return None
```

Đổi:

```py
_ir_specs = [s for s in constraints if isinstance(s.get('expr'), dict)]
```

thành:

```py
_ir_specs = [s for s in constraints if isinstance(_get_ir_expr(s), dict)]
```

Khi compile, copy expr ra top-level:

```py
_ir_spec_for_compile = dict(_ir_spec)
_ir_spec_for_compile['expr'] = _get_ir_expr(_ir_spec)
compile_constraint(model, _ir_spec_for_compile, _dv, _ir_env, soft_terms)
```

Custom specs filter cũng phải exclude `params.expr` để không đưa IR custom vào custom Python predicate path.

### 7.2. File: `python/ir_compiler.py`

#### Bug: `consecutive` dùng adjacency trong list, không kiểm tiết liền kề số học

Hiện nếu domain periods là `[1, 2, 4, 5]`, window `[2, 4]` bị coi là liền kề vì đứng cạnh nhau trong list.

Thêm helper:

```py
def _is_numeric_consecutive_window(values):
    try:
        ints = [int(v) for v in values]
    except (TypeError, ValueError):
        return True
    return all(ints[i + 1] == ints[i] + 1 for i in range(len(ints) - 1))
```

Trong loop window:

```py
window_vals = domain_vals[i:i+k]
if not _is_numeric_consecutive_window(window_vals):
    continue
```

#### Bug: `teachesOnDay` dùng `env['periods']` global

Nếu có `periodsByDay`, phải dùng periods của day đó:

```py
def _periods_for_day(env, day):
    pbd = env.get('periodsByDay') or env.get('periods_by_day') or {}
    return pbd.get(str(day)) or env.get('periods', [])
```

Dùng helper này trong `teachesOnDay`.

### 7.3. File: `python/ir_eval.py`

Sửa logic `consecutive` giống compiler để enforce == verify.

Sửa `teachesOnDay` dùng periods theo day.

### 7.4. File: `python/ir_derived.py`

`DerivedVars.teachesOnDay` hiện là placeholder luôn true. Sửa một trong hai hướng:

Hướng A — implement thật:

```py
class DerivedVars:
    def __init__(self, model, slots, assignments, periods=None, periods_by_day=None):
        self.periods = periods or []
        self.periods_by_day = periods_by_day or {}

    def teachesOnDay(self, teacher, day):
        periods = self.periods_by_day.get(day) or self.periods
        vars_ = [
            var for (assignment_id, d, p), var in self.slots.items()
            if d == day and p in periods and self.assignment_by_id[assignment_id]['teacher'] == teacher
        ]
        b = self.model.NewBoolVar(...)
        if vars_:
            self.model.AddMaxEquality(b, vars_)
        else:
            self.model.Add(b == 0)
        return b
```

Hướng B — nếu chưa dùng: xóa method hoặc raise `NotImplementedError` để không tạo bug âm thầm.

---

## 8. P1 — Sửa custom_dsl hard / CEGAR / predicate security

File:

```txt
python/templates/solver_skeleton.py
python/code_executor.py
src/features/timetable/ai/constraint-preflight.ts
src/features/timetable/ai/solver-constraint-gate.ts
```

### 8.1. CEGAR dùng deadline chung

Hiện mỗi vòng CEGAR set lại full budget:

```py
solver.parameters.max_time_in_seconds = _max_seconds
```

Sửa thành deadline tuyệt đối:

```py
import time

_solve_start = time.monotonic()
_deadline = _solve_start + _max_seconds

def _remaining_seconds():
    return max(1, int(_deadline - time.monotonic()))
```

Trong mỗi vòng:

```py
remaining = _remaining_seconds()
if remaining <= 0:
    result['status'] = 'timeout'
    best_values = None
    break
solver.parameters.max_time_in_seconds = remaining
```

### 8.2. Không trả solution nếu hard custom vẫn fail sau max rounds

Sau vòng while:

```py
if _custom_hard_failed(custom_checks):
    result['status'] = 'infeasible'
    result['customChecks'] = custom_checks
    result['customCegarExhausted'] = True
    best_values = None
```

### 8.3. `_custom_hard_failed` phải fail-closed

Hiện predicate error hoặc missing predicate có thể `checked: False`, rồi không bị coi là failed.

Sửa:

```py
def _custom_hard_failed(checks):
    hard_custom_ids = {...}
    seen = {c.get('id') for c in checks}
    if hard_custom_ids - seen:
        return True
    return any(
        c.get('id') in hard_custom_ids and not c.get('ok')
        for c in checks
    )
```

### 8.4. Không `exec` predicate không qua kiểm soát

Nếu vẫn giữ `pythonPredicate`:

- AST-parse predicate source trước khi exec.
- Reject `Import`, `ImportFrom`, `Exec`, `Eval`, forbidden dunder attrs.
- Không cho access object introspection.

Tốt hơn: ngừng support `pythonPredicate` runtime; convert custom constraints sang IR `params.expr`.

---

## 9. P2 — Sửa `teacher_homeroom_first_period`

File:

```txt
python/templates/solver_skeleton.py
```

### 9.1. Vấn đề

Logic hiện tại ép:

```py
model.Add(sum(pinned) >= 1)
```

cho mọi target day. Điều này nghĩa là GVCN phải có tiết đầu với lớp đó mỗi ngày, kể cả ngày không định dạy.

### 9.2. Chọn lại semantic

Nếu đúng ý là:

> “Nếu GVCN có dạy lớp đó trong ngày d, thì tiết đầu của ngày đó nên/phải là GVCN”

thì sửa:

```py
for d in target_days:
    day_vars = [slot của homeroom teacher với class đó trong ngày d]
    first_vars = [slot của homeroom teacher với class đó tại first_period]

    has_day = model.NewBoolVar(...)
    model.Add(sum(day_vars) >= 1).OnlyEnforceIf(has_day)
    model.Add(sum(day_vars) == 0).OnlyEnforceIf(has_day.Not())
    model.Add(sum(first_vars) >= 1).OnlyEnforceIf(has_day)
```

Nếu muốn ép mỗi ngày đều có tiết GVCN đầu ngày, giữ logic cũ nhưng đổi tên kind/UI copy cho rõ:

```txt
required_daily_homeroom_first_period
```

---

## 10. P2 — Capacity check và auto-relaxation

### 10.1. File: `src/features/timetable/ai/capacity-check.ts`

Sửa:

1. `periodCountForSession` không fallback bằng `Math.max(...)` vì overestimate slot.
2. Dùng active periods từ `translator-periods.ts` hoặc `input-compressor.ts`.
3. Tính cả whitelist constraints:
   - `teacher_allowed_days`
   - `teacher_allowed_periods`
   - `class_allowed_days`
   - `class_allowed_periods`
4. Check capacity giáo viên theo ngày/slot: giáo viên không thể dạy 2 lớp cùng slot.

### 10.2. File: `src/features/timetable/ai/auto-relaxation.ts`

Hiện relax theo heuristic, không theo nguyên nhân infeasible. Cần:

1. Nếu có IIS/conflict core thì relax theo conflict core.
2. Nếu relax `subject_max_consecutive` universal, phải chạy normalizer trước, tránh relax xong thành soft no-op.
3. Log rõ constraint nào bị relax và vì sao.

---

## 11. P2 — Docker fallback notice

Files:

```txt
electron/main.mjs
electron/preload.ts
electron/preload.cjs
src/features/timetable/components/SetupPages.tsx
```

Backend đã có `solver-runtime:notice`. Cần kiểm tra UI:

```ts
window.electron?.solverRuntime?.onNotice((payload) => {
  // show toast/banner
});
```

Acceptance: chọn Docker khi Docker unavailable thì UI phải hiện warning rõ:

```txt
Docker không khả dụng, hệ thống đang fallback sang Bundled solver.
```

---

## 12. Tests bắt buộc

### 12.1. Normalizer tests

File mới:

```txt
src/features/timetable/ai/constraint-spec-normalizer.test.ts
```

Case 1:

```ts
subject_max_consecutive subject='__all__', max=2
assignments có Toán, Văn
=> output 2 specs: Toán, Văn; mỗi spec có max=2 và maxConsecutive=2
```

Case 2:

```ts
subject thiếu, original có “mọi môn”
=> expand tất cả môn
```

Case 3:

```ts
chỉ có params.max = 2
=> output params.maxConsecutive = 2, không default thành 1
```

Case 4:

```ts
max thiếu hoặc max <= 0
=> issues invalid_max_consecutive
```

### 12.2. Solver hard test

Input:

- Lớp 6A.
- Môn Văn 4 tiết/tuần.
- Một ngày có 4 period.
- Hard `subject_max_consecutive` Văn max 2.

Expected:

- Solver không trả schedule 4 Văn liên tiếp.
- Nếu không có nghiệm khác thì status infeasible/validation fail.

### 12.3. Solver soft test

Cùng input nhưng soft weight 8.

Expected:

- Nếu bắt buộc phải xếp 4 Văn liên tiếp thì solver có thể success.
- `softViolations.length > 0`.
- UI message hiển thị còn vi phạm ưu tiên.

### 12.4. Confirmed spec gate test

Confirmed spec:

```ts
{ kind: 'subject_max_consecutive', params: { subject: '__all__', max: 2 } }
```

Expected:

- Gate expand ra subject cụ thể, hoặc block nếu không có subject.
- Không bao giờ cho spec `subject='__all__'` đi xuống Python.

### 12.5. Validator test

Schedule có:

```txt
6A Thứ 2 tiết 1 Văn
6A Thứ 2 tiết 2 Văn
6A Thứ 2 tiết 3 Văn
6A Thứ 2 tiết 4 Văn
```

Spec:

```ts
subject_max_consecutive subject='__all__', maxConsecutive=2
```

Expected:

```ts
softViolations.length === 1 // nếu soft
hardViolations.length === 1 // nếu hard
```

### 12.6. IR consecutive test

Periods by day:

```py
[1, 2, 4, 5]
```

Expected:

- `[1, 2]` là consecutive.
- `[2, 4]` không phải consecutive.
- `[4, 5]` là consecutive.

### 12.7. CEGAR custom hard test

Hard custom predicate luôn false.

Expected:

- Sau max CEGAR rounds, result là NO_SOLUTION / infeasible.
- Không được `SOLUTION_FOUND`.

### 12.8. Predicate error test

Hard custom predicate missing/raise exception.

Expected:

- Fail-closed.
- Không trả schedule success.

### 12.9. Docker notice test

Docker unavailable + selected mode docker.

Expected:

- UI nhận `solver-runtime:notice`.
- Warning hiển thị.

---

## 13. Thứ tự làm cho junior

Làm theo đúng thứ tự này, không nhảy:

1. Tạo `constraint-spec-normalizer.ts` và test normalizer.
2. Gắn normalizer vào parse/analyze/reparse/solve gate.
3. Sửa `deterministic-validator.ts` cho `subject_max_consecutive` universal + max key.
4. Sửa `solver_skeleton.py` `_add_subject_max_consecutive` + no-op warning.
5. Sửa result surfacing soft violations.
6. Sửa registry và toàn bộ key `maxConsecutive`.
7. Sửa `macros.py` và `validator_engine.py`.
8. Sửa IR import/expr/consecutive/teachesOnDay.
9. Sửa CEGAR/custom predicate.
10. Sửa homeroom/capacity/auto-relax/docker UI.
11. Chạy full tests + manual case 4 tiết Văn.

---

## 14. Manual QA case cuối cùng

Dữ liệu test:

```txt
Lớp: 6A
Ngày: Thứ 2
Tiết: 1,2,3,4,5
Môn Văn: 4 tiết/tuần
Môn Toán: 1 tiết/tuần
```

Ràng buộc soft:

```txt
Với mọi lớp, mọi môn, mỗi ngày: mỗi môn tối đa 2 tiết liên tiếp trong cùng một ngày. Trọng số 8/10.
```

Expected:

1. UI không còn hiển thị “Môn mọi môn” hoặc `__all__` trong spec đã confirm.
2. Debug bundle `constraintSpecs` phải có `subject: 'Văn'`, `subject: 'Toán'`, không có `subject: '__all__'`.
3. Nếu output vẫn 4 Văn liên tiếp, UI phải báo soft violation.
4. Nếu đổi ràng buộc sang bắt buộc, output không được có 4 Văn liên tiếp; nếu không thể thì solver báo infeasible.







"Đúng, **nhánh AI codegen solver thật sự đã bị bỏ rồi**. Trong `Backend.xml` hiện tại `local-agent.ts` chỉ nhận confirmed specs, check deterministic eligibility rồi gọi `runDeterministicSolver`; comment cũng ghi rõ planner/coder/repair đã bị gỡ và fail-closed nếu không eligible. 



Nhưng trong code vẫn còn **rác/di sản tên gọi + marker + type + IPC** của pipeline cũ. Dọn theo list này là sạch.



## 1. Không phải bug, nhưng nên rename cho đỡ hiểu nhầm



### `src/features/timetable/ai/deterministic-solver.ts`



Hiện vẫn dùng:



```ts

loadSolverSkeleton()

injectConstraintCode(skeleton, '')

executeGeneratedCode(...)

```



Dù comment ghi “không dùng planner/coder/repair LLM”, deterministic solver vẫn fill skeleton bằng empty custom block rồi execute qua bridge. 



**Sửa:**



```ts

injectConstraintCode -> injectEmptyCustomConstraintBlock

executeGeneratedCode -> executeSolverCode

```



Hoặc tốt hơn:



```ts

const solverCode = await loadFixedSolverCode()

const execResult = await executeSolverCode(solverCode, executePayload, ...)

```



## 2. File còn mùi AI codegen rõ nhất



### `src/features/timetable/ai/skeleton-injector.ts`



Có marker:



```ts

const MARKER_LINE = /^[ \t]*#\s*<<<\s*AI_FILL_HERE\s*>>>\s*$/m;

```



Có các hàm xử lý code do AI trả về:



```ts

stripMarkdownFence

trimExplanatoryProse

stripLeakedSchemaFields

extractBuildCustomConstraintsBody

normalizeConstraintCodeBody

injectConstraintCode

syntaxCheckPython

astCheckPython

```



**Nếu bỏ hẳn AI codegen**, dọn như này:



* Đổi file thành `solver-template-loader.ts`.

* Giữ `loadSolverSkeleton`.

* Xóa toàn bộ logic normalize code AI.

* Chỉ còn hàm:



```ts

export function buildFixedSolverCode(skeleton: string): string {

  return skeleton.replace(MARKER_LINE, 'pass');

}

```



* Nếu không còn custom Python nữa thì xóa luôn `syntaxCheckPython`, `astCheckPython`.



## 3. Python skeleton vẫn còn marker AI



### `python/templates/solver_skeleton.py`



Có đoạn:



```py

# === AI custom_dsl injection ...

custom_specs = [...]

# <<< AI_FILL_HERE >>>

pass

```



**Sửa sạch:**



* Đổi comment thành deterministic.

* Đổi marker `AI_FILL_HERE` thành `CUSTOM_CONSTRAINTS_DISABLED` hoặc bỏ marker luôn.

* Nếu không còn support Python custom constraint thì xóa `custom_specs` đoạn này.



Ví dụ:



```py

# Custom Python codegen is disabled. Built-in and IR constraints are handled above.

pass

```



## 4. Bridge vẫn tên là executeGeneratedCode



### `src/features/timetable/ai/python-bridge.ts`



Có comment:



```ts

Execute a piece of Python code generated by the Coder.

```



Và function:



```ts

executeGeneratedCode(...)

```



Nó hiện vẫn được deterministic solver dùng, nhưng tên sai ngữ nghĩa. 



**Sửa:**



```ts

executeGeneratedCode -> executeSolverCode

```



Comment đổi thành:



```ts

Execute the fixed Python solver skeleton with the prepared input payload.

```



Route fallback `/api/ai/python-execute` cũng nên đổi tên nếu muốn sạch:



```txt

/api/ai/python-execute -> /api/solver/execute

```



## 5. Electron còn prewarm prompt coder/planner/repair



### `electron/main.mjs`



Còn check/prewarm:



```js

/prompts/coder.system.md

/prompts/planner.system.md

/prompts/repair.system.md

/api/ai/python-execute

/api/ai/python-syntax-check

/api/ai/python-ast-check

/api/ai/solver-skeleton

```



Trong current backend, electron vẫn prewarm mấy route/prompt codegen cũ. 



**Sửa:**



Trong `verifyApiRoutes`, bỏ:



```js

{ path: '/prompts/coder.system.md', name: 'coder prompt' }

```



Trong `prewarmApiRoutes`, bỏ:



```js

'/api/ai/python-execute',

'/api/ai/python-syntax-check',

'/api/ai/python-ast-check',

'/api/ai/solver-skeleton',

'/prompts/coder.system.md',

'/prompts/planner.system.md',

'/prompts/repair.system.md',

```



Giữ `/api/ai/chat` nếu parse/analyze constraint vẫn dùng LLM.



## 6. Types còn type của planner/coder/repair



### `src/features/timetable/ai/types.ts`



Còn:



```ts

modelPlanner?: string;

modelCoder?: string;

modelRepair?: string;

```



Còn lifecycle phase:



```ts

'coding'

'fixing'

'planner'

```



Còn result types:



```ts

CoderTurnResult

RepairTurnResult

PlannerTurnResult

```



**Sửa:**



* Xóa `modelPlanner`, `modelCoder`, `modelRepair`.

* Giữ `modelTranslator` nếu parse/analyze constraint vẫn dùng LLM.

* Xóa `CoderTurnResult`, `RepairTurnResult`, `PlannerTurnResult`.

* Xóa phase `coding`, `fixing`, `planner` nếu UI không dùng nữa.



## 7. Run cache còn hash model codegen cũ



### `src/features/timetable/ai/run-cache.ts`



Còn hash:



```ts

modelPlanner: provider.modelPlanner,

modelCoder: provider.modelCoder,

modelRepair: provider.modelRepair,

```



**Sửa:**



Chỉ giữ:



```ts

model

modelTranslator

solverProfile

solverRuntimeMode

versions

```



## 8. Pipeline versions còn version prompt codegen



### `src/features/timetable/ai/pipeline-versions.ts`



Còn:



```ts

planner: '3.0.0',

coder: '3.3.0',

repair: '3.1.0',

```



**Sửa:**



```ts

export const PROMPT_VERSIONS = {

  translator: '4.0.0',

} as const;

```



Hoặc nếu analyze/reparse cũng có prompt riêng thì tách:



```ts

constraintParser

constraintAnalyzer

customNormalizer

```



## 9. Debug/workspace còn generated solver/planner output



### `src/features/timetable/ai/workspace.ts`



Còn state kiểu:



```ts

latestConstraintCode

latestGeneratedSolver

setLatestGeneratedSolver

```



**Sửa:**



* Nếu UI không hiển thị generated solver nữa: xóa.

* Nếu vẫn muốn debug solver code cố định: rename thành:



```ts

latestSolverCode

setLatestSolverCode

```



### `src/features/timetable/ai/debug-bundle.ts`



Còn:



```ts

plannerOutput

generatedSolver

```



**Sửa:**



```ts

plannerOutput -> bỏ

generatedSolver -> solverCodeSnapshot hoặc bỏ

```



## 10. Custom Python predicate: quyết định giữ hay bỏ



Chỗ này không hẳn là “AI codegen”, nhưng nó vẫn là **runtime Python user/custom code**:



* `python/templates/solver_skeleton.py`: `_verify_custom_predicates`, `exec(src, ...)`

* `python/validator_engine.py`: `_verify_python_predicate`

* `src/features/timetable/constraints/ConstraintInterpretationCard.tsx`: UI nhập `pythonPredicate`

* `src/features/timetable/constraints/constraint-form-schema.ts`: field `pythonPredicate`

* `src/features/timetable/ai/constraint-spec.ts`: `pythonPredicate?: string`

* `src/features/timetable/ai/deterministic-solver-eligibility.ts`: vẫn cho custom_dsl có `pythonPredicate`



Nếu mục tiêu là **bỏ sạch codegen AI nhưng vẫn cho admin/user viết Python custom**, thì giữ nhưng siết sandbox.



Nếu mục tiêu là **không cho bất kỳ Python custom nào nữa**, thì xóa toàn bộ `pythonPredicate`, chỉ cho `custom_dsl` dạng IR `expr`.



## Kết luận ngắn



Không còn nhánh LLM planner/coder/repair chạy thật trong current `local-agent.ts`. Cái còn là **di sản tên gọi và hook cũ**:



```txt

skeleton-injector.ts

python-bridge.ts

deterministic-solver.ts

python/templates/solver_skeleton.py

electron/main.mjs

types.ts

run-cache.ts

pipeline-versions.ts

workspace.ts

debug-bundle.ts

```



Dọn nhanh nhất: **rename bridge/injector + xóa prompt coder/planner/repair + xóa modelPlanner/modelCoder/modelRepair + xóa generatedSolver/plannerOutput**.
"
