# Upgrade Plan: Non-Tech Constraint Re-Parse Approval Flow

## 1. Goal

Build a real, user-friendly recovery flow for the biggest product risk:

> After the system parses a timetable constraint and shows the interpretation to the user, the user may say: **"This is not what I meant."**

The target users are **non-technical school timetable users**. They should never need to understand or edit technical concepts such as:

- `kind`
- `ConstraintSpec`
- Python
- functions
- checker
- hard/soft internals
- solver encoding
- AST/IR/custom DSL

The product must only ask them to confirm whether the system's Vietnamese interpretation matches their intent.

## 2. Final Decision We Agreed On

We agreed to implement this flow:

```text
User enters raw constraint
  -> System parses it
  -> UI shows one Vietnamese interpretation
  -> User chooses: "Đúng rồi" or "Không đúng"
  -> If "Không đúng": backend asks AI to re-parse using two internal strategies
       1. Try to fit the intent into built-in constraints
       2. If built-in is not suitable, produce a clear semantic/code-ready interpretation
  -> UI shows one rewritten Vietnamese interpretation again
  -> User chooses: "Đúng rồi" or "Vẫn không đúng"
  -> Only confirmed interpretations may be sent to solver
```

Important: **the user must not see the two strategies**. They are internal backend behavior only.

## 3. Core UX Requirement

### 3.1 First parse display

After parsing, show only this kind of card:

```text
Hệ thống hiểu là:
"Cô Lan không được dạy vào sáng thứ 2."

[Đúng rồi] [Không đúng]
```

No technical metadata should be visible by default.

Do not show:

- internal kind names
- raw JSON
- templates
- Python predicate
- code editor
- "custom_dsl"
- solver/checker wording
- hard/soft implementation terms

### 3.2 If user clicks "Không đúng"

Do not open a long wizard.

Instead:

1. Send the original raw constraint to AI again.
2. Include the rejected interpretation/spec so AI knows what not to repeat.
3. Include the timetable domain context: teachers, classes, subjects, days, periods/sessions, assignments.
4. Ask AI to produce a new interpretation using two internal routes:
   - built-in candidate if possible
   - semantic candidate if built-in is not possible
5. Show the user only one clean Vietnamese sentence.

Example UI:

```text
Hệ thống hiểu lại là:
"Nếu thứ 2 tiết 1 giáo viên Hương không có tiết dạy, thì thứ 5 tiết 3 và tiết 4 giáo viên Thủy phải có tiết dạy."

[Đúng rồi] [Vẫn không đúng]
```

## 4. Important Example We Agreed On

Raw user input:

```text
Vào ngày thứ 2, tiết 1, nếu cô Hương không dạy, thì đến thứ 5, tiết 3, thầy Thủy phải dạy tiết đó và tiết 4
```

Expected normalized Vietnamese interpretation:

```text
Nếu thứ 2 tiết 1 giáo viên Hương không có tiết dạy, thì thứ 5 tiết 3 và tiết 4 giáo viên Thủy phải có tiết dạy.
```

Expected internal semantic representation, conceptually:

```ts
{
  type: 'semantic_if_then',
  if: {
    op: 'teacher_not_teaching_at_slot',
    teacher: 'Hương',
    day: 'monday',
    period: 1
  },
  then: [
    {
      op: 'teacher_required_slot',
      teacher: 'Thủy',
      day: 'thursday',
      period: 3
    },
    {
      op: 'teacher_required_slot',
      teacher: 'Thủy',
      day: 'thursday',
      period: 4
    }
  ]
}
```

If built-in constraints can represent it, map it to existing `if_then` + then atoms. If not, keep this semantic representation as the input for code generation. The code generator must consume this clarified representation, **not the ambiguous raw sentence directly**.

## 5. Product Principle

The user is not responsible for fixing parser mistakes.

The user only needs to answer:

```text
Is this Vietnamese sentence exactly what you meant?
```

The system is responsible for:

- re-parsing
- rewording
- fitting to built-ins if possible
- creating semantic/code-ready representation if needed
- blocking unsupported constraints

## 6. Backend Re-Parse Contract

Create a dedicated re-parse API/service for rejected interpretations.

Suggested service name:

```ts
reparseRejectedConstraint(...)
```

Suggested route:

```text
POST /api/ai/reparse-constraint
```

Input shape:

```ts
type ReparseRejectedConstraintRequest = {
  rawConstraint: {
    id: string;
    text: string;
    type: 'required' | 'preferred';
    weight?: number;
  };
  rejectedDraft: ParsedConstraintDraft;
  rejectedSummary: string;
  previousAttempts: Array<{
    summary: string;
    spec?: ConstraintSpec;
  }>;
  context: {
    teachers: string[];
    classes: string[];
    subjects: string[];
    days: Array<{ id: string; label: string }>;
    periods: Array<{ day?: string; session?: string; period: number }>;
    assignments: Array<{
      id: string;
      teacher: string;
      class: string;
      subject: string;
      weeklyPeriods: number;
    }>;
  };
};
```

Output shape:

```ts
type ReparseRejectedConstraintResponse = {
  status: 'candidate' | 'unsupported' | 'needs_retry';
  displayText: string;
  candidate: {
    source: 'built_in' | 'semantic';
    confidence: 'high' | 'medium' | 'low';
    specs?: ConstraintSpec[];
    semantic?: SemanticConstraint;
    assumptions: string[];
    unresolvedQuestions: string[];
  };
};
```

Rules:

- `displayText` must be a plain Vietnamese sentence.
- `displayText` must be specific enough for user approval.
- If there are assumptions, they must be folded into the sentence, not hidden in technical metadata.
- If AI cannot produce a precise interpretation, return `unsupported` or `needs_retry`, not a fake near-match.

## 7. AI Prompt Requirements

When user rejects a parse, prompt AI with this policy:

```text
The previous interpretation was rejected by the user.
Do not repeat it.
Your job is to produce a new precise Vietnamese interpretation.

First try to express the user's intent using the supported built-in constraint kinds.
If that is not possible, produce a semantic logic representation that is precise enough for code generation.

Never invent missing teacher/class/subject names.
Never hide assumptions.
If the sentence is ambiguous, rewrite the interpretation with the assumption made explicit.
If exact support is impossible, return unsupported.

The user is non-technical. The display text must be natural Vietnamese only.
```

## 8. Semantic Candidate Design

Add a semantic representation layer for constraints that are not safely covered by built-ins.

This layer is not shown to users.

Minimum semantic operations needed initially:

```ts
type SemanticCondition =
  | { op: 'teacher_teaching_at_slot'; teacher: string; day: string; period: number }
  | { op: 'teacher_not_teaching_at_slot'; teacher: string; day: string; period: number }
  | { op: 'teacher_teaching_on_day'; teacher: string; day: string }
  | { op: 'teacher_not_teaching_on_day'; teacher: string; day: string }
  | { op: 'class_has_subject_at_slot'; class: string; subject: string; day: string; period: number }
  | { op: 'and'; args: SemanticCondition[] }
  | { op: 'or'; args: SemanticCondition[] }
  | { op: 'not'; arg: SemanticCondition };

type SemanticAction =
  | { op: 'teacher_required_slot'; teacher: string; day: string; period: number }
  | { op: 'teacher_block_slot'; teacher: string; day: string; period: number }
  | { op: 'teacher_required_day'; teacher: string; day: string }
  | { op: 'teacher_block_day'; teacher: string; day: string }
  | { op: 'assignment_required_slot'; assignmentId: string; day: string; period: number }
  | { op: 'assignment_block_slot'; assignmentId: string; day: string; period: number };

type SemanticConstraint =
  | {
      type: 'if_then';
      if: SemanticCondition;
      then: SemanticAction[];
    }
  | {
      type: 'all_of';
      constraints: SemanticConstraint[];
    }
  | {
      type: 'unsupported_precise_text';
      text: string;
      reason: string;
    };
```

This can later be mapped to existing `ConstraintSpec`, `if_then`, IR, or code generation.

## 9. User Approval Rules

### 9.1 Confirmed only when user says yes

A rejected or unconfirmed interpretation must never enter the solver.

Only these can be solved:

- user clicked **Đúng rồi** on the current interpretation
- candidate status is not `unsupported`
- candidate has either valid built-in specs or valid semantic representation that the solver/code generator can handle

### 9.2 Rejected interpretation must be remembered

If the user clicks "Không đúng" or "Vẫn không đúng", save the rejected summary/spec in `previousAttempts`.

AI must be instructed not to return the same interpretation again.

### 9.3 Limit attempts safely

Recommended:

- Allow up to 3 automatic re-parse attempts per constraint.
- After 3 rejected attempts, show a simple non-technical block message:

```text
Hệ thống chưa hiểu chính xác ràng buộc này.
Bạn có thể sửa lại câu theo cách cụ thể hơn, hoặc tạm thời bỏ ràng buộc này.
Ràng buộc bắt buộc chưa được xác nhận sẽ không được dùng để xếp lịch.
```

Do not show technical failure details.

## 10. UI Changes

### 10.1 Constraint card states

Add states:

```ts
type ConstraintUnderstandingStatus =
  | 'parsed_waiting_approval'
  | 'approved'
  | 'rejected_reparsing'
  | 'reparsed_waiting_approval'
  | 'unsupported'
  | 'failed_to_understand';
```

### 10.2 Buttons

For first parse:

```text
[Đúng rồi] [Không đúng]
```

After re-parse:

```text
[Đúng rồi] [Vẫn không đúng]
```

For unsupported:

```text
Hệ thống chưa hỗ trợ chính xác ràng buộc này.
[Viết lại câu] [Bỏ qua]
```

For required constraints, **Bỏ qua** should either be disabled or clearly warn that the required constraint will not be used and solving remains blocked unless removed.

### 10.3 Hide advanced controls

The following must not be visible in the primary non-tech flow:

- template selector
- Python predicate
- JSON/spec editor
- kind names
- internal confidence
- checker/solver coverage

Advanced controls may remain behind a small "Nâng cao" area, but not in the default path.

## 11. Solver Gate Rules

Update/keep preflight behavior:

- Any required constraint without approved interpretation blocks solve.
- Any `unsupported` required constraint blocks solve.
- Any semantic candidate that cannot be converted to solver/code blocks solve.
- Do not silently downgrade a required constraint to soft.
- Do not silently run a near-match.

## 12. Code Generation Rule

If candidate source is `semantic`, code generation must receive:

- original text
- approved `displayText`
- semantic representation
- explicit assumptions

It must not rely only on raw natural language.

This is important because raw text is ambiguous. The approved Vietnamese sentence and semantic object are the ground truth.

## 13. Suggested Implementation Steps

### Phase 1 — UX simplification

- Update constraint review cards to show only Vietnamese interpretation + two buttons.
- Hide technical details from normal view.
- Add rejected state and loading state.

### Phase 2 — Re-parse service

- Add `reparseRejectedConstraint` service.
- Add API route or integrate into existing parse service.
- Pass original text, rejected interpretation, previous attempts, and context to AI.
- Return `displayText` + built-in/semantic candidate.

### Phase 3 — Semantic representation

- Add `SemanticConstraint` types.
- Add conversion from simple semantic `if_then` to existing `ConstraintSpec` when possible.
- Preserve semantic payload for future code generation when built-in conversion is not possible.

### Phase 4 — Approval and preflight

- Store approved candidate as the canonical interpretation.
- Ensure solver only consumes approved candidates.
- Block unsupported/unapproved required constraints.

### Phase 5 — Tests

Add tests for:

1. User rejects first parse, AI returns different display text.
2. Previous rejected interpretation is passed to AI.
3. Re-parse does not repeat rejected summary.
4. Required unapproved constraint blocks solve.
5. Approved semantic if_then converts to built-in if possible.
6. Unsupported required constraint blocks solve.
7. UI does not show technical fields in default flow.
8. Example sentence about Hương/Thủy normalizes correctly.

## 14. Acceptance Criteria

This upgrade is done when:

- A non-technical user only sees Vietnamese interpretation text and simple approval buttons.
- Clicking "Không đúng" triggers a re-parse, not a technical edit form.
- AI receives the rejected interpretation and is told not to repeat it.
- The new candidate can be either built-in or semantic/code-ready.
- The user approves only the Vietnamese interpretation.
- Solver only runs approved interpretations.
- Required constraints that remain misunderstood/unsupported block solving.
- No fake near-match is silently accepted.

## 15. Non-Goals

Do not implement these in the first version:

- Full visual IR builder
- Python editor for normal users
- Template gallery as the main recovery path
- Long wizard with many questions
- Asking the user to choose `kind` or technical constraint type
- Showing internal parse JSON in the normal flow

## 16. Summary

The key product decision:

> When user says the parsed interpretation is wrong, the system should not ask them to fix technical details. It should re-parse internally using built-in and semantic strategies, then show one clear Vietnamese interpretation for approval again.

This keeps the user flow simple while still creating precise, code-ready logic for the solver.
