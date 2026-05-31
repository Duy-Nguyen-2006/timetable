import sys
import json
from pathlib import Path
try:
    import pytest
except ImportError:
    pytest = None

sys.path.append(str(Path(__file__).parent.parent))

from code_executor import _map_status, run_user_code


def _make_sandbox_stub(result_payload):
    """Build a fake run_sandboxed that writes result.json and reports success."""

    def fake_run_sandboxed(file_path, timeout=120, workspace_dir=None):
        cwd = Path(workspace_dir or Path(file_path).parent)
        (cwd / "result.json").write_text(json.dumps(result_payload), encoding="utf-8")
        return {
            "success": True,
            "return_code": 0,
            "stdout": "SOLUTION_FOUND",
            "stderr": "",
            "combined_output": "SOLUTION_FOUND",
            "sandbox": "test",
        }

    return fake_run_sandboxed


def test_map_status():
    assert _map_status("OPTIMAL") == "optimal"
    assert _map_status("FEASIBLE") == "feasible"
    assert _map_status("INFEASIBLE") == "infeasible"
    assert _map_status("MODEL_INVALID") == "infeasible"
    assert _map_status("UNKNOWN") == "unknown"


def test_run_user_code_accepts_feasible_status(tmp_path, monkeypatch):
    import code_executor
    import sandbox.run as sandbox_run

    monkeypatch.setattr(
        sandbox_run,
        "run_sandboxed",
        _make_sandbox_stub({
            "status": "feasible",
            "schedule": [{"assignmentId": "a1"}],
            "assignments": [{"id": "a1"}],
        }),
    )
    monkeypatch.setattr(code_executor.Path, "cwd", lambda: Path(tmp_path))

    res = run_user_code("print('hello')", timeout=10)
    assert res["ok"] is True
    assert res["status"] == "feasible"


def test_run_user_code_empty_schedule_optimal_coerced(tmp_path, monkeypatch):
    import sandbox.run as sandbox_run

    monkeypatch.setattr(
        sandbox_run,
        "run_sandboxed",
        _make_sandbox_stub({"status": "optimal", "schedule": []}),
    )

    res = run_user_code("print('hello')", timeout=10)
    assert res["ok"] is False
    assert res["status"] == "infeasible"


def test_artifact_cleanup(tmp_path, monkeypatch):
    import code_executor
    import os
    import time
    import sandbox.run as sandbox_run

    mock_artifact_dir = Path(tmp_path) / ".ai_results"
    mock_artifact_dir.mkdir()

    for i in range(60):
        file = mock_artifact_dir / f"result_{i}.json"
        file.write_text("{}")
        mtime = time.time() - (60 - i) * 10
        os.utime(file, (mtime, mtime))

    monkeypatch.setattr(code_executor.Path, "cwd", lambda: Path(tmp_path))
    monkeypatch.setattr(
        sandbox_run,
        "run_sandboxed",
        _make_sandbox_stub({"status": "optimal", "schedule": [{"id": "x"}]}),
    )

    res = run_user_code("print('hello')", timeout=10)
    assert res["ok"] is True

    remaining_files = sorted(mock_artifact_dir.glob("result_*.json"))
    assert len(remaining_files) == 51
    for i in range(10):
        assert not (mock_artifact_dir / f"result_{i}.json").exists()
