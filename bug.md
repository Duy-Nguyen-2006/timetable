I'll start by reading the computer module documentation, then upload and explore your source code.

I'll upload your source code to the sandbox and explore it.

Let me explore the directory structure and find the constraint-related code.

This is a large, sophisticated codebase. Let me extract the constraint clarification/review UI files that relate to your screenshot (the "AI PHÂN TÍCH" panel with the "Đồng ý" button).

The screenshot doesn't match this card — it shows "GỢI Ý CÁCH HIỂU", "Dùng gợi ý này", "Tự đặt luật" buttons. Let me find the actual clarification component and its state logic.

The "Đồng ý" button lives in `ConstraintInputPanel.tsx` and the suggestion block is `ClarificationSuggestionsBlock.tsx`. Let me extract both, plus the review hook.

Now the key file — the panel that wires the "Đồng ý" button. Let me extract it and the review hook.

I found the buggy button condition. Now let me trace how `pendingAiPreview` state and its handlers are wired, plus how clarification options get a `specDraft`.

Let me look at the critical orchestration logic in `TimetableApp.tsx` around the preview handlers, and how clarification options are built.

The root cause is becoming clear, but let me confirm whether the recommended option ("Dùng gợi ý này") actually carries a `specDraft`, and examine the custom-constraint backend pipeline. Let me extract the clarification builders, draft builders, and the custom normalization service.

I have a clear picture of the UI bug. Let me confirm the backend side — how clarification questions get built into the draft, and the custom-constraint normalization pipeline.

Confirmed the key paths. Let me read the two draft builders that produce the clarification options shown in the preview, to verify whether the recommended option carries a committable `specDraft`.

The empty-options finding is important. Now let me read `buildClarificationQuestions` in `constraint-clarification.ts` — this generates the recommended option shown in your screenshot — to confirm whether it carries a committable `specDraft`.

The smoking gun is confirmed. The recommended option `per_class` in your exact screenshot question carries **no `specDraft`**. Let me verify the `option()` helper and the custom-normalization backend to round out the analysis.

I've confirmed the bug. Let me read the custom-constraint backend (`custom-normalization-service.ts`) to ground the upgrade recommendations.

Tôi đã đọc xuyên suốt luồng xử lý constraint custom trong source của bạn. Đã tìm ra **đúng nguyên nhân** khiến bạn "chọn gợi ý rồi mà không ấn được Đồng ý", và một vài bug phụ đi kèm. Dưới đây là phân tích + cách fix ngay + hướng nâng cấp backend cho "siêu hoàn hảo".

---

## 1. Nguyên nhân gốc (root cause)

Nút **Đồng ý** trong `ConstraintInputPanel.tsx` bị khoá bằng điều kiện:

```tsx
disabled={!pendingAiPreview.draft.proposedSpecs.length || pendingAiPreview.draft.status === 'unsupported'}
```

→ Nút chỉ bật khi `proposedSpecs.length > 0`. Khi câu cần làm rõ (trạng thái `needs_clarification`/`needs_review`), `proposedSpecs = []` ⇒ **Đồng ý luôn bị disable**.

Vấn đề là: **chọn gợi ý KHÔNG hề điền `proposedSpecs`.** Truy ngược đúng câu trong ảnh của bạn:

Câu *"nếu Hương và Sơn dạy cùng 1 ngày thì ko dạy cùng 1 tiết"* rơi vào nhánh `same_day_without_class` trong `constraint-clarification.ts`:

```tsx
questions.push({
  id: 'same_day_without_class',
  prompt: 'Ràng buộc nói «cùng ngày» nhưng chưa rõ áp dụng cho lớp nào?',
  options: [
    option('per_class', 'Áp dụng cho từng lớp: mỗi lớp mỗi ngày tuân theo ràng buộc', { recommended: true }),
    option('whole_school', 'Áp dụng cho toàn trường (mọi lớp)'),
  ],
});
```

Option `per_class` (cái "Dùng gợi ý này" bạn bấm) **không có `specDraft`**. Mà `option()` chỉ tạo `{ id, labelVi, ...extra }` — không có spec.

Giờ xem `ClarificationSuggestionsBlock.handleOptionClick`:

```tsx
if (selected.specDraft && onApplySpecDraft) {   // ❌ FALSE vì per_class không có specDraft
  onApplySpecDraft(selected.specDraft);
  return;
}
onSelectOption(question.id, selected);          // ✅ chạy nhánh này
```

Và trong `ConstraintInputPanel`, `onSelectOption` luôn gọi:

```tsx
onSelectOption={(_questionId, option) => {
  if (option.id.startsWith('use_')) { onReparsePreviewWithFeedback?.(option.labelVi); return; }
  onReparsePreviewWithFeedback?.(option.labelVi);   // → reparse lại bằng LLM
}}
```

⇒ Bấm "Dùng gợi ý này" **không commit gì cả, mà gọi `reparsePreviewWithFeedback` → chạy lại LLM** (`handleIntakeAiAnalysis`). Câu if-then chéo giáo viên này không khớp built-in kind nào, nên LLM lại trả `needs_clarification`, `proposedSpecs` vẫn rỗng → **Đồng ý vẫn disable**. Bạn rơi vào **vòng lặp clarification vô tận**.

**Tóm lại:** các option dạng "phạm vi/ngữ nghĩa" do `buildClarificationQuestions` sinh ra **không mang theo `specDraft`/`irDraft`**, nên click chúng chỉ gọi lại LLM chứ không bao giờ điền được `proposedSpecs` — đúng thứ mà nút Đồng ý phụ thuộc. Đây mâu thuẫn ngay với comment trong `constraint-clarification-types.ts`: *"specDraft and irDraft travel with the option so the user click can deterministically map back to a ConstraintSpec without further LLM calls."* — ý đồ là deterministic, nhưng implement lại rớt về LLM.

---

## 2. Các bug phụ phát hiện thêm

1. **Nhánh custom hoàn toàn không có option để bấm.** Trong `custom-normalization-draft.ts`:
    
    ```tsx
    function clarificationQuestions(result) {
      return result.clarificationQuestions.map((q, i) => ({ id:`custom_clarification_${i+1}`, prompt:q, options: [] })); // options rỗng
    }
    ```
    
    Constraint thuần custom_dsl hiển thị câu hỏi nhưng **không có option, không có "Gợi ý"** → người dùng chỉ còn "Tự đặt luật"/template/chat. Không thể tiến lên qua clarification.
    
2. **`canBuildSpec` của custom quá chặt.** `canBuildSpec = status === 'normalized' && !needsClarification`. Một khi `needsClarification = true` thì **không bao giờ** sinh spec, kể cả khi người dùng đã làm rõ. Không có đường nào hạ cờ `needsClarification` từ phía lựa chọn của user.
3. **Branch chết (dead code) ở thông báo reparse:**
    
    ```tsx
    {reparseCount >= 2 ? (<p>…ưu tiên «Tự đặt luật»…</p>) : reparseCount >= 3 ? (<p>…3 lần…</p>) : null}
    ```
    
    `>= 3` không bao giờ chạy vì `>= 2` đã bắt trước. Và quan trọng hơn: **cap reparse chỉ đổi text, không đổi hành vi click** — nên vẫn lặp được vô hạn.
    
4. **Hai nhánh `onSelectOption` giống hệt nhau.** Nhánh `option.id.startsWith('use_')` (option sửa tên thực thể gần đúng — vốn rất quan trọng) bị xử lý y như mọi option khác: chỉ ném `labelVi` làm feedback, không thực sự thay tên thực thể rồi parse lại.
5. **Import trùng** trong `ConstraintInputPanel.tsx`:
    
    ```tsx
    import type { ConstraintSpec } from '../ai/constraint-spec';   // dòng ~16
    import type { ConstraintSpec } from '../ai/constraint-spec';   // dòng ~18 — trùng
    ```
    
    Sẽ gây lỗi/cảnh báo TS2300 (duplicate identifier).
    

---

## 3. Fix ngay để bỏ kẹt (minimal, deterministic)

Nguyên tắc: **chọn option = commit deterministic, không gọi lại LLM.**

**(a) Thêm handler commit trong `TimetableApp.tsx`** — option nào có `specDraft` thì dùng luôn; option "phạm vi/ngữ nghĩa" thì gói thành `custom_dsl` spec kèm `scope`:

```tsx
const applyPreviewClarificationChoice = (option: ClarificationOption) => {
  if (!pendingAiPreview) return;
  if (option.specDraft) { applyPreviewSpecDraft(option.specDraft); return; }   // đường deterministic sẵn có
  if (option.id === 'none_fit') return;                                        // free-text mới reparse

  const p = pendingAiPreview;
  const refinedText = `${p.draft.displayText ?? p.rawText} — ${option.labelVi}`;
  const spec: ConstraintSpec = {
    id: `custom_${p.item.id}`,
    original: p.rawText,
    severity: p.item.type === 'preferred' ? 'soft' : 'hard',
    kind: 'custom_dsl',
    params: {
      naturalLanguage: p.rawText,
      normalizedText: refinedText,
      scope: option.id,                 // per_class | whole_school | ...
      source: 'clarification_choice',
    },
    ...(p.item.type === 'preferred' ? { weight: p.item.weight } : {}),
  };
  applyPreviewSpecDraft(spec);          // hàm này đã set proposedSpecs + status:'parsed' → bật Đồng ý
};
```

**(b) Đổi wiring trong `ConstraintInputPanel.tsx`** — đừng reparse khi chọn option thường:

```tsx
onSelectOption={(_q, option) => {
  if (option.id === 'none_fit') return;               // free-text tự xử lý qua khung viết lại
  onApplyPreviewClarificationChoice?.(option);        // commit deterministic
}}
```

(và truyền prop `onApplyPreviewClarificationChoice={applyPreviewClarificationChoice}` từ `TimetableApp`.)

**(c) Sửa gate nút Đồng ý** dùng một helper chung thay vì điều kiện rải rác:

```tsx
export function isDraftCommittable(d: ParsedConstraintDraft): boolean {
  return d.status !== 'unsupported'
    && d.proposedSpecs.length > 0
    && !d.issues.some(i => i.code === 'needs_user_clarification');
}
```

```tsx
disabled={!isDraftCommittable(pendingAiPreview.draft)}
```

**(d) Dọn các bug phụ:** xóa import trùng; sửa thứ tự branch reparse (`>= 3` trước `>= 2`); và sau khi vượt cap reparse thì **disable hẳn nút reparse**, chỉ chừa "Tự đặt luật"/template/hạ mềm.

Chỉ với (a)+(b)+(c) là bạn hết kẹt: chọn "Áp dụng cho từng lớp" → có ngay `proposedSpecs` → bấm được Đồng ý.

---

## 4. Nâng cấp backend "siêu hoàn hảo" (đúng triết lý pipeline của bạn)

Fix trên mới chỉ "commit được". Để phần custom constraint thực sự chắc, theo đúng hướng *LLM dịch — code lo đúng đắn* mà bạn đang theo đuổi:

**4.1 — Đóng vòng lặp bằng invariant deterministic.**

Mọi `recommended` option trong một draft `needs_clarification` **bắt buộc** phải tạo ra `proposedSpecs.length > 0` khi apply (qua `specDraft`, `irDraft`, hoặc refinement thuần hàm). Biến điều này thành test contract (xem mục 5). Chọn option **không bao giờ** được phép gọi LLM trừ đúng nhánh free-text "Không cái nào đúng".

**4.2 — Đưa câu điều kiện vào ConstraintIR thay vì custom_dsl "mù".**

Câu trong ảnh là biểu diễn được chính xác, không cần để dạng text custom:

```
if_then(
  if:   same_day(teacherA, teacherB),
  then: not_same_period(teacherA, teacherB),
  scope: per_class            // ← chính là clarification bạn đang hỏi
)
```

Repo bạn đã có sẵn `constraint-ir.ts`, `ir-compiler.ts`, `ir_eval.py`, `kind-to-ir.ts`, `cp-sat-roundtrip.ts`. Hãy để clarification *scope* set thẳng `ir.scope = 'per_class' | 'whole_school'` (deterministic), rồi compile IR → CP-SAT. Như vậy constraint này thành **hard constraint solver encode được**, không còn rơi về custom_dsl chỉ-kiểm-tra.

**4.3 — Gate "Đồng ý" bằng validation thật, không chỉ bằng độ dài mảng.**

Trước khi cho commit, chạy spec/IR qua `ir-type-checker` → `deterministic-validator`/`constraint-draft-validator`. Kết quả gắn capability badge (bạn đã có UI: "Solver hỗ trợ đầy đủ" / "Chỉ kiểm tra, không tối ưu" / "Chưa hỗ trợ"). Nút Đồng ý chỉ commit khi validator nói encode/kiểm-tra được — đảm bảo không bao giờ đẩy constraint rác xuống solver.

**4.4 — Nhánh custom phải có option như nhánh analyze.**

Cho `custom-normalization-draft.ts` dùng chính `buildClarificationQuestions(...)` để sinh option có cấu trúc (scope, severity, disambiguation thực thể) thay vì `options: []`. Và bỏ ràng buộc `canBuildSpec` cứng: cho phép hạ cờ `needsClarification` khi user đã chọn đủ scope/severity.

**4.5 — Loop guard thật sự.** Sau `reparseCount` đạt cap: tắt reparse, chỉ còn deterministic commit / manual / template / demote — để không bao giờ kẹt vòng vô tận nữa.

**4.6 — Sửa entity near-match (`use_*`).** Khi user chọn "Dùng «Sơn»" (sửa typo), phải **thay thực thể trong câu** rồi parse lại đúng tên, chứ không ném labelVi làm feedback chung chung.

---

## 5. Khoá vĩnh viễn bằng test (để không tái phát)

Thêm vào bộ test contract sẵn có (`constraint-kind-contract.test.ts`, `constraint-clarification-builder.test.ts`):

- **Invariant clarification:** với mọi `ConstraintClarificationQuestion` ở draft `needs_clarification`, apply option `recommended` ⇒ `isDraftCommittable(draft) === true`.
- **Regression cho đúng câu của bạn:** input *"nếu Hương và Sơn dạy cùng 1 ngày thì ko dạy cùng 1 tiết"* + chọn `per_class` ⇒ draft có ≥1 spec, `status !== 'unsupported'`, nút Đồng ý enable.
- **No-LLM-on-pick:** chọn option (khác `none_fit`) **không** được gọi `invokeChat` (mock và assert 0 lần gọi).
- **IR roundtrip:** `if_then(same_day → not_same_period, scope=per_class)` compile được CP-SAT và `ir_eval` cho kết quả khớp golden.

---

Nếu bạn muốn, tôi có thể viết thẳng **patch hoàn chỉnh** cho 3 file (`ConstraintInputPanel.tsx`, `TimetableApp.tsx`, `constraint-review-ui.ts`) cho phần fix mục 3, hoặc soạn **spec nâng cấp IR cho constraint điều kiện** (mục 4.2) theo format spec/DoD/test mà bạn hay dùng. Bạn muốn tôi làm cái nào trước?
