import json
import os as _os
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


def is_slot_allowed(assignment, day, period, constraint_specs):
    for spec in constraint_specs:
        if spec.get("severity", "hard") != "hard":
            continue
        kind = spec.get("kind")
        params = spec.get("params", {}) or {}

        if kind == "teacher_block_day" and assignment.get("teacher") == params.get("teacher") and day == params.get("day"):
            return False
        if kind == "teacher_block_period" and assignment.get("teacher") == params.get("teacher") and period == int(params.get("period", -1)):
            return False
        if kind == "teacher_block_slot" and assignment.get("teacher") == params.get("teacher") and day == params.get("day") and period == int(params.get("period", -1)):
            return False
        if kind == "teacher_allowed_days" and assignment.get("teacher") == params.get("teacher"):
            allowed_days = set(params.get("days") or [])
            if allowed_days and day not in allowed_days:
                return False
        if kind == "teacher_allowed_periods" and assignment.get("teacher") == params.get("teacher"):
            allowed_periods = {int(x) for x in (params.get("periods") or [])}
            if allowed_periods and period not in allowed_periods:
                return False
        if kind == "class_block_day" and assignment.get("class") == params.get("class") and day == params.get("day"):
            return False
        if kind == "class_block_period" and assignment.get("class") == params.get("class") and period == int(params.get("period", -1)):
            return False
        if kind == "class_block_slot" and assignment.get("class") == params.get("class") and day == params.get("day") and period == int(params.get("period", -1)):
            return False
        if kind == "subject_allowed_days" and assignment.get("subject") == params.get("subject"):
            allowed_days = set(params.get("days") or [])
            if allowed_days and day not in allowed_days:
                return False
        if kind == "subject_pin_period" and assignment.get("subject") == params.get("subject"):
            target_classes = set(params.get("classes") or classes)
            allowed_periods = {int(x) for x in (params.get("periods") or [])}
            if assignment.get("class") in target_classes and allowed_periods and period not in allowed_periods:
                return False
        if kind == "assignment_block_slot" and assignment.get("id") == params.get("assignmentId") and day == params.get("day") and period == int(params.get("period", -1)):
            return False
        if kind == "assignment_pin_slot" and assignment.get("id") == params.get("assignmentId"):
            if day != params.get("day") or period != int(params.get("period", -1)):
                return False
        if kind == "assignment_allowed_slots" and assignment.get("id") == params.get("assignmentId"):
            allowed_slots = {
                (item.get("day"), int(item.get("period", -1)))
                for item in (params.get("slots") or [])
                if isinstance(item, dict)
            }
            if allowed_slots and (day, period) not in allowed_slots:
                return False
        if kind == "subject_flag_ceremony_slot" and day == params.get("day") and period == int(params.get("period", -1)):
            return False
    return True


slots = {}
for a in assignments:
    for d in days:
        for p in periods_for_day(d):
            if is_slot_allowed(a, d, p, constraints):
                slots[(a["id"], d, p)] = model.NewBoolVar(f"x_{a['id']}_{d}_{p}")


def _slot_var(a, d, p):
    return slots.get((a["id"], d, p))


# Mỗi assignment đúng weeklyPeriods
for a in assignments:
    model.Add(
        sum(_slot_var(a, d, p) for d in days for p in periods_for_day(d) if (a["id"], d, p) in slots)
        == a["weeklyPeriods"]
    )

# Mỗi class/day/period tối đa 1 assignment
for c in classes:
    for d in days:
        for p in periods_for_day(d):
            model.Add(sum(_slot_var(a, d, p) for a in assignments if a["class"] == c and (a["id"], d, p) in slots) <= 1)

# Mỗi teacher/day/period tối đa 1 assignment
teachers = list({a["teacher"] for a in assignments})
for t in teachers:
    for d in days:
        for p in periods_for_day(d):
            model.Add(sum(_slot_var(a, d, p) for a in assignments if a["teacher"] == t and (a["id"], d, p) in slots) <= 1)


def build_custom_constraints(model, slots, data):
    assignments = data["assignments"]
    days = data["days"]
    periods = data["periods"]
    periods_by_day = data.get("periodsByDay") or {}
    constraints = data["constraints"]

    soft_terms = []
    unsupported_soft_kinds = []

    def _periods_for(d):
        day_periods = periods_by_day.get(d)
        if isinstance(day_periods, list) and day_periods:
            return day_periods
        return periods

    def _slot_var(a, d, p):
        return slots.get((a["id"], d, p))

    def _slot_vars(items):
        return [var for var in items if var is not None]

    def _safe_add_zero(var, guard=None):
        if var is not None:
            ct = model.Add(var == 0)
            if guard is not None:
                ct.OnlyEnforceIf(guard)

    def _soft_weight(spec):
        weight = spec.get("weight")
        if weight is None:
            weight = spec.get("params", {}).get("weight")
        try:
            weight = int(weight)
        except (TypeError, ValueError):
            weight = 1
        return max(1, weight)

    def _penalize_forbidden_slots(spec, slot_vars):
        weight = _soft_weight(spec)
        for var in slot_vars:
            soft_terms.append((weight, var))

    def _penalize_excess(spec, count_vars, limit, tag):
        if not count_vars:
            return
        weight = _soft_weight(spec)
        excess = model.NewIntVar(0, len(count_vars), f"soft_excess_{spec.get('id', 'x')}_{tag}")
        model.Add(excess >= sum(count_vars) - limit)
        soft_terms.append((weight, excess))

    def _resolve_group_subjects(group_name):
        group_specs = [
            s for s in constraints
            if s.get("kind") == "subject_group"
            and (s.get("params", {}).get("name") == group_name or s.get("name") == group_name)
        ]
        group_subjects = set()
        for gs in group_specs:
            src = gs.get("params", {}) or {}
            for subject in (src.get("subjects") or gs.get("subjects", [])):
                group_subjects.add(subject)
        return group_subjects

    def _add_class_subjects_not_same_day(spec, soft_terms_ref=None):
        params = spec.get("params", {})
        subjects = params.get("subjects") or []
        target_class = params.get("class")
        max_subjects = int(params.get("maxSubjectsPerDay", 1) or 1)
        if len(subjects) < 2:
            return
        target_classes = [target_class] if target_class else data["classes"]
        for c in target_classes:
            for d in days:
                present_vars = []
                for subject in subjects:
                    asgs = [a for a in assignments if a["class"] == c and a["subject"] == subject]
                    slot_vars = _slot_vars(_slot_var(a, d, p) for a in asgs for p in _periods_for(d))
                    if not slot_vars:
                        continue
                    present = model.NewBoolVar(f"pres_{c}_{subject}_{d}")
                    model.Add(sum(slot_vars) >= 1).OnlyEnforceIf(present)
                    model.Add(sum(slot_vars) == 0).OnlyEnforceIf(present.Not())
                    present_vars.append(present)
                if len(present_vars) <= max_subjects:
                    continue
                if soft_terms_ref is None:
                    model.Add(sum(present_vars) <= max_subjects)
                else:
                    excess = model.NewIntVar(0, len(present_vars), f"soft_pair_{c}_{d}")
                    model.Add(excess >= sum(present_vars) - max_subjects)
                    soft_terms_ref.append((_soft_weight(spec), excess))

    def _add_teacher_max_working_days(spec, soft_terms_ref=None):
        params = spec.get("params", {})
        teacher = params.get("teacher")
        total_days = len(days)
        if params.get("maxDays") is not None:
            max_days = int(params.get("maxDays"))
        elif params.get("minDaysOff") is not None:
            max_days = total_days - int(params.get("minDaysOff"))
        else:
            max_days = total_days - 1
        target_teachers = [teacher] if teacher else list({a["teacher"] for a in assignments})
        for target_teacher in target_teachers:
            teacher_asgs = [a for a in assignments if a["teacher"] == target_teacher]
            work_vars = []
            for d in days:
                day_slots = _slot_vars(_slot_var(a, d, p) for a in teacher_asgs for p in _periods_for(d))
                if not day_slots:
                    continue
                work_var = model.NewBoolVar(f"work_{target_teacher}_{d}")
                model.Add(sum(day_slots) >= 1).OnlyEnforceIf(work_var)
                model.Add(sum(day_slots) == 0).OnlyEnforceIf(work_var.Not())
                work_vars.append(work_var)
            if not work_vars:
                continue
            if soft_terms_ref is None:
                model.Add(sum(work_vars) <= max_days)
            else:
                excess = model.NewIntVar(0, len(work_vars), f"soft_workdays_{target_teacher}")
                model.Add(excess >= sum(work_vars) - max_days)
                soft_terms_ref.append((_soft_weight(spec), excess))

    def _add_subject_max_consecutive(spec, soft_terms_ref=None):
        params = spec.get("params", {})
        subject = params.get("subject")
        max_consecutive = int(params.get("maxConsecutive", 1) or 1)
        if max_consecutive <= 0:
            return
        target_classes = set(params.get("classes") or data["classes"])
        window_length = max_consecutive + 1
        for c in target_classes:
            asgs = [a for a in assignments if a["class"] == c and a["subject"] == subject]
            if not asgs:
                continue
            for d in days:
                day_periods = _periods_for(d)
                for i in range(0, max(0, len(day_periods) - window_length + 1)):
                    window = day_periods[i:i + window_length]
                    if any(window[k + 1] != window[k] + 1 for k in range(len(window) - 1)):
                        continue
                    window_slot_vars = _slot_vars(_slot_var(a, d, p) for a in asgs for p in window)
                    if soft_terms_ref is None:
                        model.Add(sum(window_slot_vars) <= max_consecutive)
                    else:
                        over = model.NewBoolVar(f"soft_consec_{c}_{subject}_{d}_{window[0]}")
                        model.Add(sum(window_slot_vars) >= window_length).OnlyEnforceIf(over)
                        model.Add(sum(window_slot_vars) <= window_length - 1).OnlyEnforceIf(over.Not())
                        soft_terms_ref.append((_soft_weight(spec), over))

    def _add_soft_constraint(spec):
        kind = spec.get("kind")
        params = spec.get("params", {})

        if kind == "subject_pin_period":
            subject = params.get("subject")
            allowed = set(int(x) for x in params.get("periods", []))
            target_classes = set(params.get("classes") or data["classes"])
            forbidden = []
            for a in assignments:
                if a["subject"] == subject and a["class"] in target_classes:
                    for d in days:
                        for p in _periods_for(d):
                            if p not in allowed:
                                forbidden.append(_slot_var(a, d, p))
            _penalize_forbidden_slots(spec, _slot_vars(forbidden))

        elif kind == "teacher_block_day":
            teacher = params.get("teacher")
            day = params.get("day")
            forbidden = [
                _slot_var(a, day, p)
                for a in assignments
                if a["teacher"] == teacher
                for p in _periods_for(day)
            ]
            _penalize_forbidden_slots(spec, _slot_vars(forbidden))

        elif kind == "teacher_block_period":
            teacher = params.get("teacher")
            period = int(params.get("period"))
            forbidden = [
                _slot_var(a, d, period)
                for a in assignments
                if a["teacher"] == teacher
                for d in days
                if period in _periods_for(d)
            ]
            _penalize_forbidden_slots(spec, _slot_vars(forbidden))

        elif kind == "teacher_block_slot":
            teacher = params.get("teacher")
            day = params.get("day")
            period = int(params.get("period"))
            forbidden = [
                _slot_var(a, day, period)
                for a in assignments
                if a["teacher"] == teacher
                if period in _periods_for(day)
            ]
            _penalize_forbidden_slots(spec, _slot_vars(forbidden))

        elif kind == "teacher_max_per_day":
            teacher = params.get("teacher")
            if teacher is None or params.get("maxPerDay") is None:
                return
            limit = int(params.get("maxPerDay"))
            teacher_asgs = [a for a in assignments if a["teacher"] == teacher]
            for d in days:
                count_vars = _slot_vars(_slot_var(a, d, p) for a in teacher_asgs for p in _periods_for(d))
                _penalize_excess(spec, count_vars, limit, f"{teacher}_{d}")

        elif kind == "class_no_double_subject_day":
            target_class = params.get("class")
            subject = params.get("subject")
            max_per_day = int(params.get("maxPerDay", 1) or 1)
            target_classes = [target_class] if target_class else data["classes"]
            for c in target_classes:
                subjects = {subject} if subject else {a["subject"] for a in assignments if a["class"] == c}
                for current_subject in subjects:
                    asgs = [a for a in assignments if a["class"] == c and a["subject"] == current_subject]
                    for d in days:
                        count_vars = _slot_vars(_slot_var(a, d, p) for a in asgs for p in _periods_for(d))
                        _penalize_excess(spec, count_vars, max_per_day, f"{c}_{current_subject}_{d}")

        elif kind == "subject_group_daily_limit":
            group_name = params.get("groupName")
            max_per_day = int(params.get("maxPerDay", 1))
            target_class = params.get("class")
            group_subjects = _resolve_group_subjects(group_name)
            target_classes = [target_class] if target_class else data["classes"]
            for c in target_classes:
                class_assignments = [
                    a for a in assignments if a["class"] == c and a["subject"] in group_subjects
                ]
                for d in days:
                    count_vars = _slot_vars(_slot_var(a, d, p) for a in class_assignments for p in _periods_for(d))
                    _penalize_excess(spec, count_vars, max_per_day, f"grp_{c}_{d}")

        elif kind == "class_subjects_not_same_day":
            _add_class_subjects_not_same_day(spec, soft_terms_ref=soft_terms)

        elif kind == "teacher_max_working_days":
            _add_teacher_max_working_days(spec, soft_terms_ref=soft_terms)

        elif kind == "subject_max_consecutive":
            _add_subject_max_consecutive(spec, soft_terms_ref=soft_terms)

        elif kind in ("subject_preferred_periods", "teacher_preferred_periods"):
            entity_key = "subject" if kind == "subject_preferred_periods" else "teacher"
            entity = params.get(entity_key)
            allowed = set(int(x) for x in params.get("periods", []))
            target_classes = set(params.get("classes") or data["classes"])
            forbidden = []
            for a in assignments:
                if a.get(entity_key) != entity:
                    continue
                if entity_key == "subject" and a["class"] not in target_classes:
                    continue
                for d in days:
                    for p in _periods_for(d):
                        if p not in allowed:
                            forbidden.append(_slot_var(a, d, p))
            _penalize_forbidden_slots(spec, _slot_vars(forbidden))

        elif kind == "global_teacher_utilization_balance":
            loads = {}
            for a in assignments:
                loads.setdefault(a["teacher"], []).append(a)
            if len(loads) < 2:
                return
            totals = []
            for teacher, asgs in loads.items():
                total_vars = _slot_vars(_slot_var(a, d, p) for a in asgs for d in days for p in _periods_for(d))
                if not total_vars:
                    continue
                total = model.NewIntVar(0, len(total_vars), f"load_{teacher}")
                model.Add(total == sum(total_vars))
                totals.append(total)
            if len(totals) >= 2:
                max_bound = sum(int(a.get("weeklyPeriods", 0) or 0) for a in assignments) + 1
                max_load = model.NewIntVar(0, max_bound, "teacher_max_load")
                min_load = model.NewIntVar(0, max_bound, "teacher_min_load")
                for t in totals:
                    model.Add(max_load >= t)
                    model.Add(min_load <= t)
                spread = model.NewIntVar(0, max_bound, "teacher_load_spread")
                model.Add(spread == max_load - min_load)
                tol = int(params.get("tolerance", 1) or 1)
                excess = model.NewIntVar(0, max_bound, "teacher_load_excess")
                model.Add(excess >= spread - tol)
                soft_terms.append((_soft_weight(spec), excess))

        else:
            unsupported_soft_kinds.append(spec.get("id", spec.get("kind", "unknown")))
            return

    def _build_condition_literal(condition):
        op = condition.get("op") if isinstance(condition, dict) else None
        _build_condition_literal.counter = getattr(_build_condition_literal, "counter", 0) + 1
        lit = model.NewBoolVar(f"if_then_cond_{_build_condition_literal.counter}")

        if op == "teacher_teaches_on_day":
            teacher = condition.get("teacher")
            day = condition.get("day")
            day_slots = _slot_vars(
                _slot_var(a, day, p)
                for a in assignments
                if a["teacher"] == teacher
                for p in _periods_for(day)
            )
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
            slot_vars = _slot_vars(
                _slot_var(a, day, period)
                for a in assignments
                if a["teacher"] == teacher and period in _periods_for(day)
            )
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
            run_positions = []  # (day, start_period_index) for non-overlap enforcement
            for d in days:
                day_periods = _periods_for(d)
                day_runs = []
                for i in range(0, max(0, len(day_periods) - length + 1)):
                    window = day_periods[i:i + length]
                    if len(window) != length or any(window[k + 1] != window[k] + 1 for k in range(len(window) - 1)):
                        continue
                    run = model.NewBoolVar(f"run_{a['id']}_{d}_{window[0]}_{length}")
                    window_vars = _slot_vars(_slot_var(a, d, p) for p in window)
                    for var in window_vars:
                        model.Add(run <= var)
                    model.Add(run >= sum(window_vars) - length + 1)
                    day_runs.append((i, run))
                # Enforce non-overlap: two runs within `length` steps of each other
                # cannot both be active (aligns with validator's floor(streak/length)).
                for j in range(len(day_runs)):
                    for k in range(j + 1, len(day_runs)):
                        if day_runs[k][0] - day_runs[j][0] < length:
                            model.Add(day_runs[j][1] + day_runs[k][1] <= 1)
                run_vars.extend(r for _, r in day_runs)
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
                        _safe_add_zero(_slot_var(a, d, p), guard)

        elif kind == "teacher_block_period":
            t = params.get("teacher")
            p = int(params.get("period"))
            for a in assignments:
                if a["teacher"] == t:
                    for d in days:
                        if p in _periods_for(d):
                            _safe_add_zero(_slot_var(a, d, p), guard)

        elif kind == "teacher_block_slot":
            t = params.get("teacher")
            d = params.get("day")
            p = int(params.get("period"))
            if p in _periods_for(d):
                for a in assignments:
                    if a["teacher"] == t:
                        _safe_add_zero(_slot_var(a, d, p), guard)

        elif kind == "teacher_max_per_day":
            t = params.get("teacher")
            if t is None or params.get("maxPerDay") is None:
                pass
            else:
                n = int(params.get("maxPerDay"))
                teacher_asgs = [a for a in assignments if a["teacher"] == t]
                for d in days:
                    model.Add(
                        sum(_slot_vars(_slot_var(a, d, p) for a in teacher_asgs for p in _periods_for(d))) <= n
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
                                _safe_add_zero(_slot_var(a, d, p), guard)

        elif kind == "class_no_double_subject_day":
            cls = params.get("class")
            subj = params.get("subject")
            max_per_day = int(params.get("maxPerDay", 1) or 1)
            target_classes = [cls] if cls else data["classes"]
            for c in target_classes:
                subjects = {subj} if subj else {a["subject"] for a in assignments if a["class"] == c}
                for current_subject in subjects:
                    asgs = [a for a in assignments if a["class"] == c and a["subject"] == current_subject]
                    for d in days:
                        model.Add(
                            sum(_slot_vars(_slot_var(a, d, p) for a in asgs for p in _periods_for(d))) <= max_per_day
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
                        sum(_slot_vars(_slot_var(a, d, p) for a in asgs1)) +
                        sum(_slot_vars(_slot_var(a, d, p) for a in asgs2))
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
            _add_soft_constraint(spec)
            continue

        if kind == "weekly_periods_exact":
            continue

        elif kind == "teacher_block_day":
            t = params.get("teacher")
            d = params.get("day")
            for a in assignments:
                if a["teacher"] == t:
                    for p in _periods_for(d):
                        _safe_add_zero(_slot_var(a, d, p))

        elif kind == "teacher_block_period":
            t = params.get("teacher")
            p = int(params.get("period"))
            for a in assignments:
                if a["teacher"] == t:
                    for d in days:
                        if p in _periods_for(d):
                            _safe_add_zero(_slot_var(a, d, p))

        elif kind == "teacher_block_slot":
            t = params.get("teacher")
            d = params.get("day")
            p = int(params.get("period"))
            if p in _periods_for(d):
                for a in assignments:
                    if a["teacher"] == t:
                        _safe_add_zero(_slot_var(a, d, p))

        elif kind == "teacher_max_per_day":
            t = params.get("teacher")
            if t is None or params.get("maxPerDay") is None:
                continue
            n = int(params.get("maxPerDay"))
            teacher_asgs = [a for a in assignments if a["teacher"] == t]
            for d in days:
                model.Add(
                    sum(_slot_vars(_slot_var(a, d, p) for a in teacher_asgs for p in _periods_for(d))) <= n
                )

        elif kind == "teacher_max_consecutive":
            t = params.get("teacher")
            if t is None or params.get("maxConsecutive") is None:
                continue
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
                        sum(_slot_vars(_slot_var(a, d, p) for a in teacher_asgs for p in window)) <= n
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
                                _safe_add_zero(_slot_var(a, d, p))

        elif kind == "class_no_double_subject_day":
            cls = params.get("class")
            subj = params.get("subject")
            max_per_day = int(params.get("maxPerDay", 1) or 1)
            target_classes = [cls] if cls else data["classes"]
            for c in target_classes:
                subjects = {subj} if subj else {a["subject"] for a in assignments if a["class"] == c}
                for current_subject in subjects:
                    asgs = [a for a in assignments if a["class"] == c and a["subject"] == current_subject]
                    for d in days:
                        model.Add(
                            sum(_slot_vars(_slot_var(a, d, p) for a in asgs for p in _periods_for(d))) <= max_per_day
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
                        sum(_slot_vars(_slot_var(a, d, p) for a in asgs1)) +
                        sum(_slot_vars(_slot_var(a, d, p) for a in asgs2))
                        <= 1
                    )

        elif kind == "subject_consecutive":
            _add_subject_consecutive(spec)

        elif kind == "class_subjects_not_same_day":
            _add_class_subjects_not_same_day(spec)

        elif kind == "teacher_max_working_days":
            _add_teacher_max_working_days(spec)

        elif kind == "subject_max_consecutive":
            _add_subject_max_consecutive(spec)

        elif kind == "resource_capacity":
            continue

        elif kind == "session_limit":
            teacher = params.get("teacher")
            max_periods = int(params.get("maxPeriods", 1))
            session_name = params.get("session")
            session_days = params.get("days") or days
            teacher_asgs = [a for a in assignments if a["teacher"] == teacher]
            for d in session_days:
                session_periods = _periods_for(d)
                if session_name:
                    day_sessions = data.get("sessions", [])
                    session_obj = next((s for s in day_sessions if s.get("id") == session_name or s.get("label") == session_name), None)
                    if session_obj:
                        session_periods = [
                            p for p in session_periods
                            if any(
                                p >= offset + 1 and p <= offset + int(data.get("periodCounts", {}).get(session_obj["id"], 0))
                                for offset in [sum(int(data.get("periodCounts", {}).get(s2["id"], 0)) for s2 in day_sessions[:i])]
                                for i, s2 in enumerate(day_sessions)
                                if s2["id"] == session_obj["id"]
                            )
                        ]
                slot_vars = _slot_vars(
                    _slot_var(a, d, p)
                    for a in teacher_asgs
                    for p in session_periods
                )
                if slot_vars:
                    model.Add(sum(slot_vars) <= max_periods)

        elif kind == "subject_group":
            pass  # Definition only, resolved by subject_group_daily_limit

        elif kind == "subject_group_daily_limit":
            group_name = params.get("groupName")
            max_per_day = int(params.get("maxPerDay", 1))
            target_class = params.get("class")
            group_specs = [
                s for s in constraints
                if s.get("kind") == "subject_group"
                and (s.get("params", {}).get("name") == group_name or s.get("name") == group_name)
            ]
            group_subjects = set()
            for gs in group_specs:
                src = gs.get("params", {}) or {}
                for s in (src.get("subjects") or gs.get("subjects", [])):
                    group_subjects.add(s)
            target_classes = [target_class] if target_class else classes
            for cls in target_classes:
                cls_asgs = [a for a in assignments if a["class"] == cls and a["subject"] in group_subjects]
                for d in days:
                    slot_vars = _slot_vars(
                        _slot_var(a, d, p)
                        for a in cls_asgs
                        for p in _periods_for(d)
                    )
                    if slot_vars:
                        model.Add(sum(slot_vars) <= max_per_day)

        elif kind == "if_then":
            condition = params.get("if")
            then_specs = params.get("then", [])
            if condition and isinstance(then_specs, list):
                guard = _build_condition_literal(condition)
                for then_spec in then_specs:
                    if isinstance(then_spec, dict):
                        _apply_then_constraint(then_spec, guard)

        elif kind == "teacher_prefer_consecutive":
            teacher = params.get("teacher")
            if not teacher:
                continue
            teacher_asgs = [a for a in assignments if a["teacher"] == teacher]
            for d in days:
                day_periods = _periods_for(d)
                day_slots = _slot_vars(_slot_var(a, d, p) for a in teacher_asgs for p in day_periods)
                if len(day_slots) < 2:
                    continue
                total = model.NewIntVar(0, len(day_slots), f"tpc_total_{teacher}_{d}")
                model.Add(total == sum(day_slots))
                first_var = model.NewIntVar(0, len(day_periods), f"tpc_first_{teacher}_{d}")
                last_var = model.NewIntVar(0, len(day_periods), f"tpc_last_{teacher}_{d}")
                for idx, p in enumerate(day_periods):
                    p_slots = _slot_vars(_slot_var(a, d, p) for a in teacher_asgs)
                    if not p_slots:
                        continue
                    has_class = model.NewBoolVar(f"tpc_has_{teacher}_{d}_{p}")
                    model.Add(sum(p_slots) >= 1).OnlyEnforceIf(has_class)
                    model.Add(sum(p_slots) == 0).OnlyEnforceIf(has_class.Not())
                    model.Add(first_var <= idx).OnlyEnforceIf(has_class)
                    model.Add(last_var >= idx).OnlyEnforceIf(has_class)
                span = model.NewIntVar(0, len(day_periods), f"tpc_span_{teacher}_{d}")
                model.Add(span == last_var - first_var + 1)
                model.Add(span <= total)

        elif kind == "class_max_subjects_per_day":
            target_class = params.get("class")
            max_subjects = int(params.get("maxSubjects", 99))
            target_classes = [target_class] if target_class else data["classes"]
            for c in target_classes:
                all_subjects = list({a["subject"] for a in assignments if a["class"] == c})
                for d in days:
                    present_vars = []
                    for subj in all_subjects:
                        asgs = [a for a in assignments if a["class"] == c and a["subject"] == subj]
                        sv = _slot_vars(_slot_var(a, d, p) for a in asgs for p in _periods_for(d))
                        if not sv:
                            continue
                        present = model.NewBoolVar(f"cms_{c}_{subj}_{d}")
                        model.Add(sum(sv) >= 1).OnlyEnforceIf(present)
                        model.Add(sum(sv) == 0).OnlyEnforceIf(present.Not())
                        present_vars.append(present)
                    if len(present_vars) > max_subjects:
                        model.Add(sum(present_vars) <= max_subjects)

        elif kind == "teacher_min_gap":
            teacher = params.get("teacher")
            min_gap = int(params.get("minGap", 1))
            if not teacher or min_gap <= 0:
                continue
            teacher_asgs = [a for a in assignments if a["teacher"] == teacher]
            for d in days:
                day_periods = _periods_for(d)
                for i in range(len(day_periods)):
                    for j in range(i + 1, min(i + min_gap + 1, len(day_periods))):
                        if day_periods[j] - day_periods[i] > min_gap:
                            break
                        if day_periods[j] - day_periods[i] < min_gap + 1:
                            p1, p2 = day_periods[i], day_periods[j]
                            vars1 = _slot_vars(_slot_var(a, d, p1) for a in teacher_asgs)
                            vars2 = _slot_vars(_slot_var(a, d, p2) for a in teacher_asgs)
                            if vars1 and vars2:
                                has1 = model.NewBoolVar(f"tmg_h1_{teacher}_{d}_{p1}")
                                model.Add(sum(vars1) >= 1).OnlyEnforceIf(has1)
                                model.Add(sum(vars1) == 0).OnlyEnforceIf(has1.Not())
                                has2 = model.NewBoolVar(f"tmg_h2_{teacher}_{d}_{p2}")
                                model.Add(sum(vars2) >= 1).OnlyEnforceIf(has2)
                                model.Add(sum(vars2) == 0).OnlyEnforceIf(has2.Not())
                                model.Add(has1 + has2 <= 1)

        elif kind == "subject_spread_days":
            target_class = params.get("class")
            subject = params.get("subject")
            min_days = int(params.get("minDays", 2))
            target_classes = [target_class] if target_class else data["classes"]
            for c in target_classes:
                asgs = [a for a in assignments if a["class"] == c and a["subject"] == subject]
                if not asgs:
                    continue
                day_vars = []
                for d in days:
                    sv = _slot_vars(_slot_var(a, d, p) for a in asgs for p in _periods_for(d))
                    if not sv:
                        continue
                    has_day = model.NewBoolVar(f"ssd_{c}_{subject}_{d}")
                    model.Add(sum(sv) >= 1).OnlyEnforceIf(has_day)
                    model.Add(sum(sv) == 0).OnlyEnforceIf(has_day.Not())
                    day_vars.append(has_day)
                if day_vars:
                    model.Add(sum(day_vars) >= min(min_days, len(day_vars)))

        elif kind == "teacher_no_last_period":
            teacher = params.get("teacher")
            excluded_periods = params.get("excludedPeriods")
            if not teacher:
                continue
            teacher_asgs = [a for a in assignments if a["teacher"] == teacher]
            for d in days:
                day_periods = _periods_for(d)
                if excluded_periods:
                    target_periods = [int(p) for p in excluded_periods if int(p) in day_periods]
                else:
                    target_periods = [day_periods[-1]] if day_periods else []
                for p in target_periods:
                    for a in teacher_asgs:
                        _safe_add_zero(_slot_var(a, d, p))

        elif kind == "teacher_max_classes_per_day":
            teacher = params.get("teacher")
            max_classes = int(params.get("maxClasses", 99))
            target_teachers = [teacher] if teacher else list({a["teacher"] for a in assignments})
            for target_teacher in target_teachers:
                teacher_asgs = [a for a in assignments if a["teacher"] == target_teacher]
                for d in days:
                    present_vars = []
                    for cls in {a["class"] for a in teacher_asgs}:
                        cls_asgs = [a for a in teacher_asgs if a["class"] == cls]
                        sv = _slot_vars(_slot_var(a, d, p) for a in cls_asgs for p in _periods_for(d))
                        if not sv:
                            continue
                        present = model.NewBoolVar(f"tmc_{target_teacher}_{cls}_{d}")
                        model.Add(sum(sv) >= 1).OnlyEnforceIf(present)
                        model.Add(sum(sv) == 0).OnlyEnforceIf(present.Not())
                        present_vars.append(present)
                    if len(present_vars) > max_classes:
                        model.Add(sum(present_vars) <= max_classes)

        elif kind == "teacher_pair_not_same_slot":
            teachers = params.get("teachers", [])
            if len(teachers) != 2:
                raise NotImplementedError(f"Invalid teacher_pair_not_same_slot: {spec.get('id')}")
            t1, t2 = teachers
            scope_day = (params.get("scope") or {}).get("day")
            days_to_check = [scope_day] if scope_day else days
            asgs1 = [a for a in assignments if a["teacher"] == t1]
            asgs2 = [a for a in assignments if a["teacher"] == t2]
            for d in days_to_check:
                for p in _periods_for(d):
                    model.Add(
                        sum(_slot_vars(_slot_var(a, d, p) for a in asgs1)) +
                        sum(_slot_vars(_slot_var(a, d, p) for a in asgs2))
                        <= 1
                    )

        elif kind == "teacher_homeroom_first_period":
            teacher = params.get("teacher")
            cls = params.get("class")
            period = int(params.get("period", 1))
            target_days = params.get("days") or days
            asgs = [a for a in assignments if a["teacher"] == teacher and a["class"] == cls]
            for d in target_days:
                pinned = _slot_vars(_slot_var(a, d, period) for a in asgs if period in _periods_for(d))
                if pinned:
                    model.Add(sum(pinned) >= 1)

        elif kind == "subject_not_last_period":
            subject = params.get("subject")
            target_classes = set(params.get("classes") or data["classes"])
            for a in assignments:
                if a["subject"] != subject or a["class"] not in target_classes:
                    continue
                for d in days:
                    day_periods = _periods_for(d)
                    if not day_periods:
                        continue
                    last_p = day_periods[-1]
                    _safe_add_zero(_slot_var(a, d, last_p))

        elif kind == "class_max_heavy_subjects_per_session":
            heavy_subjects = set(params.get("subjects") or [])
            groups = params.get("subjectGroups") or [list(heavy_subjects)]
            max_heavy = int(params.get("maxHeavyInSession", 2) or 2)
            by_session = params.get("sessionPeriodsBySession") or {}
            target_class = params.get("class")
            target_classes = [target_class] if target_class else data["classes"]
            for c in target_classes:
                for d in days:
                    for session_id, sess_periods in by_session.items():
                        sess_periods = [int(p) for p in sess_periods]
                        if not sess_periods:
                            continue
                        for group in groups:
                            present_vars = []
                            for subj in group:
                                asgs = [a for a in assignments if a["class"] == c and a["subject"] == subj]
                                sv = _slot_vars(_slot_var(a, d, p) for a in asgs for p in sess_periods)
                                if not sv:
                                    continue
                                present = model.NewBoolVar(f"hsess_{c}_{subj}_{d}_{session_id}")
                                model.Add(sum(sv) >= 1).OnlyEnforceIf(present)
                                model.Add(sum(sv) == 0).OnlyEnforceIf(present.Not())
                                present_vars.append(present)
                            if len(present_vars) > max_heavy:
                                model.Add(sum(present_vars) <= max_heavy)

        elif kind == "class_max_heavy_subjects_per_day":
            heavy_subjects = set(params.get("subjects") or [])
            max_heavy = int(params.get("maxHeavy", 2))
            target_class = params.get("class")
            target_classes = [target_class] if target_class else data["classes"]
            for c in target_classes:
                for d in days:
                    present_vars = []
                    for subj in heavy_subjects:
                        asgs = [a for a in assignments if a["class"] == c and a["subject"] == subj]
                        sv = _slot_vars(_slot_var(a, d, p) for a in asgs for p in _periods_for(d))
                        if not sv:
                            continue
                        present = model.NewBoolVar(f"heavy_{c}_{subj}_{d}")
                        model.Add(sum(sv) >= 1).OnlyEnforceIf(present)
                        model.Add(sum(sv) == 0).OnlyEnforceIf(present.Not())
                        present_vars.append(present)
                    if len(present_vars) > max_heavy:
                        model.Add(sum(present_vars) <= max_heavy)

        elif kind == "class_first_period_required":
            target_class = params.get("class")
            target_classes = [target_class] if target_class else data["classes"]
            for c in target_classes:
                class_asgs = [a for a in assignments if a["class"] == c]
                for d in days:
                    day_periods = _periods_for(d)
                    if not day_periods:
                        continue
                    first_p = day_periods[0]
                    day_slots = _slot_vars(_slot_var(a, d, p) for a in class_asgs for p in day_periods)
                    if not day_slots:
                        continue
                    has_day = model.NewBoolVar(f"c1st_has_{c}_{d}")
                    model.Add(sum(day_slots) >= 1).OnlyEnforceIf(has_day)
                    model.Add(sum(day_slots) == 0).OnlyEnforceIf(has_day.Not())
                    first_slots = _slot_vars(_slot_var(a, d, first_p) for a in class_asgs)
                    if first_slots:
                        model.Add(sum(first_slots) >= 1).OnlyEnforceIf(has_day)

        elif kind == "subject_flag_ceremony_slot":
            d = params.get("day")
            p = int(params.get("period", 1))
            if p in _periods_for(d):
                for a in assignments:
                    _safe_add_zero(_slot_var(a, d, p))

        elif kind == "custom_dsl":
            # AI-generated custom code phía dưới, chạy MỘT LẦN cho tất cả
            # custom_dsl specs (không lặp lại per-spec). (fix bug #5)
            continue

        else:
            raise NotImplementedError(
                f"Unsupported HARD constraint kind in solver skeleton: {kind} (id={spec.get('id')})"
            )

    # === AI custom_dsl injection (chạy đúng 1 lần, ngoài vòng for spec) ===
    # Skeleton không tự guard bằng custom_specs: coder prompt đã filter custom_dsl,
    # nên để generated code tự quyết định no-op khi không có custom hard specs.
    custom_specs = [s for s in constraints if s.get("kind") == "custom_dsl" and s.get("severity", "hard") == "hard"]
    # <<< AI_FILL_HERE >>>
    pass

    return soft_terms, unsupported_soft_kinds


soft_terms, unsupported_soft_kinds = build_custom_constraints(model, slots, data)

# Warm-start: inject hints từ schedule cũ nếu có, giúp solver hội tụ nhanh hơn
# khi user chỉnh sửa nhỏ và re-solve.
_warm_schedule = data.get("warmStartSchedule") or []
if _warm_schedule:
    _warm_set = {
        (str(e.get("assignmentId") or ""), str(e.get("day") or ""), int(e.get("period")))
        for e in _warm_schedule
        if e.get("assignmentId") and e.get("day") and e.get("period") is not None
    }
    for _key, _var in slots.items():
        model.AddHint(_var, 1 if _key in _warm_set else 0)

solver = cp_model.CpSolver()
# Thời gian giải có thể override qua env SOLVER_MAX_SECONDS để khớp với
# timeoutMs phía Node (fix bug #29).
try:
    _max_seconds = float(_os.environ.get("SOLVER_MAX_SECONDS", "") or 60.0)
except Exception:
    _max_seconds = 60.0
_deterministic = _os.environ.get("TT_DETERMINISTIC", "") == "1"
try:
    _workers = 1 if _deterministic else int(_os.environ.get("SOLVER_WORKERS", "") or max(1, (_os.cpu_count() or 2) - 1))
except Exception:
    _workers = 1 if _deterministic else max(1, (_os.cpu_count() or 2) - 1)
solver.parameters.num_search_workers = min(max(1, _workers), 8)
try:
    solver.parameters.random_seed = int(_os.environ.get("SOLVER_RANDOM_SEED", "") or 42)
except Exception:
    solver.parameters.random_seed = 42

best_values = None

if soft_terms:
    phase1 = max(5.0, _max_seconds * 0.4)
    solver.parameters.max_time_in_seconds = phase1
    status = solver.Solve(model)
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        best_values = {key: solver.Value(var) for key, var in slots.items()}
        for key, var in slots.items():
            model.AddHint(var, best_values[key])

    model.Minimize(sum(int(weight) * var for (weight, var) in soft_terms))
    phase2 = max(5.0, _max_seconds - phase1)
    solver.parameters.max_time_in_seconds = phase2
    status2 = solver.Solve(model)
    if status2 in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        best_values = {key: solver.Value(var) for key, var in slots.items()}
        status = status2
else:
    solver.parameters.max_time_in_seconds = _max_seconds
    status = solver.Solve(model)
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        best_values = {key: solver.Value(var) for key, var in slots.items()}

result = {
    "classes": classes,
    "days": days,
    "periods": periods,
    "assignments": assignments,
    "status": solver.StatusName(status).lower(),
    "schedule": [],
}

def _verify_custom_predicates(schedule_out):
    checks = []
    safe_builtins = {
        "len": len, "range": range, "sum": sum, "min": min, "max": max,
        "sorted": sorted, "set": set, "list": list, "dict": dict, "tuple": tuple,
        "frozenset": frozenset, "any": any, "all": all, "abs": abs, "round": round,
        "int": int, "str": str, "bool": bool, "float": float,
        "enumerate": enumerate, "zip": zip, "map": map, "filter": filter,
        "isinstance": isinstance,
    }
    for spec in data.get("constraints", []):
        if spec.get("kind") != "custom_dsl":
            continue
        sid = spec.get("id", "unknown")
        src = (spec.get("params") or {}).get("pythonPredicate") or spec.get("pythonPredicate")
        if not src:
            checks.append({"id": sid, "checked": False, "ok": False,
                           "violations": [{"constraintId": sid, "kind": "custom_dsl",
                                           "message": "Thiếu pythonPredicate"}]})
            continue
        try:
            ns = {}
            exec(src, {"__builtins__": safe_builtins}, ns)  # noqa: S102
            fn = ns.get("check")
            if not callable(fn):
                raise ValueError("pythonPredicate phải định nghĩa def check(schedule)")
            raw = fn(schedule_out)
            if isinstance(raw, bool):
                viol = [] if raw else [{"constraintId": sid, "kind": "custom_dsl",
                                        "message": "Predicate trả về False"}]
            else:
                viol = [{"constraintId": sid, "kind": "custom_dsl", "message": str(v)}
                        for v in (raw or [])]
            checks.append({"id": sid, "checked": True, "ok": len(viol) == 0,
                           "violations": viol})
        except Exception as exc:  # noqa: BLE001
            checks.append({"id": sid, "checked": False, "ok": False,
                           "violations": [{"constraintId": sid, "kind": "custom_dsl",
                                           "message": f"Predicate error: {exc}"}]})
    return checks


if best_values is not None:
    for a in assignments:
        for d in days:
            for p in periods_for_day(d):
                if best_values.get((a["id"], d, p)) == 1:
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
    result["customChecks"] = _verify_custom_predicates(result["schedule"])
    result["unsupportedSoftKinds"] = unsupported_soft_kinds
    with open("result.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    print("SOLUTION_FOUND")
else:
    with open("result.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    print(f"NO_SOLUTION:{solver.StatusName(status)}")
