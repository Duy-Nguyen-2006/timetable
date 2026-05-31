#!/usr/bin/env python3
"""
Dispatcher: chọn sandbox phù hợp dựa theo env TT_SANDBOX_MODE.
Values: "docker" | "bwrap" | "none".
Default: auto-detect (bwrap nếu Linux + bwrap available, docker nếu Docker available, else error).
"""
from __future__ import annotations
import os
import platform
import shutil
import sys
from pathlib import Path
from typing import Any

def _auto_mode() -> str:
    if platform.system() == "Linux" and shutil.which("bwrap"):
        return "bwrap"
    if shutil.which("docker"):
        return "docker"
    return "none"


def check_unsafe_allowed(env: dict[str, str] | None = None) -> tuple[bool, str]:
    """Decide whether the no-sandbox ("none") path may run.

    Pure + testable. Packaged builds set TT_PRODUCTION=1 and must never run
    user code without a sandbox, even if TT_SANDBOX_ALLOW_UNSAFE=1 is present.
    """
    env = os.environ if env is None else env
    if env.get("TT_PRODUCTION") == "1":
        return (
            False,
            "Sandbox không khả dụng trong bản đóng gói (production). "
            "Cần Docker hoặc bwrap để chạy solver an toàn.",
        )
    if env.get("TT_SANDBOX_ALLOW_UNSAFE") != "1":
        return (
            False,
            "No sandbox available (no Docker, no bwrap). "
            "Set TT_SANDBOX_ALLOW_UNSAFE=1 to bypass (DEV ONLY).",
        )
    return True, ""

def run_sandboxed(file_path: str, timeout: int = 120, workspace_dir: str | None = None) -> dict[str, Any]:
    mode = os.environ.get("TT_SANDBOX_MODE", _auto_mode()).lower()

    if mode == "docker":
        from sandbox.executor import run_in_sandbox
        res = run_in_sandbox(file_path=file_path, timeout=timeout, workspace_dir=workspace_dir)
        res["sandbox"] = "docker"
        return res

    if mode == "bwrap":
        from sandbox.bubblewrap_executor import run_with_bubblewrap
        res = run_with_bubblewrap(file_path=file_path, timeout=timeout, workspace_dir=workspace_dir)
        res["sandbox"] = "bwrap"
        return res

    if mode == "none":
        # Dev only — phải set TT_SANDBOX_ALLOW_UNSAFE=1 để confirm; bản
        # production (TT_PRODUCTION=1) luôn bị chặn (#8).
        allowed, reason = check_unsafe_allowed()
        if not allowed:
            raise RuntimeError(reason)
        import subprocess
        cwd = Path(workspace_dir) if workspace_dir else Path(file_path).resolve().parent
        # Frozen binary acts as its own interpreter via --run-solver.
        if getattr(sys, "frozen", False):
            argv = [sys.executable, "--run-solver", str(Path(file_path).resolve())]
        else:
            argv = [sys.executable, str(Path(file_path).resolve())]
        # fix bug #23 — catch TimeoutExpired để trả về status "timeout" thay
        # vì ném exception ngược lên caller.
        try:
            result = subprocess.run(
                argv,
                cwd=cwd, capture_output=True, text=True, timeout=timeout
            )
        except subprocess.TimeoutExpired as exc:
            stdout_str = (exc.stdout.decode(errors="ignore") if isinstance(exc.stdout, (bytes, bytearray)) else (exc.stdout or ""))
            stderr_str = (exc.stderr.decode(errors="ignore") if isinstance(exc.stderr, (bytes, bytearray)) else (exc.stderr or ""))
            output = (stdout_str + stderr_str) or f"TIMEOUT after {timeout}s"
            return {
                "success": False,
                "status": "timeout",
                "return_code": -1,
                "stdout": stdout_str,
                "stderr": stderr_str or f"Timeout after {timeout}s",
                "combined_output": output[:6000],
                "sandbox": "none",
            }
        output = (result.stdout or "") + (result.stderr or "")
        return {
            "success": result.returncode == 0 and "SOLUTION_FOUND" in output.upper(),
            "return_code": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "combined_output": output[:6000],
            "sandbox": "none",
        }

    raise ValueError(f"Unknown TT_SANDBOX_MODE: {mode}")