#!/usr/bin/env python3
import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path

import pytest


API_BASE = os.environ.get("TIMETABLE_API_BASE", "http://127.0.0.1:3000")
API_KEY = os.environ.get("LOWPRIZO_API_KEY", "")


@pytest.fixture(scope="session")
def dataset_index():
    return {item["id"]: item for item in parse_datasets()}


def parse_datasets(path="datasets.txt"):
    raw = Path(path).read_text(encoding="utf-8")
    blocks = re.split(r"\n(?=DATASET\s+\d+)", raw)
    datasets = []
    for block in blocks:
        m = re.search(r"DATASET\s+(\d+)", block)
        if not m:
            continue
        ds = {
            "id": int(m.group(1)),
            "days": "",
            "time": "",
            "max_periods": 0,
            "assignments": [],
            "hard_constraints": [],
            "soft_constraints": [],
        }
        section = ""
        for line in [line.strip() for line in block.splitlines() if line.strip()]:
            if line.startswith("Days:"):
                ds["days"] = line.replace("Days:", "").strip()
            elif line.startswith("Time:"):
                ds["time"] = line.replace("Time:", "").strip()
            elif line.startswith("Max periods:"):
                ds["max_periods"] = int(line.replace("Max periods:", "").strip())
            elif line == "Teachers:":
                section = "teachers"
            elif line == "Subjects:":
                section = "subjects"
            elif line == "Classes:":
                section = "classes"
            elif line == "Assignments:":
                section = "assignments"
            elif line == "Hard constraints:":
                section = "hard"
            elif line == "Soft constraints:":
                section = "soft"
            elif section == "assignments":
                teacher, subject, class_name, weekly = line.split("-")
                ds["assignments"].append({
                    "teacher": teacher,
                    "subject": subject,
                    "className": class_name,
                    "weeklyPeriods": int(weekly),
                })
            elif section == "hard":
                ds["hard_constraints"].append(line)
            elif section == "soft":
                ds["soft_constraints"].append(line)
        datasets.append(ds)
    return datasets


def make_payload(ds):
    days = [
        {"id": "monday", "label": "Thứ 2"},
        {"id": "tuesday", "label": "Thứ 3"},
        {"id": "wednesday", "label": "Thứ 4"},
        {"id": "thursday", "label": "Thứ 5"},
        {"id": "friday", "label": "Thứ 6"},
    ]
    lower_time = ds["time"].lower()
    if "morning-afternoon" in lower_time:
        sessions = [{"id": "morning", "label": "Sáng"}, {"id": "afternoon", "label": "Chiều"}]
    elif "afternoon" in lower_time:
        sessions = [{"id": "afternoon", "label": "Chiều"}]
    else:
        sessions = [{"id": "morning", "label": "Sáng"}]
    return {
        "apiKey": API_KEY,
        "days": days,
        "sessions": sessions,
        "periodCounts": {session["id"]: ds["max_periods"] for session in sessions},
        "deletedPeriods": {},
        "assignments": ds["assignments"],
        "constraints": [
            *[{"type": "required", "text": text} for text in ds["hard_constraints"]],
            *[{"type": "preferred", "text": text, "weight": 5} for text in ds["soft_constraints"]],
        ],
    }


def call_api(payload, *, disable_llm=False):
    headers = {"Content-Type": "application/json", "x-lowprizo-api-key": API_KEY}
    if disable_llm:
        headers["x-disable-llm"] = "1"
    req = urllib.request.Request(
        f"{API_BASE}/api/generate-timetable",
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=240) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        pytest.fail(f"API HTTP {exc.code}: {body[:500]}")


def filled_cells(result):
    return [cell for cell in result.get("cells", []) if cell.get("entries")]


def has_entry(result, predicate):
    return any(predicate(cell, entry) for cell in result.get("cells", []) for entry in cell.get("entries", []))


def violation_map(result):
    return {item.get("constraintId"): item for item in result.get("violations", [])}


def assert_solver_contract(result):
    assert result["status"] in {"solved", "infeasible", "error"}
    assert result["verdict"] in {"accept", "retry", "infeasible", "error"}
    assert isinstance(result.get("diagnostics"), list)
    assert isinstance(result.get("attemptHistorySummary"), list)
    assert isinstance(result.get("telemetry"), dict)
    assert result.get("artifactSummary")


pytestmark = pytest.mark.skipif(not API_KEY, reason="LOWPRIZO_API_KEY is not set")


@pytest.mark.parametrize("dataset_id", [1, 2, 4, 5, 6])
def test_dataset_api_solved_smoke(dataset_id, dataset_index):
    result = call_api(make_payload(dataset_index[dataset_id]))
    telemetry = result.get("telemetry") or {}

    assert_solver_contract(result)
    assert result["status"] == "solved", result.get("diagnostics")
    assert result["verdict"] == "accept"
    assert not [v for v in result.get("violations", []) if v.get("violated")]
    assert filled_cells(result)

    if dataset_id == 1:
        assert telemetry.get("llmCallCount", 0) >= 1
        assert telemetry.get("solverAttempts", 0) >= 1
    elif dataset_id == 2:
        assert not has_entry(result, lambda cell, entry: entry["teacher"] == "Thuận" and cell["dayId"] not in {"tuesday", "wednesday", "thursday"})
    elif dataset_id == 4:
        assert has_entry(result, lambda cell, entry: entry["subject"] == "KHTN" and cell["period"] == 1)
        assert has_entry(result, lambda cell, entry: entry["subject"] == "Văn" and cell["period"] in {2, 3})
    elif dataset_id == 5:
        assert not has_entry(result, lambda cell, entry: entry["teacher"] == "Dung" and cell["sessionId"] != "afternoon")
        assert not has_entry(result, lambda cell, entry: entry["teacher"] == "Sơn" and cell["dayId"] == "thursday" and cell["sessionId"] == "afternoon")
    elif dataset_id == 6:
        assert not has_entry(result, lambda cell, entry: entry["subject"] in {"Toán", "KHTN", "Văn"} and cell["sessionId"] != "morning")
        assert not has_entry(result, lambda cell, entry: entry["subject"] in {"Toán", "Văn"} and cell["period"] == 7)


def test_dataset_api_infeasible_path(dataset_index):
    result = call_api(make_payload(dataset_index[3]))

    assert_solver_contract(result)
    assert result["status"] == "infeasible", result
    assert result["verdict"] == "infeasible"
    assert result.get("finalReason") == "solver_infeasible"
    assert result.get("iisConstraintIds") or result.get("diagnostics")
    assert any(item.get("phase") == "checker" and item.get("status") == "success" for item in result.get("attemptHistorySummary", []))


def test_dataset_api_retry_then_accept_path(dataset_index):
    result = call_api(make_payload(dataset_index[2]), disable_llm=True)
    attempts = result.get("attemptHistorySummary", [])
    telemetry = result.get("telemetry") or {}

    assert_solver_contract(result)
    assert result["status"] == "solved", result
    assert result["verdict"] == "accept"
    assert any(item.get("phase") == "validation" for item in attempts)
    assert any(item.get("phase") == "checker" and item.get("status") == "success" for item in attempts)
    assert telemetry.get("solverAttempts", 0) >= 1
    assert telemetry.get("llmCallCount", 0) >= 1

    if any(item.get("phase") == "validation" and item.get("status") == "retry" for item in attempts):
        assert any(item.get("phase") == "checker" and item.get("status") == "retry" for item in attempts)
        assert telemetry.get("repairAttempts", 0) >= 1


def test_dataset_api_invalid_output_guardrail(dataset_index):
    result = call_api(make_payload(dataset_index[2]), disable_llm=True)
    violations = violation_map(result)

    assert_solver_contract(result)
    assert result["finalReason"] in {"accepted", "max_safe_iterations", "no_progress", "retry_stop", "token_budget_exceeded", "request_timeout"}
    assert any(item.get("phase") == "validation" for item in result.get("attemptHistorySummary", []))
    assert any(item.get("phase") == "checker" for item in result.get("attemptHistorySummary", []))
    if result["status"] == "error":
        assert result["verdict"] == "error"
        assert result.get("telemetry", {}).get("guardrailStopReason")
    else:
        assert result["status"] == "solved"
        assert result["verdict"] == "accept"
        assert isinstance(violations, dict)
