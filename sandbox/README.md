# Sandbox cho AI Agent (Docker)

Thư mục này cung cấp môi trường thực thi **an toàn, cô lập** cho code do AI (LLM) sinh ra.

## Vấn đề hiện tại (rất nguy hiểm)

File `agent.py` hiện tại có 2 tool cực mạnh:

- `write_file`: LLM có thể ghi **bất kỳ nội dung nào** vào `runner.py`
- `run_file`: Dùng `subprocess.run([sys.executable, ...])` để chạy code đó **với toàn quyền của user** trên máy thật.

→ LLM (kể cả do prompt injection hoặc hallucination) có thể:
- Xóa file, đọc `.env`, đánh cắp API key
- Chạy lệnh hệ thống, reverse shell, đào coin, v.v.

## Giải pháp: Docker Sandbox (Khuyến nghị)

Code được chạy bên trong container với các hạn chế nghiêm ngặt:

| Hạn chế                    | Mức độ          | Ghi chú |
|---------------------------|------------------|--------|
| Network                   | Bị chặn hoàn toàn (`--network=none`) | Code không thể gọi API, download, exfiltrate |
| Filesystem                | Chỉ thấy được thư mục workspace bạn mount | `--read-only` + tmpfs |
| User                      | Chạy dưới user `sandbox` (non-root) | |
| Capabilities              | Tất cả bị drop (`--cap-drop=ALL`) | |
| RAM / CPU                 | Giới hạn (mặc định 4GB / 2 cores) | |
| Thời gian                 | Có timeout cứng | |

## Cách sử dụng nhanh

### Bước 1: Build sandbox image (chỉ cần làm 1 lần)

```bash
cd sandbox
./build.sh
# hoặc
docker build -t timetable-sandbox:latest -f Dockerfile .
```

### Bước 2: Chạy agent như bình thường

```bash
cd ..
python agent.py
```

Agent sẽ tự động chạy `runner.py` bên trong Docker sandbox (vì `USE_SANDBOX = True`).

---

## Cách sử dụng chi tiết

### 1. Build image lần đầu

```bash
cd sandbox
docker build -t timetable-sandbox:latest -f Dockerfile .
```

Hoặc chỉ cần import `executor.py` — nó sẽ tự build nếu chưa có.

### 2. Gọi từ code

```python
from sandbox.executor import run_in_sandbox

result = run_in_sandbox(
    file_path="runner.py",
    timeout=90,
    memory_limit="4g",
    cpu_limit=2,
    workspace_dir=".",           # chỉ thư mục này được mount vào container
)

print(result["stdout"])
print(result["stderr"])
```

### 3. Tích hợp vào agent.py (đã hỗ trợ)

Xem phần bên dưới.

## Tích hợp vào agent.py

Mở file `agent.py` và thay thế / bổ sung hàm `run_file`:

```python
from sandbox.executor import run_file_sandboxed

def run_file(path: str, use_sandbox: bool = True) -> dict:
    if use_sandbox and path.endswith("runner.py"):
        # Chỉ runner.py (code do LLM sinh) mới chạy sandbox
        return run_file_sandboxed(path, timeout=TIMEOUT_SECONDS)
    else:
        # reviewer_agent.py, output_formatter.py... vẫn chạy trên host
        # (vì chúng cần network để gọi LLM)
        ...
```

Xem file `agent.py` đã được patch (nếu bạn chạy script patch) để có ví dụ đầy đủ.

## Các file quan trọng

- `Dockerfile` — định nghĩa môi trường cô lập
- `executor.py` — wrapper gọi `docker run` với đầy đủ flag bảo mật

## Lựa chọn nhẹ hơn (không dùng Docker)

Nếu không muốn dùng Docker daemon, có thể dùng:

1. **bubblewrap** (`bwrap`) — rất nhẹ, khởi động nhanh, chỉ cần cài `bwrap`
2. **Firejail**
3. **nsjail** (của Google)

### Sử dụng bubblewrap (nhẹ)

```bash
# Cài đặt
sudo apt install bubblewrap     # Debian/Ubuntu
# sudo pacman -S bubblewrap     # Arch
# sudo dnf install bubblewrap   # Fedora

# Chạy test
python sandbox/bubblewrap_executor.py
```

Sau đó bạn có thể sửa `agent.py` để dùng `bubblewrap_executor` thay vì Docker khi cần môi trường nhẹ hơn.

**Lưu ý**: bubblewrap yếu hơn Docker về network isolation và resource limits. Dùng cho dev/test, production nên ưu tiên Docker hoặc gVisor.

## Lưu ý quan trọng

- **reviewer_agent.py** và các tool cần gọi LLM **KHÔNG** nên chạy trong sandbox không có mạng.
- Chỉ nên sandbox những file "untrusted" thực sự (`runner.py` là điển hình).
- Nếu code của bạn cần đọc thêm file (datasets.txt, ...), hãy dùng tham số `extra_mounts` để mount chúng read-only.

## Bảo mật nâng cao hơn nữa

- Dùng **gVisor** (runsc) thay vì Docker runtime mặc định
- Chạy Docker trong VM (Firecracker, QEMU)
- Sử dụng seccomp profile tùy chỉnh
- Giới hạn syscall bằng `--security-opt seccomp=...`

Hiện tại mức độ isolation của setup này đã đủ tốt cho hầu hết các trường hợp sử dụng agent tự viết code.
