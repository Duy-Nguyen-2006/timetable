"""Base OR-Tools timetable solver template for agent-authored generated solvers.

This file provides deterministic base helpers and a stable result schema.
Generated solver artifacts can import from this module to reduce repeated code.
"""

from __future__ import annotations

from ortools.sat.python import cp_model


RESULT_STATUS = {
    "solved": "solved",
    "infeasible": "infeasible",
    "error": "error",
}


SAFE_BUILTINS = {
    "sum": sum,
    "len": len,
    "range": range,
    "zip": zip,
    "sorted": sorted,
    "set": set,
    "list": list,
    "dict": dict,
    "tuple": tuple,
    "any": any,
    "all": all,
    "min": min,
    "max": max,
    "int": int,
    "bool": bool,
    "str": str,
    "enumerate": enumerate,
    "True": True,
    "False": False,
    "None": None,
    "abs": abs,
    "map": map,
    "filter": filter,
    "round": round,
}


def build_empty_result(
    status,
    message,
    diagnostics,
    *,
    cells=None,
    iis_constraint_ids=None,
    execution_errors=None,
    validation_errors=None,
    violations=None,
    solver_stats=None,
):
    return {
        "status": status,
        "message": message,
        "diagnostics": diagnostics,
        "cells": cells or [],
        "iisConstraintIds": iis_constraint_ids or [],
        "executionErrors": execution_errors or [],
        "validationErrors": validation_errors or [],
        "violations": violations or [],
        "solverStats": solver_stats,
    }


def build_solver_stats(solver, has_objective=False):
    return {
        "wallTimeSeconds": solver.WallTime(),
        "objectiveValue": solver.ObjectiveValue() if has_objective else None,
        "bestBound": solver.BestObjectiveBound() if has_objective else None,
        "numConflicts": solver.NumConflicts(),
        "numBranches": solver.NumBranches(),
    }


def normalize_problem(problem):
    slots = problem.get("slots", [])
    assignments = problem.get("assignments", [])
    solver_config = problem.get("solverConfig", {})
    return slots, assignments, solver_config


def create_base_model(problem):
    slots, assignments, solver_config = normalize_problem(problem)
    model = cp_model.CpModel()
    x = {
        (a["assignmentId"], s["slotId"]): model.NewBoolVar(f"x_{a['assignmentId']}_{s['slotId']}")
        for a in assignments
        for s in slots
    }

    unique_teacher_ids = {a["teacherId"] for a in assignments}
    unique_class_ids = {a["classId"] for a in assignments}

    teacher_assigns_map = {
        tid: [a for a in assignments if a["teacherId"] == tid]
        for tid in unique_teacher_ids
    }
    class_assigns_map = {
        cid: [a for a in assignments if a["classId"] == cid]
        for cid in unique_class_ids
    }

    for a in assignments:
        model.Add(sum(x[(a["assignmentId"], s["slotId"])] for s in slots) == int(a["weeklyPeriods"]))

    for s in slots:
        for teacher_id in unique_teacher_ids:
            model.Add(sum(x[(a["assignmentId"], s["slotId"])] for a in teacher_assigns_map[teacher_id]) <= 1)
        for class_id in unique_class_ids:
            model.Add(sum(x[(a["assignmentId"], s["slotId"])] for a in class_assigns_map[class_id]) <= 1)

    return {
        "model": model,
        "x": x,
        "slots": slots,
        "assignments": assignments,
        "solverConfig": solver_config,
        "teacherAssignsMap": teacher_assigns_map,
        "classAssignsMap": class_assigns_map,
    }


def solve_base_model(problem, extra_setup=None):
    slots, assignments, solver_config = normalize_problem(problem)
    max_time_seconds = float(solver_config.get("maxTimeSeconds", 20))
    if max_time_seconds < 5:
        raise ValueError("solverConfig.maxTimeSeconds must be at least 5 for debuggable CP-SAT runs.")

    if not slots:
        return build_empty_result(
            RESULT_STATUS["infeasible"],
            "Không có ô tiết nào để xếp lịch.",
            ["Bạn cần chọn ít nhất một ngày, một buổi và một tiết đang hoạt động."],
        )

    if not assignments:
        return build_empty_result(
            RESULT_STATUS["infeasible"],
            "Chưa có phân công chuyên môn.",
            ["Bạn cần thêm ít nhất một phân công giáo viên - môn - lớp."],
        )

    base = create_base_model(problem)
    model = base["model"]
    x = base["x"]
    diagnostics = []
    objective_terms = []

    # Create assumption literals for each user hard constraint (enables IIS extraction).
    # Coder should use model.Add(...).OnlyEnforceIf(lit) so these are tracked properly.
    hard_constraints = problem.get("hardConstraints", [])
    hard_constraint_literals = {}
    for hc in hard_constraints:
        lit = model.NewBoolVar(f"hc_assume_{hc['id']}")
        hard_constraint_literals[hc["id"]] = lit
    base["hardConstraintLiterals"] = hard_constraint_literals

    if extra_setup is not None:
        extra_setup(base, objective_terms, diagnostics)

    # Assume all user hard constraint literals are True so solver enforces them.
    # When INFEASIBLE, SufficientAssumptionsForInfeasibility() identifies the culprits.
    if hard_constraint_literals:
        model.AddAssumptions(list(hard_constraint_literals.values()))

    if objective_terms:
        model.Maximize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max_time_seconds
    solver.parameters.num_search_workers = min(max(int(solver_config.get("numWorkers", 4)), 1), 4)
    solver.parameters.random_seed = int(solver_config.get("randomSeed", 1))

    status = solver.Solve(model)
    has_objective = bool(objective_terms)

    if status == cp_model.INFEASIBLE:
        # Extract IIS: map assumption literal indices back to user constraint IDs.
        lit_index_to_id = {lit.Index(): hc_id for hc_id, lit in hard_constraint_literals.items()}
        iis_lits = solver.SufficientAssumptionsForInfeasibility()
        iis_ids = [lit_index_to_id[l] for l in iis_lits if l in lit_index_to_id]
        return build_empty_result(
            RESULT_STATUS["infeasible"],
            "Không thể xếp thời khóa biểu hợp lệ.",
            ["OR-Tools xác định bài toán không có nghiệm với các ràng buộc hiện tại."] + diagnostics,
            iis_constraint_ids=iis_ids,
            solver_stats=build_solver_stats(solver, has_objective=has_objective),
        )

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return build_empty_result(
            RESULT_STATUS["error"],
            "Solver không trả về nghiệm khả dụng.",
            diagnostics + [f"Solver status={status}"],
            solver_stats=build_solver_stats(solver, has_objective=has_objective),
        )

    cells = []
    for s in slots:
        entries = []
        for a in assignments:
            if solver.Value(x[(a["assignmentId"], s["slotId"])]) == 1:
                entries.append(
                    {
                        "assignmentKey": a["assignmentId"],
                        "subject": a["subjectLabel"],
                        "teacher": a["teacherLabel"],
                        "className": a["classLabel"],
                    }
                )
        cells.append(
            {
                "slotId": s["slotId"],
                "dayId": s["dayId"],
                "sessionId": s["sessionId"],
                "period": s["period"],
                "entries": entries,
            }
        )

    return {
        "status": RESULT_STATUS["solved"],
        "message": "Đã tạo thời khóa biểu hợp lệ.",
        "diagnostics": diagnostics,
        "cells": cells,
        "iisConstraintIds": [],
        "executionErrors": [],
        "validationErrors": [],
        "violations": [],
        "solverStats": build_solver_stats(solver, has_objective=has_objective),
    }
