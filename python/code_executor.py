#!/usr/bin/env python3

import json
import py_compile
import runpy
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
from pathlib import Path
from typing import Any

# When PyInstaller freezes us into a single binary, sys.frozen=True and
# sys.executable points at the binary itself, not a Python interpreter. The
# bundled CPython is only reachable by re-exec'ing this binary with a
# dedicated mode flag (--run-solver). Sandbox launchers must use this same
# binary as the interpreter — never bare `python`, which is unavailable on
# user machines that didn't install Python.
IS_FROZEN = bool(getattr(sys, "frozen", False))
SELF_EXECUTABLE = sys.executable

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# TIMEOUT_SECONDS mặc định; có thể override qua đối số dòng lệnh argv[1]
# hoặc env EXECUTOR_TIMEOUT_SECONDS để đồng bộ với timeoutMs phía Node
# (fix bug #6).
import os as _os_mod


def _default_timeout() -> int:
    env_value = _os_mod.environ.get("EXECUTOR_TIMEOUT_SECONDS")
    if env_value:
        try:
            v = int(float(env_value))
            if v > 0:
                return v
        except ValueError:
            pass
    if len(sys.argv) >= 2:
        try:
            v = int(float(sys.argv[1]))
            if v > 0:
                return v
        except ValueError:
            pass
    return 360


TIMEOUT_SECONDS = _default_timeout()
MAX_STDOUT_LINES = 100


def _truncate_output(text: str, max_lines: int = MAX_STDOUT_LINES) -> str:
    lines = text.splitlines()
    if len(lines) <= max_lines:
        return text
    head = "\n".join(lines[:max_lines])
    return f"{head}\n...[truncated {len(lines) - max_lines} lines]"


def _digest_error(stderr: str, max_length: int = 800) -> str:
    lines = [line.strip() for line in stderr.splitlines() if line.strip()]
    focused = "\n".join(lines[-12:])
    return focused[:max_length]


def _map_status(raw: str) -> str:
    status = raw.upper()
    if status == "OPTIMAL":
        return "optimal"
    if status == "FEASIBLE":
        return "feasible"
    if status in {"INFEASIBLE", "MODEL_INVALID"}:
        return "infeasible"
    if status in {"UNKNOWN"}:
        return "unknown"
    return "unknown"


def run_user_code(code: str, timeout: int, job_dir: str | None = None) -> dict[str, Any]:
    started = time.time()
    with tempfile.TemporaryDirectory(prefix="timetable_exec_") as temp_dir:
        workspace = Path(temp_dir)
        input_src = Path(job_dir) / "input.json" if job_dir else Path.cwd() / "input.json"
        input_dst = workspace / "input.json"
        solver_path = workspace / "solver_generated.py"
        result_path = workspace / "result.json"

        if input_src.exists():
            shutil.copy2(input_src, input_dst)
        else:
            input_dst.write_text("{}", encoding="utf-8")

        solver_path.write_text(code, encoding="utf-8")

        # Syntax check in-process. Avoids re-spawning sys.executable, which in a
        # PyInstaller binary points at the binary itself, not a Python.
        try:
            py_compile.compile(str(solver_path), doraise=True)
        except py_compile.PyCompileError as exc:
            return {
                "phase": "compile",
                "ok": False,
                "status": "crashed",
                "durationMs": int((time.time() - started) * 1000),
                "errorDigest": _digest_error(str(exc)),
                "stdout": "",
                "stderr": str(exc),
            }
        except SyntaxError as exc:
            return {
                "phase": "compile",
                "ok": False,
                "status": "crashed",
                "durationMs": int((time.time() - started) * 1000),
                "errorDigest": _digest_error(str(exc)),
                "stdout": "",
                "stderr": str(exc),
            }

        from sandbox.run import run_sandboxed

        try:
            sandbox_result = run_sandboxed(
                file_path=str(solver_path),
                timeout=timeout,
                workspace_dir=str(workspace),
            )
        except Exception as exc:
            return {
                "phase": "run",
                "ok": False,
                "status": "crashed",
                "durationMs": int((time.time() - started) * 1000),
                "errorDigest": _digest_error(str(exc)),
                "stdout": "",
                "stderr": str(exc),
            }

        stdout = sandbox_result.get("stdout", "") or ""
        stderr = sandbox_result.get("stderr", "") or ""
        return_code = sandbox_result.get("return_code", -1)

        if "timed out" in stderr.lower() or sandbox_result.get("message") == "Timeout":
            return {
                "phase": "run",
                "ok": False,
                "status": "timeout",
                "durationMs": int((time.time() - started) * 1000),
                "errorDigest": f"Execution timed out after {timeout}s",
                "stdout": _truncate_output(stdout),
                "stderr": _truncate_output(stderr),
            }

        upper_stdout = stdout.upper()
        marker_count = upper_stdout.count("SOLUTION_FOUND")

        # Early return if SOLUTION_FOUND appears more than once, as this indicates multiple
        # distinct solver solutions were outputted, which violates parsing guarantees.
        if marker_count > 1:
            return {
                "phase": "parse",
                "ok": False,
                "status": "crashed",
                "durationMs": int((time.time() - started) * 1000),
                "errorDigest": "Invalid marker count: SOLUTION_FOUND appears more than once.",
                "stdout": _truncate_output(stdout),
                "stderr": _truncate_output(stderr),
            }

        if not result_path.exists():
            return {
                "phase": "parse",
                "ok": False,
                "status": "crashed",
                "durationMs": int((time.time() - started) * 1000),
                "errorDigest": "result.json was not generated by solver.",
                "stdout": _truncate_output(stdout),
                "stderr": _truncate_output(stderr),
            }

        try:
            result_json = json.loads(result_path.read_text(encoding="utf-8"))
        except Exception as exc:
            return {
                "phase": "parse",
                "ok": False,
                "status": "crashed",
                "durationMs": int((time.time() - started) * 1000),
                "errorDigest": f"Invalid result.json format: {exc}",
                "stdout": _truncate_output(stdout),
                "stderr": _truncate_output(stderr),
            }

        schedule = result_json.get("schedule", []) if isinstance(result_json, dict) else []
        status_raw = result_json.get("status", "unknown") if isinstance(result_json, dict) else "unknown"
        status = _map_status(str(status_raw))

        # Validation sanity: nếu schedule trống mà status nói optimal/feasible → ép infeasible.
        if status in {"optimal", "feasible"} and not schedule:
            status = "infeasible"

        unscheduled: list[str] = []
        if isinstance(result_json, dict) and isinstance(result_json.get("assignments"), list):
            scheduled_ids = {
                str(entry.get("assignmentId"))
                for entry in schedule
                if isinstance(entry, dict) and entry.get("assignmentId") is not None
            }
            unscheduled = [
                str(item.get("id"))
                for item in result_json["assignments"]
                if isinstance(item, dict) and str(item.get("id")) not in scheduled_ids
            ]

        ok = return_code == 0 and status in {"optimal", "feasible"}
        digest_source = stderr if stderr.strip() else stdout

        artifact_dir = Path.cwd() / ".ai_results"
        artifact_dir.mkdir(parents=True, exist_ok=True)

        # Cleanup: giữ tối đa 50 file gần nhất
        _MAX_ARTIFACTS = 50
        existing = sorted(artifact_dir.glob("result_*.json"), key=lambda p: p.stat().st_mtime)
        for old in existing[:-_MAX_ARTIFACTS]:
            try:
                old.unlink()
            except OSError:
                pass

        artifact_path = artifact_dir / f"result_{int(time.time() * 1000)}.json"
        artifact_path.write_text(json.dumps(result_json, ensure_ascii=False), encoding="utf-8")

        return {
            "phase": "run",
            "ok": ok,
            "status": status if status in {"optimal", "feasible", "infeasible"} else "unknown",
            "durationMs": int((time.time() - started) * 1000),
            "resultPath": str(artifact_path),
            "resultSummary": {
                "scheduledCount": len(schedule) if isinstance(schedule, list) else 0,
                "unscheduledAssignments": unscheduled,
            },
            "errorDigest": _digest_error(digest_source) if not ok else "",
            "stdout": _truncate_output(stdout),
            "stderr": _truncate_output(stderr),
        }


def main() -> None:
    code = sys.stdin.read()
    if not code.strip():
        print(
            json.dumps(
                {
                    "phase": "parse",
                    "ok": False,
                    "status": "crashed",
                    "durationMs": 0,
                    "errorDigest": "No code received on stdin.",
                    "stdout": "",
                    "stderr": "",
                },
                ensure_ascii=False,
            )
        )
        return

    try:
        result = run_user_code(code, TIMEOUT_SECONDS)
    except Exception:
        result = {
            "phase": "run",
            "ok": False,
            "status": "crashed",
            "durationMs": 0,
            "errorDigest": _digest_error(traceback.format_exc()),
            "stdout": "",
            "stderr": "",
        }
    print(json.dumps(result, ensure_ascii=False))


def daemon() -> None:
    """Persistent mode: read newline-delimited JSON jobs from stdin, write results to stdout."""
    for raw_line in sys.stdin:
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        try:
            job = json.loads(raw_line)
        except json.JSONDecodeError as exc:
            print(json.dumps({"phase": "parse", "ok": False, "status": "crashed",
                              "durationMs": 0, "errorDigest": f"JSON decode error: {exc}",
                              "stdout": "", "stderr": ""}, ensure_ascii=False), flush=True)
            continue

        code = job.get("code", "")
        timeout = int(job.get("timeoutSeconds", TIMEOUT_SECONDS))
        job_dir = job.get("jobDir") or None
        solver_workers = job.get("solverWorkers")
        if not code.strip():
            print(json.dumps({"phase": "parse", "ok": False, "status": "crashed",
                              "durationMs": 0, "errorDigest": "No code in job.",
                              "stdout": "", "stderr": ""}, ensure_ascii=False), flush=True)
            continue

        prev_solver_workers = _os_mod.environ.get("SOLVER_WORKERS")
        if solver_workers is not None:
            _os_mod.environ["SOLVER_WORKERS"] = str(int(solver_workers))
        try:
            result = run_user_code(code, timeout, job_dir)
        except Exception:
            result = {"phase": "run", "ok": False, "status": "crashed", "durationMs": 0,
                      "errorDigest": _digest_error(traceback.format_exc()), "stdout": "", "stderr": ""}
        finally:
            if solver_workers is not None:
                if prev_solver_workers is None:
                    _os_mod.environ.pop("SOLVER_WORKERS", None)
                else:
                    _os_mod.environ["SOLVER_WORKERS"] = prev_solver_workers
        print(json.dumps(result, ensure_ascii=False), flush=True)


def run_solver_self_exec() -> int:
    """Self-interpreter mode: ``code_executor --run-solver <file>``.

    Lets sandbox launchers use this binary as the Python interpreter when no
    system Python is available (PyInstaller frozen build).
    """
    args = [a for a in sys.argv[1:] if a != "--run-solver"]
    if not args:
        print("[code_executor] --run-solver requires a script path", file=sys.stderr)
        return 2
    script = Path(args[0]).resolve()
    if not script.exists():
        print(f"[code_executor] script not found: {script}", file=sys.stderr)
        return 2
    sys.argv = [str(script), *args[1:]]
    sys.path.insert(0, str(script.parent))
    try:
        runpy.run_path(str(script), run_name="__main__")
        return 0
    except SystemExit as exc:
        return int(exc.code) if isinstance(exc.code, int) else 0
    except Exception:
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    if "--run-solver" in sys.argv:
        sys.exit(run_solver_self_exec())
    if "--daemon" in sys.argv:
        daemon()
    else:
        main()