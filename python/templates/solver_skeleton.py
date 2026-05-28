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

    def _build_condition_literal(condition):
        op = condition.get("op") if isinstance(condition, dict) else None
        lit = model.NewBoolVar(f"if_then_cond_{abs(hash(str(condition))) % 100000000}")

        if op == "teacher_teaches_on_day":
            teacher = condition.get("teacher")
            day = condition.get("day")
            day_slots = [
                slots[(a["id"], day, p)]
                for a in assignments
                if a["teacher"] == teacher
                for p in _periods_for(day)
            ]
            if day_slots:
                model.Add(sum(day_slots) >= 1).OnlyEnforceIf(lit)
                model.Add(sum(day_slots) == 0).OnlyEnforceIf(lit.Not())
            else:
                model.Add(lit == 0)
            return lit

        if op == "teacher_teaches_at_slot":
            teacher = condition.get("teacher")
            day = condition.get("day")
            period = int(condition.get("period"))
            slot_vars = [
                slots[(a["id"], day, period)]
                for a in assignments
                if a["teacher"] == teacher and period in _periods_for(day)
            ]
            if slot_vars:
                model.Add(sum(slot_vars) >= 1).OnlyEnforceIf(lit)
                model.Add(sum(slot_vars) == 0).OnlyEnforceIf(lit.Not())
            else:
                model.Add(lit == 0)
            return lit

        if op == "and":
            args = [_build_condition_literal(arg) for arg in condition.get("args", [])]
            if not args:
                model.Add(lit == 0)
                return lit
            for arg in args:
                model.Add(lit <= arg)
            model.Add(lit >= sum(args) - len(args) + 1)
            return lit

        if op == "or":
            args = [_build_condition_literal(arg) for arg in condition.get("args", [])]
            if not args:
                model.Add(lit == 0)
                return lit
            for arg in args:
                model.Add(lit >= arg)
            model.Add(lit <= sum(args))
            return lit

        if op == "not":
            arg = _build_condition_literal(condition.get("arg", {}))
            model.Add(lit + arg == 1)
            return lit

        model.Add(lit == 0)
        return lit

    def _add_subject_consecutive(spec, guard=None):
        params = spec.get("params", {})
        subj = params.get("subject")
        length = int(params.get("length", 2) or 2)
        if length <= 1:
            return
        target_classes = set(params.get("classes") or data["classes"])
        for a in assignments:
            if a["subject"] != subj or a["class"] not in target_classes:
                continue
            # Rule A: require only floor(weeklyPeriods / length) consecutive blocks.
            # Any remainder (weeklyPeriods % length) may be scheduled as loose periods;
            # do not require every subject period to belong to a consecutive block.
            required_runs = int(a.get("weeklyPeriods", 0)) // length
            if required_runs <= 0:
                continue
            run_vars = []
            for d in days:
                day_periods = _periods_for(d)
                for i in range(0, max(0, len(day_periods) - length + 1)):
                    window = day_periods[i:i + length]
                    if len(window) != length or any(window[k + 1] != window[k] + 1 for k in range(len(window) - 1)):
                        continue
                    run = model.NewBoolVar(f"run_{a['id']}_{d}_{window[0]}_{length}")
                    window_vars = [slots[(a["id"], d, p)] for p in window]
                    for var in window_vars:
                        model.Add(run <= var)
                    model.Add(run >= sum(window_vars) - length + 1)
                    run_vars.append(run)
            if run_vars:
                ct = model.Add(sum(run_vars) >= required_runs)
                if guard is not None:
                    ct.OnlyEnforceIf(guard)

    def _apply_then_constraint(then_spec, guard):
        kind = then_spec.get("kind")
        params = then_spec.get("params", {})

        if kind == "teacher_block_day":
            t = params.get("teacher")
            d = params.get("day")
            for a in assignments:
                if a["teacher"] == t:
                    for p in _periods_for(d):
                        model.Add(slots[(a["id"], d, p)] == 0).OnlyEnforceIf(guard)

        elif kind == "teacher_block_period":
            t = params.get("teacher")
            p = int(params.get("period"))
            for a in assignments:
                if a["teacher"] == t:
                    for d in days:
                        if p in _periods_for(d):
                            model.Add(slots[(a["id"], d, p)] == 0).OnlyEnforceIf(guard)

        elif kind == "teacher_block_slot":
            t = params.get("teacher")
            d = params.get("day")
            p = int(params.get("period"))
            if p in _periods_for(d):
                for a in assignments:
                    if a["teacher"] == t:
                        model.Add(slots[(a["id"], d, p)] == 0).OnlyEnforceIf(guard)

        elif kind == "teacher_max_per_day":
            t = params.get("teacher")
            n = int(params.get("maxPerDay"))
            teacher_asgs = [a for a in assignments if a["teacher"] == t]
            for d in days:
                model.Add(
                    sum(slots[(a["id"], d, p)] for a in teacher_asgs for p in _periods_for(d)) <= n
                ).OnlyEnforceIf(guard)

        elif kind == "subject_pin_period":
            subj = params.get("subject")
            allowed = set(int(x) for x in params.get("periods", []))
            target_classes = set(params.get("classes") or data["classes"])
            for a in assignments:
                if a["subject"] == subj and a["class"] in target_classes:
                    for d in days:
                        for p in _periods_for(d):
                            if p not in allowed:
                                model.Add(slots[(a["id"], d, p)] == 0).OnlyEnforceIf(guard)

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
                ).OnlyEnforceIf(guard)

        elif kind == "pair_not_same_slot":
            teachers = params.get("teachers", [])
            if len(teachers) != 2:
                return
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
                    ).OnlyEnforceIf(guard)

        elif kind == "subject_consecutive":
            _add_subject_consecutive(then_spec, guard)

        else:
            raise NotImplementedError(f"Unsupported if_then then kind: {kind}")

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
            _add_subject_consecutive(spec)

        elif kind == "if_then":
            condition = params.get("if")
            then_specs = params.get("then", [])
            if condition and isinstance(then_specs, list):
                guard = _build_condition_literal(condition)
                for then_spec in then_specs:
                    if isinstance(then_spec, dict):
                        _apply_then_constraint(then_spec, guard)

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