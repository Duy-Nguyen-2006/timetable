Rõ rồi. Để phân tích chính xác phần "phân tích constraints" (vì sao chưa chuẩn 100% và chưa tận dụng được AI), tôi cần đọc sâu các file lõi của tầng parsing. Để tôi đọc chúng.

Tiếp tục đọc các file lõi: dịch vụ LLM lớn, retriever, disambiguation, semantic direction, và parser IR-first.

Đọc nốt dịch vụ LLM lớn, retriever (engine chấm điểm) và rule parser built-in để hoàn tất bức tranh.

Đọc tiếp phần logic chính của dịch vụ phân tích LLM và cơ chế chấm điểm của retriever.

Đọc nốt phần cuối của dịch vụ phân tích và cơ chế chấm điểm retriever để hoàn thiện đánh giá.

Đọc cơ chế chấm điểm của retriever (Stage 2) — đây là điểm quan trọng để đánh giá độ chính xác.

Đã đọc xong toàn bộ lớp **phân tích/parse ràng buộc**. Dưới đây là đánh giá phê bình tập trung đúng 2 trục bạn quan tâm: **(A) chỗ chưa chính xác 100%** và **(B) chỗ chưa tận dụng được AI**, kèm khuyến nghị hành động.

---

## Tóm tắt nhanh pipeline parse hiện tại

`parse-pipeline.ts` chạy 5 stage cho **mỗi câu**:

1. **Resolver** (code) — `buildResolverHints`: khớp entity (exact-match), trích số/tiết/ngày, suy `inferredScope`, gắn cờ `mentionsBlock/Max/Min/...`
2. **Retriever** (code) — `retrieveTopK`: chấm điểm lexical + bonus hướng ngữ nghĩa, lấy top-5 kind.
3. **Ambiguity gate** (code) — `AMBIGUITY_DELTA=1.2`, `AMBIGUITY_FLOOR=3`.
4. **Slot-fill** (LLM) — prompt nhỏ, LLM chỉ chọn kind trong top-k + điền params.
5. **Back-translation check** (code) — đối chiếu lexical, `gate=0.62`.

Song song có `ir-first-parser` (Tier-1 deterministic) chạy **shadow mode**, và `negative-guard` chống "lật" nghĩa.

Triết lý "LLM chỉ dịch, code đảm bảo đúng" rất hợp lý cho **phía solver** (IR → CP-SAT). **Nhưng ở phía parse, thiết kế đã nghiêng quá đà về regex/heuristic cho đúng bài toán khó nhất là *hiểu ý định ngôn ngữ* — chỗ mà regex yếu nhất và AI mạnh nhất.** Đây là gốc của hầu hết vấn đề dưới đây.

---

## A. Những chỗ CHƯA chính xác 100%

**1. Bug số bị dùng 2 lần (period vừa làm "tiết" vừa làm "số lượng").**

Trong `ir-first-parser.ts`, `minCount = hints.extractedNumber ?? 1`, còn `period = extractPeriod(...)`. Nhưng `extractedNumber = extractFirstNumber(rawText)` lấy **số đầu tiên bất kỳ**. Với câu *"GV Thủy phải có tiết 4"* (chỉ có 1 con số), cả `period` và `extractedNumber` đều = 4 → tạo `atLeast { k: 4, period: 4 }` thay vì `k: 1`. Đây là lỗi đếm thật sự, sai ngữ nghĩa.

**2. `extractFirstNumber` không hiểu số viết chữ.**

*"phải có ít nhất hai tiết 4"* → bỏ qua "hai", bắt "4" làm cả count lẫn period. Tiếng Việt rất hay viết "hai/ba/bốn tiết".

**3. `only` → `allowed_periods` hardcode `Math.max(5, ...periods)`.**

`tryParseOnlyTeacher` giả định tối đa 5 tiết/ngày. Trường 8–10 tiết/ngày: *"chỉ dạy tiết 4"* chỉ cấm tiết 1,2,3,5 → **tiết 6–10 vẫn được dạy** → ràng buộc bị nới lỏng âm thầm. Parser này không nhận `periodCounts` từ `agentInput` nên không thể biết số tiết thật.

**4. Phát hiện hướng ngữ nghĩa hoàn toàn bằng regex, dễ sai phủ định/kết hợp.**

`analyzeSemanticDirection` dựa trên danh sách marker cứng. `BLOCK` đòi *"không + (dạy|học|được|xếp)"*; câu *"không có tiết trống"* (không + "có") → **không nhận ra block**. Câu phủ định kép *"không phải nghỉ tiết 4"* → vẫn match "nghỉ" → ra `block` (sai). Regex không xử lý được phạm vi phủ định.

**5. Giải quyết xung đột hướng bằng trọng số cứng, đáng lẽ phải hỏi.**

Khi vừa `require` vừa `only`, code chọn cái điểm cao hơn; trọng số đều 1.0 → hòa → mặc định chọn `require` với confidence 0.9. Đây là câu thật sự mơ hồ nhưng lại tự quyết thay vì clarify.

**6. Vi phạm "single source of truth" giữa doc và code.**

`disambiguation-table.ts` ghi rõ "được kiểm tra ĐẦU TIÊN trong mọi parser path", nhưng các `tryParse*` trong `ir-first-parser` lại gọi thẳng `analyzeSemanticDirection`, chỉ dùng `findDisambiguationMatch` ở nhánh fallback cuối. Hai nguồn quyết định hướng → drift.

**7. Cờ `mentions*` cũng hai nguồn.**

Comment nói "dùng analyzer dùng chung", nhưng thực tế chỉ `mentionsBlock/Only/Preferred` qua analyzer; `mentionsMax/Min/Consecutive/IfThen` vẫn regex riêng trong `buildResolverHints`. Dễ lệch nhau.

**8. Ngữ nghĩa `subject_required_period` đáng ngờ.**

IR sinh ra: *"với mỗi lớp, mỗi ngày, số tiết môn X ở tiết P ≥ minCount"* (`forall classes` lồng trong `atLeast days`). Đây là cách hiểu rất mạnh và nhiều khả năng sai cho câu *"môn X phải có ở tiết 4"*.

**9. `self-consistency` đòi đồng thuận TUYỆT ĐỐI.**

`voteSlotFillResponses` chỉ chấp nhận khi `winnerCount === responses.length`. Với temp 0.1 + 3 mẫu, chỉ 1 mẫu lệch là **mất winner**. Vừa quá nghiêm vừa tốn 3x token cho lợi ích biên.

**10. `ALLOWED_PARAMS` chỉ whitelist 6 kind.**

`slot-fill-parser.ts` chỉ lọc params cho 6 kind; 77 kind còn lại nhận params **không lọc** → params LLM bịa có thể lọt tới solver. Sanitization không nhất quán.

**11. Confidence bị hardcode 'medium'.**

`constraint-parse-service` gán cứng 'medium' cho kết quả LLM, không suy từ margin điểm retriever / mức đồng thuận / điểm back-translation. Vứt bỏ tín hiệu sẵn có.

**12. Fast-path rule-parser không kiểm chứng entity.**

`inferRuleParseConfidence` trả 'high' cho `teacher_block_day` đơn lẻ mà **không đối chiếu** giáo viên có trong `agentInput` hay không. *"Cô Lan nghỉ thứ 2"* khi Lan không tồn tại → vẫn high → map vào giáo viên ma, bỏ qua LLM.

**13. Mất ràng buộc cứng âm thầm khi LLM lỗi.**

`fallbackBuiltInSpecs` lọc bỏ `custom_dsl`. Một ràng buộc **hard** mà rule parser chỉ hiểu thành `custom_dsl` sẽ bị **drop hẳn** thay vì đẩy lên clarification → mất ràng buộc bắt buộc = rủi ro đúng đắn nghiêm trọng.

**14. Bóc "ví dụ minh hoạ" quá hẹp.**

Chỉ match *"ví dụ / chẳng hạn / kiểu như / như là"*; bỏ sót "vd", "vd:", ngoặc đơn *"(như tiết 4,5)"*. Số trong phần minh hoạ còn sót lại làm nhiễu `extractFirstNumber`.

---

## B. Những chỗ CHƯA tận dụng được sức mạnh của AI

**1. ⚠️ "Embedding" hiện tại là GIẢ — đây là vấn đề lớn nhất.**

`computeTextEmbedding` chỉ **hash token vào 384 bucket** rồi chuẩn hoá. `cosineSimilarity` trên vector đó = bag-of-words có va chạm hash, **không có ngữ nghĩa**. Hơn nữa `CATALOG` embeddings = `null` ("lexical-only mode"). Nghĩa là toàn bộ "semantic retrieval" thực chất chỉ là **khớp từ khoá**. Embedding thật sẽ xử lý được diễn đạt khác, từ đồng nghĩa, sai chính tả — toàn bộ năng lực này đang bị bỏ phí.

**2. Quyết định hướng ngữ nghĩa — phần dễ sai nhất — lại không nhờ AI.**

`require/block/only/prefer` là trục quyết định độ đúng, nhưng 100% bằng regex marker cứng, và được tính **trước** khi gọi LLM. LLM (đang được gọi sẵn, có nhiều ngữ cảnh nhất) **không được hỏi để xác nhận/ghi đè** hướng. Nên để LLM hoặc một classifier nhỏ quyết hướng + confidence, còn regex/`negative-guard` làm lớp chặn "lật".

**3. LLM không tự kiểm tra ngữ nghĩa mapping của chính nó.**

`back-translation-check` thuần lexical (overlap token + số + đảo phủ định, gate 0.62). Một paraphrase đúng nhưng dùng từ đồng nghĩa ("buổi sáng" vs "tiết 1–5") sẽ **bị từ chối oan**; một parse sai nhưng trùng từ khoá lại **lọt**. Một lời gọi LLM "spec này có đúng nghĩa câu kia không? có/không + lý do" sẽ mạnh hơn nhiều.

**4. Confidence không được hiệu chỉnh từ tín hiệu thật.**

Có sẵn: margin top1–top2 của retriever, tỉ lệ đồng thuận self-consistency, điểm back-translation, logprob LLM. Tất cả bị bỏ để gán cứng 'medium'.

**5. Câu hỏi làm rõ bị hardcode.**

`clarifyAmbiguousIfThen` còn **nhúng cứng ví dụ "Hiếu và Thúy"** trong code production — đây là tàn dư. AI hoàn toàn có thể sinh câu hỏi làm rõ theo ngữ cảnh thật.

**6. Khớp entity chỉ exact-match.**

`matchKnownEntities` không xử lý alias/typo/dấu: *"cô Thuỷ"* vs *"Thủy"* vs *"GV Thủy"*. Sai tên → không suy được scope → retrieval sai. Nên dùng fuzzy/embedding hoặc LLM chuẩn hoá tên.

**7. Negative few-shots phong phú nhưng retrieval không dùng được.**

Catalog có `negativeFewShots` (kiến thức phân biệt rất giá trị) nhưng chỉ được nhồi vào prompt; bước retrieval quyết top-k lại lexical nên không khai thác được tri thức này về mặt ngữ nghĩa.

**8. Self-consistency tốn token mà ít giá trị.**

3 mẫu cùng prompt ở temp 0.1 gần như giống nhau; yêu cầu đồng thuận tuyệt đối → hiếm khi đổi kết quả nhưng tốn gấp 3. Đáng lẽ: 1 parse + 1 verify, hoặc ensemble prompt đa dạng.

---

## C. Khuyến nghị ưu tiên

### Quick wins (sửa độ chính xác, ít rủi ro)

- **Tách "số lượng" khỏi "số tiết"**: count chỉ lấy khi có marker (*ít nhất/tối đa/N tiết*), tránh dùng period làm `k`. (Sửa lỗi #A1, #A2)
- **Truyền `periodCounts` vào ir-first** để `only` cấm đúng dải tiết thật. (#A3)
- **Mở rộng `ALLOWED_PARAMS` ra toàn bộ kind** qua schema tập trung trong `constraint-registry` thay vì whitelist 6 kind. (#A10)
- **Không drop `custom_dsl` hard** khi fallback — đẩy lên `needs_clarification`. (#A13)
- **Nới self-consistency về đa số (2/3)**. (#A9)
- **Bỏ chuỗi "Hiếu/Thúy" hardcode**, sinh động. (#B5)
- **Hỗ trợ số viết chữ + mở rộng marker minh hoạ**. (#A2, #A14)
- **Hợp nhất `mentions*` về một analyzer duy nhất**. (#A7)
- **Đối chiếu entity với `agentInput` trước khi gán 'high'**. (#A12)

### Structural (tận dụng AI đúng chỗ)

- **Thay embedding giả bằng embedding thật** (script offline `compute-embeddings.ts` đã có sườn) → retrieval ngữ nghĩa thật. Đây là đòn bẩy lớn nhất.
- **Thêm bước LLM "semantic verify"** (entailment có/không hoặc paraphrase-back) thay/bổ sung cho back-translation lexical.
- **Để LLM/classifier quyết hướng + confidence**, regex làm prior và `negative-guard` làm lớp chặn — chứ không để regex làm "toà án tối cao".
- **Hiệu chỉnh confidence** từ margin retriever + đồng thuận + điểm verify.
- **Chuẩn hoá entity bằng fuzzy/LLM** (dấu, alias, typo).

---

Điểm mấu chốt: kiến trúc deterministic rất đúng cho **đảm bảo solver enforce == verify**, nhưng đã bị áp nhầm sang **bài toán hiểu ngôn ngữ** — nơi cần embedding/LLM thật. Hiện tại AI chỉ đóng vai "điền chỗ trống", còn mọi quyết định ngữ nghĩa khó đều giao cho regex.

Bạn muốn tôi **gom toàn bộ phần này thành một trang Notion** dạng spec (bug catalog + DoD + đề xuất sprint) theo đúng format bạn hay dùng không?
