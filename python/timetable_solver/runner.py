import json
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from timetable_solver.solver import solve_timetable


def main():
    try:
        raw_input = sys.stdin.read()
        problem = json.loads(raw_input)
        result = solve_timetable(problem)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({
            "status": "error",
            "message": "Python OR-Tools runner bị lỗi.",
            "diagnostics": [str(exc), traceback.format_exc()],
            "cells": [],
            "iisConstraintIds": [],
            "executionErrors": [],
            "validationErrors": [],
            "solverStats": None,
        }, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
