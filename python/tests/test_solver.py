"""Unit tests for the rewritten solver."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from timetable_solver.solver import solve_timetable


def _minimal_problem(extra_constraints=None):
    return {
        "slots": [
            {"slotId": "d1-m-1", "dayId": "d1", "sessionId": "morning", "period": 1},
            {"slotId": "d1-m-2", "dayId": "d1", "sessionId": "morning", "period": 2},
        ],
        "assignments": [
            {
                "assignmentId": "a1",
                "teacherId": "T1",
                "teacherLabel": "Lan",
                "subjectId": "S1",
                "subjectLabel": "Toán",
                "classId": "C1",
                "classLabel": "9A",
                "weeklyPeriods": 1,
            }
        ],
        "aiCompiledConstraints": extra_constraints or [],
        "solverConfig": {"maxTimeSeconds": 5, "numWorkers": 2, "randomSeed": 1},
    }


def test_basic_solve():
    r = solve_timetable(_minimal_problem())
    assert r["status"] == "solved"
    assert sum(len(c["entries"]) for c in r["cells"]) == 1


def test_hard_constraint_applied():
    code = (
        "for s in slots:\n"
        "    if s['period']==1:\n"
        "        model.Add(x[('a1', s['slotId'])] == 0)"
    )
    r = solve_timetable(_minimal_problem([
        {"id": "c1", "description": "", "original": "", "priority": "hard", "code": code}
    ]))
    assert r["status"] == "solved"
    # The assigned period must be 2 (period 1 is forbidden)
    for c in r["cells"]:
        for e in c["entries"]:
            assert c["period"] == 2


def test_infeasible_iis():
    """Two conflicting constraints → infeasible → IIS contains both."""
    code_a = "model.Add(x[('a1','d1-m-1')] == 0)"
    code_b = "model.Add(x[('a1','d1-m-2')] == 0)"
    r = solve_timetable(_minimal_problem([
        {"id": "c1", "description": "", "original": "", "priority": "hard", "code": code_a},
        {"id": "c2", "description": "", "original": "", "priority": "hard", "code": code_b},
    ]))
    assert r["status"] == "infeasible"
    assert set(r["iisConstraintIds"]) == {"c1", "c2"}


def test_soft_objective():
    code = (
        "for s in slots:\n"
        "    if s['period']==1:\n"
        "        objective_terms.append(10 * x[('a1', s['slotId'])])"
    )
    r = solve_timetable(_minimal_problem([
        {"id": "c1", "description": "", "original": "", "priority": "soft", "weight": 10, "code": code}
    ]))
    assert r["status"] == "solved"
    # The solver should prefer period 1 due to soft constraint
    for c in r["cells"]:
        if c["entries"]:
            assert c["period"] == 1


def test_execution_error_logged():
    code = "model.Add(x[('not_exist','also_not')] == 0)"  # KeyError
    r = solve_timetable(_minimal_problem([
        {"id": "c1", "description": "", "original": "", "priority": "hard", "code": code}
    ]))
    assert any(e["constraintId"] == "c1" for e in r["executionErrors"])


def test_validation_error_logged():
    code = "import os"
    r = solve_timetable(_minimal_problem([
        {"id": "c1", "description": "", "original": "", "priority": "hard", "code": code}
    ]))
    assert any(e["constraintId"] == "c1" for e in r["validationErrors"])


def test_no_slots_infeasible():
    r = solve_timetable({"slots": [], "assignments": [{"assignmentId": "a1"}]})
    assert r["status"] == "infeasible"


def test_no_assignments_infeasible():
    r = solve_timetable({"slots": [{"slotId": "s1"}], "assignments": []})
    assert r["status"] == "infeasible"


def test_empty_constraint_skipped():
    r = solve_timetable(_minimal_problem([
        {"id": "c1", "description": "", "original": "", "priority": "hard", "code": ""}
    ]))
    assert r["status"] == "solved"


def test_multiple_assignments():
    problem = {
        "slots": [
            {"slotId": "d1-m-1", "dayId": "d1", "sessionId": "morning", "period": 1},
            {"slotId": "d1-m-2", "dayId": "d1", "sessionId": "morning", "period": 2},
        ],
        "assignments": [
            {
                "assignmentId": "a1",
                "teacherId": "T1",
                "teacherLabel": "Lan",
                "subjectId": "S1",
                "subjectLabel": "Toán",
                "classId": "C1",
                "classLabel": "9A",
                "weeklyPeriods": 1,
            },
            {
                "assignmentId": "a2",
                "teacherId": "T2",
                "teacherLabel": "Nam",
                "subjectId": "S2",
                "subjectLabel": "Lý",
                "classId": "C1",
                "classLabel": "9A",
                "weeklyPeriods": 1,
            },
        ],
        "aiCompiledConstraints": [],
        "solverConfig": {"maxTimeSeconds": 5, "numWorkers": 2, "randomSeed": 1},
    }
    r = solve_timetable(problem)
    assert r["status"] == "solved"
    # Both assignments should be placed, and in different slots (same class)
    total_entries = sum(len(c["entries"]) for c in r["cells"])
    assert total_entries == 2


def test_hard_and_soft_mixed():
    hard_code = (
        "for s in slots:\n"
        "    if s['period']==2:\n"
        "        model.Add(x[('a1', s['slotId'])] == 0)"
    )
    soft_code = (
        "for s in slots:\n"
        "    if s['period']==1:\n"
        "        objective_terms.append(5 * x[('a1', s['slotId'])])"
    )
    r = solve_timetable(_minimal_problem([
        {"id": "c1", "description": "", "original": "", "priority": "hard", "code": hard_code},
        {"id": "c2", "description": "", "original": "", "priority": "soft", "weight": 5, "code": soft_code},
    ]))
    assert r["status"] == "solved"
    # Only period 1 is available after hard constraint
    for c in r["cells"]:
        for e in c["entries"]:
            assert c["period"] == 1
