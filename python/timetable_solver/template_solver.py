"""Canonical parsed-constraint timetable solver template."""

from __future__ import annotations

import re

from timetable_solver.base_solver_template import solve_base_model


VN_DAY_MAP = {
    "thứ 2": "monday", "thứ hai": "monday",
    "thứ 3": "tuesday", "thứ ba": "tuesday",
    "thứ 4": "wednesday", "thứ tư": "wednesday",
    "thứ 5": "thursday", "thứ năm": "thursday",
    "thứ 6": "friday", "thứ sáu": "friday",
    "thứ 7": "saturday", "thứ bảy": "saturday",
    "chủ nhật": "sunday", "cn": "sunday",
}


def _normalize_parsed(items):
    normalized = []
    for item in items or []:
        parsed = item.get("parsed") if isinstance(item.get("parsed"), dict) else None
        if parsed:
            kind = parsed.get("kind")
            params = {k: v for k, v in parsed.items() if k != "kind"}
        else:
            kind = item.get("kind")
            params = item.get("params") if isinstance(item.get("params"), dict) else {}
        if not kind:
            continue
        normalized.append({
            "id": item.get("id", ""),
            "original": item.get("original", item.get("text", "")),
            "kind": kind,
            "params": params or {},
            "weight": item.get("weight", 1),
        })
    return normalized


def _legacy_parse(problem):
    parsed_hard = []
    parsed_soft = []
    for hc in problem.get("hardConstraints", []) or []:
        text = (hc.get("text") or "").lower()
        params = {}
        day_ids = [day_id for key, day_id in VN_DAY_MAP.items() if key in text]
        period_match = re.search(r"tiết\s+(\d+)", text)
        if "không dạy" in text and day_ids:
            params = {"teacherLabels": [], "dayIds": day_ids}
            kind = "teacher_block_days"
        elif "không dạy" in text and period_match:
            params = {"teacherLabels": [], "periods": [int(period_match.group(1))]}
            kind = "teacher_block_periods"
        elif "không học" in text and day_ids:
            params = {"classLabels": [], "dayIds": day_ids}
            kind = "class_block_days"
        else:
            kind = "unparsed"
            params = {"reason": "Legacy parser không khớp pattern."}
        parsed_hard.append({"id": hc.get("id", ""), "original": hc.get("text", ""), "kind": kind, "params": params})

    for sc in problem.get("softConstraints", []) or []:
        text = (sc.get("text") or "").lower()
        rng = re.search(r"tiết\s+(\d+)\s*[-–]\s*(\d+)", text)
        single = re.search(r"tiết\s+(\d+)", text)
        if rng:
            lo, hi = int(rng.group(1)), int(rng.group(2))
            periods = list(range(min(lo, hi), max(lo, hi) + 1))
            kind = "subject_prefer_periods"
            params = {"subjectLabels": [], "periods": periods}
        elif single:
            kind = "subject_prefer_periods"
            params = {"subjectLabels": [], "periods": [int(single.group(1))]}
        else:
            kind = "unparsed"
            params = {"reason": "Legacy parser không khớp pattern."}
        parsed_soft.append({
            "id": sc.get("id", ""),
            "original": sc.get("text", ""),
            "kind": kind,
            "params": params,
            "weight": sc.get("weight", 1),
        })
    return parsed_hard, parsed_soft


def _slots(meta, key, values):
    result = []
    lookup = meta.get(key, {}) or {}
    for value in values or []:
        result.extend(lookup.get(str(value), []))
    return list(dict.fromkeys(result))


def _slot_ids_for_day_period(meta, day_ids, periods):
    result = []
    lookup = meta.get("slotsByDayPeriod", {}) or {}
    for day_id in day_ids or []:
        for period in periods or []:
            result.extend(lookup.get(f"{day_id}__{period}", []))
    return list(dict.fromkeys(result))


def _slot_ids_for_session_day(meta, session_ids, day_ids):
    result = []
    lookup = meta.get("slotsByDaySession", {}) or {}
    for day_id in day_ids or []:
        for session_id in session_ids or []:
            result.extend(lookup.get(f"{day_id}__{session_id}", []))
    return list(dict.fromkeys(result))


def _labels_to_asgs(labels, label_map):
    if labels == "*":
        ids = []
        for group in label_map.values():
            ids.extend(group)
        return list(dict.fromkeys(ids))
    result = []
    for label in labels or []:
        result.extend(label_map.get(label, []))
    return list(dict.fromkeys(result))


def _all_slots(meta):
    result = []
    for group in (meta.get("slotsByDayId", {}) or {}).values():
        result.extend(group)
    return set(result)


def _sorted_day_slots(slots_by_day, slot_map, day_id):
    return sorted(
        [slot_map[sid] for sid in slots_by_day.get(day_id, []) if sid in slot_map],
        key=lambda slot: slot["period"],
    )


def _force_zero(model, x, asg_ids, slot_ids, lit):
    for asg_id in asg_ids:
        for slot_id in slot_ids:
            if (asg_id, slot_id) in x:
                model.Add(x[(asg_id, slot_id)] == 0).OnlyEnforceIf(lit)


def solve_timetable(problem):
    meta = problem.get("meta", {}) or {}
    teacher_to_asgs = meta.get("teacherToAsgIds", {}) or {}
    class_to_asgs = meta.get("classToAsgIds", {}) or {}
    subject_to_asgs = meta.get("subjectToAsgIds", {}) or {}
    slots_by_day = meta.get("slotsByDayId", {}) or {}
    slots_by_period = meta.get("slotsByPeriod", {}) or {}
    slots_by_session = meta.get("slotsBySessionId", {}) or {}
    parsed_hard = _normalize_parsed(problem.get("parsedHard"))
    parsed_soft = _normalize_parsed(problem.get("parsedSoft"))
    if not parsed_hard and not parsed_soft:
        parsed_hard, parsed_soft = _legacy_parse(problem)

    def extra_setup(base, objective_terms, diagnostics):
        model = base["model"]
        x = base["x"]
        slots = base["slots"]
        assignments = base["assignments"]
        hc_lits = base.get("hardConstraintLiterals", {})
        slot_map = {s["slotId"]: s for s in slots}
        asg_map = {a["assignmentId"]: a for a in assignments}
        all_slot_ids = _all_slots(meta)

        for constraint in parsed_hard:
            cid = constraint["id"]
            kind = constraint["kind"]
            params = constraint["params"]
            lit = hc_lits.get(cid)
            if lit is None or kind == "unparsed":
                continue

            if kind == "teacher_block_days":
                _force_zero(model, x, _labels_to_asgs(params.get("teacherLabels"), teacher_to_asgs), _slots(meta, "slotsByDayId", params.get("dayIds")), lit)
            elif kind == "teacher_block_periods":
                _force_zero(model, x, _labels_to_asgs(params.get("teacherLabels"), teacher_to_asgs), _slots(meta, "slotsByPeriod", params.get("periods")), lit)
            elif kind == "teacher_block_sessions":
                _force_zero(model, x, _labels_to_asgs(params.get("teacherLabels"), teacher_to_asgs), _slots(meta, "slotsBySessionId", params.get("sessionIds")), lit)
            elif kind == "teacher_block_day_period":
                _force_zero(model, x, _labels_to_asgs(params.get("teacherLabels"), teacher_to_asgs), _slot_ids_for_day_period(meta, params.get("dayIds"), params.get("periods")), lit)
            elif kind == "teacher_block_session_day":
                _force_zero(model, x, _labels_to_asgs(params.get("teacherLabels"), teacher_to_asgs), _slot_ids_for_session_day(meta, params.get("sessionIds"), params.get("dayIds")), lit)
            elif kind == "teacher_allow_only_days":
                allowed = set(_slots(meta, "slotsByDayId", params.get("dayIds")))
                _force_zero(model, x, _labels_to_asgs(params.get("teacherLabels"), teacher_to_asgs), all_slot_ids - allowed, lit)
            elif kind == "teacher_allow_only_sessions":
                allowed = set(_slots(meta, "slotsBySessionId", params.get("sessionIds")))
                _force_zero(model, x, _labels_to_asgs(params.get("teacherLabels"), teacher_to_asgs), all_slot_ids - allowed, lit)
            elif kind == "class_block_days":
                _force_zero(model, x, _labels_to_asgs(params.get("classLabels"), class_to_asgs), _slots(meta, "slotsByDayId", params.get("dayIds")), lit)
            elif kind == "subject_block_periods":
                _force_zero(model, x, _labels_to_asgs(params.get("subjectLabels"), subject_to_asgs), _slots(meta, "slotsByPeriod", params.get("periods")), lit)
            elif kind == "subject_pin_periods":
                allowed = set(_slots(meta, "slotsByPeriod", params.get("periods")))
                for asg_id in _labels_to_asgs(params.get("subjectLabels"), subject_to_asgs):
                    terms = [x[(asg_id, sid)] for sid in allowed if (asg_id, sid) in x]
                    if terms:
                        model.Add(sum(terms) >= 1).OnlyEnforceIf(lit)
            elif kind == "subject_only_sessions":
                allowed = set(_slots(meta, "slotsBySessionId", params.get("sessionIds")))
                _force_zero(model, x, _labels_to_asgs(params.get("subjectLabels"), subject_to_asgs), all_slot_ids - allowed, lit)
            elif kind == "subject_block_consecutive":
                block_size = int(params.get("blockSize") or 2)
                for asg_id in _labels_to_asgs(params.get("subjectLabels"), subject_to_asgs):
                    weekly = int(asg_map.get(asg_id, {}).get("weeklyPeriods", 0))
                    if block_size <= 1 or weekly <= 0 or weekly % block_size != 0:
                        diagnostics.append(f"{cid}: block size không chia hết weeklyPeriods, bỏ hard block.")
                        continue
                    starts = []
                    for day_id in slots_by_day:
                        day_slots = _sorted_day_slots(slots_by_day, slot_map, day_id)
                        for i in range(len(day_slots) - block_size + 1):
                            window = day_slots[i:i + block_size]
                            if any(window[j + 1]["period"] != window[j]["period"] + 1 for j in range(block_size - 1)):
                                continue
                            start = model.NewBoolVar(f"blk_{cid}_{asg_id}_{day_id}_{i}")
                            starts.append(start)
                            for slot in window:
                                model.Add(x[(asg_id, slot["slotId"])] >= start).OnlyEnforceIf(lit)
                    if starts:
                        model.Add(sum(starts) * block_size == weekly).OnlyEnforceIf(lit)
            elif kind == "teacher_max_consecutive":
                max_consecutive = int(params.get("max") or 1)
                labels = params.get("teacherLabels")
                groups = teacher_to_asgs.values() if labels == "*" else [teacher_to_asgs.get(label, []) for label in labels or []]
                for asg_ids in groups:
                    for day_id in slots_by_day:
                        day_slots = _sorted_day_slots(slots_by_day, slot_map, day_id)
                        for i in range(len(day_slots) - max_consecutive):
                            window = day_slots[i:i + max_consecutive + 1]
                            terms = [x[(asg_id, slot["slotId"])] for asg_id in asg_ids for slot in window if (asg_id, slot["slotId"]) in x]
                            if terms:
                                model.Add(sum(terms) <= max_consecutive).OnlyEnforceIf(lit)
            elif kind == "teacher_min_off_days":
                minimum = int(params.get("min") or 1)
                labels = params.get("teacherLabels")
                groups = teacher_to_asgs.values() if labels == "*" else [teacher_to_asgs.get(label, []) for label in labels or []]
                for index, asg_ids in enumerate(groups):
                    has_days = []
                    for day_id in slots_by_day:
                        terms = [x[(asg_id, sid)] for asg_id in asg_ids for sid in slots_by_day.get(day_id, []) if (asg_id, sid) in x]
                        has_day = model.NewBoolVar(f"teacher_has_{cid}_{index}_{day_id}")
                        if terms:
                            model.AddMaxEquality(has_day, terms)
                        else:
                            model.Add(has_day == 0)
                        has_days.append(has_day)
                    if has_days:
                        model.Add(sum(day.Not() for day in has_days) >= minimum).OnlyEnforceIf(lit)
            elif kind == "class_daily_subject_any":
                class_labels = class_to_asgs.keys() if params.get("classLabels") == "*" else params.get("classLabels") or []
                subjects = set(params.get("subjectLabels") or [])
                for class_label in class_labels:
                    class_asgs = [asg for asg in class_to_asgs.get(class_label, []) if asg_map.get(asg, {}).get("subjectLabel") in subjects]
                    for day_id, slot_ids in slots_by_day.items():
                        terms = [x[(asg_id, sid)] for asg_id in class_asgs for sid in slot_ids if (asg_id, sid) in x]
                        if terms:
                            model.Add(sum(terms) >= 1).OnlyEnforceIf(lit)
            elif kind == "subjects_not_consecutive":
                subject_labels = set(params.get("subjectLabels") or [])
                for class_label, class_asgs in class_to_asgs.items():
                    target_asgs = [asg for asg in class_asgs if asg_map.get(asg, {}).get("subjectLabel") in subject_labels]
                    for day_id in slots_by_day:
                        day_slots = _sorted_day_slots(slots_by_day, slot_map, day_id)
                        for left, right in zip(day_slots, day_slots[1:]):
                            if right["period"] != left["period"] + 1:
                                continue
                            terms = [x[(asg, left["slotId"])] for asg in target_asgs if (asg, left["slotId"]) in x]
                            next_terms = [x[(asg, right["slotId"])] for asg in target_asgs if (asg, right["slotId"]) in x]
                            if terms and next_terms:
                                model.Add(sum(terms) + sum(next_terms) <= 1).OnlyEnforceIf(lit)

        for constraint in parsed_soft:
            kind = constraint["kind"]
            params = constraint["params"]
            weight = int(constraint.get("weight") or 1)
            if kind == "subject_prefer_periods":
                class_filter = set(params.get("classFilter") or [])
                for asg_id in _labels_to_asgs(params.get("subjectLabels"), subject_to_asgs):
                    if class_filter and asg_map.get(asg_id, {}).get("classLabel") not in class_filter:
                        continue
                    for slot_id in _slots(meta, "slotsByPeriod", params.get("periods")):
                        if (asg_id, slot_id) in x:
                            objective_terms.append(weight * x[(asg_id, slot_id)])
            elif kind == "subject_block_periods":
                for asg_id in _labels_to_asgs(params.get("subjectLabels"), subject_to_asgs):
                    for slot_id in _slots(meta, "slotsByPeriod", params.get("periods")):
                        if (asg_id, slot_id) in x:
                            objective_terms.append(-weight * x[(asg_id, slot_id)])
            elif kind == "subject_only_sessions":
                allowed = set(_slots(meta, "slotsBySessionId", params.get("sessionIds")))
                for asg_id in _labels_to_asgs(params.get("subjectLabels"), subject_to_asgs):
                    for slot_id in all_slot_ids - allowed:
                        if (asg_id, slot_id) in x:
                            objective_terms.append(-weight * x[(asg_id, slot_id)])
            elif kind == "subject_prefer_sessions":
                for asg_id in _labels_to_asgs(params.get("subjectLabels"), subject_to_asgs):
                    for slot_id in _slots(meta, "slotsBySessionId", params.get("sessionIds")):
                        if (asg_id, slot_id) in x:
                            objective_terms.append(weight * x[(asg_id, slot_id)])
            elif kind == "subject_block_consecutive":
                block_size = int(params.get("blockSize") or 2)
                if block_size > 1:
                    for asg_id in _labels_to_asgs(params.get("subjectLabels"), subject_to_asgs):
                        for day_id in slots_by_day:
                            day_slots = _sorted_day_slots(slots_by_day, slot_map, day_id)
                            for i in range(len(day_slots) - block_size + 1):
                                window = day_slots[i:i + block_size]
                                if any(window[j + 1]["period"] != window[j]["period"] + 1 for j in range(block_size - 1)):
                                    continue
                                reward = model.NewBoolVar(f"soft_block_{constraint['id']}_{asg_id}_{day_id}_{i}")
                                for slot in window:
                                    model.Add(x[(asg_id, slot["slotId"])] >= reward)
                                objective_terms.append(weight * reward)
            elif kind == "class_daily_subject_any":
                class_labels = class_to_asgs.keys() if params.get("classLabels") == "*" else params.get("classLabels") or []
                subjects = set(params.get("subjectLabels") or [])
                for class_label in class_labels:
                    class_asgs = [asg for asg in class_to_asgs.get(class_label, []) if asg_map.get(asg, {}).get("subjectLabel") in subjects]
                    for day_id, slot_ids in slots_by_day.items():
                        terms = [x[(asg_id, sid)] for asg_id in class_asgs for sid in slot_ids if (asg_id, sid) in x]
                        if terms:
                            hit = model.NewBoolVar(f"soft_day_any_{constraint['id']}_{class_label}_{day_id}")
                            model.AddMaxEquality(hit, terms)
                            objective_terms.append(weight * hit)
            elif kind == "subjects_not_consecutive":
                subject_labels = set(params.get("subjectLabels") or [])
                for class_label, class_asgs in class_to_asgs.items():
                    target_asgs = [asg for asg in class_asgs if asg_map.get(asg, {}).get("subjectLabel") in subject_labels]
                    for day_id in slots_by_day:
                        day_slots = _sorted_day_slots(slots_by_day, slot_map, day_id)
                        for i, (left, right) in enumerate(zip(day_slots, day_slots[1:])):
                            if right["period"] != left["period"] + 1:
                                continue
                            for asg_a in target_asgs:
                                for asg_b in target_asgs:
                                    if (asg_a, left["slotId"]) not in x or (asg_b, right["slotId"]) not in x:
                                        continue
                                    pair = model.NewBoolVar(f"soft_nonconsec_{constraint['id']}_{class_label}_{day_id}_{i}_{asg_a}_{asg_b}")
                                    model.AddBoolAnd([x[(asg_a, left["slotId"])], x[(asg_b, right["slotId"])]]).OnlyEnforceIf(pair)
                                    model.AddBoolOr([x[(asg_a, left["slotId"])].Not(), x[(asg_b, right["slotId"])].Not()]).OnlyEnforceIf(pair.Not())
                                    objective_terms.append(-weight * pair)

    return solve_base_model(problem, extra_setup=extra_setup)
