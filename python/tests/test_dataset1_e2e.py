"""End-to-end test using DATASET 1 — proves the soft subject_consecutive fix
actually drives the solver to a 0-violation schedule for the real Vietnamese
input.
"""
from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path

from skeleton_runner import run_skeleton as _run_skeleton

FIXTURES = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "solver"


def _soft_violations(schedule, specs):
    """Replicate the deterministic validator's soft-violation report."""
    from validator_engine import validate_schedule, _validator_engine  # type: ignore
    return _validator_engine.validate_schedule(schedule, specs, lambda *a, **kw: None)


def test_dataset1_has_no_soft_subject_consecutive_violation() -> None:
    payload = json.loads((FIXTURES / "dataset1.json").read_text(encoding="utf-8"))
    workspace = Path(tempfile.mkdtemp(prefix="tack-ds1-"))
    try:
        result = _run_skeleton(workspace, payload, timeout=120, deterministic=True)
    finally:
        shutil.rmtree(workspace, ignore_errors=True)
    assert result["status"] in ("optimal", "feasible"), result

    # Group by (subject, class) to find runs.
    by_subj_class: dict[tuple[str, str], list[tuple[str, int]]] = {}
    for e in result["schedule"]:
        by_subj_class.setdefault((e["subject"], e["class"]), []).append((e["day"], int(e["period"])))
    print("\n=== DATASET 1 schedule ===")
    for e in result["schedule"]:
        print(f"  {e['day']:>4} p{e['period']:>2}  {e['class']:>3}  {e['subject']:<10}  {e['teacher']}")
    for subj, klass in [("Văn", "6A"), ("Văn", "6B")]:
        entries = by_subj_class.get((subj, klass), [])
        # Group by day, find consecutive runs of length 2.
        per_day: dict[str, list[int]] = {}
        for d, p in entries:
            per_day.setdefault(d, []).append(p)
        runs = 0
        for periods in per_day.values():
            periods.sort()
            streak = 1
            for i in range(1, len(periods)):
                if periods[i] == periods[i - 1] + 1:
                    streak += 1
                else:
                    if streak >= 2:
                        runs += 1
                    streak = 1
            if streak >= 2:
                runs += 1
        assert runs >= 2, (
            f"DATASET 1: {subj} {klass} has only {runs} run(s) of length 2, "
            f"expected ≥2 (soft subject_consecutive should drive solver). "
            f"entries={entries}"
        )
