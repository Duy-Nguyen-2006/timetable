"""Tier 3 — predicate-exec tests for python/validator_engine.py."""
from __future__ import annotations

import importlib.util
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
ENGINE_PATH = ROOT / "validator_engine.py"

spec = importlib.util.spec_from_file_location("validator_engine", ENGINE_PATH)
validator_engine = importlib.util.module_from_spec(spec)
sys.modules["validator_engine"] = validator_engine
spec.loader.exec_module(validator_engine)

validate_schedule = validator_engine.validate_schedule


def _spec(spec_id: str, src: str, severity: str = "hard") -> dict:
    return {
        "id": spec_id,
        "original": "ràng buộc đặc biệt",
        "severity": severity,
        "kind": "custom_dsl",
        "params": {"pythonPredicate": src},
    }


def test_missing_pythonpredicate_marked_unchecked_with_note() -> None:
    spec = {
        "id": "c1",
        "original": "test",
        "severity": "hard",
        "kind": "custom_dsl",
        "params": {},
    }
    result = validate_schedule([], [spec])
    assert "c1" in result["uncheckedConstraintIds"]
    assert result["uncheckedNotes"]["c1"] == "predicate_missing"


def test_unsafe_predicate_marked_unchecked_with_note() -> None:
    src = (
        "def check(schedule):\n"
        "    return __import__('os').system('echo hi')\n"
    )
    spec = _spec("c2", src)
    result = validate_schedule([], [spec])
    assert "c2" in result["uncheckedConstraintIds"]
    assert result["uncheckedNotes"]["c2"] == "predicate_unsafe"


def test_safe_predicate_true_returns_no_violations() -> None:
    src = "def check(schedule):\n    return True\n"
    spec = _spec("c3", src)
    result = validate_schedule([], [spec])
    assert "c3" not in result["uncheckedConstraintIds"]
    assert result["hardConstraintPass"] is True


def test_safe_predicate_false_returns_violation() -> None:
    src = "def check(schedule):\n    return False\n"
    spec = _spec("c4", src)
    result = validate_schedule([], [spec])
    assert "c4" not in result["uncheckedConstraintIds"]
    assert result["hardConstraintPass"] is False
    assert any(v.get("constraintId") == "c4" for v in result["hardViolations"])


def test_predicate_nameerror_does_not_silently_pass() -> None:
    src = "def check(schedule):\n    raise NameError('missing value')\n"
    spec = _spec("c5", src)
    result = validate_schedule([], [spec])
    # Predicate errored → must NOT silently treat as satisfied.
    assert "c5" in result["uncheckedConstraintIds"]
    assert result["uncheckedNotes"]["c5"] == "predicate_error"
    assert result["hardConstraintPass"] is False


def test_predicate_zerodivision_does_not_silently_pass() -> None:
    src = "def check(schedule):\n    return 1 / 0\n"
    spec = _spec("c6", src)
    result = validate_schedule([], [spec])
    assert "c6" in result["uncheckedConstraintIds"]
    assert result["uncheckedNotes"]["c6"] == "predicate_error"


def test_predicate_typeerror_does_not_silently_pass() -> None:
    src = "def check(schedule):\n    return 1 + 'a'  # TypeError\n"
    spec = _spec("c7", src)
    result = validate_schedule([], [spec])
    assert "c7" in result["uncheckedConstraintIds"]


def test_predicate_timeout_is_killed() -> None:
    # A predicate that loops forever must be killed by the 5s timeout bound.
    src = (
        "def check(schedule):\n"
        "    while True:\n"
        "        pass\n"
        "    return True\n"
    )
    spec = _spec("c8", src)
    result = validate_schedule([], [spec])
    assert "c8" in result["uncheckedConstraintIds"]
    assert result["uncheckedNotes"]["c8"] == "predicate_timeout"


# ---- AST-safety parametrized test for all 14 forbidden names/attrs ----

FORBIDDEN_CASES = [
    ("exec", "exec('print(1)')"),
    ("eval", "eval('1')"),
    ("compile", "compile('1', '<s>', 'eval')"),
    ("input", "input('prompt')"),
    ("breakpoint", "breakpoint()"),
    ("globals", "globals()"),
    ("locals", "locals()"),
    ("vars", "vars()"),
    ("print", "print('x')"),
    ("__class__", "(1).__class__"),
    ("__bases__", "(1).__class__.__bases__"),
    ("__subclasses__", "(1).__class__.__subclasses__()"),
    ("__mro__", "(1).__class__.__mro__"),
    ("__builtins__", "__builtins__"),
]


def test_ast_safety_rejects_all_forbidden_names_and_attrs() -> None:
    for name, snippet in FORBIDDEN_CASES:
        src = f"def check(schedule):\n    return {snippet}\n"
        result = validator_engine._predicate_is_unsafe(src)
        assert result is not None, f"Expected unsafe for {name}, got None"
        # Must mention the forbidden symbol.
        assert name in result, f"Expected '{name}' in error, got: {result}"


def test_safe_predicate_using_only_allowed_builtins_passes() -> None:
    src = (
        "def check(schedule):\n"
        "    teachers = {e['teacher'] for e in schedule}\n"
        "    return len(teachers) > 0\n"
    )
    assert validator_engine._predicate_is_unsafe(src) is None
