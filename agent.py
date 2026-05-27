"""
agent.py - OR-Tools Agent with Native Tool Calling

This agent can read, edit, and run files using real tool calling (similar to how I operate).
Its goal is to iteratively build and improve a working OR-Tools CP-SAT timetable solver
inside `runner.py` until it finds a valid solution.

No LangChain / LangGraph used — pure native function calling.
"""

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from openai import OpenAI

# Try to load sandbox executor (optional but recommended)
try:
    from sandbox.executor import run_in_sandbox
    SANDBOX_AVAILABLE = True
except ImportError:
    SANDBOX_AVAILABLE = False
    run_in_sandbox = None

# ========================== SANDBOX CONFIG ==========================
# BẬT/TẮT sandbox cho code do AI sinh ra.
# Khuyến nghị: BẬT (True) khi chạy trên VPS/production.
USE_SANDBOX = True

# Chỉ những file này mới chạy trong sandbox (untrusted code)
SANDBOXED_FILES = {"runner.py", "runner_generated.py", "solver.py"}


# ========================== CONFIG ==========================
load_dotenv()

API_KEY = os.getenv("API_KEY")
if not API_KEY:
    raise RuntimeError("API_KEY environment variable is required (set OpenRouter API key or compatible LLM provider key)")
API_BASE = os.getenv("API_BASE", "https://openrouter.ai/api/v1")
MODEL = os.getenv("MODEL", "deepseek/deepseek-v4-flash")

RUNNER_PATH = Path("runner.py")
MAX_ITERATIONS = 5   # Giảm mạnh để tăng tốc (Solution 1: ít lần gọi LLM hơn)
TIMEOUT_SECONDS = 60


client = OpenAI(
    api_key=API_KEY,
    base_url=API_BASE,
    default_headers={
        "HTTP-Referer": "https://github.com/timetable-or-tools-agent",
        "X-Title": "OR-Tools Timetable Agent",
    }
)


# ========================== TOOL DEFINITIONS ==========================

def read_file(path: str) -> str:
    """Read and return the content of a file."""
    try:
        p = Path(path)
        if not p.exists():
            return f"ERROR: File '{path}' does not exist."
        content = p.read_text(encoding="utf-8")
        return content
    except Exception as e:
        return f"ERROR reading file: {str(e)}"


def write_file(path: str, content: str) -> str:
    """
    Write (overwrite) the entire content of a file.
    This is the main way the agent edits code.
    """
    try:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return f"Successfully wrote {len(content)} characters to '{path}'."
    except Exception as e:
        return f"ERROR writing file: {str(e)}"


def run_file(path: str, force_sandbox: bool = None) -> dict[str, Any]:
    """
    Execute a Python file and return structured result.

    When USE_SANDBOX=True and the file is in SANDBOXED_FILES,
    the execution happens inside a hardened Docker container
    (no network, limited filesystem, resource limits).

    This is the critical security boundary for AI-generated code.
    """
    path_obj = Path(path)
    filename = path_obj.name

    # Decide whether to use sandbox
    use_sandbox = force_sandbox
    if use_sandbox is None:
        use_sandbox = USE_SANDBOX and SANDBOX_AVAILABLE and (filename in SANDBOXED_FILES)

    if use_sandbox and SANDBOX_AVAILABLE:
        print(f"[Security] Running {filename} inside Docker sandbox...")
        return run_in_sandbox(
            file_path=str(path_obj),
            timeout=TIMEOUT_SECONDS,
            memory_limit="4g",
            cpu_limit=2,
            workspace_dir=str(path_obj.parent),   # only this dir is visible inside container
        )

    # ===================== FALLBACK: Run directly on host (DANGEROUS) =====================
    if use_sandbox and not SANDBOX_AVAILABLE:
        print("[WARNING] Sandbox requested but not available. Falling back to host execution (INSECURE).")

    try:
        result = subprocess.run(
            [sys.executable, str(path)],
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS
        )

        output = (result.stdout or "") + (result.stderr or "")
        success = "SOLUTION FOUND" in output.upper() or "✅" in output

        return {
            "success": success,
            "return_code": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "combined_output": output[:4000],
            "message": "Execution completed (host - INSECURE)."
        }
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "return_code": -1,
            "stdout": "",
            "stderr": "Execution timed out.",
            "combined_output": "ERROR: Execution timed out after 60 seconds.",
            "message": "Timeout"
        }
    except Exception as e:
        return {
            "success": False,
            "return_code": -1,
            "stdout": "",
            "stderr": str(e),
            "combined_output": f"ERROR: {str(e)}",
            "message": "Execution failed."
        }


def read_dataset() -> str:
    """Read the timetable dataset from datasets.txt"""
    try:
        return Path("datasets.txt").read_text(encoding="utf-8")
    except Exception as e:
        return f"ERROR: Could not read datasets.txt - {str(e)}"


# Tool schemas for the LLM (OpenAI function calling format)
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the full content of a file. Use this to inspect the current state of runner.py.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The path to the file to read (e.g. 'runner.py')"
                    }
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write or overwrite a file with new content. This is the main tool for editing and building the OR-Tools solver.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The path to the file to write (usually 'runner.py')"
                    },
                    "content": {
                        "type": "string",
                        "description": "The complete new content of the file."
                    }
                },
                "required": ["path", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "run_file",
            "description": "Execute a Python file. IMPORTANT: Files like runner.py run inside a secure Docker sandbox (no network, limited FS). Other files (reviewer_agent.py, etc.) run on host because they need LLM API access.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The Python file to run (runner.py will be sandboxed automatically)"
                    }
                },
                "required": ["path"]
            }
        }
    }
]


# Map tool names to actual Python functions
TOOL_FUNCTIONS = {
    "read_file": read_file,
    "write_file": write_file,
    "run_file": run_file,
}


# ========================== SYSTEM PROMPT ==========================

SYSTEM_PROMPT = """Bạn là một kỹ sư OR-Tools CP-SAT chuyên nghiệp.

Mục tiêu chính: Xây dựng một solver OR-Tools đúng và chất lượng trong file `runner.py`.

Yêu cầu quan trọng:
- Phải tuân thủ 100% các ràng buộc cứng (giáo viên không trùng, lớp không trùng, đúng số tiết, unavailable).
- Cố gắng viết code tốt ngay từ lần đầu để giảm số lần gọi LLM.

Bạn có 3 công cụ: read_file, write_file, run_file.

Quy tắc bắt buộc:
1. BẮT BUỘC phải bắt đầu bằng read_file("datasets.txt").
2. Khi tìm được solution (in "SOLUTION FOUND"), không được dừng.
3. Phải làm cho runner.py xuất dữ liệu kết quả ra file `results.txt` theo định dạng JSON đơn giản như sau:
   {
     "classes": ["6A", "6B"],
     "days": ["Thứ 2", "Thứ 3", ...],
     "periods": ["1", "2", "3", "4"],
     "schedule": [
       {"class": "6A", "day": "Thứ 2", "period": "1", "subject": "Toán", "teacher": "Sơn"},
       ...
     ]
   }
4. Sau đó gọi `output_formatter.py` để tạo `Result.csv`.

5. Sau khi có Result.csv, bạn PHẢI gọi `reviewer_agent.py` để kiểm tra.
   - Nếu Reviewer trả về "APPROVED" → bạn có thể kết thúc.
   - Nếu Reviewer đưa feedback (phát hiện vi phạm hard constraints) → bạn phải sửa `runner.py` và thử lại.

Bạn KHÔNG cần tạo result.md nữa.
"""


# ========================== AGENT LOOP ==========================

def execute_tool(tool_name: str, arguments: dict) -> Any:
    """Execute a tool and return its result."""
    if tool_name not in TOOL_FUNCTIONS:
        return f"ERROR: Unknown tool '{tool_name}'"

    func = TOOL_FUNCTIONS[tool_name]
    try:
        return func(**arguments)
    except Exception as e:
        return f"ERROR executing tool {tool_name}: {str(e)}"


def run_agent():
    print("=" * 70)
    print("OR-TOOLS AUTONOMOUS AGENT (Native Tool Calling) - SANDBOXED VERSION")
    print(f"Target file : {RUNNER_PATH}")
    print(f"Dataset file: datasets.txt  ← Agent must read this via tool")
    print(f"Final output: Result.csv (via results.txt + output_formatter.py)")
    print(f"Model       : {MODEL}")
    print(f"Max iterations : {MAX_ITERATIONS} (Fast mode)")
    print(f"Security    : Sandbox={'ENABLED' if USE_SANDBOX and SANDBOX_AVAILABLE else 'DISABLED (DANGEROUS)'}")
    print("=" * 70)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": "Bắt đầu. Mục tiêu là viết solver tốt ngay từ lần đầu. Khi có solution, phải xuất dữ liệu ra results.txt theo cấu trúc JSON đơn giản, sau đó gọi output_formatter.py để tạo Result.csv. Không cần tạo result.md nữa."}
    ]

    solution_found = False
    result_csv_created = False

    for iteration in range(1, MAX_ITERATIONS + 1):
        print(f"\n{'='*25} ITERATION {iteration} {'='*25}")

        try:
            response = client.chat.completions.create(
                model=MODEL,
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
                temperature=0.2,
                max_tokens=8000,
            )
        except Exception as e:
            print(f"[ERROR] Failed to call LLM: {e}")
            break

        message = response.choices[0].message
        messages.append(message.model_dump())

        if message.tool_calls:
            for tool_call in message.tool_calls:
                tool_name = tool_call.function.name
                try:
                    arguments = json.loads(tool_call.function.arguments)
                except json.JSONDecodeError:
                    arguments = {}

                print(f"[Agent] Calling tool: {tool_name}({arguments})")

                tool_result = execute_tool(tool_name, arguments)

                if tool_name == "run_file" and isinstance(tool_result, dict):
                    print(f"[Agent] Run result: success={tool_result.get('success')}")
                    if tool_result.get("success"):
                        solution_found = True
                        print("[Agent] Solution detected. Agent should make runner.py write results.txt then call output_formatter.py")

                if tool_name == "write_file":
                    path = arguments.get("path", "")
                    if "Result.csv" in path or "result.csv" in path.lower():
                        result_csv_created = True
                        print("[Agent] Result.csv was created. Now calling Reviewer Agent...")

                        # Gọi Reviewer Agent để kiểm tra
                        reviewer_result = execute_tool("run_file", {"path": "reviewer_agent.py"})
                        print(f"[Agent] Reviewer result: {reviewer_result}")

                        # Nếu reviewer reject, đưa feedback vào messages để agent sửa
                        if isinstance(reviewer_result, dict) and not reviewer_result.get("success", True):
                            feedback = str(reviewer_result)
                            print("[Agent] Reviewer REJECTED. Will try to fix based on feedback.")
                            messages.append({
                                "role": "user",
                                "content": f"Reviewer đã phát hiện vi phạm hard constraints. Feedback: {feedback}\n\nHãy sửa runner.py và thử lại."
                            })
                        else:
                            print("[Agent] Reviewer APPROVED or finished.")

                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": tool_name,
                    "content": json.dumps(tool_result, ensure_ascii=False) if isinstance(tool_result, (dict, list)) else str(tool_result)
                })

        else:
            if message.content:
                print(f"[Agent] Message: {message.content[:400]}...")

        if solution_found and result_csv_created:
            print("\n" + "=" * 70)
            print("🎉 Hoàn thành! Solution found + Result.csv đã được tạo.")
            print("=" * 70)
            return True

    print(f"\n❌ Finished after {MAX_ITERATIONS} iterations.")
    print(f"   Solution found: {solution_found}")
    print(f"   Result.csv created: {result_csv_created}")
    return False


if __name__ == "__main__":
    run_agent()
