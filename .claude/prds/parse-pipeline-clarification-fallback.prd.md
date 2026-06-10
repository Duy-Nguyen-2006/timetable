# Parse Pipeline — Clarification Fallback for Unrecognized Constraints

## Problem
Khi người dùng nhập ràng buộc tiếng Việt tự nhiên mà parse pipeline tạo ra một `ConstraintSpec` có `kind` không nằm trong danh sách được `humanizeConstraintSpec` xử lý (hoặc không tồn tại trong `CONSTRAINT_KINDS` registry), UI hiện render ra **một message kiểu debug thô**:
> `Ràng buộc «Không lớp nào học quá 3 tiết 1 môn trong 1 buổi» — chưa có mô tả tiếng Việt chi tiết; dùng «Sửa cách hiểu» hoặc «Chọn mẫu».`

Message này **trộn domain text với tên nhãn UI nội bộ** («Sửa cách hiểu», «Chọn mẫu»), dùng `«»` để trích dẫn — trông giống log kỹ thuật chứ không phải phản hồi cho người dùng phổ thông. Người dùng cuối (nhân viên văn phòng nhà trường, giáo viên chủ nhiệm, hiệu phó) **không hiểu phải làm gì tiếp theo**, và không nhận được câu hỏi làm rõ nào để trả lời. Đây là regression xuất hiện **sau khi implement các section 12–16 của FIX.md** (parse pipeline hardening), và có khả năng còn bug khác trong LLM path.

## Evidence
- **Repro 100%** bởi user QA lead: gõ đúng input `Không lớp nào học quá 3 tiết 1 môn trong 1 buổi` → UI render debug string trên.
- **Source code định vị được**:
  - `src/features/timetable/ai/constraint-humanizer.ts:278-279` — `default` case của `switch (spec.kind)` trả về đoạn text vi phạm.
  - `src/features/timetable/ai/constraint-humanizer.ts:267-277` — `case 'custom_dsl':` cũng dump raw text khi thiếu `params.expr`/`params.explain`, cùng pattern.
  - `src/features/timetable/ai/constraint-clarification.ts:4-82` — `buildClarificationQuestions()` đã implement sẵn infrastructure hỏi user bằng tiếng Việt tự nhiên, **nhưng không có call site nào trong humanizer / parse pipeline** (orphaned module).
- **Confidence**: cao — bug repro deterministic, source code đã đọc, không cần instrument thêm để xác nhận primary cause.

## Users
- **Primary**: Nhân viên văn phòng nhà trường / giáo viên chủ nhiệm / hiệu phó — nhập ràng buộc TKB bằng tiếng Việt tự nhiên, không có background kỹ thuật, kỳ vọng chat-style interaction.
- **Not for**:
  - Power user (giáo viên IT, admin kỹ thuật) — họ có thể đọc hiểu debug message.
  - Nhà phát triển đang debug pipeline — họ cần log, không cần UX message.

## Hypothesis
We believe **wiring `buildClarificationQuestions()` vào humanizer's `default` branch (và các branch dễ miss khác) — sao cho bất kỳ `ConstraintSpec` nào không render được thành tiếng Việt tự nhiên sẽ trigger một câu hỏi clarify thân thiện, không bao giờ dump debug string** sẽ giải quyết vấn đề.

We'll know we're right when **debug string "chưa có mô tả tiếng Việt chi tiết" không xuất hiện trong bất kỳ DOM node nào reachable từ user input path, và 100% các test Vietnamese constraint đều hoặc (a) parse ra spec hợp lệ, hoặc (b) raise ít nhất một câu hỏi clarify bằng tiếng Việt tự nhiên có multiple-choice options**.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| Debug string "chưa có mô tả tiếng Việt chi tiết" xuất hiện trong UI | 0 lần / 100 input test | E2E test snapshot DOM sau mỗi input |
| Input chưa parse được raise câu hỏi clarify | ≥ 1 câu hỏi / input | Snapshot số `clarificationQuestions` trong store |
| Latency thêm cho clarification path | < 500 ms (p95) | Performance trace qua parse pipeline |
| Manual QA: user thật đọc message hiểu ngay phải làm gì | ≥ 9/10 trường hợp | UAT với 5 users non-tech |

## Scope

**MVP** — đủ để unblock user và ngăn regression tương tự:
- Wire `buildClarificationQuestions()` vào `humanizer.ts` `default` case (và `case 'custom_dsl'` không có `expr`/`explain`).
- Đổi signature: `humanizeConstraintSpec` trả `{ kind: 'rendered' | 'needs_clarification', text?, questions? }` thay vì luôn trả `string`, để UI caller có thể render question UI thay vì text.
- Audit rule parser trong `translator.ts` (`fallbackFromRuleParser`): đảm bảo "không lớp nào học quá N tiết 1 môn trong 1 buổi" maps sang kind hợp lệ (vd: `class_max_heavy_subjects_per_session` với `maxHeavyInSession=N, subjects=__all__` hoặc tương đương).
- Thêm regression test: 10 Vietnamese constraint phổ biến phải KHÔNG render debug string; 1 câu cụ thể phải raise câu hỏi clarify đúng ngữ nghĩa.
- Add `sentry-breadcrumb` (hoặc log marker) khi humanizer rơi vào `default`, để dễ detect thêm bug trong production.
- Grep + ESLint rule (hoặc build-time check) cấm chuỗi "chưa có mô tả tiếng Việt chi tiết" xuất hiện trong code trừ file humanizer.ts (và phải có unit test cover mọi code path rẽ vào đó).

**Out of scope**
- Redesign toàn bộ parse pipeline hoặc chuyển sang kiến trúc khác.
- Thêm constraint kind mới (vd: `class_session_max_periods_per_subject`).
- Migrate sang LLM provider khác.
- Tối ưu LLM prompt / giảm token cost.
- UI redesign của Constraint Review Panel — chỉ consume question data từ store, không đụng layout.
- **Bugs khác có thể có trong LLM path** (per user §3, §4) — sẽ track riêng thành story mới nếu phát hiện, không chặn MVP này.

## Delivery Milestones

| # | Milestone | Outcome (user-visible) | Status | Plan |
|---|---|---|---|---|
| 1 | Humanizer clarification fallback | Mọi input "lạ" nhận được câu hỏi tiếng Việt thay vì debug string; UI render câu hỏi với options | in-progress | [`.claude/plans/parse-pipeline-clarification-fallback.plan.md`](../plans/parse-pipeline-clarification-fallback.plan.md) |
| 2 | Rule parser audit + regression test | 10 constraint phổ biến đều parse đúng; "3 tiết 1 môn 1 buổi" maps sang kind hợp lệ | pending | — |
| 3 | Build-time guard chống debug string leak | Cảnh báo trong CI nếu string xuất hiện ở chỗ không mong muốn | pending | — |
| 4 | LLM path health-check (follow-up) | Audit rộng: log các case humanizer rơi vào `default` trong 1 tuần; tổng hợp danh sách kind thiếu; decide thêm kind mới hay mở rộng humanizer | pending | — |

## Open Questions
- [ ] LLM có thực sự produce spec với kind không có trong `CONSTRAINT_KINDS`, hay rule parser produce spec với `params` malformed? (cần log structured ở `humanizer` `default` để biết)
- [ ] Có nên đổi `default` case thành **fail-closed ở parse stage** (reject spec trước khi vào humanizer) thay vì render fallback? Trade-off?
- [ ] UX của câu hỏi clarify hiện tại (`buildClarificationQuestions`) có thực sự match với input "3 tiết 1 môn 1 buổi" không, hay cần bổ sung pattern mới? (regex detection có thể miss)
- [ ] Có bao nhiêu case khác (ngoài câu user nói) cũng đang bị bug này mà chưa được phát hiện?
- [ ] LLM path có bug khác không? User báo có thể có — cần tổng audit riêng.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Humanizer `default` chỉ là surface bug; root cause là rule parser produce malformed spec | Medium | High | Audit parser song song với wire clarification; nếu root cause là parser thì clarification chỉ là band-aid |
| Số case unrecognized cao hơn dự kiến khi release | Medium | Medium | Bật log ở `default`; theo dõi 1 tuần; tổng hợp thành story batch |
| UI component review panel không có sẵn slot để render `clarificationQuestions` | Medium | Medium | Spike trước: kiểm tra `ConstraintReviewPanel.tsx` có consume field này không |
| User không trả lời câu hỏi clarify mà vẫn muốn confirm draft | Low | Low | Giữ nút "Bỏ qua, dùng spec mặc định" làm escape hatch |
| Bug LLM khác xuất hiện song song | Medium | High | Track riêng làm Milestone 4; không chặn MVP; freeze scope |

---
*Status: DRAFT — requirements only. Implementation planning pending via /plan.*
