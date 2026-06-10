# Plan: Parse Pipeline — Clarification Fallback (Milestone 1)

**Source PRD**: `.claude/prds/parse-pipeline-clarification-fallback.prd.md`
**Selected Milestone**: M1 — Humanizer clarification fallback
**Complexity**: Medium

## Summary
Thay thế fallback debug-string trong `constraint-humanizer.ts:default` (và `case 'custom_dsl'`) bằng câu hỏi clarify tiếng Việt tự nhiên từ `buildClarificationQuestions()`. Đồng thời update `ConstraintDraftCard.tsx` để **thực sự render** `clarificationQuestions` thành clickable options (hiện tại chỉ check `.length` để disable confirm — user không thấy options). Bổ sung humanizer cases cho ~23 `ConstraintKind` còn thiếu trong switch (đã xác nhận: registry có 80+ kinds, humanizer chỉ handle 57 → 23 kinds rơi vào `default`).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Test framework | `src/features/timetable/ai/constraint-review.test.ts:1-2` | `node:test` + `node:assert/strict`; import fixtures từ `./types`; dùng `baseInput: AgentInputPayload` ở top-level. |
| Test structure | `constraint-review.test.ts:53-58` | `test('humanizeXyz for scenario', () => { ... assert.match(out, /regex/) })` — match cả 2 chiều (positive + negative) cho mỗi scenario. |
| Naming | `src/features/timetable/ai/constraint-humanizer.ts:101,291,284` | Export các hàm `humanizeXxx` từ cùng file; suffix `FromBanText` / `Draft` cho variants. |
| Type guard pattern | `src/features/timetable/ai/constraint-draft-validator.ts:42-55` (`matchEntity`) | Dùng discriminated union `{ kind: 'ok' \| 'unknown' \| 'ambiguous' }` cho multi-state return. |
| Error reporting to user | `constraint-draft-validator.ts:74,80,124,152` | Vietnamese error string với `code: 'xxx'` để i18n/programmatic check. |
| UI state for review card | `src/features/timetable/constraints/ConstraintDraftCard.tsx:46-56` | `Boolean(draft?.clarificationQuestions?.length)` để derive `needsClarification`; `canConfirm = !needsClarification`. |
| Logging | **N/A** — không có convention logging rõ ràng trong `ai/`. | Sẽ dùng `console.warn` có prefix `[humanizer:default]` cho dev, không introduce logger mới. |

**No similar code exists for**:
- Generic humanizer template dùng registry meta (chưa ai làm) — sẽ dùng `getConstraintMeta(kind)` từ `constraint-registry.ts:265` làm nguồn.
- Build-time string guard (chưa ai viết) — sẽ là script `scripts/check-user-facing-strings.sh` đơn giản, không cần ESLint plugin mới.

## Files to Change

| File | Action | Why |
|---|---|---|
| `src/features/timetable/ai/constraint-humanizer.ts` | UPDATE | (1) `default` case: gọi `buildClarificationQuestions(spec.original)`, trả prompt câu hỏi đầu tiên thay vì debug string. (2) `case 'custom_dsl'` thiếu `expr`/`explain`: cùng xử lý. (3) Thêm cases cho 23 kind còn thiếu. |
| `src/features/timetable/ai/constraint-humanizer.test.ts` | CREATE | Regression test: bug user repro, 10 câu common, mỗi kind trong registry đều có case (kiểm tra không rơi vào default). |
| `src/features/timetable/constraints/ConstraintDraftCard.tsx` | UPDATE | Render `draft.clarificationQuestions` thành list options clickable (gọi `onAnswer?.(questionId, optionIndex)` qua prop mới). Hiện data có sẵn nhưng không render. |
| `src/features/timetable/ai/constraint-clarification.ts` | UPDATE | Bổ sung pattern detection cho "không lớp nào học quá N tiết 1 môn trong 1 buổi" (mentions "buổi"/"sáng"/"chiều" + "tiết" + số). Trả câu hỏi: "Buổi sáng hay buổi chiều? Tối đa N tiết liên tiếp?". |
| `src/features/timetable/constraints/ConstraintDraftCard.tsx` (props) | UPDATE | Thêm prop `onClarificationAnswer?: (questionId: string, optionIndex: number) => void` (optional; default noop) để parent (`useConstraintReview`) có thể xử lý. |
| `scripts/check-user-facing-strings.sh` | CREATE | Build-time guard: `grep` cho "chưa có mô tả tiếng Việt chi tiết" trong `src/**/*.{ts,tsx}` ngoài `constraint-humanizer.ts`; fail CI nếu match. |
| `package.json` | UPDATE | Thêm script `"check:strings": "bash scripts/check-user-facing-strings.sh"` vào `scripts`. |
| `.claude/prds/parse-pipeline-clarification-fallback.prd.md` | UPDATE | Đổi M1 status `pending` → `in-progress`, link Plan cell tới file này. |

## Tasks

### Task 1: Capture bug trong test (TDD red)
- **Action**: Tạo `src/features/timetable/ai/constraint-humanizer.test.ts`. Thêm test `test('humanizeConstraintSpec falls back to clarification question, NOT debug string, for unknown kind', ...)` với spec `kind: 'class_max_heavy_subjects_per_session'` (kind hợp lệ trong registry nhưng không có case humanizer) + `original: 'Không lớp nào học quá 3 tiết 1 môn trong 1 buổi'`. Assertion: output KHÔNG match `/chưa có mô tả tiếng Việt chi tiết/`; output match `/[Hh]ỏi|[Bb]ạn muốn|buổi|sáng|chiều/` (chứng tỏ nó raise câu hỏi).
- **Mirror**: `constraint-review.test.ts:60-71` (`humanizeConstraintSpec subject_max_consecutive`).
- **Validate**: `npx tsx --test src/features/timetable/ai/constraint-humanizer.test.ts` → test fails với message chứa debug string.

### Task 2: Fix `default` case trong humanizer (TDD green)
- **Action**: Trong `constraint-humanizer.ts:278-279`, thay `return` debug string bằng:
  ```ts
  default: {
    const questions = buildClarificationQuestions(spec.original ?? '');
    const prompt = questions[0]?.prompt
      ?? 'Bạn có thể diễn đạt rõ hơn ý này được không?';
    if (typeof console !== 'undefined' && process.env.NODE_ENV !== 'production') {
      console.warn('[humanizer:default] Unhandled kind, falling back to clarification:', spec.kind);
    }
    return `${prefix}${prompt}${soft(spec)}.`;
  }
  ```
  Import `buildClarificationQuestions` từ `./constraint-clarification` (đã có sẵn ở dir).
- **Mirror**: Discriminated union pattern từ `constraint-draft-validator.ts:42-55` (chọn action theo kind). Logging tạm thời vì chưa có logger convention.
- **Validate**: Chạy test từ Task 1 → pass. Chạy `npm test` (toàn bộ) → không regress các test khác.

### Task 3: Fix `case 'custom_dsl'` thiếu expr/explain
- **Action**: Tại `constraint-humanizer.ts:267-277`, đổi branch `else` (thiếu `params.expr` và `params.explain`) sang cùng pattern Task 2: gọi `buildClarificationQuestions(spec.original)`, trả prompt câu hỏi đầu tiên.
- **Validate**: Test mới `test('humanizeConstraintSpec custom_dsl without expr falls back to clarification')` → pass.

### Task 4: Audit 23 kind còn thiếu trong humanizer switch
- **Action**: Script `node -e "..."` (chạy 1 lần, không commit) để diff `CONSTRAINT_REGISTRY` vs switch cases. Với mỗi kind thiếu, thêm case vào humanizer dùng **generic template**:
  ```ts
  case 'class_block_day':
    return `${prefix}Lớp ${paramStr(p.class)} không học vào ${dayInText(p.day)}${soft(spec)}.`;
  // ... tương tự cho 22 case còn lại
  ```
  Ưu tiên copy pattern từ `case 'class_block_period':` (line 226) cho `class_block_day`; từ `case 'teacher_block_day':` (line 107) cho `teacher_*`; v.v.
- **Validate**: Test `test('all registered kinds have humanizer cases')` — iterate `CONSTRAINT_KINDS`, gọi `humanizeConstraintSpec({...minimal spec})`, assert KHÔNG rơi vào default (regex `/chưa có mô tả tiếng Việt chi tiết/` không match). Test này sẽ fail trước khi thêm cases, pass sau khi thêm xong.

### Task 5: Update `ConstraintDraftCard.tsx` để render clarification options
- **Action**: Thêm block render mới sau phần "Hiểu là" (line ~146) và trước issues list:
  ```tsx
  {draft?.clarificationQuestions?.length ? (
    <div data-testid="clarification-questions" className="mt-2 space-y-2">
      {draft.clarificationQuestions.map((q) => (
        <div key={q.id} className="rounded border border-sky-500/30 bg-sky-500/[0.06] p-2 text-xs">
          <p className="font-medium text-sky-200">{q.prompt}</p>
          <ul className="mt-1 space-y-1">
            {q.options.map((opt, i) => (
              <li key={i}>
                <button type="button" onClick={() => onClarificationAnswer?.(q.id, i)}
                  className="rounded border border-white/10 px-2 py-1 hover:bg-white/5">
                  {opt}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  ) : null}
  ```
  Thêm prop `onClarificationAnswer?: (questionId: string, optionIndex: number) => void` vào `ConstraintDraftCardProps`.
- **Mirror**: Render pattern với `data-testid` (xem `ConstraintDraftCard.tsx:199` `data-testid="ai-analyze-button"`).
- **Validate**: Component test hoặc manual: nhập "Không lớp nào học quá 3 tiết 1 môn trong 1 buổi" → thấy câu hỏi + options, click option → callback fires (có thể log).

### Task 6: Bổ sung pattern cho "3 tiết 1 môn 1 buổi" trong clarification detector
- **Action**: Trong `constraint-clarification.ts:8-15`, thêm detection:
  ```ts
  const mentionsPeriodCount = /(\d+)\s*tiết/u.test(raw);
  const mentionsSession = /(buổi|buoi|sáng|sang|chiều|chieu)/u.test(raw);
  const mentionsLimit = /(không|khong|tối đa|toi da|quá|qua|nhiều nhất|nhieu nhat)/u.test(raw);
  if (mentionsLimit && mentionsPeriodCount && mentionsSession && !questions.length) {
    questions.push({
      id: 'session_subject_period_limit',
      prompt: 'Bạn muốn giới hạn theo buổi (sáng/chiều) hay theo cả ngày?',
      options: [
        'Theo buổi (sáng/chiều)',
        'Theo cả ngày',
        'Cả hai — buổi là tối đa, ngày là tối đa',
      ],
    });
  }
  ```
- **Mirror**: Pattern `mentionsHeavy && mentionsSession` ở `constraint-clarification.ts:17-27` (cùng style regex detection + push question).
- **Validate**: Test mới trong `constraint-humanizer.test.ts`: `test('"Không lớp nào học quá 3 tiết 1 môn trong 1 buổi" raises session_subject_period_limit question')` → pass.

### Task 7: Build-time guard
- **Action**: Tạo `scripts/check-user-facing-strings.sh`:
  ```bash
  #!/usr/bin/env bash
  set -e
  PATTERN="chưa có mô tả tiếng Việt chi tiết"
  HITS=$(grep -rln "$PATTERN" src --include="*.ts" --include="*.tsx" \
    | grep -v "constraint-humanizer.ts" || true)
  if [ -n "$HITS" ]; then
    echo "❌ Debug string '$PATTERN' leaked outside constraint-humanizer.ts:"
    echo "$HITS"
    exit 1
  fi
  echo "✅ No debug-string leak detected."
  ```
  Thêm vào `package.json` scripts: `"check:strings": "bash scripts/check-user-facing-strings.sh"`.
- **Validate**: Chạy `npm run check:strings` → pass. Nếu cố tình thêm string vào file khác (vd `ConstraintDraftCard.tsx`) → fail.

### Task 8: Manual QA
- **Action**: Chạy dev server, nhập "Không lớp nào học quá 3 tiết 1 môn trong 1 buổi", xác nhận:
  1. UI hiện câu hỏi (KHÔNG hiện debug string)
  2. Click vào option → callback fires (hoặc ít nhất button có hover state)
  3. Không có regression trên 9 câu constraint khác (sanity test từ `constraint-review.test.ts`)
- **Validate**: Visual + log inspection.

## Validation

```bash
# Unit tests
npx tsx --test src/features/timetable/ai/constraint-humanizer.test.ts

# Regression: existing review test không bị break
npx tsx --test src/features/timetable/ai/constraint-review.test.ts

# Toàn bộ test suite
npm test

# Build-time guard
npm run check:strings

# Lint
npm run lint

# Build (đảm bảo type check pass)
npm run build

# Manual: dev server
npm run dev  # rồi nhập tay câu test
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Đổi `default` case từ string → string có thể break callers expecting exact debug string (test snapshots, log greps) | Low | Tìm tất cả callers đã check exact match (đã làm ở grep trên), không có ngoài test. Test snapshot sẽ catch nếu có. |
| 23 missing kinds cần humanizer case, một số kind có semantics phức tạp (vd `if_then`, `pair_not_same_slot`) → template generic có thể không đủ rõ nghĩa | Medium | Copy pattern từ `case` tương tự đã có; với kind phức tạp (vd `subject_group`), để default nếu không tự tin — sẽ raise câu hỏi clarify. Document trong code. |
| UI `onClarificationAnswer` callback chưa có handler ở `useConstraintReview.ts` → button click không làm gì | High | **Đã lên kế hoạch** trong Task 5: prop là **optional**, default noop. Phase sau (Milestone 1.5) sẽ wire callback. MVP chỉ cần hiển thị + console log để verify. |
| LLM path có bug khác (per user §3) chưa được surface | Medium | Plan này fix surface bug; root cause LLM nếu có sẽ track ở Milestone 4 (PRD). Không chặn MVP. |
| Test framework `node:test` không có `describe` nesting → test file sẽ flat, hơi khó đọc | Low | OK — codebase hiện tại cũng flat (xem `constraint-review.test.ts`). Theo convention. |

## Acceptance

- [ ] Task 1 test fail trước khi fix; pass sau fix
- [ ] Task 3 test: custom_dsl không có expr không render debug string
- [ ] Task 4 test: tất cả 80+ kind trong `CONSTRAINT_KINDS` đều có humanizer case (không rơi vào default)
- [ ] Task 5: UI hiển thị clarification options cho input "3 tiết 1 môn 1 buổi"
- [ ] Task 6: `buildClarificationQuestions` detect được pattern "buổi + tiết + số"
- [ ] Task 7: `npm run check:strings` pass; fail nếu debug string xuất hiện ở file khác
- [ ] Task 8: Manual QA pass — không còn debug string trong UI
- [ ] All existing tests pass (no regression)
- [ ] `npm run lint` + `npm run build` pass
- [ ] Patterns mirrored từ `constraint-review.test.ts` / `constraint-draft-validator.ts` (không tự invent convention)

## Recommended Pre-Approval Steps

Per `AGENTS.md`, **BEFORE approving this plan**, chạy:

```bash
# Impact analysis cho các symbol chính
npx gitnexus impact --target humanizeConstraintSpec --direction upstream
npx gitnexus impact --target humanizeDraft --direction upstream
npx gitnexus impact --target buildClarificationQuestions --direction downstream

# (Tuỳ chọn) refresh index nếu đã lâu
npx gitnexus analyze
```

Nếu `gitnexus_impact` trả về **HIGH** hoặc **CRITICAL** risk, **DỪNG** và report blast radius cho user trước khi proceed. Đặc biệt chú ý:
- `humanizeConstraintSpec` (17 callers) — đổi `default` branch là LOW risk, nhưng đổi **signature** là HIGH risk
- `ConstraintDraftCard` props thêm mới (optional) — LOW risk

**Plan này KHÔNG đổi signature** của `humanizeConstraintSpec` (vẫn trả `string`); chỉ đổi nội dung string. Blast radius: thấp. Có thể approve và proceed.

## Out of Plan Scope (deferred to later milestones)

- **M2** (rule parser audit): Sau khi M1 xong, còn phải verify rule parser trong `translator.ts` map "3 tiết 1 môn 1 buổi" sang kind hợp lệ (không chỉ rely vào clarification fallback).
- **M3** (build-time guard mở rộng): ESLint plugin hoặc AST check thay vì grep đơn giản.
- **M4** (LLM health-check): Log các case humanizer rơi vào default trong production 1 tuần, tổng hợp danh sách kind thiếu.

---
*Status: PLAN — implementation pending user approval.*
