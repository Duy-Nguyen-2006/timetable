"""LLM-free end-to-end test for the solver skeleton.

Goal: prove the solve path (skeleton → CP-SAT → result.json) works without
needing a live LLM or a bundled binary. Runs the real `solver_skeleton.py`
against a tiny fixture in a temp directory and asserts the produced schedule
is correct and complete.

Why: previously, `scripts/pipeline_smoke_test.ts` was the only E2E test, and
it self-skipped without `OPENROUTER_API_KEY`. This test runs in CI by default
and protects the core path from regressions.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from skeleton_runner import run_skeleton as _run_skeleton

FIXTURES = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "solver"


def test_tiny_dataset_solves_to_optimal_with_no_llm() -> None:
    """2 days, 2 periods, 1 class, 2 assignments → must find OPTIMAL."""
    payload = json.loads((FIXTURES / "tiny_dataset.json").read_text(encoding="utf-8"))
    with _workspace() as workspace:
        result = _run_skeleton(workspace, payload)
    assert result["status"] in ("optimal", "feasible"), result
    # 2 assignments, each with weeklyPeriods=2 → 4 schedule entries.
    assert len(result["schedule"]) == 4, result["schedule"]
    # Every (assignmentId, day, period) tuple must be unique — no double-booking.
    seen = set()
    for entry in result["schedule"]:
        key = (entry["assignmentId"], entry["day"], entry["period"])
        assert key not in seen, f"duplicate slot in {result['schedule']}"
        seen.add(key)


def test_teacher_block_day_is_enforced() -> None:
    """Built-in `teacher_block_day` must be honored by the skeleton (no LLM)."""
    payload = json.loads((FIXTURES / "teacher_block_day.json").read_text(encoding="utf-8"))
    with _workspace() as workspace:
        result = _run_skeleton(workspace, payload)
    assert result["status"] in ("optimal", "feasible"), result
    for entry in result["schedule"]:
        if entry["day"] == "mon":
            assert entry["teacher"] != "Sơn", (
                f"teacher_block_day violated: Sơn scheduled on mon in {entry}"
            )


def test_weekly_periods_exact_is_enforced() -> None:
    """Built-in `weekly_periods_exact` must produce exactly N entries per assignment."""
    payload = json.loads((FIXTURES / "weekly_periods_exact.json").read_text(encoding="utf-8"))
    with _workspace() as workspace:
        result = _run_skeleton(workspace, payload)
    assert result["status"] in ("optimal", "feasible"), result
    counts: dict[str, int] = {}
    for entry in result["schedule"]:
        counts[entry["assignmentId"]] = counts.get(entry["assignmentId"], 0) + 1
    assert counts == {"a1": 2, "a2": 2}, counts


# --- helpers --------------------------------------------------------------

import contextlib


@contextlib.contextmanager
def _workspace():
    """Yield a fresh temp dir, then clean it up."""
    import tempfile
    tmp = Path(tempfile.mkdtemp(prefix="tack-e2e-"))
    try:
        yield tmp
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_custom_predicate_cegar_cuts_bad_solution() -> None:
    payload = json.loads((FIXTURES / "custom_predicate_cegar.json").read_text(encoding="utf-8"))
    with _workspace() as workspace:
        result = _run_skeleton(workspace, payload, 'model.Maximize(slots[("a1", "mon", 1)])')
    assert result["status"] in ("optimal", "feasible"), result
    assert result.get("customCegarRounds", 0) >= 1, result
    assert result["schedule"][0]["period"] == 2, result["schedule"]
    assert result["customChecks"][0]["ok"] is True, result["customChecks"]


def test_soft_subject_consecutive_satisfies_preference() -> None:
    """Soft `subject_consecutive` must be encoded as a soft penalty so the solver
    actually tries to schedule the required consecutive blocks instead of silently
    dropping the spec (regression test for "miss 2" bug on DATASET 1).
    """
    payload = json.loads((FIXTURES / "soft_subject_consecutive.json").read_text(encoding="utf-8"))
    with _workspace() as workspace:
        result = _run_skeleton(workspace, payload)
    assert result["status"] in ("optimal", "feasible"), result
    van_entries = [e for e in result["schedule"] if e["assignmentId"] == "v1"]
    assert len(van_entries) == 4, van_entries
    # 4 Văn periods / 2 = 2 required runs of length 2. Solver should satisfy both
    # because the dataset has plenty of room and there's no competing hard blocker.
    by_day: dict[str, list[int]] = {}
    for e in van_entries:
        by_day.setdefault(e["day"], []).append(int(e["period"]))
    runs_of_two = 0
    for periods in by_day.values():
        periods.sort()
        streak = 1
        for i in range(1, len(periods)):
            if periods[i] == periods[i - 1] + 1:
                streak += 1
            else:
                if streak >= 2:
                    runs_of_two += 1
                streak = 1
        if streak >= 2:
            runs_of_two += 1
    assert runs_of_two >= 2, (
        f"soft subject_consecutive produced only {runs_of_two} runs of length 2; "
        f"expected at least 2 (solver is silently dropping soft spec). entries={van_entries}"
    )
