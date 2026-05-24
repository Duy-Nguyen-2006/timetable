#!/usr/bin/env python3
import json
import subprocess
import sys
import time
from pathlib import Path

DATASETS_PATH = Path("datasets.txt")
RUNNER_PATH = Path("python/timetable_solver/runner.py")


def parse_datasets(path: Path):
    text = path.read_text(encoding="utf-8")
    blocks = [b.strip() for b in text.split("DATASET ") if b.strip()]
    out = []
    for block in blocks:
        lines = block.splitlines()
        ds_id = int(lines[0].strip())
        ds = {
            "id": ds_id,
            "days": "Mon-Fri",
            "time": "Morning",
            "max_periods": 4,
            "teachers": [],
            "subjects": [],
            "classes": [],
            "assignments": [],
            "hard": [],
            "soft": [],
        }
        section = None
        for line in lines[1:]:
            line = line.strip()
            if not line:
                continue
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
            else:
                if section in ("teachers", "subjects", "classes", "hard", "soft"):
                    ds[section].append(line)
                elif section == "assignments":
                    t, s, c, p = [x.strip() for x in line.split("-", 3)]
                    ds["assignments"].append(
                        {
                            "teacher": t,
                            "subject": s,
                            "className": c,
                            "weeklyPeriods": int(p),
                        }
                    )
        out.append(ds)
    return out


def build_problem(ds, solver_config):
    day_map = [
        ("monday", "Thứ 2"),
        ("tuesday", "Thứ 3"),
        ("wednesday", "Thứ 4"),
        ("thursday", "Thứ 5"),
        ("friday", "Thứ 6"),
    ]

    if "morning-afternoon" in ds["time"].lower():
        sessions = [("morning", "Sáng"), ("afternoon", "Chiều")]
    elif "afternoon" in ds["time"].lower():
        sessions = [("afternoon", "Chiều")]
    else:
        sessions = [("morning", "Sáng")]

    slots = []
    for day_id, day_label in day_map:
        for session_id, session_label in sessions:
            for p in range(1, ds["max_periods"] + 1):
                sid = f"{day_id}-{session_id}-{p}"
                slots.append(
                    {
                        "slotId": sid,
                        "dayId": day_id,
                        "dayLabel": day_label,
                        "sessionId": session_id,
                        "sessionLabel": session_label,
                        "period": p,
                    }
                )

    teacher_ids = {}
    subject_ids = {}
    class_ids = {}

    assignments = []
    for idx, a in enumerate(ds["assignments"]):
        teacher_ids.setdefault(a["teacher"], f"T{len(teacher_ids)+1}")
        subject_ids.setdefault(a["subject"], f"S{len(subject_ids)+1}")
        class_ids.setdefault(a["className"], f"C{len(class_ids)+1}")
        assignments.append(
            {
                "assignmentId": f"asg_{idx}",
                "teacherId": teacher_ids[a["teacher"]],
                "teacherLabel": a["teacher"],
                "classId": class_ids[a["className"]],
                "classLabel": a["className"],
                "subjectId": subject_ids[a["subject"]],
                "subjectLabel": a["subject"],
                "weeklyPeriods": int(a["weeklyPeriods"]),
            }
        )

    return {
        "slots": slots,
        "assignments": assignments,
        "aiCompiledConstraints": [],
        "solverConfig": solver_config,
    }


def run_solver(problem):
    start = time.perf_counter()
    proc = subprocess.run(
        [sys.executable, str(RUNNER_PATH)],
        input=json.dumps(problem),
        text=True,
        capture_output=True,
    )
    elapsed_ms = (time.perf_counter() - start) * 1000
    if proc.returncode != 0:
        return {"ok": False, "elapsedMs": elapsed_ms, "error": proc.stderr.strip()}
    try:
        data = json.loads(proc.stdout)
    except Exception as exc:
        return {"ok": False, "elapsedMs": elapsed_ms, "error": f"invalid json: {exc}"}
    return {
        "ok": True,
        "elapsedMs": elapsed_ms,
        "status": data.get("status"),
        "solverStats": data.get("solverStats"),
    }


def adaptive_config(problem):
    complexity = len(problem["slots"]) * len(problem["assignments"])
    workers = 4
    max_time = 20
    if complexity > 1500:
        max_time = 30
    if complexity > 3500:
        max_time = 45
    if complexity > 7000:
        max_time = 60
    return {"maxTimeSeconds": max_time, "numWorkers": workers, "randomSeed": 1}


def main():
    datasets = parse_datasets(DATASETS_PATH)
    rows = []
    for ds in datasets:
        base_problem = build_problem(ds, {"maxTimeSeconds": 30, "numWorkers": 8, "randomSeed": 1})
        legacy = run_solver(base_problem)

        adapt_problem = dict(base_problem)
        adapt_problem["solverConfig"] = adaptive_config(base_problem)
        adaptive = run_solver(adapt_problem)

        rows.append(
            {
                "dataset": ds["id"],
                "complexity": len(base_problem["slots"]) * len(base_problem["assignments"]),
                "legacy": legacy,
                "adaptive": adaptive,
            }
        )

    print(json.dumps({"benchmark": rows}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
