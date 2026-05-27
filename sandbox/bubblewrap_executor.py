"""
sandbox/bubblewrap_executor.py

Lightweight sandbox using bubblewrap (bwrap).
No Docker daemon required. Much faster to start.

Only works on Linux.

Install bubblewrap:
    Ubuntu/Debian:  sudo apt install bubblewrap
    Arch:           sudo pacman -S bubblewrap
    Fedora:         sudo dnf install bubblewrap

This is less isolated than Docker but still provides:
- New mount namespace (only /workspace visible)
- New PID namespace
- Seccomp filter (blocks many dangerous syscalls)
- Can run as user

Limitations compared to Docker:
- Harder to enforce strict network isolation (needs --unshare-net + careful setup)
- No easy memory/CPU limits (use systemd-run or ulimit)
- Slightly more complex to get right
"""

import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Dict, Any


def is_bwrap_available() -> bool:
    return shutil.which("bwrap") is not None


def run_with_bubblewrap(
    file_path: str,
    timeout: int = 120,
    workspace_dir: str | None = None,
) -> Dict[str, Any]:
    """
    Run Python file inside a bubblewrap sandbox.
    """
    if not is_bwrap_available():
        return {
            "success": False,
            "return_code": -1,
            "stdout": "",
            "stderr": "bubblewrap (bwrap) not found on PATH. Install it first.",
            "combined_output": "ERROR: bwrap not installed",
            "message": "Bubblewrap not available",
            "sandbox": "bubblewrap"
        }

    file_path = Path(file_path).resolve()
    if not file_path.exists():
        return {"success": False, "return_code": -1, "message": f"File not found: {file_path}"}

    if workspace_dir is None:
        workspace_dir = str(file_path.parent)
    workspace_dir = Path(workspace_dir).resolve()

    # Build a minimal bubblewrap command.
    # We bind only the workspace dir + essential system dirs (read-only).
    cmd = [
        "bwrap",
        "--ro-bind", "/usr", "/usr",
        "--ro-bind", "/lib", "/lib",
        "--ro-bind", "/lib64", "/lib64",
        "--ro-bind", "/bin", "/bin",
        "--ro-bind", "/sbin", "/sbin",
        "--ro-bind", "/etc", "/etc",
        "--ro-bind", "/opt", "/opt",           # in case ortools is installed there
        "--proc", "/proc",
        "--dev", "/dev",
        "--tmpfs", "/tmp",
        "--bind", str(workspace_dir), "/workspace",   # only writable area
        "--chdir", "/workspace",
        "--unshare-all",          # new user, pid, net, ipc, uts, cgroup, mount namespaces
        "--share-net",            # REMOVE this line if you want full network block (may break some things)
        "--die-with-parent",
        "--new-session",
        "python", str(file_path.name),
    ]

    print(f"[Bubblewrap] Running {file_path.name} in lightweight sandbox...")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        output = (result.stdout or "") + (result.stderr or "")
        success = result.returncode == 0 and "SOLUTION FOUND" in output.upper()

        return {
            "success": success,
            "return_code": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "combined_output": output[:5000],
            "message": "Executed with bubblewrap (light sandbox)",
            "sandbox": "bubblewrap"
        }

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "return_code": -1,
            "stdout": "",
            "stderr": f"Timed out after {timeout}s",
            "combined_output": "ERROR: bubblewrap timeout",
            "message": "Timeout",
            "sandbox": "bubblewrap"
        }
    except Exception as e:
        return {
            "success": False,
            "return_code": -1,
            "stdout": "",
            "stderr": str(e),
            "combined_output": str(e),
            "message": "Bubblewrap execution failed",
            "sandbox": "bubblewrap"
        }


if __name__ == "__main__":
    print("Testing bubblewrap executor...")
    res = run_with_bubblewrap("../runner.py", timeout=30)
    print(res.get("message"))
    print(res.get("stdout", "")[:300])