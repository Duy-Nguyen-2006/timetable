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


# --- Variable Reduction: pre-compute infeasible (assignment, day, period) triples ---
_infeasible = set()

for spec in constraints:
    kind = spec.get("kind")
    params = spec.get("params", {})
    severity = spec.get("severity", "hard")
    if severity != "hard":
        continue

    if kind == "teacher_block_day":
        t = params.get("teacher")
        d = params.get("day")
        if t and d:
            for a in assignments:
                if a["teacher"] == t:
                    for p in periods_for_day(d):
                        _infeasible.add((a["id"], d, p))

    elif kind == "teacher_block_period":
        t = params.get("teacher")
        p_val = params.get("period")
        if t and p_val is not None:
            p_int = int(p_val)
            for a in assignments:
                if a["teacher"] == t:
                    for d in days:
                        if p_int in periods_for_day(d):
                            _infeasible.add((a["id"], d, p_int))

    elif kind == "teacher_block_slot":
        t = params.get("teacher")
        d = params.get("day")
        p_val = params.get("period")
        if t and d and p_val is not None:
            p_int = int(p_val)
            if p_int in periods_for_day(d):
                for a in assignments:
                    if a["teacher"] == t:
                        _infeasible.add((a["id"], d, p_int))

    elif kind == "subject_pin_period":
        subj = params.get("subject")
        allowed = set(int(x) for x in params.get("periods", []))
        target_classes = set(params.get("classes") or classes)
        if subj and allowed:
            for a in assignments:
                if a["subject"] == subj and a["class"] in target_classes:
                    for d in days:
                        for p in periods_for_day(d):
                            if p not in allowed:
                                _infeasible.add((a["id"], d, p))

    elif kind == "subject_not_at_period":
        subj = params.get("subject")
        forbidden_periods = set(int(x) for x in params.get("periods", []))
        target_classes = set(params.get("classes") or classes)
        if subj and forbidden_periods:
            for a in assignments:
                if a["subject"] == subj and a["class"] in target_classes:
                    for d in days:
                        for p in periods_for_day(d):
                            if p in forbidden_periods:
                                _infeasible.add((a["id"], d, p))

    elif kind == "multi_school_availability":
        teacher = params.get("teacher")
        available_days = set(params.get("availableDays") or [])
        if teacher and available_days:
            for a in assignments:
                if a["teacher"] == teacher:
                    for d in days:
                        if d not in available_days:
                            for p in periods_for_day(d):
                                _infeasible.add((a["id"], d, p))

# Create variables only for feasible slots
slots = {}
_ZERO = model.NewConstant(0)
for a in assignments:
    for d in days:
        for p in periods_for_day(d):
            key = (a["id"], d, p)
            if key in _infeasible:
                slots[key] = _ZERO
            else:
                slots[key] = model.NewBoolVar(f"x_{a['id']}_{d}_{p}")

# Relaxation: unscheduled[a] absorbs any periods that cannot be placed.
# This guarantees a solution always exists (partial schedule instead of INFEASIBLE).
_ALLOW_PARTIAL = True
_UNSCHEDULED_PENALTY = 10_000
unscheduled = {}
for a in assignments:
    wp = max(0, int(a.get("weeklyPeriods", 0)))
    if _ALLOW_PARTIAL and wp > 0:
        uv = model.NewIntVar(0, wp, f"unscheduled_{a['id']}")
        unscheduled[a["id"]] = uv
        model.Add(
            sum(slots[(a["id"], d, p)] for d in days for p in periods_for_day(d)) + uv
            == wp
        )
    else:
        model.Add(
            sum(slots[(a["id"], d, p)] for d in days for p in periods_for_day(d))
            == wp
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


def _enforce_zero(ctx, slot_vars, guard=None):
    for var in slot_vars:
        ct = ctx["model"].Add(var == 0)
        if guard is not None:
            ct.OnlyEnforceIf(guard)


def _dispatch_teacher_block_day(ctx, spec, soft_terms_ref=None, guard=None):
    params = spec.get("params", {})
    teacher = params.get("teacher")
    day = params.get("day")
    forbidden = [
        ctx["slots"][(a["id"], day, p)]
        for a in ctx["assignments"]
        if a["teacher"] == teacher
        for p in ctx["periods_for"](day)
    ]
    if soft_terms_ref is not None:
        ctx["penalize_forbidden_slots"](spec, forbidden)
        return
    _enforce_zero(ctx, forbidden, guard=guard)


def _dispatch_teacher_block_period(ctx, spec, soft_terms_ref=None, guard=None):
    params = spec.get("params", {})
    teacher = params.get("teacher")
    period = int(params.get("period"))
    forbidden = [
        ctx["slots"][(a["id"], d, period)]
        for a in ctx["assignments"]
        if a["teacher"] == teacher
        for d in ctx["days"]
        if period in ctx["periods_for"](d)
    ]
    if soft_terms_ref is not None:
        ctx["penalize_forbidden_slots"](spec, forbidden)
        return
    _enforce_zero(ctx, forbidden, guard=guard)


def _dispatch_teacher_block_slot(ctx, spec, soft_terms_ref=None, guard=None):
    params = spec.get("params", {})
    teacher = params.get("teacher")
    day = params.get("day")
    period = int(params.get("period"))
    forbidden = [
        ctx["slots"][(a["id"], day, period)]
        for a in ctx["assignments"]
        if a["teacher"] == teacher
        if period in ctx["periods_for"](day)
    ]
    if soft_terms_ref is not None:
        ctx["penalize_forbidden_slots"](spec, forbidden)
        return
    _enforce_zero(ctx, forbidden, guard=guard)


def _dispatch_teacher_max_per_day(ctx, spec, soft_terms_ref=None, guard=None):
    params = spec.get("params", {})
    teacher = params.get("teacher")
    if teacher is None or params.get("maxPerDay") is None:
        return
    limit = int(params.get("maxPerDay"))
    teacher_asgs = [a for a in ctx["assignments"] if a["teacher"] == teacher]
    for day in ctx["days"]:
        count_vars = [ctx["slots"][(a["id"], day, p)] for a in teacher_asgs for p in ctx["periods_for"](day)]
        if soft_terms_ref is not None:
            ctx["penalize_excess"](spec, count_vars, limit, f"{teacher}_{day}")
            continue
        ct = ctx["model"].Add(sum(count_vars) <= limit)
        if guard is not None:
            ct.OnlyEnforceIf(guard)


def _dispatch_subject_pin_period(ctx, spec, soft_terms_ref=None, guard=None):
    params = spec.get("params", {})
    subject = params.get("subject")
    allowed = set(int(x) for x in params.get("periods", []))
    target_classes = set(params.get("classes") or ctx["data"]["classes"])
    forbidden = []
    for a in ctx["assignments"]:
        if a["subject"] == subject and a["class"] in target_classes:
            for day in ctx["days"]:
                for period in ctx["periods_for"](day):
                    if period not in allowed:
                        forbidden.append(ctx["slots"][(a["id"], day, period)])
    if soft_terms_ref is not None:
        ctx["penalize_forbidden_slots"](spec, forbidden)
        return
    _enforce_zero(ctx, forbidden, guard=guard)


def _dispatch_class_no_double_subject_day(ctx, spec, soft_terms_ref=None, guard=None):
    params = spec.get("params", {})
    target_class = params.get("class")
    subject = params.get("subject")
    max_per_day = int(params.get("maxPerDay", 1) or 1)
    target_classes = [target_class] if target_class else ctx["data"]["classes"]
    for class_name in target_classes:
        subjects = {subject} if subject else {a["subject"] for a in ctx["assignments"] if a["class"] == class_name}
        for current_subject in subjects:
            asgs = [a for a in ctx["assignments"] if a["class"] == class_name and a["subject"] == current_subject]
            for day in ctx["days"]:
                count_vars = [ctx["slots"][(a["id"], day, p)] for a in asgs for p in ctx["periods_for"](day)]
                if soft_terms_ref is not None:
                    ctx["penalize_excess"](spec, count_vars, max_per_day, f"{class_name}_{current_subject}_{day}")
                    continue
                ct = ctx["model"].Add(sum(count_vars) <= max_per_day)
                if guard is not None:
                    ct.OnlyEnforceIf(guard)


def _dispatch_pair_not_same_slot(ctx, spec, soft_terms_ref=None, guard=None):
    del soft_terms_ref
    params = spec.get("params", {})
    teachers = params.get("teachers", [])
    if len(teachers) != 2:
        raise NotImplementedError(f"Invalid pair_not_same_slot: {spec.get('id')}")
    t1, t2 = teachers
    scope_day = (params.get("scope") or {}).get("day")
    days_to_check = [scope_day] if scope_day else ctx["days"]
    asgs1 = [a for a in ctx["assignments"] if a["teacher"] == t1]
    asgs2 = [a for a in ctx["assignments"] if a["teacher"] == t2]
    for day in days_to_check:
        for period in ctx["periods_for"](day):
            ct = ctx["model"].Add(
                sum(ctx["slots"][(a["id"], day, period)] for a in asgs1) +
                sum(ctx["slots"][(a["id"], day, period)] for a in asgs2)
                <= 1
            )
            if guard is not None:
                ct.OnlyEnforceIf(guard)


def _dispatch_subject_not_at_period(ctx, spec, soft_terms_ref=None, guard=None):
    params = spec.get("params", {})
    subject = params.get("subject")
    forbidden_periods = set(int(x) for x in params.get("periods", []))
    target_classes = set(params.get("classes") or ctx["data"]["classes"])
    forbidden = []
    for a in ctx["assignments"]:
        if a["subject"] == subject and a["class"] in target_classes:
            for day in ctx["days"]:
                for period in ctx["periods_for"](day):
                    if period in forbidden_periods:
                        forbidden.append(ctx["slots"][(a["id"], day, period)])
    if soft_terms_ref is not None:
        ctx["penalize_forbidden_slots"](spec, forbidden)
        return
    _enforce_zero(ctx, forbidden, guard=guard)


def _dispatch_subject_group_daily_limit(ctx, spec, soft_terms_ref=None, guard=None):
    params = spec.get("params", {})
    group_name = params.get("groupName")
    max_per_day = int(params.get("maxPerDay", 1))
    target_class = params.get("class")
    group_subjects = ctx["resolve_group_subjects"](group_name)
    target_classes = [target_class] if target_class else ctx["data"]["classes"]
    for class_name in target_classes:
        class_assignments = [
            a for a in ctx["assignments"] if a["class"] == class_name and a["subject"] in group_subjects
        ]
        for day in ctx["days"]:
            count_vars = [ctx["slots"][(a["id"], day, p)] for a in class_assignments for p in ctx["periods_for"](day)]
            if soft_terms_ref is not None:
                ctx["penalize_excess"](spec, count_vars, max_per_day, f"grp_{class_name}_{day}")
                continue
            if not count_vars:
                continue
            ct = ctx["model"].Add(sum(count_vars) <= max_per_day)
            if guard is not None:
                ct.OnlyEnforceIf(guard)


def _dispatch_subject_consecutive(ctx, spec, soft_terms_ref=None, guard=None):
    del soft_terms_ref
    ctx["add_subject_consecutive"](spec, guard=guard)


def _dispatch_class_subjects_not_same_day(ctx, spec, soft_terms_ref=None, guard=None):
    del guard
    ctx["add_class_subjects_not_same_day"](spec, soft_terms_ref=soft_terms_ref)


def _dispatch_teacher_max_working_days(ctx, spec, soft_terms_ref=None, guard=None):
    del guard
    ctx["add_teacher_max_working_days"](spec, soft_terms_ref=soft_terms_ref)


def _dispatch_subject_max_consecutive(ctx, spec, soft_terms_ref=None, guard=None):
    del guard
    ctx["add_subject_max_consecutive"](spec, soft_terms_ref=soft_terms_ref)


def _dispatch_subject_spread_evenly(ctx, spec, soft_terms_ref=None, guard=None):
    del guard
    if soft_terms_ref is not None:
        ctx["add_subject_spread_evenly_soft"](spec, soft_terms_ref)
        return
    params = spec.get("params", {})
    subject = params.get("subject")
    max_gap = int(params.get("maxGap", 2) or 2)
    target_classes = set(params.get("classes") or ctx["data"]["classes"])
    for a in ctx["assignments"]:
        if a["subject"] != subject or a["class"] not in target_classes:
            continue
        for i in range(len(ctx["days"])):
            for j in range(i + 2, min(i + max_gap + 2, len(ctx["days"]) + 1)):
                window_days = ctx["days"][i:j]
                if len(window_days) <= max_gap:
                    continue
                window_vars = [ctx["slots"][(a["id"], d, p)] for d in window_days for p in ctx["periods_for"](d)]
                if window_vars:
                    ctx["model"].Add(sum(window_vars) >= 1)


def _dispatch_teacher_max_consecutive_global(ctx, spec, soft_terms_ref=None, guard=None):
    del guard
    if soft_terms_ref is not None:
        ctx["add_teacher_max_consecutive_global_soft"](spec, soft_terms_ref)
        return
    params = spec.get("params", {})
    teacher = params.get("teacher")
    max_consec = int(params.get("maxConsecutive", 4) or 4)
    target_teachers = [teacher] if teacher else list({a["teacher"] for a in ctx["assignments"]})
    all_slots_ordered = []
    for day in ctx["days"]:
        for period in ctx["periods_for"](day):
            all_slots_ordered.append((day, period))
    for target_teacher in target_teachers:
        teacher_asgs = [a for a in ctx["assignments"] if a["teacher"] == target_teacher]
        if not teacher_asgs:
            continue
        window_len = max_consec + 1
        for i in range(len(all_slots_ordered) - window_len + 1):
            window = all_slots_ordered[i:i + window_len]
            ctx["model"].Add(
                sum(ctx["slots"][(a["id"], d, p)] for (d, p) in window for a in teacher_asgs) <= max_consec
            )


def _dispatch_teacher_prefer_compact(ctx, spec, soft_terms_ref=None, guard=None):
    del guard
    if soft_terms_ref is not None:
        ctx["add_teacher_prefer_compact_soft"](spec, soft_terms_ref)
        return
    params = spec.get("params", {})
    teacher = params.get("teacher")
    target_teachers = [teacher] if teacher else list({a["teacher"] for a in ctx["assignments"]})
    for target_teacher in target_teachers:
        teacher_asgs = [a for a in ctx["assignments"] if a["teacher"] == target_teacher]
        if not teacher_asgs:
            continue
        for day in ctx["days"]:
            day_periods = ctx["periods_for"](day)
            if len(day_periods) < 3:
                continue
            for i in range(1, len(day_periods) - 1):
                p_before = day_periods[i - 1]
                p_curr = day_periods[i]
                p_after = day_periods[i + 1]
                has_before = [ctx["slots"][(a["id"], day, p_before)] for a in teacher_asgs]
                has_curr = [ctx["slots"][(a["id"], day, p_curr)] for a in teacher_asgs]
                has_after = [ctx["slots"][(a["id"], day, p_after)] for a in teacher_asgs]
                gap = ctx["model"].NewBoolVar(f"hgap_{target_teacher}_{day}_{p_curr}")
                ctx["model"].Add(sum(has_curr) == 0).OnlyEnforceIf(gap)
                ctx["model"].Add(sum(has_curr) >= 1).OnlyEnforceIf(gap.Not())
                has_surr = ctx["model"].NewBoolVar(f"hsurr_{target_teacher}_{day}_{p_curr}")
                ctx["model"].Add(sum(has_before) >= 1).OnlyEnforceIf(has_surr)
                ctx["model"].Add(sum(has_after) >= 1).OnlyEnforceIf(has_surr)
                ctx["model"].Add(sum(has_before) + sum(has_after) <= 1).OnlyEnforceIf(has_surr.Not())
                ctx["model"].Add(gap + has_surr <= 1)


def _dispatch_class_balanced_daily_load(ctx, spec, soft_terms_ref=None, guard=None):
    del guard
    if soft_terms_ref is not None:
        ctx["add_class_balanced_daily_load_soft"](spec, soft_terms_ref)
        return
    params = spec.get("params", {})
    target_class = params.get("class")
    max_diff = int(params.get("maxDiff", 1) or 1)
    target_classes = [target_class] if target_class else ctx["data"]["classes"]
    for class_name in target_classes:
        class_asgs = [a for a in ctx["assignments"] if a["class"] == class_name]
        if not class_asgs:
            continue
        day_counts = []
        for day in ctx["days"]:
            day_var = ctx["model"].NewIntVar(0, len(class_asgs) * len(ctx["periods_for"](day)), f"hload_{class_name}_{day}")
            ctx["model"].Add(day_var == sum(ctx["slots"][(a["id"], day, p)] for a in class_asgs for p in ctx["periods_for"](day)))
            day_counts.append(day_var)
        for i in range(len(day_counts)):
            for j in range(i + 1, len(day_counts)):
                ctx["model"].Add(day_counts[i] - day_counts[j] <= max_diff)
                ctx["model"].Add(day_counts[j] - day_counts[i] <= max_diff)


def _dispatch_teacher_fixed_slot(ctx, spec, soft_terms_ref=None, guard=None):
    params = spec.get("params", {})
    teacher = params.get("teacher")
    day = params.get("day")
    period = int(params.get("period"))
    subject = params.get("subject")
    teacher_asgs = [a for a in ctx["assignments"] if a["teacher"] == teacher]
    if subject:
        teacher_asgs = [a for a in teacher_asgs if a["subject"] == subject]
    slot_vars = [ctx["slots"][(a["id"], day, period)] for a in teacher_asgs if period in ctx["periods_for"](day)]
    if soft_terms_ref is not None:
        if slot_vars:
            neg_var = ctx["model"].NewBoolVar(f"soft_fixed_{teacher}_{day}_{period}")
            ctx["model"].Add(sum(slot_vars) == 0).OnlyEnforceIf(neg_var)
            ctx["model"].Add(sum(slot_vars) >= 1).OnlyEnforceIf(neg_var.Not())
            soft_terms_ref.append((ctx["soft_weight"](spec), neg_var))
        return
    if slot_vars:
        ct = ctx["model"].Add(sum(slot_vars) >= 1)
        if guard is not None:
            ct.OnlyEnforceIf(guard)


def _dispatch_subject_not_consecutive_days(ctx, spec, soft_terms_ref=None, guard=None):
    del guard
    if soft_terms_ref is not None:
        ctx["add_subject_not_consecutive_days_soft"](spec, soft_terms_ref)
        return
    params = spec.get("params", {})
    subject = params.get("subject")
    target_classes = set(params.get("classes") or ctx["data"]["classes"])
    for class_name in target_classes:
        class_asgs = [a for a in ctx["assignments"] if a["class"] == class_name and a["subject"] == subject]
        if not class_asgs:
            continue
        for i in range(len(ctx["days"]) - 1):
            day1, day2 = ctx["days"][i], ctx["days"][i + 1]
            has_day1 = [ctx["slots"][(a["id"], day1, p)] for a in class_asgs for p in ctx["periods_for"](day1)]
            has_day2 = [ctx["slots"][(a["id"], day2, p)] for a in class_asgs for p in ctx["periods_for"](day2)]
            if not has_day1 or not has_day2:
                continue
            b1 = ctx["model"].NewBoolVar(f"hncd1_{class_name}_{subject}_{day1}")
            ctx["model"].Add(sum(has_day1) >= 1).OnlyEnforceIf(b1)
            ctx["model"].Add(sum(has_day1) == 0).OnlyEnforceIf(b1.Not())
            b2 = ctx["model"].NewBoolVar(f"hncd2_{class_name}_{subject}_{day2}")
            ctx["model"].Add(sum(has_day2) >= 1).OnlyEnforceIf(b2)
            ctx["model"].Add(sum(has_day2) == 0).OnlyEnforceIf(b2.Not())
            ctx["model"].Add(b1 + b2 <= 1)


def _dispatch_multi_school_availability(ctx, spec, soft_terms_ref=None, guard=None):
    params = spec.get("params", {})
    teacher = params.get("teacher")
    available_days = set(params.get("availableDays") or [])
    teacher_asgs = [a for a in ctx["assignments"] if a["teacher"] == teacher]
    forbidden = []
    for a in teacher_asgs:
        for day in ctx["days"]:
            if day not in available_days:
                for period in ctx["periods_for"](day):
                    forbidden.append(ctx["slots"][(a["id"], day, period)])
    if soft_terms_ref is not None:
        ctx["penalize_forbidden_slots"](spec, forbidden)
        return
    _enforce_zero(ctx, forbidden, guard=guard)


def _dispatch_teacher_max_consecutive(ctx, spec, soft_terms_ref=None, guard=None):
    del soft_terms_ref
    params = spec.get("params", {})
    teacher = params.get("teacher")
    if teacher is None or params.get("maxConsecutive") is None:
        return
    limit = int(params.get("maxConsecutive"))
    if limit <= 0:
        return
    teacher_asgs = [a for a in ctx["assignments"] if a["teacher"] == teacher]
    for day in ctx["days"]:
        day_periods = ctx["periods_for"](day)
        if len(day_periods) <= limit:
            continue
        for i in range(len(day_periods) - limit):
            window = day_periods[i:i + limit + 1]
            if any(window[k + 1] != window[k] + 1 for k in range(len(window) - 1)):
                continue
            ct = ctx["model"].Add(
                sum(ctx["slots"][(a["id"], day, p)] for a in teacher_asgs for p in window) <= limit
            )
            if guard is not None:
                ct.OnlyEnforceIf(guard)


def _dispatch_resource_capacity(ctx, spec, soft_terms_ref=None, guard=None):
    del soft_terms_ref
    params = spec.get("params", {})
    subject = params.get("subject")
    capacity = int(params.get("capacity", 1))
    for day in ctx["days"]:
        for period in ctx["periods_for"](day):
            slot_vars = [
                ctx["slots"][(a["id"], day, period)]
                for a in ctx["assignments"]
                if a["subject"] == subject
            ]
            if not slot_vars:
                continue
            ct = ctx["model"].Add(sum(slot_vars) <= capacity)
            if guard is not None:
                ct.OnlyEnforceIf(guard)


def _dispatch_session_limit(ctx, spec, soft_terms_ref=None, guard=None):
    del soft_terms_ref
    params = spec.get("params", {})
    teacher = params.get("teacher")
    max_periods = int(params.get("maxPeriods", 1))
    session_name = params.get("session")
    session_days = params.get("days") or ctx["days"]
    teacher_asgs = [a for a in ctx["assignments"] if a["teacher"] == teacher]
    for day in session_days:
        session_periods = ctx["periods_for"](day)
        if session_name:
            day_sessions = ctx["data"].get("sessions", [])
            session_obj = next((s for s in day_sessions if s.get("id") == session_name or s.get("label") == session_name), None)
            if session_obj:
                session_periods = [
                    p for p in session_periods
                    if any(
                        p >= offset + 1 and p <= offset + int(ctx["data"].get("periodCounts", {}).get(session_obj["id"], 0))
                        for offset in [sum(int(ctx["data"].get("periodCounts", {}).get(s2["id"], 0)) for s2 in day_sessions[:i])]
                        for i, s2 in enumerate(day_sessions)
                        if s2["id"] == session_obj["id"]
                    )
                ]
        slot_vars = [ctx["slots"][(a["id"], day, p)] for a in teacher_asgs for p in session_periods]
        if not slot_vars:
            continue
        ct = ctx["model"].Add(sum(slot_vars) <= max_periods)
        if guard is not None:
            ct.OnlyEnforceIf(guard)


def _dispatch_if_then(ctx, spec, soft_terms_ref=None, guard=None):
    del soft_terms_ref, guard
    params = spec.get("params", {})
    condition = params.get("if")
    then_specs = params.get("then", [])
    if condition and isinstance(then_specs, list):
        condition_guard = ctx["build_condition_literal"](condition)
        for then_spec in then_specs:
            if isinstance(then_spec, dict):
                ctx["apply_then_constraint"](then_spec, condition_guard)


def _dispatch_noop(ctx, spec, soft_terms_ref=None, guard=None):
    del ctx, spec, soft_terms_ref, guard


SOFT_CONSTRAINT_HANDLERS = {
    "subject_pin_period": _dispatch_subject_pin_period,
    "teacher_block_day": _dispatch_teacher_block_day,
    "teacher_block_period": _dispatch_teacher_block_period,
    "teacher_block_slot": _dispatch_teacher_block_slot,
    "teacher_max_per_day": _dispatch_teacher_max_per_day,
    "teacher_max_consecutive": _dispatch_teacher_max_consecutive,
    "class_no_double_subject_day": _dispatch_class_no_double_subject_day,
    "subject_group_daily_limit": _dispatch_subject_group_daily_limit,
    "class_subjects_not_same_day": _dispatch_class_subjects_not_same_day,
    "teacher_max_working_days": _dispatch_teacher_max_working_days,
    "subject_max_consecutive": _dispatch_subject_max_consecutive,
    "subject_consecutive": _dispatch_subject_consecutive,
    "subject_spread_evenly": _dispatch_subject_spread_evenly,
    "teacher_max_consecutive_global": _dispatch_teacher_max_consecutive_global,
    "subject_not_at_period": _dispatch_subject_not_at_period,
    "teacher_prefer_compact": _dispatch_teacher_prefer_compact,
    "class_balanced_daily_load": _dispatch_class_balanced_daily_load,
    "teacher_fixed_slot": _dispatch_teacher_fixed_slot,
    "subject_not_consecutive_days": _dispatch_subject_not_consecutive_days,
    "multi_school_availability": _dispatch_multi_school_availability,
    "pair_not_same_slot": _dispatch_pair_not_same_slot,
    "resource_capacity": _dispatch_resource_capacity,
    "session_limit": _dispatch_session_limit,
    "if_then": _dispatch_if_then,
}

HARD_CONSTRAINT_HANDLERS = {
    "weekly_periods_exact": _dispatch_noop,
    "teacher_block_day": _dispatch_teacher_block_day,
    "teacher_block_period": _dispatch_teacher_block_period,
    "teacher_block_slot": _dispatch_teacher_block_slot,
    "teacher_max_per_day": _dispatch_teacher_max_per_day,
    "teacher_max_consecutive": _dispatch_teacher_max_consecutive,
    "subject_pin_period": _dispatch_subject_pin_period,
    "class_no_double_subject_day": _dispatch_class_no_double_subject_day,
    "pair_not_same_slot": _dispatch_pair_not_same_slot,
    "subject_consecutive": _dispatch_subject_consecutive,
    "class_subjects_not_same_day": _dispatch_class_subjects_not_same_day,
    "teacher_max_working_days": _dispatch_teacher_max_working_days,
    "subject_max_consecutive": _dispatch_subject_max_consecutive,
    "resource_capacity": _dispatch_resource_capacity,
    "session_limit": _dispatch_session_limit,
    "subject_group": _dispatch_noop,
    "subject_group_daily_limit": _dispatch_subject_group_daily_limit,
    "if_then": _dispatch_if_then,
    "subject_spread_evenly": _dispatch_subject_spread_evenly,
    "teacher_max_consecutive_global": _dispatch_teacher_max_consecutive_global,
    "subject_not_at_period": _dispatch_subject_not_at_period,
    "teacher_prefer_compact": _dispatch_teacher_prefer_compact,
    "class_balanced_daily_load": _dispatch_class_balanced_daily_load,
    "teacher_fixed_slot": _dispatch_teacher_fixed_slot,
    "subject_not_consecutive_days": _dispatch_subject_not_consecutive_days,
    "multi_school_availability": _dispatch_multi_school_availability,
    "custom_dsl": _dispatch_noop,
}

THEN_CONSTRAINT_HANDLERS = {
    "teacher_block_day": _dispatch_teacher_block_day,
    "teacher_block_period": _dispatch_teacher_block_period,
    "teacher_block_slot": _dispatch_teacher_block_slot,
    "teacher_max_per_day": _dispatch_teacher_max_per_day,
    "subject_pin_period": _dispatch_subject_pin_period,
    "class_no_double_subject_day": _dispatch_class_no_double_subject_day,
    "pair_not_same_slot": _dispatch_pair_not_same_slot,
    "subject_consecutive": _dispatch_subject_consecutive,
}


def build_custom_constraints(model, slots, data):
    assignments = data["assignments"]
    days = data["days"]
    periods = data["periods"]
    periods_by_day = data.get("periodsByDay") or {}
    constraints = data["constraints"]

    soft_terms = []

    def _periods_for(d):
        day_periods = periods_by_day.get(d)
        if isinstance(day_periods, list) and day_periods:
            return day_periods
        return periods

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

    def _add_subject_spread_evenly_soft(spec, soft_terms_ref):
        params = spec.get("params", {})
        subject = params.get("subject")
        max_gap = int(params.get("maxGap", 2) or 2)
        target_classes = set(params.get("classes") or data["classes"])
        weight = _soft_weight(spec)
        for a in assignments:
            if a["subject"] != subject or a["class"] not in target_classes:
                continue
            for i in range(len(days)):
                for j in range(i + 2, min(i + max_gap + 2, len(days) + 1)):
                    window_days = days[i:j]
                    if len(window_days) <= max_gap:
                        continue
                    window_vars = [slots[(a["id"], d, p)] for d in window_days for p in _periods_for(d)]
                    if not window_vars:
                        continue
                    no_class_in_window = model.NewBoolVar(f"spread_{a['id']}_{i}_{j}")
                    model.Add(sum(window_vars) == 0).OnlyEnforceIf(no_class_in_window)
                    model.Add(sum(window_vars) >= 1).OnlyEnforceIf(no_class_in_window.Not())
                    soft_terms_ref.append((weight, no_class_in_window))

    def _add_teacher_max_consecutive_global_soft(spec, soft_terms_ref):
        params = spec.get("params", {})
        teacher = params.get("teacher")
        max_consec = int(params.get("maxConsecutive", 4) or 4)
        weight = _soft_weight(spec)
        target_teachers = [teacher] if teacher else list({a["teacher"] for a in assignments})
        all_slots_ordered = []
        for d in days:
            for p in _periods_for(d):
                all_slots_ordered.append((d, p))
        for t in target_teachers:
            t_asgs = [a for a in assignments if a["teacher"] == t]
            if not t_asgs:
                continue
            window_len = max_consec + 1
            for i in range(len(all_slots_ordered) - window_len + 1):
                window = all_slots_ordered[i:i + window_len]
                window_vars = [slots[(a["id"], d, p)] for (d, p) in window for a in t_asgs]
                if len(window_vars) <= max_consec:
                    continue
                over = model.NewBoolVar(f"gconsec_{t}_{i}")
                model.Add(sum(window_vars) >= window_len).OnlyEnforceIf(over)
                model.Add(sum(window_vars) <= window_len - 1).OnlyEnforceIf(over.Not())
                soft_terms_ref.append((weight, over))

    def _add_teacher_prefer_compact_soft(spec, soft_terms_ref):
        params = spec.get("params", {})
        teacher = params.get("teacher")
        weight = _soft_weight(spec)
        target_teachers = [teacher] if teacher else list({a["teacher"] for a in assignments})
        for t in target_teachers:
            t_asgs = [a for a in assignments if a["teacher"] == t]
            if not t_asgs:
                continue
            for d in days:
                day_periods = _periods_for(d)
                if len(day_periods) < 3:
                    continue
                for i in range(1, len(day_periods) - 1):
                    p_before = day_periods[i - 1]
                    p_curr = day_periods[i]
                    p_after = day_periods[i + 1]
                    has_before = [slots[(a["id"], d, p_before)] for a in t_asgs]
                    has_curr = [slots[(a["id"], d, p_curr)] for a in t_asgs]
                    has_after = [slots[(a["id"], d, p_after)] for a in t_asgs]
                    gap = model.NewBoolVar(f"gap_{t}_{d}_{p_curr}")
                    model.Add(sum(has_curr) == 0).OnlyEnforceIf(gap)
                    model.Add(sum(has_curr) >= 1).OnlyEnforceIf(gap.Not())
                    has_surround = model.NewBoolVar(f"surr_{t}_{d}_{p_curr}")
                    model.Add(sum(has_before) >= 1).OnlyEnforceIf(has_surround)
                    model.Add(sum(has_after) >= 1).OnlyEnforceIf(has_surround)
                    model.Add(sum(has_before) + sum(has_after) <= 1).OnlyEnforceIf(has_surround.Not())
                    real_gap = model.NewBoolVar(f"rgap_{t}_{d}_{p_curr}")
                    model.AddBoolAnd([gap, has_surround]).OnlyEnforceIf(real_gap)
                    model.AddBoolOr([gap.Not(), has_surround.Not()]).OnlyEnforceIf(real_gap.Not())
                    soft_terms_ref.append((weight, real_gap))

    def _add_class_balanced_daily_load_soft(spec, soft_terms_ref):
        params = spec.get("params", {})
        target_class = params.get("class")
        max_diff = int(params.get("maxDiff", 1) or 1)
        weight = _soft_weight(spec)
        target_classes = [target_class] if target_class else data["classes"]
        for c in target_classes:
            c_asgs = [a for a in assignments if a["class"] == c]
            if not c_asgs:
                continue
            day_counts = []
            for d in days:
                day_var = model.NewIntVar(0, len(c_asgs) * len(_periods_for(d)), f"load_{c}_{d}")
                model.Add(day_var == sum(slots[(a["id"], d, p)] for a in c_asgs for p in _periods_for(d)))
                day_counts.append(day_var)
            for i in range(len(day_counts)):
                for j in range(i + 1, len(day_counts)):
                    diff = model.NewIntVar(0, 20, f"ldiff_{c}_{i}_{j}")
                    model.Add(diff >= day_counts[i] - day_counts[j] - max_diff)
                    model.Add(diff >= day_counts[j] - day_counts[i] - max_diff)
                    soft_terms_ref.append((weight, diff))

    def _add_subject_not_consecutive_days_soft(spec, soft_terms_ref):
        params = spec.get("params", {})
        subject = params.get("subject")
        target_classes = set(params.get("classes") or data["classes"])
        weight = _soft_weight(spec)
        for c in target_classes:
            c_asgs = [a for a in assignments if a["class"] == c and a["subject"] == subject]
            if not c_asgs:
                continue
            for i in range(len(days) - 1):
                d1, d2 = days[i], days[i + 1]
                has_d1 = [slots[(a["id"], d1, p)] for a in c_asgs for p in _periods_for(d1)]
                has_d2 = [slots[(a["id"], d2, p)] for a in c_asgs for p in _periods_for(d2)]
                if not has_d1 or not has_d2:
                    continue
                b1 = model.NewBoolVar(f"ncd1_{c}_{subject}_{d1}")
                model.Add(sum(has_d1) >= 1).OnlyEnforceIf(b1)
                model.Add(sum(has_d1) == 0).OnlyEnforceIf(b1.Not())
                b2 = model.NewBoolVar(f"ncd2_{c}_{subject}_{d2}")
                model.Add(sum(has_d2) >= 1).OnlyEnforceIf(b2)
                model.Add(sum(has_d2) == 0).OnlyEnforceIf(b2.Not())
                both = model.NewBoolVar(f"ncboth_{c}_{subject}_{i}")
                model.AddBoolAnd([b1, b2]).OnlyEnforceIf(both)
                model.AddBoolOr([b1.Not(), b2.Not()]).OnlyEnforceIf(both.Not())
                soft_terms_ref.append((weight, both))

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
                    slot_vars = [slots[(a["id"], d, p)] for a in asgs for p in _periods_for(d)]
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
                day_slots = [slots[(a["id"], d, p)] for a in teacher_asgs for p in _periods_for(d)]
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
                    window_slot_vars = [slots[(a["id"], d, p)] for a in asgs for p in window]
                    if soft_terms_ref is None:
                        model.Add(sum(window_slot_vars) <= max_consecutive)
                    else:
                        over = model.NewBoolVar(f"soft_consec_{c}_{subject}_{d}_{window[0]}")
                        model.Add(sum(window_slot_vars) >= window_length).OnlyEnforceIf(over)
                        model.Add(sum(window_slot_vars) <= window_length - 1).OnlyEnforceIf(over.Not())
                        soft_terms_ref.append((_soft_weight(spec), over))

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

    ctx = {
        "model": model,
        "slots": slots,
        "data": data,
        "assignments": assignments,
        "days": days,
        "constraints": constraints,
        "periods_for": _periods_for,
        "soft_weight": _soft_weight,
        "penalize_forbidden_slots": _penalize_forbidden_slots,
        "penalize_excess": _penalize_excess,
        "resolve_group_subjects": _resolve_group_subjects,
        "add_subject_spread_evenly_soft": _add_subject_spread_evenly_soft,
        "add_teacher_max_consecutive_global_soft": _add_teacher_max_consecutive_global_soft,
        "add_teacher_prefer_compact_soft": _add_teacher_prefer_compact_soft,
        "add_class_balanced_daily_load_soft": _add_class_balanced_daily_load_soft,
        "add_subject_not_consecutive_days_soft": _add_subject_not_consecutive_days_soft,
        "add_class_subjects_not_same_day": _add_class_subjects_not_same_day,
        "add_teacher_max_working_days": _add_teacher_max_working_days,
        "add_subject_max_consecutive": _add_subject_max_consecutive,
        "add_subject_consecutive": _add_subject_consecutive,
    }

    def _apply_then_constraint(then_spec, guard):
        kind = then_spec.get("kind")
        handler = THEN_CONSTRAINT_HANDLERS.get(kind)
        if handler is None:
            raise NotImplementedError(f"Unsupported if_then then kind: {kind}")
        handler(ctx, then_spec, guard=guard)

    ctx["build_condition_literal"] = _build_condition_literal
    ctx["apply_then_constraint"] = _apply_then_constraint

    for spec in constraints:
        kind = spec.get("kind")
        severity = spec.get("severity", "hard")

        if severity != "hard":
            handler = SOFT_CONSTRAINT_HANDLERS.get(kind)
            if handler is not None:
                handler(ctx, spec, soft_terms_ref=soft_terms)
            continue

        handler = HARD_CONSTRAINT_HANDLERS.get(kind)
        if handler is None:
            raise NotImplementedError(
                f"Unsupported HARD constraint kind in solver skeleton: {kind} (id={spec.get('id')})"
            )
        handler(ctx, spec)

    # === AI custom_dsl injection (chạy đúng 1 lần, ngoài vòng for spec) ===
    # Skeleton không tự guard bằng custom_specs: coder prompt đã filter custom_dsl,
    # nên để generated code tự quyết định no-op khi không có custom hard specs.
    custom_specs = [s for s in constraints if s.get("kind") == "custom_dsl" and s.get("severity", "hard") == "hard"]
    # <<< AI_FILL_HERE >>>
    pass

    return soft_terms


soft_terms = build_custom_constraints(model, slots, data)

# Add unscheduled penalty terms (highest priority — must be minimized before soft constraints)
_unscheduled_terms = [(_UNSCHEDULED_PENALTY, uv) for uv in unscheduled.values()]

solver = cp_model.CpSolver()
try:
    _max_seconds = float(_os.environ.get("SOLVER_MAX_SECONDS", "") or 60.0)
except Exception:
    _max_seconds = 60.0

import multiprocessing as _mp
try:
    _workers = int(_os.environ.get("SOLVER_WORKERS", "") or 0)
except Exception:
    _workers = 0
if _workers <= 0:
    _workers = min(8, max(1, _mp.cpu_count() or 4))
solver.parameters.num_search_workers = _workers

try:
    solver.parameters.random_seed = int(_os.environ.get("SOLVER_RANDOM_SEED", "") or 42)
except Exception:
    solver.parameters.random_seed = 42

solver.parameters.linearization_level = 2

best_values = None
best_unscheduled_values = {}

_real_slots = {k: v for k, v in slots.items() if v is not _ZERO}

_all_terms = _unscheduled_terms + soft_terms
if _all_terms:
    # Phase 1: find any feasible solution quickly
    phase1 = max(5.0, _max_seconds * 0.35)
    solver.parameters.max_time_in_seconds = phase1
    status = solver.Solve(model)
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        best_values = {key: solver.Value(var) for key, var in _real_slots.items()}
        best_unscheduled_values = {aid: solver.Value(uv) for aid, uv in unscheduled.items()}
        for key, var in _real_slots.items():
            model.AddHint(var, best_values[key])

    # Phase 2: optimize (unscheduled penalty + soft constraints)
    model.Minimize(sum(int(w) * v for (w, v) in _all_terms))
    phase2 = max(5.0, _max_seconds - phase1)
    solver.parameters.max_time_in_seconds = phase2
    status2 = solver.Solve(model)
    if status2 in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        best_values = {key: solver.Value(var) for key, var in _real_slots.items()}
        best_unscheduled_values = {aid: solver.Value(uv) for aid, uv in unscheduled.items()}
        status = status2
else:
    solver.parameters.max_time_in_seconds = _max_seconds
    status = solver.Solve(model)
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        best_values = {key: solver.Value(var) for key, var in _real_slots.items()}
        best_unscheduled_values = {aid: solver.Value(uv) for aid, uv in unscheduled.items()}

# Collect assignments that could not be fully scheduled
_partial_assignments = [
    {"assignmentId": aid, "missing": cnt}
    for aid, cnt in best_unscheduled_values.items()
    if cnt > 0
]

result = {
    "classes": classes,
    "days": days,
    "periods": periods,
    "assignments": assignments,
    "status": solver.StatusName(status).lower(),
    "schedule": [],
    "partialAssignments": _partial_assignments,
}

if best_values is not None:
    for a in assignments:
        for d in days:
            for p in periods_for_day(d):
                key = (a["id"], d, p)
                if key in _infeasible:
                    continue
                if best_values.get(key) == 1:
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
    if _partial_assignments:
        print(f"PARTIAL_SOLUTION:{len(_partial_assignments)}")
    else:
        print("SOLUTION_FOUND")
else:
    with open("result.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    print(f"NO_SOLUTION:{solver.StatusName(status)}")
