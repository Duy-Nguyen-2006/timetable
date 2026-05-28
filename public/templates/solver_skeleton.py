import json
from ortools.sat.python import cp_model

with open("input.json", encoding="utf-8") as f:
    data = json.load(f)

classes = data["classes"]
days = data["days"]
periods = data["periods"]
periods_by_day = data.get("periodsByDay") or {}
assignments = data["assignments"]
constraints = data["constraints"]

model = cp_model.CpModel()


def periods_for_day(day_id):
    day_periods = periods_by_day.get(day_id)
    if isinstance(day_periods, list) and day_periods:
        return day_periods
    return periods


slots = {}
for a in assignments:
    for d in days:
        for p in periods_for_day(d):
            slots[(a["id"], d, p)] = model.NewBoolVar(f"x_{a['id']}_{d}_{p}")

# Mỗi assignment đúng weeklyPeriods
for a in assignments:
    model.Add(
        sum(slots[(a["id"], d, p)] for d in days for p in periods_for_day(d))
        == a["weeklyPeriods"]
    )

# Mỗi class/day/period tối đa 1 assignment
for c in classes:
    for d in days:
        for p in periods_for_day(d):
            model.Add(sum(slots[(a["id"], d, p)] for a in assignments if a["class"] == c) <= 1)

# Mỗi teacher/day/period tối đa 1 assignment
teachers = list({a["teacher"] for a in assignments})
for t in teachers:
    for d in days:
        for p in periods_for_day(d):
            model.Add(sum(slots[(a["id"], d, p)] for a in assignments if a["teacher"] == t) <= 1)


def build_custom_constraints(model, slots, data):
    assignments = data["assignments"]
    days = data["days"]
    periods = data["periods"]
    periods_by_day = data.get("periodsByDay") or {}
    constraints = data["constraints"]

    def _periods_for(d):
        day_periods = periods_by_day.get(d)
        if isinstance(day_periods, list) and day_periods:
            return day_periods
        return periods

    for spec in constraints:
        kind = spec.get("kind")
        params = spec.get("params", {})
        severity = spec.get("severity", "hard")

        if severity != "hard":
            continue

        if kind == "weekly_periods_exact":
            continue

        elif kind == "teacher_block_day":
            t = params.get("teacher")
            d = params.get("day")
            for a in assignments:
                if a["teacher"] == t:
                    for p in _periods_for(d):
                        model.Add(slots[(a["id"], d, p)] == 0)

        elif kind == "teacher_block_period":
            t = params.get("teacher")
            p = int(params.get("period"))
            for a in assignments:
                if a["teacher"] == t:
                    for d in days:
                        if p in _periods_for(d):
                            model.Add(slots[(a["id"], d, p)] == 0)

        elif kind == "teacher_block_slot":
            t = params.get("teacher")
            d = params.get("day")
            p = int(params.get("period"))
            if p in _periods_for(d):
                for a in assignments:
                    if a["teacher"] == t:
                        model.Add(slots[(a["id"], d, p)] == 0)

        elif kind == "teacher_max_per_day":
            t = params.get("teacher")
            n = int(params.get("maxPerDay"))
            teacher_asgs = [a for a in assignments if a["teacher"] == t]
            for d in days:
                model.Add(
                    sum(slots[(a["id"], d, p)] for a in teacher_asgs for p in _periods_for(d)) <= n
                )

        elif kind == "teacher_max_consecutive":
            t = params.get("teacher")
            n = int(params.get("maxConsecutive"))
            if n <= 0:
                # n=0 hoặc âm => teacher không được dạy 2 tiết liên tiếp nào;
                # với n=0 đặc biệt, không có window length nào hợp lệ,
                # bỏ qua để tránh tạo ràng buộc vô nghĩa. (fix bug #16)
                continue
            teacher_asgs = [a for a in assignments if a["teacher"] == t]
            for d in days:
                day_periods = _periods_for(d)
                # window length = n + 1, slide trên day_periods. Cần
                # range(len - n) >= 0; bảo vệ khi day_periods quá ngắn.
                if len(day_periods) <= n:
                    continue
                for i in range(len(day_periods) - n):
                    window = day_periods[i:i + n + 1]
                    if any(window[k + 1] != window[k] + 1 for k in range(len(window) - 1)):
                        continue
                    model.Add(
                        sum(slots[(a["id"], d, p)] for a in teacher_asgs for p in window) <= n
                    )

        elif kind == "subject_pin_period":
            subj = params.get("subject")
            allowed = set(int(x) for x in params.get("periods", []))
            target_classes = set(params.get("classes") or data["classes"])
            for a in assignments:
                if a["subject"] == subj and a["class"] in target_classes:
                    for d in days:
                        for p in _periods_for(d):
                            if p not in allowed:
                                model.Add(slots[(a["id"], d, p)] == 0)

        elif kind == "class_no_double_subject_day":
            cls = params.get("class")
            subj = params.get("subject")
            asgs = [
                a for a in assignments
                if a["class"] == cls and (subj is None or a["subject"] == subj)
            ]
            for d in days:
                model.Add(
                    sum(slots[(a["id"], d, p)] for a in asgs for p in _periods_for(d)) <= 1
                )

        elif kind == "pair_not_same_slot":
            teachers = params.get("teachers", [])
            if len(teachers) != 2:
                raise NotImplementedError(f"Invalid pair_not_same_slot: {spec.get('id')}")
            t1, t2 = teachers
            scope_day = (params.get("scope") or {}).get("day")
            days_to_check = [scope_day] if scope_day else days
            asgs1 = [a for a in assignments if a["teacher"] == t1]
            asgs2 = [a for a in assignments if a["teacher"] == t2]

            for d in days_to_check:
                for p in _periods_for(d):
                    model.Add(
                        sum(slots[(a["id"], d, p)] for a in asgs1) +
                        sum(slots[(a["id"], d, p)] for a in asgs2)
                        <= 1
                    )

        elif kind == "subject_consecutive":
            # Để deterministic-validator + repair LLM xử lý ở post-solve.
            # Hằng số ràng buộc liên tiếp không đưa vào CP-SAT để tránh
            # NotImplementedError crash trước cả khi có solution. (fix bug #17)
            continue

        elif kind == "if_then":
            # Tương tự subject_consecutive: condition phụ thuộc vào nghiệm,
            # check ở post-solve thay vì gài cứng vào model. (fix bug #17)
            continue

        elif kind == "custom_dsl":
            # AI-generated custom code phía dưới, chạy MỘT LẦN cho tất cả
            # custom_dsl specs (không lặp lại per-spec). (fix bug #5)
            continue

        else:
            # Skip thay vì raise để repair LLM có thể vẫn chạy. Validator sẽ
            # ghi nhận violation và force repair.
            continue

    # === AI custom_dsl injection (chạy đúng 1 lần, ngoài vòng for spec) ===
    # Skeleton không tự guard bằng custom_specs: coder prompt đã filter custom_dsl,
    # nên để generated code tự quyết định no-op khi không có custom hard specs.
    custom_specs = [s for s in constraints if s.get("kind") == "custom_dsl" and s.get("severity", "hard") == "hard"]
    # <<< AI_FILL_HERE >>>
    pass


build_custom_constraints(model, slots, data)

solver = cp_model.CpSolver()
# Thời gian giải có thể override qua env SOLVER_MAX_SECONDS để khớp với
# timeoutMs phía Node (fix bug #29).
import os as _os
try:
    _max_seconds = float(_os.environ.get("SOLVER_MAX_SECONDS", "") or 60.0)
except Exception:
    _max_seconds = 60.0
solver.parameters.max_time_in_seconds = _max_seconds
status = solver.Solve(model)

result = {
    "classes": classes,
    "days": days,
    "periods": periods,
    "assignments": assignments,
    "status": solver.StatusName(status).lower(),
    "schedule": [],
}

if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
    for a in assignments:
        for d in days:
            for p in periods_for_day(d):
                if solver.Value(slots[(a["id"], d, p)]) == 1:
                    result["schedule"].append(
                        {
                            "assignmentId": a["id"],
                            "class": a["class"],
                            "day": d,
                            "period": p,
                            "subject": a["subject"],
                            "teacher": a["teacher"],
                        }
                    )
    with open("result.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    print("SOLUTION_FOUND")
else:
    with open("result.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    print(f"NO_SOLUTION:{solver.StatusName(status)}")