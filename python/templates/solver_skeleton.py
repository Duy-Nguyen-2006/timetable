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
    # <<< AI_FILL_HERE >>>


build_custom_constraints(model, slots, data)

solver = cp_model.CpSolver()
solver.parameters.max_time_in_seconds = 60.0
status = solver.Solve(model)

result = {
    "classes": classes,
    "days": days,
    "periods": periods,
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
