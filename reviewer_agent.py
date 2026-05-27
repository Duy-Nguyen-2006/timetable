"""
reviewer_agent.py - Agent 2 (Reviewer / Validator)

Nhiệm vụ:
- Đọc original input từ datasets.txt
- Đọc kết quả từ results.txt (hoặc Result.csv)
- Kiểm tra xem kết quả có vi phạm các hard constraints trong dataset hay không
- Nếu có vi phạm → đưa feedback rõ ràng và yêu cầu Agent 1 viết lại
- Nếu không vi phạm → APPROVED

Mục tiêu: Tăng độ tin cậy lên gần 100% bằng cách thêm lớp review độc lập.
"""

import json
import os
from pathlib import Path
from typing import Any, Dict, List

from dotenv import load_dotenv
from openai import OpenAI


# ==================== CONFIG ====================
load_dotenv()

API_KEY = os.getenv("API_KEY")
API_BASE = os.getenv("API_BASE", "https://openrouter.ai/api/v1")
MODEL = os.getenv("MODEL", "deepseek/deepseek-v4-flash")

MAX_REVIEW_ITERATIONS = 5


client = OpenAI(
    api_key=API_KEY,
    base_url=API_BASE,
    default_headers={
        "HTTP-Referer": "https://github.com/timetable-agent",
        "X-Title": "Reviewer Agent (Agent 2)",
    }
)


# ==================== TOOLS ====================

def read_file(path: str) -> str:
    try:
        return Path(path).read_text(encoding="utf-8")
    except Exception as e:
        return f"ERROR: {str(e)}"


def read_json_file(path: str) -> Dict:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        return {"error": str(e)}


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Đọc nội dung file datasets.txt hoặc các file text khác",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_json_file",
            "description": "Đọc file results.txt (dạng JSON) chứa kết quả thời khóa biểu",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"]
            }
        }
    }
]

TOOL_FUNCTIONS = {
    "read_file": read_file,
    "read_json_file": read_json_file,
}


# ==================== SYSTEM PROMPT ====================

SYSTEM_PROMPT = """Bạn là Agent Reviewer (Agent 2) - chuyên kiểm tra tính đúng đắn của thời khóa biểu.

Nhiệm vụ CHÍNH của bạn:
Chỉ kiểm tra các **Hard Constraints** và **Basic Constraints** từ datasets.txt với kết quả trong results.txt.

Bạn KHÔNG cần quan tâm đến Soft Constraints (ràng buộc mềm).

### Những gì BẮT BUỘC phải kiểm tra:
1. **Giáo viên không dạy 2 lớp cùng 1 thời điểm**
2. **Lớp không học 2 môn cùng 1 thời điểm**
3. **Đúng số tiết theo yêu cầu** (ví dụ: Sơn-Toán-6A-4 → phải đúng 4 tiết)
4. **Unavailability của giáo viên** (ví dụ: "Sơn không dạy thứ 2", "Hương không dạy tiết 1")
5. Các hard constraints khác được nêu rõ trong datasets.txt

### Quy tắc quan trọng:
- Nếu **TẤT CẢ** hard constraints và basic constraints đều được thỏa mãn → Trả lời đúng **"APPROVED"**.
- Nếu có **BẤT KỲ** hard constraint nào bị vi phạm → Phải REJECT và đưa feedback rõ ràng.
- **Soft Constraints**: 
  - Bạn cũng phải trích xuất các soft constraints từ datasets.txt.
  - Kiểm tra mức độ thỏa mãn của chúng trong results.txt.
  - Nếu có soft constraints chưa đạt được (hoặc chưa đạt mức tối đa), hãy **liệt kê rõ ràng** những soft constraints nào chưa đạt, ví dụ:
    - "Soft constraint 'Toán nên xếp tiết 1-2' chỉ đạt 5/8 tiết"
    - "Soft constraint 'Văn nên liên tiếp 2 tiết' chỉ có 2 cặp thay vì tối đa có thể"
  - Sau đó in thông báo ra màn hình.
  - **VẪN APPROVED** (không được reject vì lý do soft constraints).

### Quy trình làm việc:
1. Đọc datasets.txt → Trích xuất cả hard constraints và soft constraints.
2. Đọc results.txt → Lấy lịch thời khóa biểu.
3. Kiểm tra tất cả hard constraints một cách cẩn thận.
4. Kiểm tra soft constraints và liệt kê cụ thể những cái nào chưa đạt (nếu có).
5. Kết luận cuối cùng chỉ là APPROVED hoặc REJECT (dựa trên hard constraints). Nếu có soft constraints chưa đạt thì in ra màn hình nhưng vẫn APPROVED.

### Khi REJECT:
- Phải trích dẫn rõ ràng:
  - Nguyên văn hard constraint từ datasets.txt
  - Phần bị vi phạm trong results.txt
- Feedback phải cụ thể để Agent 1 có thể sửa.

Bạn chỉ được APPROVED khi thực sự không có vi phạm hard constraint nào. Ngược lại, hãy nghiêm khắc.
"""


# ==================== AGENT LOOP ====================

def execute_tool(tool_name: str, arguments: dict) -> Any:
    if tool_name not in TOOL_FUNCTIONS:
        return f"ERROR: Unknown tool '{tool_name}'"
    try:
        return TOOL_FUNCTIONS[tool_name](**arguments)
    except Exception as e:
        return f"ERROR: {str(e)}"


def run_reviewer_agent(feedback_to_agent1: str = "") -> Dict:
    """
    Chạy Agent Reviewer.
    Trả về dict chứa:
    - approved: bool
    - feedback: str (nếu không approved)
    """
    print("=" * 70)
    print("REVIEWER AGENT (Agent 2) - Kiểm tra vi phạm Hard Constraints")
    print("=" * 70)

    initial_message = """Hãy bắt đầu review.

Yêu cầu:
- Chỉ dựa vào Hard Constraints để quyết định APPROVED hay REJECT.
- Nếu tất cả hard constraints đều thỏa mãn → trả lời "APPROVED".
- Về Soft Constraints: 
  - Trích xuất chúng từ datasets.txt.
  - Kiểm tra mức độ đạt được trong results.txt.
  - Nếu có soft constraints chưa đạt (hoặc chưa tối ưu), hãy **liệt kê rõ ràng** chúng ra màn hình, ví dụ:
    - "Soft constraint chưa đạt: Toán nên xếp tiết 1-2 → chỉ đạt 6/8 tiết"
    - "Soft constraint chưa đạt: Văn nên liên tiếp 2 tiết → chỉ có 3 cặp thay vì tối đa"
  - Sau đó vẫn kết luận "APPROVED".

Không được reject chỉ vì soft constraints chưa tốt.
"""

    if feedback_to_agent1:
        initial_message += f"\n\nLưu ý: Agent 1 đã nhận feedback trước đó và viết lại. Hãy review cẩn thận hơn lần này.\nFeedback trước: {feedback_to_agent1}"

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": initial_message}
    ]

    for i in range(1, MAX_REVIEW_ITERATIONS + 1):
        print(f"\n--- Reviewer Iteration {i} ---")

        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            temperature=0.1,   # thấp để review chính xác
            max_tokens=4000,
        )

        message = response.choices[0].message
        messages.append(message.model_dump())

        if message.tool_calls:
            for tool_call in message.tool_calls:
                tool_name = tool_call.function.name
                args = json.loads(tool_call.function.arguments or "{}")

                print(f"[Reviewer] Gọi tool: {tool_name}({args})")

                result = execute_tool(tool_name, args)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": tool_name,
                    "content": str(result)
                })
        else:
            content = message.content or ""
            print(f"[Reviewer]: {content[:500]}...")

            if "APPROVED" in content.upper():
                print("\n✅ REVIEWER APPROVED - Không phát hiện vi phạm hard constraints.")
                return {"approved": True, "feedback": ""}

            # Nếu không approved, coi nội dung là feedback
            print("\n❌ REVIEWER REJECTED - Phát hiện vi phạm.")
            return {"approved": False, "feedback": content}

    print("\n⚠️ Reviewer đã hết số lần thử.")
    return {"approved": False, "feedback": "Reviewer không thể kết luận sau nhiều lần kiểm tra."}


if __name__ == "__main__":
    result = run_reviewer_agent()
    print("\n=== KẾT QUẢ REVIEW ===")
    print(result)
