"""Unit tests for the template solver (no API server needed)."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "python"))

from timetable_solver.template_solver import solve_timetable


def _make_problem(*, days=None, periods=None, assignments=None, parsed_hard=None, parsed_soft=None):
    days = days or ["monday", "tuesday", "wednesday", "thursday", "friday"]
    periods = periods or [1, 2, 3, 4]
    session = "morning"
    slots = [
        {
            "slotId": f"{d}_{session}_{p}",
            "dayId": d,
            "dayLabel": d,
            "sessionId": session,
            "sessionLabel": "Sáng",
            "period": p,
        }
        for d in days
        for p in periods
    ]
    meta = {
        "teacherToAsgIds": {},
        "classToAsgIds": {},
        "subjectToAsgIds": {},
        "slotsByDayId": {},
        "slotsByPeriod": {},
        "slotsBySessionId": {},
        "slotsByDayPeriod": {},
        "slotsByDaySession": {},
        "slotsBySessionPeriod": {},
    }
    for s in slots:
        meta["slotsByDayId"].setdefault(s["dayId"], []).append(s["slotId"])
        meta["slotsByPeriod"].setdefault(str(s["period"]), []).append(s["slotId"])
        meta["slotsBySessionId"].setdefault(s["sessionId"], []).append(s["slotId"])
        meta["slotsByDayPeriod"].setdefault(f"{s['dayId']}__{s['period']}", []).append(s["slotId"])
        meta["slotsByDaySession"].setdefault(f"{s['dayId']}__{s['sessionId']}", []).append(s["slotId"])
        meta["slotsBySessionPeriod"].setdefault(f"{s['sessionId']}__{s['period']}", []).append(s["slotId"])
    for a in (assignments or []):
        meta["teacherToAsgIds"].setdefault(a["teacherLabel"], []).append(a["assignmentId"])
        meta["classToAsgIds"].setdefault(a["classLabel"], []).append(a["assignmentId"])
        meta["subjectToAsgIds"].setdefault(a["subjectLabel"], []).append(a["assignmentId"])
    hard_raw = [{"id": c["id"], "text": c.get("original", c["id"])} for c in (parsed_hard or [])]
    soft_raw = [{"id": c["id"], "text": c.get("original", c["id"]), "weight": c.get("weight", 1)} for c in (parsed_soft or [])]
    return {
        "slots": slots,
        "assignments": assignments or [],
        "hardConstraints": hard_raw,
        "softConstraints": soft_raw,
        "parsedHard": parsed_hard or [],
        "parsedSoft": parsed_soft or [],
        "solverConfig": {"maxTimeSeconds": 10, "numWorkers": 2, "randomSeed": 1},
        "meta": meta,
    }


def _make_assignment(asg_id, teacher, subject, cls, weekly):
    return {
        "assignmentId": asg_id,
        "teacherId": f"t_{teacher}",
        "teacherLabel": teacher,
        "classId": f"c_{cls}",
        "classLabel": cls,
        "subjectId": f"s_{subject}",
        "subjectLabel": subject,
        "weeklyPeriods": weekly,
    }


class TestBaseConstraints:
    def test_no_assignments_returns_infeasible(self):
        result = solve_timetable(_make_problem())
        assert result["status"] == "infeasible"

    def test_single_assignment_solved(self):
        asg = _make_assignment("a1", "Sơn", "Toán", "6A", 2)
        result = solve_timetable(_make_problem(assignments=[asg]))
        assert result["status"] == "solved"
        entries = [e for cell in result["cells"] for e in cell.get("entries", [])]
        assert len(entries) == 2

    def test_teacher_no_double_booking(self):
        """Teacher Sơn teaches both 6A and 6B Toán — must never appear in same slot for both."""
        assignments = [
            _make_assignment("a1", "Sơn", "Toán", "6A", 4),
            _make_assignment("a2", "Sơn", "Toán", "6B", 4),
        ]
        result = solve_timetable(_make_problem(assignments=assignments))
        assert result["status"] == "solved"
        for cell in result["cells"]:
            teacher_entries = [e for e in cell.get("entries", []) if e["teacher"] == "Sơn"]
            assert len(teacher_entries) <= 1, f"Double booking in slot {cell['slotId']}"

    def test_class_no_double_subject(self):
        """6A cannot have 2 subjects in same slot."""
        assignments = [
            _make_assignment("a1", "Sơn", "Toán", "6A", 2),
            _make_assignment("a2", "Dung", "Văn", "6A", 2),
        ]
        result = solve_timetable(_make_problem(assignments=assignments))
        assert result["status"] == "solved"
        for cell in result["cells"]:
            class_entries = [e for e in cell.get("entries", []) if e["className"] == "6A"]
            assert len(class_entries) <= 1, f"Class double-booked in slot {cell['slotId']}"

    def test_weekly_periods_count(self):
        """Each assignment must appear exactly weeklyPeriods times."""
        assignments = [
            _make_assignment("a1", "Sơn", "Toán", "6A", 3),
            _make_assignment("a2", "Dung", "Văn", "6A", 2),
        ]
        result = solve_timetable(_make_problem(assignments=assignments))
        assert result["status"] == "solved"
        counts = {}
        for cell in result["cells"]:
            for entry in cell.get("entries", []):
                counts[entry["assignmentKey"]] = counts.get(entry["assignmentKey"], 0) + 1
        assert counts.get("a1") == 3
        assert counts.get("a2") == 2


class TestHardConstraints:
    def test_teacher_block_days(self):
        """Sơn cannot teach on Monday."""
        assignments = [
            _make_assignment("a1", "Sơn", "Toán", "6A", 4),
            _make_assignment("a2", "Sơn", "Toán", "6B", 4),
        ]
        parsed_hard = [
            {
                "id": "hc_1",
                "original": "Sơn không dạy thứ 2",
                "parsed": {"kind": "teacher_block_days", "teacherLabels": ["Sơn"], "dayIds": ["monday"]},
            }
        ]
        result = solve_timetable(_make_problem(assignments=assignments, parsed_hard=parsed_hard))
        assert result["status"] == "solved"
        monday_slots = {s["slotId"] for s in result["cells"] if s["dayId"] == "monday"}
        for cell in result["cells"]:
            if cell["slotId"] in monday_slots:
                for entry in cell.get("entries", []):
                    assert entry["teacher"] != "Sơn", f"Sơn appears on Monday in {cell['slotId']}"

    def test_teacher_block_periods(self):
        """Hương cannot teach period 1."""
        assignments = [
            _make_assignment("a1", "Hương", "Tiếng Anh", "6A", 3),
            _make_assignment("a2", "Hương", "Tiếng Anh", "6B", 3),
        ]
        parsed_hard = [
            {
                "id": "hc_2",
                "original": "Hương không dạy tiết 1",
                "parsed": {"kind": "teacher_block_periods", "teacherLabels": ["Hương"], "periods": [1]},
            }
        ]
        result = solve_timetable(_make_problem(assignments=assignments, parsed_hard=parsed_hard))
        assert result["status"] == "solved"
        for cell in result["cells"]:
            if cell["period"] == 1:
                for entry in cell.get("entries", []):
                    assert entry["teacher"] != "Hương", f"Hương appears at period 1 in {cell['slotId']}"


class TestDataset1:
    """End-to-end smoke test matching the user's Dataset 1."""

    def _make_full_problem(self):
        assignments = [
            _make_assignment("a1", "Sơn", "Toán", "6A", 4),
            _make_assignment("a2", "Sơn", "Toán", "6B", 4),
            _make_assignment("a3", "Dung", "Văn", "6A", 4),
            _make_assignment("a4", "Dung", "Văn", "6B", 4),
            _make_assignment("a5", "Hương", "Tiếng Anh", "6A", 3),
            _make_assignment("a6", "Hương", "Tiếng Anh", "6B", 3),
            _make_assignment("a7", "Thủy", "GDTC", "6A", 2),
            _make_assignment("a8", "Thủy", "GDTC", "6B", 2),
            _make_assignment("a9", "Hiếu", "KHTN", "6A", 3),
            _make_assignment("a10", "Hiếu", "KHTN", "6B", 3),
            _make_assignment("a11", "Lan", "LS&ĐL", "6A", 2),
            _make_assignment("a12", "Lan", "LS&ĐL", "6B", 2),
            _make_assignment("a13", "Thắng", "CN", "6A", 1),
            _make_assignment("a14", "Thắng", "CN", "6B", 1),
            _make_assignment("a15", "Phương", "GDCD", "6A", 1),
            _make_assignment("a16", "Phương", "GDCD", "6B", 1),
        ]
        parsed_hard = [
            {"id": "hc_1", "original": "Sơn không dạy thứ 2",
             "parsed": {"kind": "teacher_block_days", "teacherLabels": ["Sơn"], "dayIds": ["monday"]}},
            {"id": "hc_2", "original": "Hương không dạy tiết 1",
             "parsed": {"kind": "teacher_block_periods", "teacherLabels": ["Hương"], "periods": [1]}},
        ]
        parsed_soft = [
            {"id": "sc_1", "original": "Toán nên xếp tiết 1-2",
             "parsed": {"kind": "subject_prefer_periods", "subjectLabels": ["Toán"], "periods": [1, 2]},
             "weight": 1},
            {"id": "sc_2", "original": "Văn nên liên tiếp 2 tiết",
             "parsed": {"kind": "subject_block_consecutive", "subjectLabels": ["Văn"], "blockSize": 2},
             "weight": 1},
        ]
        return _make_problem(assignments=assignments, parsed_hard=parsed_hard, parsed_soft=parsed_soft)

    def test_solved(self):
        result = solve_timetable(self._make_full_problem())
        assert result["status"] == "solved"

    def test_hard_constraint_son_no_monday(self):
        result = solve_timetable(self._make_full_problem())
        assert result["status"] == "solved"
        son_asg = {"a1", "a2"}
        monday_slots = {c["slotId"] for c in result["cells"] if c["dayId"] == "monday"}
        for cell in result["cells"]:
            if cell["slotId"] in monday_slots:
                for entry in cell.get("entries", []):
                    assert entry["assignmentKey"] not in son_asg, "Sơn appears on Monday"

    def test_hard_constraint_huong_no_period1(self):
        result = solve_timetable(self._make_full_problem())
        assert result["status"] == "solved"
        huong_asg = {"a5", "a6"}
        for cell in result["cells"]:
            if cell["period"] == 1:
                for entry in cell.get("entries", []):
                    assert entry["assignmentKey"] not in huong_asg, "Hương appears at period 1"

    def test_return_format(self):
        result = solve_timetable(self._make_full_problem())
        assert "status" in result
        assert "cells" in result
        assert "solverStats" in result
        assert isinstance(result["cells"], list)
        for cell in result["cells"]:
            assert "slotId" in cell
            assert "entries" in cell
            for entry in cell["entries"]:
                assert "assignmentKey" in entry
                assert "teacher" in entry
                assert "subject" in entry
                assert "className" in entry
