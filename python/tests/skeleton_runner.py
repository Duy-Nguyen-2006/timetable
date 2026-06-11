"""Run solver_skeleton.py in an isolated workspace for pytest."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKELETON = ROOT / "templates" / "solver_skeleton.py"

LEGACY_MARKER = "# <<< AI_FILL_HERE >>>"
SOLVER_ANCHOR = "solver = cp_model.CpSolver()"


def prepare_solver_source(skeleton_text: str, custom_body: str = "pass") -> str:
    if custom_body == "pass":
        return skeleton_text

    for line in skeleton_text.splitlines():
        if line.strip() == LEGACY_MARKER:
            indent = line[: len(line) - len(line.lstrip())]
            injected = "\n".join(indent + ln if ln.strip() else "" for ln in custom_body.splitlines())
            return skeleton_text.replace(line, injected)

    if SOLVER_ANCHOR in skeleton_text:
        block = "\n".join(custom_body.splitlines()) + "\n"
        return skeleton_text.replace(SOLVER_ANCHOR, block + SOLVER_ANCHOR, 1)

    raise AssertionError("No solver injection point found in solver_skeleton.py")


def run_skeleton(
    workspace: Path,
    input_payload: dict,
    custom_body: str = "pass",
    *,
    timeout: int = 60,
    deterministic: bool = False,
) -> dict:
    workspace.mkdir(parents=True, exist_ok=True)
    (workspace / "input.json").write_text(json.dumps(input_payload), encoding="utf-8")

    skeleton = SKELETON.read_text(encoding="utf-8")
    solver_src = prepare_solver_source(skeleton, custom_body)
    (workspace / "solver.py").write_text(solver_src, encoding="utf-8")

    env = os.environ.copy()
    env.setdefault("PYTHONHASHSEED", "0")
    if deterministic:
        env["TT_DETERMINISTIC"] = "1"

    completed = subprocess.run(
        [sys.executable, "solver.py"],
        cwd=str(workspace),
        env=env,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if completed.returncode != 0 and completed.returncode is not None:
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