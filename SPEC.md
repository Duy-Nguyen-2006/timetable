Mục tiêu : Desktop App tạo thời khóa biểu có tích hợp AI
Người dùng nhập các thông tin và nhận thời khóa biểu được tạo ra
Yêu cầu : Base constraints và Hard Constraints PHẢI ĐƯỢC tuân thủ, nếu không thể tuân thủ đồng thời, thời khóa biểu sai
Giảm tối thiểu lượng code LLM phải sinh ra để tránh hallucinate
Ràng buộc mềm được xếp theo thứ tự ưu tiên, nếu ràng buộc mềm nào không tạo được, báo về cho người dùng
Người dùng chỉ nhận về kết quả cuối cùng, không cần thấy từng step AI làm gì 
Lưu được tối đa 3 cuộc hội thoại cũ và có cơ chế cache để người dùng có thể tái sử dụng, ví dụ thay đổi minimum trong code.
Ignore toàn bộ constraints liên quan đến phòng học, ví dụ phòng A vào thứ 2 không được sử dụng.
