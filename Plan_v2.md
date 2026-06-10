# Plan_v2.md — Constraint Engine Hardening & IR-first Roadmap

> Repo: `Duy-Nguyen-2006/timetable`  
> Scope chính: nhập Constraints, hỏi lại người dùng bằng tiếng Việt khi chưa rõ, parse thành dữ liệu máy hiểu được, solver chỉ nhận constraint đã xác nhận và đã compile được.  
> Ngày lập plan: 2026-06-10  
> Trạng thái: **PLAN.md cũ quá lạc quan; Plan v2 reset lại thành kế hoạch triển khai có gate rõ ràng.**

---

## 0. Executive Summary

Mục tiêu không phải là “AI đoán giỏi hơn”. Mục tiêu đúng là:

1. **Không silent flip semantics**  
   Ví dụ:
   - `"Cô Thủy phải có tiết 4"` không bao giờ được thành `teacher_block_period`.
   - `"Cô Thủy không dạy tiết 4"` không bao giờ được thành `teacher_required_period`.
   - `"Cô Thủy chỉ dạy tiết 4"` không được hiểu như `"phải có ít nhất một tiết 4"`.

2. **Mọi constraint trước khi vào solver phải có dạng máy hiểu được**
   - Built-in kind có encoder/checker rõ ràng; hoặc
   - IR `expr` hợp lệ; hoặc
   - bị chặn lại để hỏi user, không được đưa vào solver.

3. **UI chat hỏi người dùng bằng tiếng Việt tự nhiên**
   - Không hỏi kiểu backend: “Bạn muốn `teacher_required_period` hay `teacher_allowed_periods`?”
   - Phải hỏi kiểu: “Ý bạn là cô Thủy bắt buộc có ít nhất một tiết 4, hay cô Thủy chỉ được dạy tiết 4?”

4. **Nút “xếp lịch” chỉ chạy solver**
   - Không gọi LLM.
   - Không generate code mới.
   - Không parse lại constraint mơ hồ ở phút cuối.
   - Nếu constraint chưa xác nhận/chưa compile được thì block trước.

5. **Không claim 100% bằng cách đoán**
   - Với ngôn ngữ tự nhiên, “100% chính xác” chỉ đạt được nếu hệ thống **parse deterministically khi chắc chắn**, còn khi không chắc chắn thì **hỏi lại đến khi rõ**.
   - Nghĩa là guarantee đúng phải là: **100% không silently parse sai** trong phạm vi supported grammar + clarified flow.

---

## 1. Current Reality Check

Dựa trên `PLAN.md` và source hiện tại, Phase 0 có nhiều mảnh đã tồn tại, nhưng chưa được xem là complete nếu dùng tiêu chuẩn production.

### 1.1. Những phần đã có

| Component | File | Tình trạng |
|---|---|---|
| Negative semantic guard | `src/features/timetable/ai/negative-guard.ts` | Có |
| Disambiguation table | `src/features/timetable/ai/disambiguation-table.ts` | Có |
| Require-family kinds | `src/features/timetable/ai/constraint-spec.ts`, `constraint-registry.ts` | Có dấu hiệu đã thêm |
| Reparse có `userFeedback` | `src/features/timetable/ai/constraint-reparse-service.ts` | Có |
| Frozen regression tests | `golden-eval-set-v2.test.ts`, `phase0-constraint-contract.test.ts` | Có |
| IR types + validator | `constraint-ir.ts`, `ir-type-checker.ts` | Có |
| IR-first parser shadow mode | `ir-first-parser.ts`, `shadow-mode.ts` | Có |
| Solver gate test | `solver-constraint-gate.test.ts` | Có |

### 1.2. Những phần chưa đủ an toàn

| Issue | Mức độ | Lý do |
|---|---:|---|
| `BUILT_IN_KINDS` trong `parse-pipeline.ts` thiếu require-family period | Blocker | LLM slot-fill có thể trả `teacher_required_period`, nhưng pipeline không accept như built-in nếu set chưa cập nhật |
| `built-in-suggestion.ts` chưa có deterministic rule cho `"phải có / ít nhất"` | Blocker | Fallback/local path vẫn có thể không biết require semantics |
| `constraint-retriever.ts` chưa ưu tiên require-family triggers/few-shots rõ ràng | Blocker | LLM top-k có thể không thấy candidate đúng |
| Disambiguation table chưa phải global first-class gate trong toàn bộ parser path legacy | Blocker | Có table nhưng không đảm bảo mọi path đều dùng trước khi đoán |
| Solver encoder/checker coverage cho require-family cần xác minh end-to-end | Blocker | Registry có thể nói `hasChecker: true`, nhưng phải có deterministic validator + CP-SAT compiler thực sự |
| `custom_dsl` vẫn có nguy cơ chứa text/semantic only thay vì IR executable | High | Solver gate có test chặn một số case, nhưng phải audit toàn flow |
| Shadow mode có nhưng chưa có CI threshold rõ ràng | High | Có log không có nghĩa là có gate fail build |
| UI confirmation/clarification chưa có acceptance copy chuẩn | High | User-facing Vietnamese phải rõ, không dùng backend jargon |
| “Xếp lịch” phải không gọi LLM/codegen | Critical | Cần audit toàn route/action khi bấm solve |

---

## 2. Non-negotiable Requirements

Đây là các rule không được phá.

### 2.1. Constraint parsing

- Parser không được silent fallback từ LLM `needs_clarification` sang deterministic guess.
- Parser không được map negative phrase sang positive require kind.
- Parser không được map positive require phrase sang block/allowed-only kind.
- Parser không được dùng confidence cao nếu thiếu entity/period/day/count quan trọng.
- Parser phải trả `needs_clarification` nếu:
  - entity mơ hồ;
  - scope mơ hồ;
  - phrase có conflict: vừa `"không"` vừa `"phải có"` không rõ;
  - thiếu thông tin bắt buộc;
  - kind chưa có solver encoder;
  - IR không type-check được.

### 2.2. User clarification

- Câu hỏi gửi user phải bằng tiếng Việt tự nhiên.
- Không lộ tên kind/backend/IR/DSL/internal enum.
- Mỗi câu hỏi nên có lựa chọn cụ thể.
- Không hỏi chung chung kiểu “Bạn muốn ràng buộc này nghĩa là gì?”
- Ví dụ tốt:
  - “Ý bạn là cô Thủy bắt buộc có ít nhất một tiết 4 trong tuần, hay cô Thủy chỉ được dạy ở tiết 4?”
  - “Bạn đang nói về giáo viên Thủy nào: Nguyễn Thị Thủy hay Trần Thị Thủy?”
  - “Bạn muốn áp dụng cho lớp 6A, lớp 6B, hay tất cả các lớp?”

### 2.3. Solver gate

- Nút “xếp lịch” chỉ được chạy solver.
- Không parse thêm bằng LLM ở solve-time.
- Không generate Python code mới ở solve-time.
- Solver input chỉ gồm:
  - base data;
  - confirmed constraints;
  - precompiled / pre-translated specs;
  - valid IR expr hoặc supported built-in kind.
- Nếu có raw constraint chưa confirmed: block.
- Nếu có custom text chưa có `expr`: block.
- Nếu có kind unknown: block.
- Nếu có hard constraint không có encoder: block.
- Soft constraint không có encoder có thể warning/drop tùy policy, nhưng không được âm thầm biến thành hard hoặc ngược lại.

---

## 3. Target Architecture

### 3.1. Desired pipeline

```text
User text
  ↓
Normalize + Entity Resolver
  ↓
Disambiguation Table FIRST
  ↓
Tier 1 deterministic parser
  ↓
IR validator + kind/spec normalizer
  ↓
Humanizer preview
  ↓
User confirms OR clarification loop
  ↓
Confirmed constraint store
  ↓
Solver gate
  ↓
Compiler/encoder
  ↓
CP-SAT solver
```

### 3.2. Rules by confidence level

| Parser result | Allowed action |
|---|---|
| Deterministic exact + valid IR + known entity | Show preview, allow confirm |
| Deterministic exact but missing optional count | Default only if domain rule explicit; otherwise ask |
| LLM parse high confidence + back-translation pass | Show preview, require confirm |
| LLM parse medium/low | Ask clarification |
| Contradictory markers | Ask clarification |
| Unsupported kind | Tell user not supported yet, do not solve |
| Custom natural language without IR | Ask clarification or reject before solver |

### 3.3. Canonical representations

There should be one canonical executable representation for solver:

Preferred:
```ts
ConstraintIR
```

Allowed during migration:
```ts
ConstraintSpec -> kind-to-ir adapter -> ConstraintIR
```

Temporary legacy:
```ts
ConstraintSpec -> direct solver encoder
```

Forbidden for final solve:
```ts
raw natural language -> solve
custom_dsl with only naturalLanguage -> solve
pythonPredicate generated at solve-time -> solve
```

---

## 4. Milestones Overview

| Milestone | Name | Purpose | Gate |
|---|---|---|---|
| M0 | Reality lock | Stop claiming Phase 0 complete without gate | Update plan/status |
| M1 | Contract sync | Make all kind/type/registry/parser sets consistent | Typecheck green |
| M2 | Deterministic require-family | Parse `"phải có / ít nhất"` safely without relying on LLM | Frozen tests green |
| M3 | Disambiguation-first parser path | Table is actually used before guessing | Table-path tests green |
| M4 | Solver gate hardening | Solve accepts only confirmed executable constraints | Solver gate tests green |
| M5 | UI clarification contract | Vietnamese user-facing clarification flow | UI/unit tests green |
| M6 | IR-first shadow mode with metrics | Compare old/new parser safely | zero silent flip |
| M7 | Compiler/checker parity | Enforce == verify | parity tests green |
| M8 | Flip parser | IR-first becomes authoritative | all gates pass |
| M9 | Decommission unsafe paths | Remove codegen/custom unsafe fallback | no unsafe solve path |

---

# M0 — Reality Lock

## Goal

Sửa lại trạng thái project để không ai hiểu nhầm là Phase 0 đã xong production-grade.

## Tasks

### M0.1. Replace old `PLAN.md` or add `Plan_v2.md`

Add this file as `Plan_v2.md`.

### M0.2. Add status banner to old plan

Recommended patch to old `PLAN.md`:

```md
> Superseded by `Plan_v2.md`.
> The old Phase 0 status was optimistic. Source currently still needs parser/solver gate sync before production use.
```

## Acceptance Criteria

- `Plan_v2.md` exists.
- Old `PLAN.md` no longer says Phase 0 complete without linking to v2 caveats.
- Team knows current priority is M1-M4, not Phase 1 feature expansion.

---

# M1 — Contract Sync

## Goal

Make all representations agree on supported kinds.

## Why this matters

Nếu một kind tồn tại trong `constraint-registry.ts` nhưng thiếu trong `parse-pipeline.ts` allowlist, LLM/deterministic parser có thể tạo đúng kind nhưng pipeline lại reject hoặc rơi sang custom/clarification. Đây là bug logic, không phải UX bug.

## Files to audit

- `src/features/timetable/ai/constraint-spec.ts`
- `src/features/timetable/ai/constraint-registry.ts`
- `src/features/timetable/ai/timetable-constraint-contract.ts`
- `src/features/timetable/ai/parse-pipeline.ts`
- `src/features/timetable/ai/kind-to-ir.ts`
- `src/features/timetable/ai/deterministic-validator.ts`
- `src/features/timetable/ai/deterministic-solver-eligibility.ts`
- `src/features/timetable/ai/solver-constraint-gate.ts`
- Any Python compiler/solver file that encodes constraints

## Tasks

### M1.1. Create single source of truth for built-in kinds

Current smell:
- `ConstraintKind` union exists.
- `CONSTRAINT_REGISTRY` exists.
- `BUILT_IN_CONSTRAINT_DEFINITIONS` likely exists.
- `parse-pipeline.ts` has local `BUILT_IN_KINDS` set.

This creates drift.

Target:
```ts
export const BUILT_IN_KIND_SET = new Set(
  BUILT_IN_CONSTRAINT_DEFINITIONS.map((d) => d.kind)
);
```

Then `parse-pipeline.ts` should import the centralized set instead of hardcoding.

Do not manually maintain repeated 80-kind lists.

### M1.2. Ensure require-family period kinds exist everywhere

Required kinds:
```ts
teacher_required_period
class_required_period
subject_required_period
```

They must be present in:

- `ConstraintKind`
- `CONSTRAINT_REGISTRY`
- `BUILT_IN_CONSTRAINT_DEFINITIONS`
- parser allowlist
- retriever catalog
- suggestion deterministic path
- kind-to-IR adapter
- humanizer labels
- deterministic validator checker map
- solver eligibility/capability map
- compiler/encoder

### M1.3. Add contract test: no registry/spec drift

Create test:

```ts
test('all registry kinds are assignable ConstraintKind and accepted by parser built-in set', () => {
  for (const def of BUILT_IN_CONSTRAINT_DEFINITIONS) {
    assert.equal(BUILT_IN_KIND_SET.has(def.kind), true);
  }
});
```

Also test reverse drift:
```ts
test('all solver-encodable built-in kinds have IR adapter or direct encoder', () => {
  ...
});
```

### M1.4. Add compile-time helper

Use TS `satisfies` to catch invalid kind strings:

```ts
const REQUIRE_PERIOD_KINDS = [
  'teacher_required_period',
  'class_required_period',
  'subject_required_period',
] as const satisfies readonly ConstraintKind[];
```

## Acceptance Criteria

- `npm test -- --grep contract` green, or equivalent project command.
- `npm run build` green.
- No hardcoded parser allowlist drift for require-family.
- Adding a new built-in kind in registry fails test unless parser/solver/humanizer is updated.

---

# M2 — Deterministic Require-family Parser

## Goal

Make `"phải có / cần có / ít nhất"` parse deterministically before LLM.

## Supported first wave

### Teacher require period

Input examples:
- `Cô Thủy phải có tiết 4`
- `Thủy phải có ít nhất 1 tiết 4 trong tuần`
- `Cô Thủy cần có tiết 4`
- `Bắt buộc cô Thủy có tiết 4`
- `Cô Thủy phải được xếp ít nhất một tiết 4`

Output:
```ts
{
  kind: 'teacher_required_period',
  params: {
    teacher: 'Thủy',
    period: 4,
    minCount: 1
  }
}
```

IR:
```ts
{
  atLeast: {
    k: 1,
    var: 'd',
    in: 'days',
    body: {
      teaches: {
        teacher: 'Thủy',
        day: '$$D$$',
        period: 4
      }
    }
  }
}
```

### Class require period

Input examples:
- `Lớp 6A phải có tiết 1`
- `6A cần có ít nhất 1 tiết 5 trong tuần`

Output:
```ts
{
  kind: 'class_required_period',
  params: {
    class: '6A',
    period: 1,
    minCount: 1
  }
}
```

### Subject require period

Needs product decision because semantics can mean either:
1. Subject appears at least once in period X somewhere in the timetable.
2. Each class that has this subject must have subject at period X at least once.
3. Subject for a specific class must have period X.

Do **not** silently pick one unless product requirement is explicit.

Initial safe behavior:
- If subject only, ask clarification.
- If subject + class, parse exactly.
- If product decides global subject semantics, document it and test it.

## Tasks

### M2.1. Add explicit marker detection

Centralize semantic markers:

```ts
type SemanticDirection = 'require' | 'block' | 'only' | 'prefer' | 'unknown' | 'contradictory';
```

Use disambiguation table first.

Do not scatter regex across:
- `negative-guard.ts`
- `built-in-suggestion.ts`
- `constraint-retriever.ts`
- `ir-first-parser.ts`
- `shadow-mode.ts`

Create or promote:
```ts
semantic-direction.ts
```

### M2.2. Patch `built-in-suggestion.ts`

Add deterministic branch before block/only branches:

Pseudo order:
```ts
if (teacher && direction === 'require' && period) {
  return suggest('teacher_required_period', 0.96, { teacher, period, minCount });
}

if (class && direction === 'require' && period) {
  return suggest('class_required_period', 0.95, { class, period, minCount });
}

if (subject && direction === 'require' && period) {
  if (!class && product semantics unresolved) return clarification;
  return suggest(...);
}
```

Important:
- This branch must run **before** block detection.
- Do not let `"phải có"` fall through to `teacher_block_period`.
- Do not let `"chỉ dạy"` fall through to require.

### M2.3. Patch `constraint-retriever.ts`

Add candidates for:

```ts
teacher_required_period
class_required_period
subject_required_period
```

Each candidate needs:
- triggers
- synonyms
- positive few-shots
- negative few-shots
- requiredParams

Teacher example:

```ts
triggers: [
  /\b(phai co|can co|it nhat|bat buoc co|phai duoc)\b.*\btiet\s+\d+\b/u
],
synonyms: [
  'phải có tiết',
  'cần có tiết',
  'ít nhất một tiết',
  'bắt buộc có tiết'
],
fewShots: [
  { text: 'Cô Thủy phải có tiết 4', params: { teacher: 'Thủy', period: 4, minCount: 1 } }
],
negativeFewShots: [
  {
    text: 'Cô Thủy không dạy tiết 4',
    actuallyMapsTo: 'teacher_block_period',
    reason: 'Không dạy là cấm/block, không phải bắt buộc có.'
  },
  {
    text: 'Cô Thủy chỉ dạy tiết 4',
    actuallyMapsTo: 'teacher_allowed_periods',
    reason: 'Chỉ dạy là giới hạn allowed periods, không phải at-least.'
  }
]
```

### M2.4. Patch `parse-pipeline.ts`

Stop hardcoded allowlist drift. Ensure slot-fill response with require-family period kinds is accepted.

### M2.5. Add tests

Required tests:

```ts
test('"Cô Thủy phải có tiết 4" -> teacher_required_period')
test('"Cô Thủy cần có tiết 4" -> teacher_required_period')
test('"Cô Thủy có ít nhất 1 tiết 4" -> teacher_required_period')
test('"Cô Thủy không dạy tiết 4" -> teacher_block_period')
test('"Cô Thủy chỉ dạy tiết 4" -> teacher_allowed_periods')
test('"Cô Thủy nên dạy tiết 4" -> teacher_preferred_periods or clarification, not required/block')
```

Add class tests:
```ts
test('"Lớp 6A phải có tiết 1" -> class_required_period')
test('"Lớp 6A không học tiết 1" -> class_block_period')
```

Add ambiguous tests:
```ts
test('"Toán phải có tiết 4" asks clarification if subject semantics unresolved')
```

## Acceptance Criteria

- Frozen cases pass.
- No require-marker sentence maps to block kind.
- No block-marker sentence maps to require kind.
- `built-in-suggestion.test.ts` covers require-family.
- `constraint-retriever.test.ts` top-1 or top-k contains require-family for require phrases.
- `parse-pipeline.test.ts` accepts require-family returned by slot-fill.

---

# M3 — Disambiguation-first Parser Path

## Goal

Make `disambiguation-table.ts` not just a tested file, but an actual first-class gate used by every parser path.

## Current risk

A table that is only used in `ir-first-parser.ts` does not protect legacy paths like:
- built-in suggestion;
- retrieve-then-fill;
- reparse;
- fallback;
- chat clarification.

## Tasks

### M3.1. Create a shared semantic analysis function

File:
```text
src/features/timetable/ai/semantic-direction.ts
```

API:
```ts
export type SemanticAnalysis = {
  direction: 'require' | 'block' | 'only' | 'prefer' | 'unknown' | 'contradictory';
  matchedRows: DisambiguationMatch[];
  markers: string[];
  confidence: 'high' | 'medium' | 'low';
  reason: string;
};

export function analyzeSemanticDirection(text: string): SemanticAnalysis;
```

### M3.2. Use it in all paths

Must import/use in:

- `built-in-suggestion.ts`
- `constraint-retriever.ts`
- `ir-first-parser.ts`
- `analyze-constraint-service.ts`
- `constraint-reparse-service.ts`
- `negative-guard.ts`
- `shadow-mode.ts`

### M3.3. Define precedence

Order:

1. Contradictory markers -> clarification
2. Explicit only -> allowed-only
3. Explicit block -> block
4. Explicit require -> at-least required
5. Preference -> soft/preferred
6. Unknown -> normal retriever/LLM

Examples:

| Text | Direction | Not allowed to become |
|---|---|---|
| `phải có tiết 4` | require | block, allowed-only |
| `không dạy tiết 4` | block | require, preferred |
| `chỉ dạy tiết 4` | only | require, block |
| `nên dạy tiết 4` | prefer | hard require/block |
| `không phải có tiết 4` | contradictory/needs clarification | any direct hard kind |

### M3.4. Add table coverage tests

Create `semantic-direction.test.ts`.

Test all canonical phrases:

```ts
[
  ['phải có', 'require'],
  ['cần có', 'require'],
  ['ít nhất', 'require'],
  ['bắt buộc có', 'require'],
  ['không dạy', 'block'],
  ['cấm dạy', 'block'],
  ['nghỉ tiết', 'block'],
  ['chỉ dạy', 'only'],
  ['chỉ được dạy', 'only'],
  ['ưu tiên', 'prefer'],
  ['nên', 'prefer']
]
```

## Acceptance Criteria

- Any parser path receives same `SemanticAnalysis`.
- Tests prove semantic direction consistent across modules.
- No duplicate marker lists with different meanings.
- Negative guard uses the same markers as parser.

---

# M4 — Solver Gate Hardening

## Goal

When user presses “xếp lịch”, system must only execute solver with already-confirmed, executable constraints.

## Tasks

### M4.1. Audit solve entrypoints

Search for:
- `solve`
- `generate`
- `codegen`
- `pythonPredicate`
- `custom_dsl`
- `preTranslatedSpecs`
- `confirmedConstraints`
- `constraintItemsToRaw`
- API route / server action / local agent call that runs solver

Expected files likely include:
- `solver-constraint-gate.ts`
- `deterministic-solver.ts`
- `python-bridge.ts`
- `local-agent.ts`
- any Next API route under `src/app/api/...`
- electron/local executor paths

### M4.2. Formalize solve-time allowed input

Add type:

```ts
export type ExecutableConstraint =
  | {
      source: 'builtin';
      spec: ConstraintSpec;
      ir?: ConstraintIR;
      encoder: string;
    }
  | {
      source: 'ir';
      spec: ConstraintSpec;
      ir: ConstraintIR;
    };
```

Reject:
```ts
kind === 'custom_dsl' && !params.expr
kind unknown
hard constraint without solver encoder
unconfirmed raw item
spec with missing required params
spec with failed IR validation
```

### M4.3. Make solver gate fail closed

```ts
if (hard && !capability.canEncode) {
  return { ok: false, status: 400, reason: 'Ràng buộc này chưa được hỗ trợ khi xếp lịch.' };
}
```

No fallback to:
- raw text;
- LLM;
- generated Python;
- ignored hard constraint.

### M4.4. Add explicit “no LLM at solve-time” guard

Practical option:
- Add test/mocking that solve path throws if `invokeAnalyzeChat` is called.
- Or structure imports so solver route cannot import AI chat client.

Test idea:
```ts
test('solve request does not call LLM/parser/codegen', async () => {
  const spy = mock.method(chatClient, 'invokeAnalyzeChat', () => {
    throw new Error('LLM must not be called during solve');
  });

  await runSolveWithConfirmedSpecs(...);

  assert.equal(spy.mock.callCount(), 0);
});
```

### M4.5. Add end-to-end solve gate tests

Cases:

1. Raw unconfirmed hard constraint -> blocked.
2. Confirmed `teacher_block_period` with encoder -> allowed.
3. Confirmed `teacher_required_period` with encoder -> allowed.
4. Confirmed `teacher_required_period` missing `period` -> blocked.
5. Confirmed `custom_dsl` with only `naturalLanguage` -> blocked.
6. Confirmed `custom_dsl` with valid `expr` -> allowed.
7. Unknown hard kind -> blocked.
8. Unsupported soft kind -> warning policy tested.
9. Mixed: one valid hard + one invalid hard -> whole solve blocked.
10. Already solved/loaded data should not re-trigger parse.

## Acceptance Criteria

- Pressing solve cannot invoke LLM or code generation.
- All hard constraints are either encoded or blocked.
- Solver gate error messages are Vietnamese and user-facing.
- Tests cover positive/negative cases.

---

# M5 — UI Clarification Contract

## Goal

Make the AI chat clarify constraints with users naturally in Vietnamese and produce structured data only after unambiguous confirmation.

## Required UX model

When parse result is uncertain:

```ts
{
  status: 'needs_clarification',
  questionVi: string,
  options: [
    {
      id: 'require_at_least',
      labelVi: 'Cô Thủy bắt buộc có ít nhất một tiết 4 trong tuần',
      resultingSpecDraft: ...
    },
    {
      id: 'only_allowed',
      labelVi: 'Cô Thủy chỉ được dạy ở tiết 4',
      resultingSpecDraft: ...
    }
  ]
}
```

The UI shows only:
- `questionVi`
- option labels
- maybe preview text

The UI must not show:
- `teacher_required_period`
- `ConstraintIR`
- `params`
- `DSL`
- backend enum names

## Tasks

### M5.1. Define clarification DTO

File:
```text
src/features/timetable/ai/constraint-clarification-types.ts
```

Types:
```ts
export type ClarificationOption = {
  id: string;
  labelVi: string;
  previewVi: string;
  specDraft?: ConstraintSpec;
  irDraft?: ConstraintIR;
};

export type ClarificationQuestion = {
  id: string;
  questionVi: string;
  options: ClarificationOption[];
  allowFreeText: boolean;
  reasonCode:
    | 'ambiguous_entity'
    | 'ambiguous_direction'
    | 'missing_entity'
    | 'missing_period'
    | 'missing_scope'
    | 'unsupported_semantics'
    | 'contradictory_markers';
};
```

### M5.2. Replace vague fallback questions

No:
```text
Bạn muốn ràng buộc này nghĩa là gì?
```

Yes:
```text
Mình hiểu câu này theo 2 cách. Bạn muốn chọn cách nào?
1. Cô Thủy bắt buộc có ít nhất một tiết 4 trong tuần.
2. Cô Thủy chỉ được dạy ở tiết 4.
```

### M5.3. Clarification examples

#### Ambiguous require vs only

User:
```text
Cô Thủy có tiết 4
```

Question:
```text
Bạn muốn nói là cô Thủy bắt buộc phải có ít nhất một tiết 4 trong tuần, hay cô Thủy chỉ được dạy ở tiết 4?
```

#### Missing teacher

User:
```text
Không dạy tiết 4
```

Question:
```text
Bạn muốn áp dụng cho giáo viên nào?
```

Options should be known teacher labels.

#### Ambiguous teacher name

User:
```text
Cô Thủy không dạy thứ 2
```

If there are multiple Thủy:
```text
Trong danh sách có nhiều giáo viên tên Thủy. Bạn muốn chọn cô nào?
```

Options:
- `Nguyễn Thị Thủy`
- `Trần Thị Thủy`

#### Subject semantics unresolved

User:
```text
Toán phải có tiết 4
```

Question:
```text
Bạn muốn áp dụng môn Toán ở phạm vi nào?
1. Mỗi lớp học Toán phải có ít nhất một tiết 4 trong tuần.
2. Chỉ một lớp cụ thể cần có Toán tiết 4.
3. Đây chỉ là ưu tiên, không bắt buộc.
```

### M5.4. Reparse must prioritize user answer

When user selects option/free-text answer, reparse request must include:
```ts
userFeedback
selectedOptionId
previousCandidateSpecs
```

The prompt/system must say:
- user feedback overrides old raw text;
- do not reinterpret against selected meaning;
- output only JSON.

### M5.5. Confirmation preview

Before accepting:
```text
Mình sẽ lưu ràng buộc này: Cô Thủy bắt buộc có ít nhất 1 tiết 4 trong tuần.
```

Buttons:
- `Lưu ràng buộc`
- `Sửa lại`

## Acceptance Criteria

- All clarification text is Vietnamese.
- No backend enum appears in UI text.
- Every clarification question has concrete options unless missing entity list is empty.
- Selecting an option produces deterministic `ConstraintSpec`/IR, no LLM needed if option already maps exactly.
- Reparse with free text uses `userFeedback` as highest priority.
- Tests cover copy for ambiguous direction, entity, period, subject scope.

---

# M6 — IR-first Shadow Mode with Real Gates

## Goal

Use IR-first parser safely while legacy remains authoritative until metrics prove safe.

## Current good sign

`ir-first-parser.ts` and `shadow-mode.ts` exist. However, shadow mode only matters if:
- it runs on real parse path;
- logs are persisted or testable;
- CI has thresholds;
- metrics block flipping.

## Tasks

### M6.1. Wire shadow mode into parse pipeline

At the end of legacy parse:

```ts
const irFirstResult = parseIRFirstWithGuard(rawText, hints);
const divergence = classifyDivergence(rawText, legacyResult, irFirstResult);
logger.log(...);
```

Do not affect user result yet.

### M6.2. Persist or export shadow logs

Options:
- in-memory for tests;
- local JSONL for dev;
- telemetry storage later.

Minimum:
```ts
export function getShadowSummaryForTests()
```

### M6.3. Create divergence analyzer

Script:
```text
scripts/analyze_constraint_shadow.ts
```

Outputs:
```json
{
  "total": 200,
  "silentFlipCount": 0,
  "silentFlipRate": 0,
  "kindMismatchRate": 0.03,
  "paramMismatchRate": 0.02,
  "clarificationDiffRate": 0.08
}
```

### M6.4. Add CI gate

Required before flip:
- `silentFlipRate === 0`
- frozen cases pass
- require/block/only confusion cases pass
- clarification rate under agreed threshold
- no unsupported hard constraint reaches solver

### M6.5. Golden set V2 expansion

Add at least 100 Vietnamese constraints:

Categories:
- teacher block day/period/slot
- teacher require period
- teacher only allowed periods
- teacher preferred periods
- class block period
- class require period
- subject constraints
- consecutive constraints
- max/min per day
- if-then constraints
- ambiguous cases expected to ask clarification
- unsupported cases expected to reject

Each case should include:
```ts
{
  id: 'G2-REQ-TEACHER-001',
  text: 'Cô Thủy phải có tiết 4',
  expectedStatus: 'mapped_builtin',
  expectedKind: 'teacher_required_period',
  expectedParams: { teacher: 'Thủy', period: 4, minCount: 1 },
  expectedIRShape: 'atLeast',
}
```

## Acceptance Criteria

- Shadow mode runs in tests.
- Divergence summary available.
- CI fails on any silent flip.
- Golden V2 has enough negative/ambiguous cases, not only happy path.
- Parser flip is impossible unless M6 gates pass.

---

# M7 — Compiler / Checker / Humanizer Parity

## Goal

Every supported hard constraint must have equivalent:
1. parse output;
2. human preview;
3. IR validation;
4. solver encoding;
5. deterministic checker / verifier.

## Why

Nếu preview nói “Cô Thủy phải có ít nhất 1 tiết 4” nhưng solver encode thành “Cô Thủy chỉ dạy tiết 4”, app chết về mặt trust.

## Tasks

### M7.1. Define capability map

File:
```text
src/features/timetable/ai/constraint-capabilities.ts
```

Example:
```ts
export type ConstraintCapability = {
  kind: ConstraintKind;
  canParse: boolean;
  canHumanize: boolean;
  canConvertToIR: boolean;
  canValidateIR: boolean;
  canEncodeSolver: boolean;
  canCheckDeterministically: boolean;
  notes?: string;
};
```

### M7.2. Add require-family capabilities

For:
```ts
teacher_required_period
class_required_period
subject_required_period
```

Must be:
```ts
canParse: true
canHumanize: true
canConvertToIR: true
canValidateIR: true
canEncodeSolver: true
canCheckDeterministically: true
```

If any is false, solver gate must block hard constraint.

### M7.3. Humanizer parity

Humanizer output must be stable:

```ts
teacher_required_period -> "Cô {teacher} bắt buộc có ít nhất {minCount} tiết {period} trong tuần."
teacher_block_period -> "Cô {teacher} không dạy tiết {period}."
teacher_allowed_periods -> "Cô {teacher} chỉ được dạy các tiết {periods}."
```

Tests:
- no backend enum in human text;
- includes teacher/class/subject;
- includes period;
- includes count if applicable;
- distinguish require vs only vs block.

### M7.4. Deterministic validator

Checker semantics for `teacher_required_period`:

Given final schedule entries:
```ts
count days/entries where teacher == T and period == P
must be >= minCount
```

Important product decision:
- Count by entries or by distinct days?
- Existing IR seems `atLeast k over days`, so it counts distinct days where teacher teaches period P.
- Confirm and document.

Test schedules:
- Teacher has one period 4 on Monday -> pass for `minCount=1`.
- Teacher has zero period 4 -> fail.
- Teacher has period 4 twice same day in two classes -> if counting distinct days, count 1 day; if counting entries, count 2. Pick one and test.

### M7.5. Solver encoder

CP-SAT encoding idea for teacher required period:

Let:
```text
teacher_teaches_period_day[T,D,P] = OR over assignments/classes taught by T at D,P
```

Constraint:
```text
sum_D teacher_teaches_period_day[T,D,P] >= minCount
```

Class required period:
```text
sum_D class_has_any_lesson_at_period[C,D,P] >= minCount
```

Subject required period:
Depends on product decision:
- per class:
```text
for each class C that has subject S:
  sum_D class_subject_at_period[C,S,D,P] >= minCount
```
- global:
```text
sum_{C,D} class_subject_at_period[C,S,D,P] >= minCount
```

### M7.6. Parity tests

For each supported kind:

```ts
parse text -> spec
spec -> IR
IR -> human text
IR -> solver encode
schedule -> deterministic checker
```

The checker and solver should agree on pass/fail for synthetic schedules.

## Acceptance Criteria

- All supported hard kinds have capability row.
- Solver gate uses capability row.
- Require-family has parser/humanizer/IR/encoder/checker tests.
- `npm run check:parity` passes.
- No hard constraint with missing encoder can reach solver.

---

# M8 — Parser Flip

## Goal

Make IR-first parser authoritative only after data proves it is safer than legacy.

## Preconditions

Do not start unless:

- M1-M7 complete.
- `silentFlipRate === 0`.
- Frozen regression green.
- Golden V2 green.
- Solver gate fail-closed.
- UI clarification copy accepted.
- No solve-time LLM/codegen.

## Tasks

### M8.1. Feature flag

Add flag:
```ts
CONSTRAINT_PARSER_MODE = 'legacy' | 'shadow' | 'ir_first'
```

Default:
```ts
shadow
```

During flip:
```ts
ir_first
```

### M8.2. Authoritative IR-first path

Flow:
```ts
parseIRFirstWithGuard
  -> if ir exact: return mapped_builtin/custom_dsl with expr
  -> if needs clarification: return clarification
  -> if escalate: call Tier-2 LLM IR parser
```

Legacy used only for shadow comparison, then removed in M9.

### M8.3. Tier-2 LLM must output IR JSON

No freeform custom DSL.

Schema:
```json
{
  "decision": "ir" | "needs_clarification" | "unsupported",
  "expr": {},
  "explain_vi": "...",
  "missing": [],
  "confidence": "high|medium|low"
}
```

### M8.4. Back-translation must compare IR meaning

Not enough to compare text. It must verify:
- direction;
- entity;
- period/day;
- count;
- scope;
- severity.

### M8.5. Rollback

Keep flag rollback for one release.

If production detects silent flip:
- auto switch to `legacy` or `shadow`;
- force all affected constraints to re-confirm.

## Acceptance Criteria

- IR-first mode passes all tests.
- Legacy/IR divergence acceptable.
- Feature flag works.
- Rollback documented.
- No user-facing regression in clarification flow.

---

# M9 — Decommission Unsafe Paths

## Goal

Remove old paths that allow semantic drift or unsafe solve-time behavior.

## Tasks

### M9.1. Remove `pythonPredicate` from user input path

`pythonPredicate` should not be generated from user text dynamically.

Allowed only:
- internal tests;
- trusted static fixtures;
- maybe migration legacy records but gated.

### M9.2. Remove hardcoded built-in allowlists

All kind metadata comes from central registry/capability map.

### M9.3. Remove semantic duplicate regex

All direction markers from `semantic-direction.ts` / disambiguation table.

### M9.4. Remove legacy parser authority

Legacy can remain as test fixture, not production authority.

### M9.5. Migration for saved constraints

Saved records:
- if have valid IR -> keep.
- if have built-in kind and adapter -> migrate to IR.
- if custom text only -> mark `needs_review`.
- if unknown kind -> mark `unsupported`.

User-facing message:
```text
Một số ràng buộc cũ cần bạn xác nhận lại trước khi xếp lịch để tránh hiểu sai ý.
```

## Acceptance Criteria

- No solve route can access raw natural language constraints directly.
- No dynamic Python code generation from constraints.
- Old constraints are migrated or blocked.
- Tests prove removed paths do not compile/import.

---

# 5. Detailed Implementation Order

## Sprint 1 — Stop the bleeding

Priority:
1. M1 Contract Sync
2. M2 Deterministic require-family
3. M3 Disambiguation-first shared semantic direction
4. M4 Solver gate hardening

Do not start UI polish before this is green.

### Expected commits

```text
test(constraints): add contract tests for require/block/only semantics
fix(constraints): centralize built-in kind registry usage
fix(parser): add deterministic require-period parsing
fix(retriever): add require-family candidates and negative few-shots
fix(solver): fail closed for unsupported confirmed constraints
```

## Sprint 2 — Make clarification safe

Priority:
1. M5 DTO and Vietnamese copy
2. reparse user feedback
3. confirmation preview
4. UI tests

Expected commits:
```text
feat(constraints): add structured Vietnamese clarification options
fix(constraints): prioritize user clarification feedback during reparse
test(constraints): cover clarification copy and option selection
```

## Sprint 3 — IR-first with real gates

Priority:
1. M6 shadow wiring
2. M7 capability/parity
3. golden set expansion

Expected commits:
```text
feat(constraints): wire IR-first shadow mode into parse pipeline
test(constraints): add golden v2 semantic regression suite
feat(constraints): add capability map for parser solver parity
```

## Sprint 4 — Flip and cleanup

Priority:
1. M8 feature flag
2. Tier-2 IR JSON LLM
3. M9 decommission unsafe paths

Expected commits:
```text
feat(constraints): enable IR-first parser behind feature flag
refactor(constraints): remove unsafe custom DSL solve path
chore(constraints): migrate saved constraints to IR-backed records
```

---

# 6. Test Matrix

## 6.1. Core semantic matrix

| Input | Expected |
|---|---|
| `Cô Thủy phải có tiết 4` | `teacher_required_period` |
| `Cô Thủy phải có ít nhất 1 tiết 4 trong tuần` | `teacher_required_period` |
| `Cô Thủy cần có tiết 4` | `teacher_required_period` |
| `Cô Thủy bắt buộc có tiết 4` | `teacher_required_period` |
| `Cô Thủy không dạy tiết 4` | `teacher_block_period` |
| `Cô Thủy nghỉ tiết 4` | `teacher_block_period` |
| `Cô Thủy cấm dạy tiết 4` | `teacher_block_period` |
| `Cô Thủy chỉ dạy tiết 4` | `teacher_allowed_periods` |
| `Cô Thủy chỉ được dạy tiết 4` | `teacher_allowed_periods` |
| `Cô Thủy nên dạy tiết 4` | `teacher_preferred_periods` or soft clarification |
| `Cô Thủy có tiết 4` | clarification |
| `Cô Thủy không phải có tiết 4` | clarification |
| `Cô Thủy phải không dạy tiết 4` | clarification |
| `Thủy tiết 4` | clarification |

## 6.2. Entity matrix

| Input | Data condition | Expected |
|---|---|---|
| `Thủy không dạy tiết 4` | one Thủy | parse |
| `Thủy không dạy tiết 4` | two Thủy | ask which teacher |
| `Không dạy tiết 4` | no teacher | ask teacher |
| `Lớp 6A không học tiết 4` | class exists | class block period |
| `6A phải có tiết 4` | class exists | class required period |
| `Toán phải có tiết 4` | subject exists, no class | ask scope |

## 6.3. Solver gate matrix

| Constraint | Confirmed | Executable | Expected |
|---|---:|---:|---|
| raw hard text | No | No | block |
| `teacher_block_period` | Yes | Yes | allow |
| `teacher_required_period` | Yes | Yes | allow |
| `teacher_required_period` missing period | Yes | No | block |
| `custom_dsl` with `naturalLanguage` only | Yes | No | block |
| `custom_dsl` with valid `expr` | Yes | Yes | allow |
| unknown kind | Yes | No | block |
| unsupported hard kind | Yes | No | block |
| unsupported soft kind | Yes | No | warning/drop by policy |

## 6.4. No solve-time AI matrix

Test with spy/mock:
- `invokeAnalyzeChat` not called
- `constraint-reparse-service` not called
- code generation not called
- prompt sync not relevant to solve path
- only solver bridge called

---

# 7. Acceptance Gates by Command

Use actual package scripts:

```bash
npm test
npm run build
npm run check:parity
npm run lint
```

Targeted during development:

```bash
npm run test:grep -- constraint
npm run test:grep -- retriever
npm run test:grep -- built-in-suggestion
npm run test:grep -- phase0
npm run test:grep -- solver-constraint-gate
npm run test:grep -- ir-first-parser
npm run test:grep -- shadow-mode
```

Release gate:

```bash
npm test
npm run check:parity
npm run build
```

No merge if:
- any frozen semantic test fails;
- any solver gate test fails;
- any silent flip appears;
- any hard unsupported constraint reaches solver;
- UI shows backend enum to user.

---

# 8. Product Decisions Needed Before Implementation

These must be answered before coding M2/M7/M8 deeply.

1. **`subject_required_period` nghĩa chính xác là gì?**  
   - Mỗi lớp có môn đó phải có ít nhất một tiết X?
   - Hay toàn trường chỉ cần môn đó xuất hiện ở tiết X?
   - Hay phải luôn hỏi lớp nếu user chỉ nói tên môn?

2. **`teacher_required_period.minCount` đếm theo gì?**  
   - số ngày có dạy tiết đó;
   - hay số assignment/entry ở tiết đó;
   - hay số lớp khác nhau?

3. **Nếu user nói “Cô Thủy phải có tiết 4” không nói “trong tuần”, có default `minCount=1` không?**  
   Recommended: yes, but preview must say rõ “ít nhất 1 tiết 4 trong tuần”.

4. **Soft unsupported constraints xử lý thế nào khi solve?**  
   - block solve;
   - warning and ignore;
   - ask user to confirm dropping.

5. **Saved constraints cũ chưa có IR xử lý ra sao?**  
   - auto migrate if adapter exists;
   - otherwise require review.

6. **Có cho phép LLM parse trực tiếp ra IR sau khi user bấm “Lưu ràng buộc” không?**  
   Recommended: allowed during constraint entry, not during solve.

7. **Có cho phép free-text clarification không?**  
   Recommended: yes, but reparse must require confirmation again.

8. **Threshold để flip IR-first là bao nhiêu?**  
   Recommended:
   - silent flip = 0;
   - unsupported hard to solver = 0;
   - frozen pass = 100%;
   - golden semantic exact pass >= 98%;
   - ambiguous expected clarification pass = 100%.

---

# 9. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Duplicate regex marker lists drift | Silent semantic flip | Centralize semantic direction |
| LLM returns kind not in allowlist | Correct parse rejected or custom fallback | Central registry set |
| Subject semantics unclear | Wrong timetable behavior | Force clarification until product decision |
| Solver ignores unsupported hard constraint | Timetable violates user requirement | Fail-closed solver gate |
| UI exposes backend enum | Bad UX, confused users | DTO only has Vietnamese copy |
| Custom DSL text reaches solver | Runtime unsafe / no-op | Require valid IR expr |
| Shadow mode logs but no gate | False sense of safety | CI threshold |
| Parser flip too early | Production semantic bugs | Feature flag + rollback |
| Existing saved constraints invalid | Users get unexpected solve failure | Migration/review flow |
| “100% parse” interpreted as always deciding | Wrong impossible promise | Define 100% as no silent wrong parse |

---

# 10. Definition of Done

A constraint feature is “done” only when all are true:

- It has parser coverage.
- It has disambiguation behavior.
- It has Vietnamese humanizer text.
- It has clarification behavior for missing/ambiguous fields.
- It has IR or built-in executable representation.
- It has solver encoder.
- It has deterministic checker.
- It is listed in capability map.
- It is covered by golden tests.
- It is blocked by solver gate if any required capability is missing.
- It has no solve-time LLM/codegen dependency.

---

# 11. Immediate Next Actions

Do these next, in order:

1. Commit `Plan_v2.md`.
2. Add M1 contract tests for registry/parser/capability drift.
3. Patch `parse-pipeline.ts` to stop hardcoded `BUILT_IN_KINDS` drift.
4. Add require-family deterministic suggestion tests.
5. Patch `built-in-suggestion.ts`.
6. Patch `constraint-retriever.ts`.
7. Add shared `semantic-direction.ts`.
8. Wire semantic direction into legacy and IR-first parser paths.
9. Add solver gate tests for `teacher_required_period`.
10. Verify solve path does not call LLM/codegen.
11. Expand golden V2.
12. Only then continue IR-first Phase 1/2 work.

---

# 12. Recommended Branch / Commit Strategy

Branch:
```bash
git checkout -b fix/constraint-engine-plan-v2
```

Commit 1:
```text
docs(constraints): add plan v2 for parser and solver hardening
```

Commit 2:
```text
test(constraints): add semantic contract tests for require/block/only
```

Commit 3:
```text
fix(constraints): centralize built-in kind allowlist
```

Commit 4:
```text
fix(parser): add deterministic require-period parsing
```

Commit 5:
```text
fix(retriever): add require-family triggers and negative few-shots
```

Commit 6:
```text
fix(solver): block non-executable constraints at solve gate
```

Commit 7:
```text
feat(constraints): add Vietnamese clarification DTO and copy
```

Commit 8:
```text
feat(constraints): wire IR-first shadow metrics
```

---

# 13. Reviewer Checklist

Before approving PR:

- [ ] Does this PR change parser semantics?
- [ ] Are require/block/only tests updated?
- [ ] Does any user-facing text expose backend names?
- [ ] Does solve path import any LLM/chat/codegen module?
- [ ] Are all hard constraints either encoded or blocked?
- [ ] Are saved constraints migration effects considered?
- [ ] Does the PR add a new kind? If yes, is capability map updated?
- [ ] Does humanizer output match solver semantics?
- [ ] Does deterministic validator match solver encoder?
- [ ] Does shadow divergence remain acceptable?

---

# 14. Hard Line

Do not continue building more constraint types until the current dangerous semantic cases are impossible:

```text
phải có  -> require / atLeast
không    -> block
chỉ      -> allowed-only
nên      -> preference/soft
unclear  -> ask user
unsupported -> block before solver
```

Anything else is building on sand.
