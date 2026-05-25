import importlib.util
import json
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from timetable_solver.template_solver import solve_timetable as default_solve_timetable


def _load_solver_entrypoint(artifact_path: str | None, entrypoint: str | None):
    if not artifact_path:
        return default_solve_timetable, None

    path = Path(artifact_path)
    if not path.exists():
        raise FileNotFoundError(f"Generated solver artifact not found: {artifact_path}")

    spec = importlib.util.spec_from_file_location("generated_timetable_solver", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load generated solver module from {artifact_path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    fn_name = entrypoint or "solve_timetable"
    solve_fn = getattr(module, fn_name, None)
    if solve_fn is None:
        raise AttributeError(f"Entrypoint '{fn_name}' not found in {artifact_path}")
    return solve_fn, str(path)


def main():
    try:
        raw_input = sys.stdin.read()
        request = json.loads(raw_input)
        problem = request.get("problem", request)
        artifact_path = request.get("solverArtifactPath")
        entrypoint = request.get("entrypoint")

        solve_fn, loaded_artifact_path = _load_solver_entrypoint(artifact_path, entrypoint)
        result = solve_fn(problem)
        if isinstance(result, dict) and loaded_artifact_path:
            result.setdefault("artifactPath", loaded_artifact_path)
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
            "violations": [],
            "solverStats": None,
            "artifactPath": None,
            "loadError": str(exc),
            "runtimeError": traceback.format_exc(),
        }, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
