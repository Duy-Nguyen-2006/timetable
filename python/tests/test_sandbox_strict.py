from pathlib import Path

import pytest

from sandbox import executor


def test_run_in_sandbox_strict_raises_when_image_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(executor, "ensure_image_built", lambda: False)
    with pytest.raises(RuntimeError):
        executor.run_in_sandbox(str(Path(__file__)), strict=True)


def test_run_in_sandbox_non_strict_returns_error_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(executor, "ensure_image_built", lambda: False)
    result = executor.run_in_sandbox(str(Path(__file__)), strict=False)
    assert result["success"] is False
    assert result["sandbox"] is True
