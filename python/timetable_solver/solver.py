from ortools.sat.python import cp_model


def _empty_result(status, message, diagnostics, normalized_constraints=None, solver_stats=None):
    return {
        "status": status,
        "message": message,
        "diagnostics": diagnostics,
        "cells": [],
        "normalizedConstraints": normalized_constraints or {"hard": [], "soft": [], "unparsed": []},
        "solverStats": solver_stats,
    }


def solve_timetable(problem):
    slots = problem.get("slots", [])
    assignments = problem.get("assignments", [])
    constraints = problem.get("constraints", {"hard": [], "soft": [], "unparsed": []})
    config = problem.get("solverConfig", {})

    if not slots:
        return _empty_result("infeasible", "Không có ô tiết nào để xếp lịch.", ["Bạn cần chọn ít nhất một ngày, một buổi và một tiết đang hoạt động."], constraints)

    if not assignments:
        return _empty_result("infeasible", "Chưa có phân công chuyên môn.", ["Bạn cần thêm ít nhất một phân công giáo viên - môn - lớp."], constraints)

    model = cp_model.CpModel()
    variables = {}

    for assignment in assignments:
        for slot in slots:
            key = (assignment["assignmentId"], slot["slotId"])
            variables[key] = model.NewBoolVar(f"x_{assignment['assignmentId']}_{slot['slotId']}")

    for assignment in assignments:
        model.Add(
            sum(variables[(assignment["assignmentId"], slot["slotId"])] for slot in slots)
            == int(assignment["weeklyPeriods"])
        )

    for slot in slots:
        for teacher_id in {assignment["teacherId"] for assignment in assignments}:
            teacher_assignments = [assignment for assignment in assignments if assignment["teacherId"] == teacher_id]
            model.Add(sum(variables[(assignment["assignmentId"], slot["slotId"])] for assignment in teacher_assignments) <= 1)

        for class_id in {assignment["classId"] for assignment in assignments}:
            class_assignments = [assignment for assignment in assignments if assignment["classId"] == class_id]
            model.Add(sum(variables[(assignment["assignmentId"], slot["slotId"])] for assignment in class_assignments) <= 1)

    slot_ids = {slot["slotId"] for slot in slots}
    teacher_ids = {assignment["teacherId"] for assignment in assignments}
    diagnostics = []

    for constraint in constraints.get("hard", []):
        if constraint.get("type") == "teacher_unavailable":
            teacher_id = constraint.get("teacherId")
            unavailable_slots = [slot_id for slot_id in constraint.get("slotIds", []) if slot_id in slot_ids]
            if teacher_id not in teacher_ids:
                diagnostics.append(f"Không tìm thấy giáo viên trong ràng buộc: {teacher_id}")
                continue
            for assignment in assignments:
                if assignment["teacherId"] != teacher_id:
                    continue
                for slot_id in unavailable_slots:
                    model.Add(variables[(assignment["assignmentId"], slot_id)] == 0)

    objective_terms = []
    for constraint in constraints.get("soft", []):
        if constraint.get("type") != "prefer_subject_session":
            continue
        subject_id = constraint.get("subjectId")
        session_ids = set(constraint.get("sessionIds", []))
        weight = int(constraint.get("weight", 5))
        for assignment in assignments:
            if assignment["subjectId"] != subject_id:
                continue
            for slot in slots:
                if slot["sessionId"] in session_ids:
                    objective_terms.append(weight * variables[(assignment["assignmentId"], slot["slotId"])])

    if objective_terms:
        model.Maximize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(config.get("maxTimeSeconds", 20))
    solver.parameters.num_search_workers = int(config.get("numWorkers", 8))
    solver.parameters.random_seed = int(config.get("randomSeed", 1))

    status = solver.Solve(model)
    solver_stats = {
        "wallTimeSeconds": solver.WallTime(),
        "objectiveValue": solver.ObjectiveValue() if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) and objective_terms else None,
        "bestBound": solver.BestObjectiveBound() if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) and objective_terms else None,
        "numConflicts": solver.NumConflicts(),
        "numBranches": solver.NumBranches(),
    }

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        if status == cp_model.UNKNOWN:
            return _empty_result("error", "OR-Tools hết thời gian hoặc chưa tìm được nghiệm.", ["Solver timeout hoặc trạng thái UNKNOWN."], constraints, solver_stats)
        return _empty_result("infeasible", "Không thể xếp thời khóa biểu hợp lệ.", ["OR-Tools xác định bài toán không có nghiệm với các ràng buộc hiện tại."] + diagnostics, constraints, solver_stats)

    cells_by_slot = {
        slot["slotId"]: {
            "slotId": slot["slotId"],
            "dayId": slot["dayId"],
            "sessionId": slot["sessionId"],
            "period": slot["period"],
            "entries": [],
        }
        for slot in slots
    }

    for assignment in assignments:
        for slot in slots:
            if solver.Value(variables[(assignment["assignmentId"], slot["slotId"])]) == 1:
                cells_by_slot[slot["slotId"]]["entries"].append({
                    "assignmentKey": assignment["assignmentId"],
                    "subject": assignment["subjectLabel"],
                    "teacher": assignment["teacherLabel"],
                    "className": assignment["classLabel"],
                })

    output_diagnostics = diagnostics[:]
    for item in constraints.get("unparsed", []):
        output_diagnostics.append(f"Chưa áp dụng ràng buộc chưa parse được: {item.get('text', '')}")

    return {
        "status": "solved",
        "message": "Đã tạo thời khóa biểu hợp lệ bằng OR-Tools.",
        "diagnostics": output_diagnostics,
        "cells": list(cells_by_slot.values()),
        "normalizedConstraints": constraints,
        "solverStats": solver_stats,
    }
