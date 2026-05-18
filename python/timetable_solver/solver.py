"""Timetable Solver using OR-Tools CP-SAT with AI-compiled constraint execution.

This module implements the new pipeline:
- Base model: x[aid, sid] variables, supply, no-clash teacher/class constraints
- AI-compiled constraints are validated via AST, then exec'd in a sandboxed namespace
- Hard constraints get assumption literals for IIS extraction on infeasibility
- Soft constraints append to objective_terms for Maximize
"""

from ortools.sat.python import cp_model
from timetable_solver.validator import validate_code


# ---------------------------------------------------------------------------
# Helper: Proxy model for assumption-enforced hard constraints
# ---------------------------------------------------------------------------

class _ProxyModel:
    """Wraps a CpModel so that every .Add* call auto-applies OnlyEnforceIf(assume_lit)."""

    __slots__ = ("_model", "_assume")

    def __init__(self, model, assume_lit):
        self._model = model
        self._assume = assume_lit

    # Methods that should be wrapped with OnlyEnforceIf
    _WRAP_METHODS = {
        "Add", "AddBoolOr", "AddBoolAnd", "AddImplication",
        "AddAllowedAssignments", "AddForbiddenAssignments",
        "AddLinearConstraint", "AddExactlyOne", "AddAtLeastOne",
        "AddAtMostOne", "AddMaxEquality", "AddMinEquality",
        "AddAbsEquality", "AddElement",
    }

    def __getattr__(self, name):
        attr = getattr(self._model, name)
        if name in self._WRAP_METHODS:
            def wrapped(*args, **kwargs):
                ct = attr(*args, **kwargs)
                try:
                    ct.OnlyEnforceIf(self._assume)
                except Exception as e:
                    import sys
                    print(f"[solver] Warning: OnlyEnforceIf failed for {name}: {e}", file=sys.stderr)
                return ct
            return wrapped
        return attr  # NewBoolVar, NewIntVar, Maximize, Minimize → pass-through


# ---------------------------------------------------------------------------
# Helper: build stats dict
# ---------------------------------------------------------------------------

def _stats(solver, objective_terms):
    has_obj = bool(objective_terms)

    return {
        "wallTimeSeconds": solver.WallTime(),
        "objectiveValue": solver.ObjectiveValue() if has_obj else None,
        "bestBound": solver.BestObjectiveBound() if has_obj else None,
        "numConflicts": solver.NumConflicts(),
        "numBranches": solver.NumBranches(),
    }


# ---------------------------------------------------------------------------
# Helper: empty result builder
# ---------------------------------------------------------------------------

def _empty_result(status, message, diagnostics,
                  execution_errors=None, validation_errors=None,
                  iis_constraint_ids=None, solver_stats=None):
    return {
        "status": status,
        "message": message,
        "diagnostics": diagnostics,
        "cells": [],
        "iisConstraintIds": iis_constraint_ids or [],
        "executionErrors": execution_errors or [],
        "validationErrors": validation_errors or [],
        "solverStats": solver_stats,
    }


# ---------------------------------------------------------------------------
# Main solver
# ---------------------------------------------------------------------------

def solve_timetable(problem):
    slots = problem.get("slots", [])
    assignments = problem.get("assignments", [])
    ai_constraints = problem.get("aiCompiledConstraints", [])
    config = problem.get("solverConfig", {})

    if not slots:
        return _empty_result(
            "infeasible",
            "Không có ô tiết nào để xếp lịch.",
            ["Bạn cần chọn ít nhất một ngày, một buổi và một tiết đang hoạt động."]
        )

    if not assignments:
        return _empty_result(
            "infeasible",
            "Chưa có phân công chuyên môn.",
            ["Bạn cần thêm ít nhất một phân công giáo viên - môn - lớp."]
        )

    # === Build model and decision variables ===
    model = cp_model.CpModel()
    x = {
        (a["assignmentId"], s["slotId"]): model.NewBoolVar(f"x_{a['assignmentId']}_{s['slotId']}")
        for a in assignments for s in slots
    }

    objective_terms = []

    # === Precompute unique teacher/class groupings (compute once, not per slot) ===
    unique_teacher_ids = {a["teacherId"] for a in assignments}
    teacher_assigns_map = {
        tid: [a for a in assignments if a["teacherId"] == tid]
        for tid in unique_teacher_ids
    }
    unique_class_ids = {a["classId"] for a in assignments}
    class_assigns_map = {
        cid: [a for a in assignments if a["classId"] == cid]
        for cid in unique_class_ids
    }

    # === Base constraint 1: weekly_periods per assignment ===
    for a in assignments:
        model.Add(
            sum(x[(a["assignmentId"], s["slotId"])] for s in slots)
            == int(a["weeklyPeriods"])
        )

    # === Base constraint 2: no-clash teacher ===
    for s in slots:
        for teacher_id in unique_teacher_ids:
            model.Add(
                sum(x[(a["assignmentId"], s["slotId"])] for a in teacher_assigns_map[teacher_id]) <= 1
            )

    # === Base constraint 3: no-clash class ===
    for s in slots:
        for class_id in unique_class_ids:
            model.Add(
                sum(x[(a["assignmentId"], s["slotId"])] for a in class_assigns_map[class_id]) <= 1
            )

    # === Apply AI-compiled constraints ===
    assumption_map = {}       # assumption_literal.Index() -> constraint_id
    execution_errors = []
    validation_errors = []
    diagnostics = []

    namespace_builtins = {
        "sum": sum, "len": len, "range": range, "zip": zip,
        "sorted": sorted, "set": set, "list": list, "dict": dict,
        "tuple": tuple, "any": any, "all": all, "min": min, "max": max,
        "int": int, "bool": bool, "str": str, "enumerate": enumerate,
        "True": True, "False": False, "None": None,
        "abs": abs, "map": map, "filter": filter, "round": round,
    }

    for c in ai_constraints:
        cid = c.get("id", "unknown")
        code = c.get("code", "")
        priority = c.get("priority", "hard")

        if not code.strip():
            diagnostics.append(f"Constraint {cid}: empty code, skipped.")
            continue

        # 1. Validate AST
        ok, err = validate_code(code)
        if not ok:
            validation_errors.append({"constraintId": cid, "error": err})
            continue

        # 2. Build namespace and exec
        if priority == "hard":
            # Create assumption literal for IIS extraction
            assume_lit = model.NewBoolVar(f"assume_{cid}")
            assumption_map[assume_lit.Index()] = cid

            # Use proxy model that auto-applies OnlyEnforceIf
            proxy = _ProxyModel(model, assume_lit)
            ns = {
                "model": proxy,
                "x": x,
                "assignments": assignments,
                "slots": slots,
                "objective_terms": objective_terms,
                "__builtins__": namespace_builtins,
            }
            try:
                exec(compile(code, f"<{cid}>", "exec"), ns, ns)
            except Exception as e:
                execution_errors.append({
                    "constraintId": cid,
                    "error": f"{type(e).__name__}: {e}"
                })
                # Remove assumption from map since this constraint failed
                if assume_lit.Index() in assumption_map:
                    del assumption_map[assume_lit.Index()]
                continue
            model.AddAssumption(assume_lit)
        else:  # soft
            ns = {
                "model": model,
                "x": x,
                "assignments": assignments,
                "slots": slots,
                "objective_terms": objective_terms,
                "__builtins__": namespace_builtins,
            }
            try:
                exec(compile(code, f"<{cid}>", "exec"), ns, ns)
            except Exception as e:
                execution_errors.append({
                    "constraintId": cid,
                    "error": f"{type(e).__name__}: {e}"
                })

    # === Set objective ===
    if objective_terms:
        model.Maximize(sum(objective_terms))

    # === Solve ===
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(config.get("maxTimeSeconds", 20))
    solver.parameters.num_search_workers = int(config.get("numWorkers", 8))
    solver.parameters.random_seed = int(config.get("randomSeed", 1))

    status = solver.Solve(model)

    # === Handle infeasible ===
    if status == cp_model.INFEASIBLE:
        iis_constraint_ids = []
        try:
            assumption_indices = solver.SufficientAssumptionsForInfeasibility()
            iis_constraint_ids = [
                assumption_map[i] for i in assumption_indices if i in assumption_map
            ]
        except Exception:
            pass
        return _empty_result(
            "infeasible",
            "Không thể xếp thời khóa biểu hợp lệ.",
            ["OR-Tools xác định bài toán không có nghiệm với các ràng buộc hiện tại."] + diagnostics,
            execution_errors=execution_errors,
            validation_errors=validation_errors,
            iis_constraint_ids=iis_constraint_ids,
            solver_stats=_stats(solver, objective_terms),
        )

    # === Handle unknown/timeout ===
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return _empty_result(
            "error",
            "OR-Tools hết thời gian hoặc chưa tìm được nghiệm.",
            ["Solver timeout hoặc trạng thái UNKNOWN."] + diagnostics,
            execution_errors=execution_errors,
            validation_errors=validation_errors,
            solver_stats=_stats(solver, objective_terms),
        )

    # === Build cells ===
    cells_by_slot = {
        s["slotId"]: {
            "slotId": s["slotId"],
            "dayId": s["dayId"],
            "sessionId": s["sessionId"],
            "period": s["period"],
            "entries": [],
        }
        for s in slots
    }

    for a in assignments:
        for s in slots:
            if solver.Value(x[(a["assignmentId"], s["slotId"])]) == 1:
                cells_by_slot[s["slotId"]]["entries"].append({
                    "assignmentKey": a["assignmentId"],
                    "subject": a["subjectLabel"],
                    "teacher": a["teacherLabel"],
                    "className": a["classLabel"],
                })

    return {
        "status": "solved",
        "message": "Đã tạo thời khóa biểu hợp lệ.",
        "diagnostics": diagnostics,
        "cells": list(cells_by_slot.values()),
        "iisConstraintIds": [],
        "executionErrors": execution_errors,
        "validationErrors": validation_errors,
        "solverStats": _stats(solver, objective_terms),
    }
