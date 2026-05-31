import sys
import json
from pathlib import Path
try:
    import pytest
except ImportError:
    pytest = None

# Add python directory to path
sys.path.append(str(Path(__file__).parent.parent))

from code_executor import _map_status, run_user_code

def test_map_status():
    assert _map_status("OPTIMAL") == "optimal"
    assert _map_status("FEASIBLE") == "feasible"
    assert _map_status("INFEASIBLE") == "infeasible"
    assert _map_status("MODEL_INVALID") == "infeasible"
    assert _map_status("UNKNOWN") == "unknown"

def test_run_user_code_accepts_feasible_status(tmp_path, monkeypatch):
    import code_executor

    class MockCompletedProcess:
        returncode = 0
        stdout = "SOLUTION_FOUND"
        stderr = ""

    def mock_run(*args, **kwargs):
        cwd = kwargs.get("cwd")
        if cwd:
            result_path = Path(cwd) / "result.json"
            result_path.write_text(json.dumps({
                "status": "feasible",
                "schedule": [{"assignmentId": "a1"}],
                "assignments": [{"id": "a1"}]
            }))
        return MockCompletedProcess()

    monkeypatch.setattr(code_executor.subprocess, "run", mock_run)
    monkeypatch.setattr(code_executor.Path, "cwd", lambda: Path(tmp_path))

    res = run_user_code("print('hello')", timeout=10)
    assert res["ok"] is True
    assert res["status"] == "feasible"


def test_run_user_code_empty_schedule_optimal_coerced(tmp_path, monkeypatch):
    import code_executor

    class MockCompletedProcess:
        returncode = 0
        stdout = "SOLUTION_FOUND"
        stderr = ""

    def mock_run(*args, **kwargs):
        cwd = kwargs.get("cwd")
        if cwd:
            result_path = Path(cwd) / "result.json"
            result_path.write_text(json.dumps({
                "status": "optimal",
                "schedule": []
            }))
        return MockCompletedProcess()

    monkeypatch.setattr(code_executor.subprocess, "run", mock_run)

    res = run_user_code("print('hello')", timeout=10)
    assert res["ok"] is False
    assert res["status"] == "infeasible"

def test_artifact_cleanup(tmp_path, monkeypatch):
    import code_executor
    import os
    import time

    mock_artifact_dir = Path(tmp_path) / ".ai_results"
    mock_artifact_dir.mkdir()

    for i in range(60):
        file = mock_artifact_dir / f"result_{i}.json"
        file.write_text("{}")
        mtime = time.time() - (60 - i) * 10
        os.utime(file, (mtime, mtime))

    monkeypatch.setattr(code_executor.Path, "cwd", lambda: Path(tmp_path))

    class MockCompletedProcess:
        returncode = 0
        stdout = "SOLUTION_FOUND"
        stderr = ""

    def mock_run(*args, **kwargs):
        cwd = kwargs.get("cwd")
        if cwd:
            result_path = Path(cwd) / "result.json"
            result_path.write_text(json.dumps({
                "status": "optimal",
                "schedule": [{"id": "x"}]
            }))
        return MockCompletedProcess()

    monkeypatch.setattr(code_executor.subprocess, "run", mock_run)

    res = run_user_code("print('hello')", timeout=10)
    assert res["ok"] is True

    remaining_files = sorted(mock_artifact_dir.glob("result_*.json"))
    assert len(remaining_files) == 51
    for i in range(10):
        assert not (mock_artifact_dir / f"result_{i}.json").exists()

