# Refactor Plan: Constraint Authoring and Backend Rebuild

## Goal

Build a constraint authoring flow that is friendly for non-technical users while
making the backend constraint contract stricter, easier to validate, and easier
to encode into the solver.

The new flow deliberately separates:

- Built-in constraints selected through guided forms.
- Custom constraints entered as free text and normalized by AI.
- AI suggestion for finding built-in constraints, with strict confidence gates.

Bulk update is out of scope for this plan.

## Current Problem

The current constraint flow is text-first:

1. User types natural-language constraints.
2. Rule parser and/or LLM translates text into `ConstraintSpec[]`.
3. User reviews the interpreted draft.
4. Confirmed specs are passed to the solver pipeline.

This works, but it creates friction for normal users:

- Users must know how to phrase constraints.
- Built-in constraints are not discoverable enough.
- AI can over-interpret vague text.
- Custom constraints and built-in constraints are mixed too early.
- Backend has to defend against ambiguous translated output.

The target rebuild should make built-in constraints explicit and structured from
the start.

## Target User Flow

### Flow A: Built-in Constraint Wizard

The default flow is a guided wizard.

1. User chooses severity:
   - `Bắt buộc` maps to `hard`.
   - `Nên có` maps to `soft`.
2. User chooses scope:
   - `Giáo viên`
   - `Môn học`
   - `Lớp`
   - `Phân công`
3. User chooses a built-in constraint type inside that scope.
4. A modal opens with fields required by that constraint.
5. User fills fields and clicks `Đồng ý`.
6. App shows a review sentence.
7. User confirms.

Example:

```text
Bắt buộc
→ Giáo viên
→ Giáo viên không dạy ngày
→ Giáo viên: Sơn
→ Ngày: Thứ 2
→ Đồng ý
```

Generated backend object:

```ts
{
  mode: "built_in",
  severity: "hard",
  scope: "teacher",
  kind: "teacher_block_day",
  params: {
    teacher: "Sơn",
    day: "monday"
  },
  displayText: "Giáo viên Sơn không dạy Thứ 2."
}
```

### Flow B: Custom Constraint

If the constraint is not built-in, the user chooses custom mode.

1. User chooses severity.
2. User switches to `Custom`.
3. User enters free text.
4. AI normalizes wording into a clear standard sentence.
5. User reviews and confirms.
6. Backend stores this as a custom constraint.

Example input:

```text
Vào thứ 4, nếu cô Thúy dạy tiết 1 thì vào thứ 5, cô Hạnh không dạy tiết 2.
```

Example normalized display:

```text
Nếu giáo viên Thúy dạy Thứ 4 tiết 1,
thì giáo viên Hạnh không dạy Thứ 5 tiết 2.
```

Generated backend object:

```ts
{
  mode: "custom",
  severity: "hard",
  originalText: "Vào thứ 4, nếu cô Thúy dạy tiết 1 thì vào thứ 5, cô Hạnh không dạy tiết 2.",
  normalizedText: "Nếu giáo viên Thúy dạy Thứ 4 tiết 1, thì giáo viên Hạnh không dạy Thứ 5 tiết 2.",
  status: "needs_user_confirmation"
}
```

Custom mode is intentionally separate from built-in mode. It should not silently
convert to a built-in constraint.

### Flow C: AI Built-in Suggestion Assistant

This is an optional helper for users who do not know which built-in option to
choose.

1. User types a sentence in a search/helper box.
2. The assistant tries to match it to a built-in constraint.
3. If confidence is high, it suggests the exact wizard path and prefilled fields.
4. If confidence is not high, it tells the user to use custom mode.

Example:

```text
Input: Thầy Sơn không dạy thứ 2
```

Suggestion:

```text
Nên chọn:
- Loại: Bắt buộc
- Đối tượng: Giáo viên
- Ràng buộc: Giáo viên không dạy ngày
- Giáo viên: Sơn
- Ngày: Thứ 2
```

Strict rule:

```text
If the assistant is not confident that the input maps to a built-in constraint,
it must not suggest a built-in. It must suggest custom mode instead.
```

## Product Rules

### Severity Labels

UI labels:

- `Bắt buộc`
- `Nên có`

Backend values:

- `hard`
- `soft`

The UI should not show `hard` or `soft` to normal users.

### Scope Labels

UI labels:

- `Giáo viên`
- `Môn học`
- `Lớp`
- `Phân công`
- `Custom`

Backend values:

- `teacher`
- `subject`
- `class`
- `assignment`
- `custom`

### Assignment Scope Additions

These existing global/pair kinds should appear under `Phân công` in the UI:

- `pair_not_same_slot`
- `pair_same_slot`
- `mutual_exclusion`
- `session_limit`

Reason: non-technical users understand these as relations between assignments
or assignment schedules, not as abstract global rules.

### Search Requirements

Every modal should support search where relevant:

- Search teacher names.
- Search subject names.
- Search class names.
- Search assignments.
- Search built-in constraint type names.

Search should support:

- Case-insensitive matching.
- Vietnamese diacritic-insensitive matching.
- Partial match.
- Empty state with clear message.

## Backend Contract

### Top-level Type

```ts
type TimetableConstraint = BuiltInConstraint | CustomConstraint;
```

### Built-in Constraint

```ts
type BuiltInConstraint = {
  id: string;
  mode: "built_in";
  severity: "hard" | "soft";
  scope: "teacher" | "subject" | "class" | "assignment" | "global";
  kind: BuiltInConstraintKind;
  params: Record<string, unknown>;
  weight?: number;
  displayText: string;
  createdAt: string;
  updatedAt: string;
};
```

### Custom Constraint

```ts
type CustomConstraint = {
  id: string;
  mode: "custom";
  severity: "hard" | "soft";
  originalText: string;
  normalizedText: string;
  structuredDraft?: unknown;
  status: "draft" | "needs_user_confirmation" | "confirmed" | "unsupported";
  aiConfidence?: number;
  createdAt: string;
  updatedAt: string;
};
```

### Built-in Definition Registry

The backend should maintain a source-of-truth registry:

```ts
type BuiltInConstraintDefinition = {
  kind: BuiltInConstraintKind;
  scope: "teacher" | "subject" | "class" | "assignment" | "global";
  labelVi: string;
  descriptionVi: string;
  exampleVi: string;
  severityAllowed: Array<"hard" | "soft">;
  paramsSchema: unknown;
  hasSolverEncoder: boolean;
  hasValidator: boolean;
};
```

This replaces scattered UI knowledge with one structured definition per built-in
constraint.

## Built-in Groups

### Teacher

Teacher constraints apply to one teacher or a pair of teachers.

Examples:

- `teacher_block_day`: Sơn không dạy Thứ 2.
- `teacher_block_period`: Sơn không dạy tiết 1.
- `teacher_block_slot`: Sơn không dạy Thứ 2 tiết 1.
- `teacher_max_per_day`: Sơn dạy tối đa 4 tiết mỗi ngày.
- `teacher_max_consecutive`: Sơn không dạy quá 2 tiết liên tiếp.
- `teacher_max_working_days`: Sơn dạy tối đa 4 ngày trong tuần.
- `teacher_min_per_day`: Sơn dạy ít nhất 2 tiết trong ngày có lịch.
- `teacher_no_gaps`: Lịch dạy của Sơn không có tiết trống ở giữa.
- `teacher_allowed_days`: Sơn chỉ dạy Thứ 3 và Thứ 5.
- `teacher_allowed_periods`: Sơn chỉ dạy tiết 2, 3, 4.
- `teacher_min_working_days`: Sơn phải dạy ít nhất 3 ngày trong tuần.
- `teacher_max_gaps`: Sơn có tối đa 1 tiết trống trong ngày.
- `teacher_min_consecutive`: Sơn đã dạy thì dạy ít nhất 2 tiết liền.
- `teacher_balanced_load`: Lịch Sơn giữa các ngày lệch tối đa 1 tiết.
- `teacher_max_subjects_per_day`: Sơn dạy tối đa 2 môn mỗi ngày.
- `teacher_max_consecutive_days`: Sơn không dạy quá 3 ngày liên tiếp.
- `teacher_preferred_periods`: Ưu tiên Sơn dạy tiết 3, 4.
- `teacher_max_classes_per_day`: Sơn dạy tối đa 3 lớp mỗi ngày.
- `teacher_pair_not_same_slot`: Sơn và Hương không cùng dạy một tiết.
- `teacher_homeroom_first_period`: Giáo viên chủ nhiệm Sơn dạy 6A tiết đầu.
- `teacher_required_day`: Sơn phải có tiết dạy Thứ 2.
- `teacher_required_slot`: Sơn phải dạy Thứ 2 tiết 1.
- `teacher_pair_required_same_day`: Sơn và Hương cùng phải dạy Thứ 2.
- `teacher_pair_required_same_slot`: Sơn và Hương cùng dạy Thứ 2 tiết 1.

### Subject

Subject constraints apply to a subject across classes unless narrowed by params.

Examples:

- `subject_pin_period`: Toán phải xếp tiết 1.
- `subject_preferred_periods`: Ưu tiên Toán tiết 1, 2.
- `subject_not_last_period`: Toán không xếp tiết cuối.
- `subject_consecutive`: Toán xếp 2 tiết liền.
- `subject_max_consecutive`: Toán không quá 2 tiết liền.
- `subject_allowed_days`: Toán chỉ học Thứ 2, Thứ 4, Thứ 6.
- `subject_min_gap_days`: Các buổi Toán cách nhau ít nhất 1 ngày.
- `subject_daily_max_periods`: Toán tối đa 2 tiết mỗi ngày.
- `subject_block_period`: GDTC không học tiết 1.
- `subject_block_days`: Văn không học Thứ 6.
- `subject_not_consecutive`: Anh không xếp liền 2 tiết.
- `subject_min_days`: Toán phải học ít nhất 3 ngày trong tuần.
- `subject_spread_evenly`: Toán rải đều trong tuần.
- `subject_order_before`: Lý phải học trước Hóa.
- `subject_not_after_subject`: Toán không học ngay sau GDTC.
- `subject_group`: Nhóm môn nặng gồm Toán, Lý, Hóa.
- `subject_group_daily_limit`: Nhóm môn nặng tối đa 2 tiết mỗi ngày.
- `subject_session_max_periods`: Toán buổi sáng tối đa 2 tiết.

### Class

Class constraints apply to one class or class-level schedules.

Examples:

- `class_block_day`: 6A không học Thứ 7.
- `class_block_period`: 6A không học tiết 5.
- `class_block_slot`: 6A không học Thứ 2 tiết 1.
- `class_max_per_day`: 6A tối đa 5 tiết mỗi ngày.
- `class_min_per_day`: 6A tối thiểu 4 tiết mỗi ngày.
- `class_no_gaps`: 6A học liền mạch, không có tiết trống.
- `class_no_double_subject_day`: 6A không học Toán quá 1 lần mỗi ngày.
- `class_subjects_not_same_day`: 6A không học Toán và Văn cùng ngày.
- `class_fixed_period`: 6A phải có tiết ở Thứ 2 tiết 1.
- `class_allowed_days`: 6A chỉ học từ Thứ 2 đến Thứ 6.
- `class_allowed_periods`: 6A chỉ học tiết 1 đến tiết 5.
- `class_max_consecutive`: 6A không học quá 4 tiết liền.
- `class_max_subjects_per_day`: 6A tối đa 5 môn mỗi ngày.
- `class_balanced_load`: Số tiết của 6A giữa các ngày lệch tối đa 1.
- `class_subjects_same_day`: Toán và Tin của 6A phải học cùng ngày.
- `class_min_working_days`: 6A phải học ít nhất 5 ngày trong tuần.
- `class_max_heavy_subjects_per_day`: 6A tối đa 2 môn nặng mỗi ngày.
- `class_max_heavy_subjects_per_session`: 6A buổi sáng tối đa 1 môn nặng.
- `class_first_period_required`: Ngày nào 6A học thì phải có tiết 1.

### Assignment

Assignment constraints apply to a specific teacher-subject-class assignment or a
relationship between assignments.

Examples:

- `assignment_pin_slot`: Sơn - Toán - 6A phải xếp Thứ 2 tiết 1.
- `assignment_block_slot`: Sơn - Toán - 6A không xếp Thứ 2 tiết 1.
- `assignment_allowed_slots`: Sơn - Toán - 6A chỉ xếp Thứ 2 tiết 1 hoặc Thứ 4 tiết 3.
- `assignment_spread_days`: Toán 6A phải rải ít nhất 3 ngày.
- `weekly_periods_exact`: Toán 6A đúng 4 tiết trong tuần.
- `assignment_consecutive`: Toán 6A phải có block 2 tiết liền.
- `assignment_max_per_day`: Toán 6A tối đa 1 tiết mỗi ngày.
- `assignment_same_day`: Toán 6A và Tin 6A phải cùng ngày.
- `assignment_not_same_day`: Toán 6A và GDTC 6A không cùng ngày.
- `pair_not_same_slot`: Toán 6A và Văn 6A không được trùng tiết.
- `pair_same_slot`: Sinh hoạt 6A và Sinh hoạt 6B phải cùng tiết.
- `mutual_exclusion`: Trong nhóm phân công này, không được có 2 phân công trùng slot.
- `session_limit`: Sơn buổi sáng tối đa 3 tiết.

### Global

Global constraints apply to the timetable as a whole.

Examples:

- `subject_flag_ceremony_slot`: Thứ 2 tiết 1 là chào cờ.
- `global_teacher_utilization_balance`: Tải dạy giữa giáo viên lệch tối đa 1 tiết.
- `if_then`: Nếu Sơn dạy Thứ 2 tiết 2 thì Hương không dạy Thứ 3 tiết 1.

Note: for the UI, `pair_not_same_slot`, `pair_same_slot`, `mutual_exclusion`,
and `session_limit` should appear under `Phân công`, even if internally some of
them are currently grouped as global.

## AI Suggestion Design

### Purpose

Help users find a built-in wizard path. The assistant does not create final
constraints by itself.

### Input

```ts
{
  userText: string;
  teachers: string[];
  subjects: string[];
  classes: string[];
  assignments: Assignment[];
  builtInDefinitions: BuiltInConstraintDefinition[];
}
```

### Output

```ts
type BuiltInSuggestion =
  | {
      decision: "suggest_built_in";
      confidence: number;
      scope: "teacher" | "subject" | "class" | "assignment" | "global";
      kind: BuiltInConstraintKind;
      paramsDraft: Record<string, unknown>;
      missingParams: string[];
      explanation: string;
    }
  | {
      decision: "use_custom";
      confidence: number;
      reason: string;
    };
```

### Confidence Gate

Rules:

- If confidence is below threshold, return `use_custom`.
- If any required entity is missing or ambiguous, return `use_custom` or ask for
  missing fields in the wizard, depending on the UX state.
- Do not invent teachers, subjects, classes, assignments, or built-in kinds.
- Do not map complex if-then text to a simple built-in unless it exactly matches
  a supported built-in.

Recommended threshold:

```ts
const BUILT_IN_SUGGESTION_THRESHOLD = 0.82;
```

### Local Model Option

For suggestion only, a local small model such as Gemma can be useful. However,
the safest design is hybrid:

1. Deterministic candidate search:
   - entity match
   - Vietnamese normalized text
   - keyword match
   - param extraction
2. AI rerank among top candidates.
3. Confidence gate.
4. If not confident, send user to custom.

Avoid letting the local model generate arbitrary constraint kinds.

## Custom AI Normalization

Custom AI should not try to force every sentence into a built-in constraint.

Input:

```ts
{
  severity: "hard" | "soft";
  originalText: string;
  teachers: string[];
  subjects: string[];
  classes: string[];
  assignments: Assignment[];
}
```

Output:

```ts
{
  normalizedText: string;
  detectedEntities: {
    teachers: string[];
    subjects: string[];
    classes: string[];
    assignments: string[];
    days: string[];
    periods: number[];
  };
  confidence: number;
  needsClarification: boolean;
  clarificationQuestions: string[];
}
```

Rules:

- Normalize wording, do not silently change meaning.
- Keep the original text.
- Ask clarification if entity or time is ambiguous.
- Mark unsupported if the custom statement cannot be made precise enough.

## Implementation Phases

### Phase 1: Constraint Definition Registry

Create a structured definition source for all built-in constraints.

Expected output:

- `BuiltInConstraintDefinition[]`
- Vietnamese labels
- Vietnamese examples
- params schema per kind
- scope grouping for UI
- `pair_*`, `mutual_exclusion`, `session_limit` placed under assignment in UI

Validation:

- Every built-in kind has label, example, params schema.
- Every solver-encodable kind has an encoder contract.
- Every checker-supported kind has validator coverage.

### Phase 2: New Constraint Contract

Introduce `TimetableConstraint = BuiltInConstraint | CustomConstraint`.

Expected output:

- TypeScript types.
- Zod schemas.
- serializer/deserializer.
- migration adapter from current `ConstraintSpec[]`.

Validation:

- Unit tests for schema parsing.
- Unit tests for invalid params.
- Unit tests for hard/soft weight behavior.

### Phase 3: Built-in Wizard UI

Replace text-first built-in creation with guided modal flow.

Expected output:

- Severity picker.
- Scope picker.
- Built-in type picker.
- Param modal.
- Search inputs for entities and built-in types.
- Review card.

Validation:

- Component tests for selecting teacher/day.
- Component tests for soft weight.
- Component tests for missing required params.

### Phase 4: AI Built-in Suggestion Assistant

Add optional helper that suggests wizard path from user text.

Expected output:

- deterministic candidate extractor
- optional local model rerank adapter
- strict confidence gate
- output contract with `suggest_built_in` or `use_custom`

Validation:

- "Sơn không dạy thứ 2" suggests `teacher_block_day`.
- ambiguous teacher returns missing/needs clarification.
- complex custom if-then returns `use_custom` unless exact built-in support exists.
- unsupported text never gets forced into a built-in.

### Phase 5: Custom Constraint Flow

Add separate custom mode.

Expected output:

- Custom input modal.
- AI normalization route/service.
- review and confirmation card.
- custom constraint storage.

Validation:

- Original text is preserved.
- Normalized text is shown to user.
- Low confidence requires confirmation or clarification.
- Custom constraints do not enter built-in encoder path.

### Phase 6: Solver and Validator Adapter

Bridge the new contract into the existing solver pipeline.

Expected output:

- Built-in constraints compile to solver specs.
- Custom constraints route to the custom handling pipeline.
- Old `ConstraintSpec` compatibility adapter during transition.

Validation:

- Existing parity check still passes.
- Built-in wizard output solves simple datasets.
- Custom constraints fail closed if unsupported.

### Phase 7: Remove Old Text-first Built-in Flow

After the new flow is stable, remove or downgrade the old text-first built-in
translation path.

Expected output:

- Built-in creation no longer depends on free-text parsing.
- Rule parser and translator remain only for suggestion/custom/migration.

Validation:

- No built-in solve path requires LLM.
- All wizard-created built-ins are deterministic.

## Non-technical UX Requirements

- Never show raw kind names like `teacher_block_day` in the main UI.
- Always show a Vietnamese summary sentence before confirm.
- Use green `Đồng ý` and red `Cancel` in modals.
- Prefer searchable dropdowns over raw text fields.
- Show examples in every built-in picker row.
- Keep field names concrete:
  - `Tên giáo viên`
  - `Tên lớp`
  - `Tên môn`
  - `Phân công`
  - `Ngày`
  - `Tiết`
  - `Số tiết tối đa`
- Show warnings in normal language, not parser language.
- Make custom mode visible, not hidden as an error fallback.

## Risks

- A local model can over-suggest built-ins if not gated.
- Custom constraints can become vague without a strict review step.
- Mixing custom and built-in too early will recreate current complexity.
- Solver and validator can drift if the new registry is not the source of truth.
- Migration from current confirmed drafts needs care.

## Hard Rules

- Built-in wizard output must be deterministic.
- Custom constraints must not silently become built-in constraints.
- AI suggestion must return `use_custom` when confidence is low.
- Solver should fail closed for unsupported hard constraints.
- Every built-in kind must have one owner definition with params schema,
  encoder status, checker status, label, description, and example.

## Open Questions

- Should custom constraints be solver-enforced in v1, or only normalized and
  reviewed first?
- Should local Gemma be bundled with the desktop app, downloaded on demand, or
  optional?
- What is the minimum machine spec if local AI is used?
- Should soft constraints always require a user-selected priority?
- Should `global` remain visible in UI, or should all current global kinds be
  redistributed into user-facing scopes?

## Suggested First Implementation Slice

Start with a narrow vertical slice:

1. Add new built-in definition registry for 5 simple teacher constraints:
   - `teacher_block_day`
   - `teacher_block_period`
   - `teacher_block_slot`
   - `teacher_max_per_day`
   - `teacher_allowed_days`
2. Add wizard UI for `Bắt buộc/Nên có -> Giáo viên`.
3. Generate new `BuiltInConstraint` objects.
4. Convert them back to current `ConstraintSpec` shape through an adapter.
5. Keep the existing solver untouched for the first slice.

This proves the product workflow without forcing a full backend rewrite in one
step.
