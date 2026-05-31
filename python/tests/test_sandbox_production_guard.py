import pytest

from sandbox.run import check_unsafe_allowed, run_sandboxed


def test_production_blocks_unsafe_even_with_allow_flag():
    allowed, reason = check_unsafe_allowed({"TT_PRODUCTION": "1", "TT_SANDBOX_ALLOW_UNSAFE": "1"})
    assert allowed is False
    assert "production" in reason.lower()


def test_dev_requires_allow_unsafe_flag():
    allowed, reason = check_unsafe_allowed({})
    assert allowed is False
    assert "TT_SANDBOX_ALLOW_UNSAFE" in reason


def test_dev_allows_with_explicit_flag():
    allowed, reason = check_unsafe_allowed({"TT_SANDBOX_ALLOW_UNSAFE": "1"})
    assert allowed is True
    assert reason == ""


def test_none_mode_blocked_in_production(monkeypatch, tmp_path):
    monkeypatch.setenv("TT_SANDBOX_MODE", "none")
    monkeypatch.setenv("TT_PRODUCTION", "1")
    monkeypatch.setenv("TT_SANDBOX_ALLOW_UNSAFE", "1")
    file = tmp_path / "x.py"
    file.write_text("print('hi')")
    with pytest.raises(RuntimeError, match="production"):
        run_sandboxed(str(file))
