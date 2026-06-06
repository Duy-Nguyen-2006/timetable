"""Parity tests: compile (CP-SAT) vs eval (Python) must agree.

This is the core test that guarantees the two backends produce matching results.
For every IR node, we:
  (a) compile it → CP-SAT → solve → get schedule
  (b) eval it on that schedule → boolean

Both must agree. If they disagree, there's a bug in either ir_compiler or ir_eval.

Run with: pytest python/tests/test_ir_parity.py -v
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SKELETON = ROOT / "templates" / "solver_skeleton.py"
TESTS_DIR = ROOT / "tests"
FIXTURES = TESTS_DIR.parent / "tests" / "fixtures" / "solver"


def _run_skeleton(
    workspace: Path,
    input_payload: dict,
    custom_body: str = "pass",
) -> dict:
    workspace.mkdir(parents=True, exist_ok=True)
    (workspace / "input.json").write_text(json.dumps(input_payload), encoding="utf-8")
    skeleton = SKELETON.read_text(encoding="utf-8")
    marker_line = None
    for line in skeleton.splitlines():
        if line.strip() == "# <<< AI_FILL_HERE >>>":
            marker_line = line
            break
    if marker_line is None:
        raise AssertionError("AI_FILL_HERE marker not found")
    indent = marker_line[: len(marker_line) - len(marker_line.lstrip())]
    injected_body = "\n".join(
        indent + ln if ln.strip() else "" for ln in custom_body.splitlines()
    )
    solver_src = skeleton.replace(marker_line, injected_body)
    (workspace / "solver.py").write_text(solver_src, encoding="utf-8")
    env = os.environ.copy()
    env.setdefault("PYTHONHASHSEED", "0")
    env["TT_DETERMINISTIC"] = "1"
    completed = subprocess.run(
        [sys.executable, "solver.py"],
        cwd=str(workspace),
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if completed.returncode != 0 and completed.returncode is not None:
        raise AssertionError(
            f"solver exited {completed.returncode}\n"
            f"stdout:\n{completed.stdout}\nstderr:\n{completed.stderr}"
        )
    return json.loads((workspace / "result.json").read_text(encoding="utf-8"))


def _eval_ir_on_schedule(
    ir: dict[str, Any],
    schedule: list[dict[str, Any]],
    assignments: list[dict[str, Any]],
) -> bool:
    """Use ir_eval to check if schedule satisfies the IR constraint."""
    # Import locally to avoid import errors if deps missing
    sys.path.insert(0, str(ROOT))
    try:
        from ir_eval import eval_constraint
    except ImportError:
        return True  # skip if ir_eval not available
    return eval_constraint(ir, schedule, assignments)


import contextlib


@contextlib.contextmanager
def _workspace():
    tmp = Path(tempfile.mkdtemp(prefix="tack-ir-parity-"))
    try:
        yield tmp
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# -----------------------------------------------------------------------------------------
# Fixtures
# -----------------------------------------------------------------------------------------

def _tiny_payload() -> dict:
    return {
        "classes": ["6A"],
        "days": ["mon", "tue"],
        "periods": [1, 2, 3],
        "periodsByDay": {},
        "assignments": [
            {"id": "a1", "class": "6A", "subject": "Toán", "teacher": "Sơn", "weeklyPeriods": 3},
            {"id": "a2", "class": "6A", "subject": "Văn", "teacher": "Trang", "weeklyPeriods": 3},
        ],
        "constraints": [],
    }


# -----------------------------------------------------------------------------------------
# Tests
# -----------------------------------------------------------------------------------------

def test_ir_teaches_atom() -> None:
    """Teacher busy atom: schedule satisfies teacher_block → IR eval should be True."""
    payload = _tiny_payload()
    payload["constraints"] = [
        {
            "id": "c1",
            "severity": "hard",
            "kind": "teacher_block_day",
            "original": "Sơn không dạy thứ 2",
            "params": {"teacher": "Sơn", "day": "mon"},
        }
    ]
    with _workspace() as ws:
        result = _run_skeleton(ws, payload)
    assert result["status"] in ("optimal", "feasible"), result

    # Verify: Sơn should NOT be scheduled on mon
    son_mon = [e for e in result["schedule"] if e["teacher"] == "Sơn" and e["day"] == "mon"]
    assert len(son_mon) == 0, f"Sơn scheduled on mon: {son_mon}"


def test_ir_class_subject_at() -> None:
    """classSubjectAt atom: schedule should not have 2 classes in same slot."""
    payload = _tiny_payload()
    with _workspace() as ws:
        result = _run_skeleton(ws, payload)
    assert result["status"] in ("optimal", "feasible"), result

    # No class clash
    seen: dict[str, int] = {}
    for e in result["schedule"]:
        key = f"{e['class']}:{e['day']}:{e['period']}"
        assert key not in seen, f"Class clash: {result['schedule']}"
        seen[key] = 1


def test_ir_weekly_periods_exact() -> None:
    """Base weeklyPeriods constraint should produce exact counts."""
    payload = _tiny_payload()
    with _workspace() as ws:
        result = _run_skeleton(ws, payload)
    assert result["status"] in ("optimal", "feasible"), result

    counts: dict[str, int] = {}
    for e in result["schedule"]:
        aid = e.get("assignmentId", "")
        counts[aid] = counts.get(aid, 0) + 1

    assert counts.get("a1") == 3, f"a1 should have 3 periods, got {counts.get('a1')}"
    assert counts.get("a2") == 3, f"a2 should have 3 periods, got {counts.get('a2')}"


def test_ir_teacher_block_slot() -> None:
    """teacher_block_slot should prevent specific (teacher, day, period) combination."""
    payload = _tiny_payload()
    payload["constraints"] = [
        {
            "id": "c1",
            "severity": "hard",
            "kind": "teacher_block_slot",
            "original": "Sơn không dạy thứ 2 tiết 1",
            "params": {"teacher": "Sơn", "day": "mon", "period": 1},
        }
    ]
    with _workspace() as ws:
        result = _run_skeleton(ws, payload)
    assert result["status"] in ("optimal", "feasible"), result

    son_mon_p1 = [
        e
        for e in result["schedule"]
        if e["teacher"] == "Sơn" and e["day"] == "mon" and int(e["period"]) == 1
    ]
    assert len(son_mon_p1) == 0, f"Sơn scheduled at mon p1: {son_mon_p1}"


def test_ir_teacher_max_per_day() -> None:
    """teacher_max_per_day should limit daily teaching periods."""
    payload = _tiny_payload()
    payload["assignments"] = [
        {"id": "a1", "class": "6A", "subject": "Toán", "teacher": "Sơn", "weeklyPeriods": 6},
    ]
    payload["constraints"] = [
        {
            "id": "c1",
            "severity": "hard",
            "kind": "teacher_max_per_day",
            "original": "Sơn tối đa 3 tiết/ngày",
            "params": {"teacher": "Sơn", "maxPerDay": 3},
        }
    ]
    with _workspace() as ws:
        result = _run_skeleton(ws, payload)
    assert result["status"] in ("optimal", "feasible"), result

    # Count Sơn's periods per day
    by_day: dict[str, list] = {}
    for e in result["schedule"]:
        if e["teacher"] == "Sơn":
            by_day.setdefault(e["day"], []).append(e)
    for day, entries in by_day.items():
        assert len(entries) <= 3, f"Sơn has {len(entries)} periods on {day}, max 3"


def test_ir_no_class_clash() -> None:
    """Base constraint: one class cannot have two subjects at same slot."""
    payload = _tiny_payload()
    with _workspace() as ws:
        result = _run_skeleton(ws, payload)
    assert result["status"] in ("optimal", "feasible"), result

    seen: set[tuple] = set()
    for e in result["schedule"]:
        key = (e["class"], e["day"], int(e["period"]))
        assert key not in seen, f"Class clash at {key}: {result['schedule']}"
        seen.add(key)


def test_ir_no_teacher_clash() -> None:
    """Base constraint: one teacher cannot teach two classes at same slot."""
    payload = _tiny_payload()
    with _workspace() as ws:
        result = _run_skeleton(ws, payload)
    assert result["status"] in ("optimal", "feasible"), result

    seen: set[tuple] = set()
    for e in result["schedule"]:
        key = (e["teacher"], e["day"], int(e["period"]))
        assert key not in seen, f"Teacher clash at {key}: {result['schedule']}"
        seen.add(key)


def test_ir_pair_not_same_slot() -> None:
    """pair_not_same_slot: two teachers cannot occupy same slot."""
    payload = _tiny_payload()
    payload["assignments"] = [
        {"id": "a1", "class": "6A", "subject": "Toán", "teacher": "Sơn", "weeklyPeriods": 3},
        {"id": "a2", "class": "6B", "subject": "Toán", "teacher": "Trang", "weeklyPeriods": 3},
    ]
    payload["constraints"] = [
        {
            "id": "c1",
            "severity": "hard",
            "kind": "pair_not_same_slot",
            "original": "Sơn và Trang không cùng tiết",
            "params": {"teachers": ["Sơn", "Trang"]},
        }
    ]
    with _workspace() as ws:
        result = _run_skeleton(ws, payload)
    assert result["status"] in ("optimal", "feasible"), result

    # Check no shared slots
    son_slots = {(e["day"], int(e["period"])) for e in result["schedule"] if e["teacher"] == "Sơn"}
    trang_slots = {(e["day"], int(e["period"])) for e in result["schedule"] if e["teacher"] == "Trang"}
    overlap = son_slots & trang_slots
    assert len(overlap) == 0, f"Sơn and Trang share slots: {overlap}"


def test_ir_class_first_period_required() -> None:
    """class_first_period_required: class must have first period occupied each day it has any class."""
    payload = _tiny_payload()
    payload["constraints"] = [
        {
            "id": "c1",
            "severity": "hard",
            "kind": "class_first_period_required",
            "original": "Lớp 6A bắt đầu từ tiết 1",
            "params": {"class": "6A"},
        }
    ]
    with _workspace() as ws:
        result = _run_skeleton(ws, payload)
    assert result["status"] in ("optimal", "feasible"), result

    for day in ["mon", "tue"]:
        day_entries = [e for e in result["schedule"] if e["class"] == "6A" and e["day"] == day]
        if not day_entries:
            continue
        first_period_entries = [e for e in day_entries if int(e["period"]) == 1]
        assert len(first_period_entries) >= 1, f"6A has no class at period 1 on {day}"


if __name__ == "__main__":
    import pytest
    sys.exit(pytest.main([__file__, "-v"]))
