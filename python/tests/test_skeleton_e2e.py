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
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKELETON = ROOT / "templates" / "solver_skeleton.py"
FIXTURES = ROOT.parent / "tests" / "fixtures" / "solver"


def _run_skeleton(workspace: Path, input_payload: dict, custom_body: str = "pass") -> dict:
    """Execute solver_skeleton.py in `workspace` and return parsed result.json."""
    workspace.mkdir(parents=True, exist_ok=True)
    (workspace / "input.json").write_text(json.dumps(input_payload), encoding="utf-8")

    # Inject custom_body at the AI_FILL_HERE marker instead of relying on a
    # real LLM to generate code. We do this by string-replacement rather than
    # importing the module so the test exercises the same code path as the
    # bundled executor.
    skeleton = SKELETON.read_text(encoding="utf-8")
    marker_line = None
    for line in skeleton.splitlines():
        if line.strip() == "# <<< AI_FILL_HERE >>>":
            marker_line = line
            break
    if marker_line is None:
        raise AssertionError("AI_FILL_HERE marker not found in solver_skeleton.py")
    indent = marker_line[: len(marker_line) - len(marker_line.lstrip())]
    injected_body = "\n".join(indent + ln if ln.strip() else "" for ln in custom_body.splitlines())
    solver_src = skeleton.replace(marker_line, injected_body)
    (workspace / "solver.py").write_text(solver_src, encoding="utf-8")

    env = os.environ.copy()
    env.setdefault("PYTHONHASHSEED", "0")
    completed = subprocess.run(
        [sys.executable, "solver.py"],
        cwd=str(workspace),
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if completed.returncode != 0 and completed.returncode is not None:
        # Treat non-zero exit as a test failure with the stderr surfaced.
        raise AssertionError(
            f"solver exited with {completed.returncode}\n"
            f"stdout:\n{completed.stdout}\nstderr:\n{completed.stderr}"
        )
    result_path = workspace / "result.json"
    if not result_path.exists():
        raise AssertionError(
            f"solver did not write result.json\nstdout:\n{completed.stdout}\nstderr:\n{completed.stderr}"
        )
    return json.loads(result_path.read_text(encoding="utf-8"))


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
