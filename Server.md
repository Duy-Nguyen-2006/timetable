## Code Runner API — thông tin đầy đủ cho AI khác

### Mục đích

Đây là một Python runtime API nội bộ cho n8n AI Agent.

Nó hoạt động như môi trường chạy code Python bình thường có cài sẵn OR-Tools.

AI có thể gửi Python code như:

print(123)

API sẽ chạy code đó và trả về:

{
  "success": true,
  "stdout": "123\n",
  "stderr": "",
  "result": null,
  "error": null,
  "traceback": null,
  "execution_time_ms": 26
}

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


# 1) URL KẾT NỐI


## URL nội bộ cho n8n

Dùng URL này trong n8n HTTP Request node:

http://code-runner-api:8000/run


## URL public để test ngoài internet

https://timetable.lowprizo.com/run

Health:

http://code-runner-api:8000/health

hoặc:

https://timetable.lowprizo.com/health

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


# 2) AUTHENTICATION

Tất cả request POST /run cần header:

Authorization: Bearer Duy010206@
Content-Type: application/json

Token đang lấy từ env:

CODE_RUNNER_TOKEN

Nếu thiếu hoặc sai token, API trả:

401 Unauthorized

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


# 3) ENDPOINT


## GET /

Dùng kiểm tra service.

Response:

{
  "service": "code-runner-api",
  "status": "ok"
}

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


## GET /health

Healthcheck.

Response:

{
  "ok": true
}

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


## POST /run

Chạy code Python.

URL nội bộ:

http://code-runner-api:8000/run

URL public:

https://timetable.lowprizo.com/run

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


# 4) REQUEST FORMAT


## Tối giản nhất

{
  "code": "print(123)",
  "timeout_seconds": 300
}

Response:

{
  "success": true,
  "stdout": "123\n",
  "stderr": "",
  "result": null,
  "error": null,
  "traceback": null,
  "execution_time_ms": 26
}

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


## Có truyền input

API sẽ ghi input_data thành file:

input.json

trong thư mục chạy code.

Request:

{
  "input_data": {
    "classes": ["10A1"],
    "teachers": [],
    "subjects": [],
    "rooms": [],
    "timeslots": [],
    "constraints": []
  },
  "code": "import json\ninput_data = json.load(open('input.json', encoding='utf-8'))\nprint(input_data)",
  "timeout_seconds": 300
}

Trong code Python, đọc input như sau:

import json

input_data = json.load(open("input.json", encoding="utf-8"))
print(input_data)

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


## Có trả result JSON

Nếu code ghi file:

result.json

API sẽ đọc file đó và trả vào field result.

Request:

{
  "code": "import json\nresult = {'status':'ok', 'schedule': []}\njson.dump(result, open('result.json','w'), ensure_ascii=False)",
  "timeout_seconds": 300
}

Response:

{
  "success": true,
  "stdout": "",
  "stderr": "",
  "result": {
    "status": "ok",
    "schedule": []
  },
  "error": null,
  "traceback": null,
  "execution_time_ms": 30
}

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


## Ghi chú tương thích

API nhận cả 2 field:

{
  "code": "print(123)"
}

hoặc:

{
  "solver_code": "print(123)"
}

Nhưng nên dùng:

{
  "code": "..."
}

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⠙ Reasoning 19s · Ctrl+C to interrupt

# 5) RESPONSE FORMAT


## Thành công

{
  "success": true,
  "stdout": "output printed by code\n",
  "stderr": "",
  "result": null,
  "error": null,
  "traceback": null,
  "execution_time_ms": 123
}

Nếu có result.json:

{
  "success": true,
  "stdout": "",
  "stderr": "",
  "result": {
    "status": "ok"
  },
  "error": null,
  "traceback": null,
  "execution_time_ms": 123
}

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


## Lỗi runtime

Ví dụ code:

print("before")
raise RuntimeError("boom")

Response:

{
  "success": false,
  "stdout": "before\n",
  "stderr": "Traceback (most recent call last):\n  File \"/tmp/code-runner-xxx/main.py\", line 2, in <module>\n    raise RuntimeError(\"boom\")\nRuntimeError: boom\n",
  "result": null,
  "error": "RuntimeError: boom",
  "traceback": "Traceback (most recent call last):\n  File \"/tmp/code-runner-xxx/main.py\", line 2, in <module>\n    raise RuntimeError(\"boom\")\nRuntimeError: boom\n",
  "execution_time_ms": 26
}

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


## Timeout

Response:

{
  "success": false,
  "stdout": "",
  "stderr": "",
  "result": null,
  "error": "timeout",
  "traceback": "Execution timed out after 300 seconds",
  "execution_time_ms": 300000
}

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


# 6) OR-TOOLS EXAMPLE

Request body:

{
  "timeout_seconds": 300,
  "code": "from ortools.sat.python import cp_model\nimport json\n\nmodel = cp_model.CpModel()\nx = model.NewIntVar(0, 10, 'x')\ny = model.NewIntVar(0, 10, 'y')\nmodel.Add(x + y <= 10)\nmodel.
    Maximize(2*x + 3*y)\n\nsolver = cp_model.CpSolver()\nstatus = solver.Solve(model)\n\nresult = {\n    'status': solver.StatusName(status).lower(),\n    'x': solver.Value(x),\n    'y': solver
    .Value(y),\n    'objective': solver.ObjectiveValue()\n}\n\nprint(result)\nwith open('result.json', 'w', encoding='utf-8') as f:\n    json.dump(result, f, ensure_ascii=False)\n"
}

Response mẫu:

{
  "success": true,
  "stdout": "{'status': 'optimal', 'x': 0, 'y': 10, 'objective': 30.0}\n",
  "stderr": "",
  "result": {
    "status": "optimal",
    "x": 0,
    "y": 10,
    "objective": 30.0
  },
  "error": null,
  "traceback": null,
  "execution_time_ms": 1140
}

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


# 7) CÁCH DÙNG TRONG N8N

Dùng HTTP Request node.


## Method

POST


## URL

http://code-runner-api:8000/run


## Headers

Authorization: Bearer Duy010206@
Content-Type: application/json


## Body JSON

Ví dụ đơn giản:

{
  "code": "={{ $json.code }}",
  "input_data": "={{ $json.input_data }}",
  "timeout_seconds": 300
}

Nếu chỉ muốn test nhanh trong n8n:

{
  "code": "print(123)",
  "timeout_seconds": 300
}

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


# 8) FLOW GỢI Ý CHO N8N AI AGENT

1. User gửi dữ liệu thời khóa biểu.
2. AI Agent sinh Python code.
3. n8n gọi:

POST http://code-runner-api:8000/run

1. Nếu response:

{
  "success": true
}

thì lấy:

result

hoặc:

stdout

1. Nếu response:

{
  "success": false
}

thì đưa lại cho AI:

stdout
stderr
error
traceback

để AI tự sửa code rồi gọi lại /run.

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


# 9) GIỚI HẠN HIỆN TẠI

┌──────────────────────┬──────────────────┐
│ Mục                  │ Giá trị          │
├──────────────────────┼──────────────────┤
│ RPS/RPM limit        │ Không có         │
├──────────────────────┼──────────────────┤
│ Max execute count    │ Không có         │
├──────────────────────┼──────────────────┤
│ Session              │ Không có         │
├──────────────────────┼──────────────────┤
│ Upload file endpoint │ Không có         │
├──────────────────────┼──────────────────┤
│ Body size            │ khoảng 2MB       │
├──────────────────────┼──────────────────┤
│ Default timeout      │ 300s             │
├──────────────────────┼──────────────────┤
│ Max timeout          │ 600s             │
├──────────────────────┼──────────────────┤
│ Docker socket        │ Không mount      │
├──────────────────────┼──────────────────┤
│ Container user       │ non-root appuser │
├──────────────────────┼──────────────────┤
│ OR-Tools             │ Có sẵn           │
├──────────────────────┼──────────────────┤
│ Input file           │ input.json       │
├──────────────────────┼──────────────────┤
│ Optional output file │ result.json      │
└──────────────────────┴──────────────────┘

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


# 10) CODE / DEPLOYMENT HIỆN TẠI

Project path:

/root/lowprizo/ops/code-runner


## File chính

/root/lowprizo/ops/code-runner/gateway/app/main.py

Code xử lý /run nằm ở:

/root/lowprizo/ops/code-runner/gateway/app/main.py:93-192


## Requirements

/root/lowprizo/ops/code-runner/gateway/requirements.txt:1-5

fastapi
uvicorn[standard]
pydantic
numpy<2.3
ortools==9.14.6206

numpy<2.3 và ortools==9.14.6206 được pin để tránh lỗi CPU baseline trên VPS.


## Dockerfile

/root/lowprizo/ops/code-runner/gateway/Dockerfile:1-20

• base python:3.11-slim
• install requirements
• tạo user non-root appuser
• expose 8000
• chạy uvicorn app.main:app --host 0.0.0.0 --port 8000


## Docker Compose

/root/lowprizo/ops/code-runner/docker-compose.yml:1-23

Service:

code-runner-api

Network:

n8n_n8n-network

Không publish port ra host, n8n gọi nội bộ bằng service name.

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


# 11) TRẠNG THÁI TEST GẦN NHẤT

Đã test pass:


## print(123)

{
  "success": true,
  "stdout": "123\n",
  "stderr": "",
  "result": null,
  "error": null,
  "traceback": null,
  "execution_time_ms": 26
}


## OR-Tools

{
  "success": true,
  "stdout": "{'status': 'optimal', 'x': 0, 'y': 10, 'objective': 30.0}\n",
  "stderr": "",
  "result": {
    "status": "optimal",
    "x": 0,
    "y": 10,
    "objective": 30.0
  },
  "error": null,
  "traceback": null,
  "execution_time_ms": 1140
}


## Runtime error

{
  "success": false,
  "stdout": "before\n",
  "stderr": "Traceback ... RuntimeError: boom\n",
  "result": null,
  "error": "RuntimeError: boom",
  "traceback": "Traceback ... RuntimeError: boom\n",
  "execution_time_ms": 26
}

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


# 12) TÓM TẮT MỘT CÂU

Đây là API nội bộ cho n8n chạy Python code bất kỳ trong container có sẵn OR-Tools: gửi code, API chạy như script Python bình thường, trả stdout, stderr, result.json, error, traceback.
● [05:20:31] Finished f174eba2-783c-4232-893d-a89cabc212d6
 root                                                                                                                                                                󱙺 FORGE 112.5k  gpt-5.5 HIGH
󰄾
