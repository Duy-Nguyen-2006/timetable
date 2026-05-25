# Walkthrough

## Mục tiêu cập nhật lần này

- [ ] Soát và thay thế toàn bộ logic agent hiện tại bằng kiến trúc mới `pi.dev + checker`.
- [ ] Ghi lại plan triển khai rõ ràng cho 2 trạng thái kết quả cuối: không tạo được / tạo được với báo cáo constraints.
- [ ] Cắt bỏ prompt/loop agent cũ trong API service và thay bằng scaffold runtime mới.
- [ ] Đồng bộ UI/result contract với pipeline mới.
- [ ] Verify API + lint/build + cập nhật `.orchids/orchids.json` đúng chuẩn.

## Assumptions

- `pi.dev` sẽ là runtime chính cho coder agent ở bước tiếp theo, nhưng trong commit này ta chỉ thay thế kiến trúc codebase hiện tại sang scaffold sẵn sàng cho `pi.dev`.
- Checker agent vẫn là deterministic-first: validator code thật quyết định pass/fail base + hard constraints, còn soft constraints chỉ dùng để báo cáo cho user.
- Logic agent cũ (`Lowprizo coder/checker prompts` và loop hiện tại) sẽ bị xóa bỏ hoàn toàn theo yêu cầu.

## Plan đã chốt

1. **Orchestrator mới**
   - API route vẫn giữ `/api/generate-timetable`.
   - Service mới đổi sang mô hình `pi runtime orchestration` thay cho `runAgenticLoop` cũ.
   - Tạm thời service sẽ trả trạng thái `not_configured`/scaffold nếu chưa có runtime `pi.dev` thật.

2. **Hai actor chính**
   - `Pi Coder Agent`: sinh/chạy/sửa solver code cho đến khi có candidate timetable hoặc kết luận không tạo được.
   - `Checker Agent`: đọc candidate + deterministic validation report.

3. **Quy tắc quyết định cuối cùng**
   - Nếu Pi không tạo ra timetable: trả kết quả `infeasible` với message `Không tạo được thời khóa biểu.`
   - Nếu Pi tạo được timetable và validator pass base + hard:
     - nếu soft constraints đều pass: báo `Tất cả ràng buộc đều thỏa mãn.`
     - nếu còn soft constraints fail: vẫn trả `solved`, nhưng kèm danh sách soft constraints chưa thỏa để báo user.
   - Nếu base/hard fail: checker phản hồi lại để Pi code lại.

4. **Guardrails**
   - Không còn giữ logic attempt loop cũ trong codebase.
   - Để chờ runtime `pi.dev` thật, service mới sẽ là scaffold có contract rõ, event rõ, result rõ.

5. **Verify**
   - smoke test API route
   - `npm run lint`
   - `npm run build`
   - cập nhật `.orchids/orchids.json` về đúng `projectId`, `createdAt`, `startupCommands`, `templateId`
