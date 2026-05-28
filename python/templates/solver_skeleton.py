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
            teacher_asgs = [a for a in assignments if a["teacher"] == t]
            for d in days:
                day_periods = _periods_for(d)
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
            raise NotImplementedError(
                f"subject_consecutive registry chưa implement an toàn: {spec.get('id')}"
            )

        elif kind == "if_then":
            raise NotImplementedError(
                f"if_then registry chưa implement an toàn: {spec.get('id')}"
            )

        elif kind == "custom_dsl":
            # <<< AI_FILL_HERE >>>
            pass

        else:
            raise NotImplementedError(f"Unsupported constraint kind: {kind}")


build_custom_constraints(model, slots, data)

solver = cp_model.CpSolver()
solver.parameters.max_time_in_seconds = 60.0
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
