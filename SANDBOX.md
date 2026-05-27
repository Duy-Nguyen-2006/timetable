# Hướng dẫn Sandbox cho AI Agent

File này giải thích cách "wrap" source code để AI có thể chạy code một cách an toàn.

## Tóm tắt vấn đề

Code gốc (`agent.py`) cho phép LLM:
- Ghi tùy ý vào `runner.py` (`write_file`)
- Chạy file đó trên máy thật với quyền đầy đủ (`run_file` → `subprocess`)

→ **Rủi ro cực cao** khi chạy trên VPS hoặc môi trường production.

## Giải pháp đã implement

Đã tạo thư mục `sandbox/` với 2 lựa chọn:

### 1. Docker Sandbox (Khuyến nghị mạnh - Đã tích hợp sẵn)

**File quan trọng:**
- `sandbox/Dockerfile`
- `sandbox/executor.py` — logic chạy container với `--network=none`, `--read-only`, user non-root, v.v.
- `sandbox/build.sh`

**Đã patch vào:**
- `agent.py` (thêm `USE_SANDBOX = True`, tự động dùng sandbox cho `runner.py`)

**Cách dùng:**
```bash
cd sandbox
./build.sh                 # build image lần đầu
cd ..
python agent.py            # từ giờ runner.py sẽ chạy trong container
```

### 2. Bubblewrap (Nhẹ, không cần Docker)

- `sandbox/bubblewrap_executor.py`
- Yêu cầu cài `bwrap`
- Khởi động nhanh hơn, isolation yếu hơn một chút

## Những gì được bảo vệ

| Thành phần               | Trạng thái      | Lý do |
|--------------------------|-----------------|-------|
| `runner.py` (LLM viết)   | **Sandbox**     | Code không tin cậy |
| `reviewer_agent.py`      | Host (có mạng)  | Cần gọi LLM API |
| `output_formatter.py`    | Host            | Tool đơn giản |
| `write_file`             | Vẫn cho phép    | Nhưng chỉ trong workspace được mount |

## Nâng cao bảo mật (nếu cần)

1. Dùng **gVisor** (runtime thay thế cho Docker): `docker run --runtime=runsc ...`
2. Chạy agent bên trong VM/Firecracker
3. Thêm seccomp profile tùy chỉnh
4. Dùng volume driver với encryption + read-only snapshots

## Tắt sandbox tạm thời (chỉ dev)

Trong `agent.py`:
```python
USE_SANDBOX = False   # CHỈ DÙNG KHI DEBUG
```

**Tuyệt đối không dùng trong production.**

## Kiểm tra nhanh

Sau khi build xong, chạy:
```bash
python -c "
from sandbox.executor import run_in_sandbox
print(run_in_sandbox('runner.py', timeout=15))
"
```

Nếu thấy dòng `Running in isolated container` là đã hoạt động.

---

Bắt đầu dùng ngay bằng cách build image và chạy `python agent.py`.
