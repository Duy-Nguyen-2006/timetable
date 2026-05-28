import os
import pytest
from unittest.mock import patch

from sandbox.run import _auto_mode, run_sandboxed

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
