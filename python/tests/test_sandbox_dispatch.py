import os
import pytest
from unittest.mock import patch

from sandbox.run import _auto_mode, run_sandboxed
from sandbox.bubblewrap_executor import _python_package_roots, run_with_bubblewrap

def test_auto_mode_picks_bwrap_on_linux_when_available(monkeypatch):
    monkeypatch.setattr("platform.system", lambda: "Linux")
    monkeypatch.setattr("shutil.which", lambda cmd: "/usr/bin/bwrap" if cmd == "bwrap" else None)
    assert _auto_mode() == "bwrap"

def test_auto_mode_falls_back_to_docker(monkeypatch):
    monkeypatch.setattr("platform.system", lambda: "Darwin")
    monkeypatch.setattr("shutil.which", lambda cmd: "/usr/bin/docker" if cmd == "docker" else None)
    assert _auto_mode() == "docker"

def test_none_mode_refuses_without_allow_unsafe(monkeypatch, tmp_path):
    monkeypatch.setenv("TT_SANDBOX_MODE", "none")
    monkeypatch.delenv("TT_SANDBOX_ALLOW_UNSAFE", raising=False)
    file = tmp_path / "x.py"
    file.write_text("print('hi')")
    with pytest.raises(RuntimeError, match="TT_SANDBOX_ALLOW_UNSAFE"):
        run_sandboxed(str(file))

def test_bwrap_mounts_python_package_roots(monkeypatch, tmp_path):
    package_root = tmp_path / "site-packages"
    package_root.mkdir()
    script = tmp_path / "solver.py"
    script.write_text("print('SOLUTION_FOUND')")
    captured = {}

    monkeypatch.setattr("sandbox.bubblewrap_executor.is_bwrap_available", lambda: True)
    monkeypatch.setattr("sandbox.bubblewrap_executor._python_package_roots", lambda: [package_root])

    def fake_run(cmd, **kwargs):
        captured["cmd"] = cmd
        class Result:
            returncode = 0
            stdout = "SOLUTION_FOUND\n"
            stderr = ""
        return Result()

    monkeypatch.setattr("subprocess.run", fake_run)

    result = run_with_bubblewrap(str(script), timeout=5, workspace_dir=str(tmp_path))

    assert result["success"] is True
    cmd = captured["cmd"]
    assert str(package_root) in cmd
    assert "--setenv" in cmd
    assert "PYTHONPATH" in cmd
    pythonpath = cmd[cmd.index("PYTHONPATH") + 1]
    assert "/tmp/timetable-python-site-0" in pythonpath
