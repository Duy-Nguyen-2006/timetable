"""
sandbox/executor.py

Secure execution of Python code inside Docker for AI agents.

This module replaces dangerous subprocess.run calls when executing
code that was written by an LLM (e.g. runner.py).

Usage:
    from sandbox.executor import run_in_sandbox

    result = run_in_sandbox(
        file_path="runner.py",
        timeout=90,
        memory_limit="4g",
        cpu_limit=2,
        workspace_dir="./workspace"   # only this dir is mounted
    )
"""

import os
import json
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from typing import Dict, Any, Optional


# Name of the Docker image we will build/use
SANDBOX_IMAGE = "timetable-sandbox:latest"
SANDBOX_WORKSPACE_CONTAINER_PATH = "/sandbox_workspace"


def ensure_image_built() -> bool:
    """
    Build the sandbox Docker image if it doesn't exist.
    Returns True if image is ready.
    """
    try:
        # Check if image exists
        result = subprocess.run(
            ["docker", "images", "-q", SANDBOX_IMAGE],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.stdout.strip():
            return True

        # Build the image
        sandbox_dir = Path(__file__).parent
        print(f"[Sandbox] Building Docker image '{SANDBOX_IMAGE}' (first time only)...")
        build_result = subprocess.run(
            [
                "docker", "build",
                "-t", SANDBOX_IMAGE,
                "-f", str(sandbox_dir / "Dockerfile"),
                str(sandbox_dir)
            ],
            capture_output=True,
            text=True,
            timeout=300
        )
        if build_result.returncode != 0:
            print("[Sandbox] ERROR building image:")
            print(build_result.stderr)
            return False

        print("[Sandbox] Docker image built successfully.")
        return True

    except Exception as e:
        print(f"[Sandbox] Failed to build image: {e}")
        return False


def run_in_sandbox(
    file_path: str,
    timeout: int = 120,
    memory_limit: str = "4g",
    cpu_limit: int = 2,
    strict: bool = True,
    workspace_dir: Optional[str] = None,
    extra_mounts: Optional[Dict[str, str]] = None,
    env_vars: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """
    Execute a Python file inside a hardened Docker sandbox.

    Args:
        file_path: Path to the .py file to execute (relative or absolute).
        timeout: Max seconds the container is allowed to run.
        memory_limit: Docker memory limit (e.g. "2g", "512m").
        cpu_limit: Number of CPU cores (e.g. 1.5, 2).
        strict: If True, raise RuntimeError when sandbox cannot be initialized.
        workspace_dir: Directory that will be mounted as /workspace inside container.
                       Everything outside this dir is invisible to the code.
        extra_mounts: Additional host_path -> container_path (read-only) mounts.
        env_vars: Environment variables to pass into the container.

    Returns:
        Dict with keys:
            - success: bool
            - return_code: int
            - stdout: str
            - stderr: str
            - combined_output: str (truncated)
            - message: str
            - sandbox: True
    """
    if not ensure_image_built():
        if strict:
            raise RuntimeError(
                "[SANDBOX] Docker image unavailable and strict=True. Refusing to execute untrusted code."
            )
        return {
            "success": False,
            "return_code": -1,
            "stdout": "",
            "stderr": "Failed to prepare sandbox Docker image",
            "combined_output": "SANDBOX ERROR: Could not build Docker image",
            "message": "Sandbox initialization failed",
            "sandbox": True
        }

    file_path = Path(file_path).resolve()
    if not file_path.exists():
        return {
            "success": False,
            "return_code": -1,
            "stdout": "",
            "stderr": f"File not found: {file_path}",
            "combined_output": f"ERROR: {file_path} does not exist",
            "message": "File not found",
            "sandbox": True
        }

    # Determine workspace directory (the only writable area inside container)
    if workspace_dir is None:
        # Default: use the directory containing the file being executed
        workspace_dir = str(file_path.parent)
    workspace_dir = Path(workspace_dir).resolve()
    try:
        file_path.relative_to(workspace_dir)
    except ValueError:
        return {
            "success": False,
            "return_code": -1,
            "stdout": "",
            "stderr": f"File must be inside sandbox workspace directory: {workspace_dir}",
            "combined_output": "SANDBOX ERROR: file outside allowed directory",
            "message": "Sandbox workspace policy violation",
            "sandbox": True
        }

    # Create a unique container name for easier cleanup.
    # Thêm suffix uuid để tránh va chạm khi nhiều job chạy song song trong
    # cùng ms (fix bug #24).
    container_name = f"sandbox-run-{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}"

    # Build docker run command with strong isolation
    cmd = [
        "docker", "run",
        "--rm",
        "--name", container_name,

        # === SECURITY HARDENING ===
        "--network=none",                    # No network access at all
        "--read-only",                       # Root filesystem is read-only
        "--tmpfs", "/tmp:exec,noatime,nosuid,size=128m",
        "--tmpfs", "/var/tmp:exec,noatime,nosuid,size=64m",

        # Drop all capabilities
        "--cap-drop=ALL",
        "--security-opt", "no-new-privileges",

        # Resource limits
        f"--memory={memory_limit}",
        f"--memory-swap={memory_limit}",     # Disable swap
        f"--cpus={cpu_limit}",

        # User namespace (run as non-root inside)
        "-u", "sandbox",

        # Mount only the workspace (read-write)
        "-v", f"{workspace_dir}:{SANDBOX_WORKSPACE_CONTAINER_PATH}:rw",

        # Working directory inside container
        "-w", SANDBOX_WORKSPACE_CONTAINER_PATH,
    ]

    # Add extra read-only mounts if provided (e.g. datasets, libraries)
    if extra_mounts:
        for host_path, container_path in extra_mounts.items():
            cmd.extend(["-v", f"{Path(host_path).resolve()}:{container_path}:ro"])

    # Environment variables (be very careful what you pass)
    if env_vars:
        for k, v in env_vars.items():
            # Never pass secrets unless explicitly required and audited
            cmd.extend(["-e", f"{k}={v}"])

    # The actual command
    cmd.extend([
        SANDBOX_IMAGE,
        "python", str(file_path.name)   # run the file by name inside sandbox workspace
    ])

    print(f"[Sandbox] Running in isolated container: {file_path.name}")
    print(f"[Sandbox] Workspace mounted: {workspace_dir} → {SANDBOX_WORKSPACE_CONTAINER_PATH}")
    print(f"[Sandbox] Limits: memory={memory_limit}, cpus={cpu_limit}, network=none")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout + 15   # give Docker a bit more time for startup
        )

        output = (result.stdout or "") + (result.stderr or "")

        success = result.returncode == 0 and (
            "SOLUTION_FOUND" in output.upper() or "✅" in output
        )

        return {
            "success": success,
            "return_code": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "combined_output": output[:6000],
            "message": "Executed inside Docker sandbox",
            "sandbox": True,
            "container": container_name
        }

    except subprocess.TimeoutExpired:
        # Attempt to kill the container if still running
        try:
            subprocess.run(
                ["docker", "kill", container_name],
                capture_output=True, timeout=5
            )
        except Exception:
            pass

        return {
            "success": False,
            "return_code": -1,
            "stdout": "",
            "stderr": f"Execution timed out after {timeout}s inside sandbox",
            "combined_output": f"ERROR: Sandbox execution timed out after {timeout} seconds.",
            "message": "Timeout (sandbox)",
            "sandbox": True
        }

    except Exception as e:
        return {
            "success": False,
            "return_code": -1,
            "stdout": "",
            "stderr": str(e),
            "combined_output": f"SANDBOX ERROR: {str(e)}",
            "message": "Sandbox execution failed",
            "sandbox": True
        }


def run_file_sandboxed(path: str, timeout: int = 60) -> Dict[str, Any]:
    """
    Drop-in replacement for the original run_file() in agent.py
    when you want sandboxed execution.
    """
    return run_in_sandbox(
        file_path=path,
        timeout=timeout,
        memory_limit="4g",
        cpu_limit=2.0,
    )


# Quick test when running this file directly
if __name__ == "__main__":
    print("Testing sandbox executor...")
    test_file = Path(__file__).parent.parent / "runner.py"
    if test_file.exists():
        res = run_in_sandbox(str(test_file), timeout=30, memory_limit="2g")
        print(json.dumps({k: str(v)[:200] for k, v in res.items()}, indent=2, ensure_ascii=False))
    else:
        print("runner.py not found for test.")