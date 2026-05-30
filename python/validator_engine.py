from __future__ import annotations

from typing import Any


def _to_period(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _evaluate_condition(condition: dict[str, Any], schedule: list[dict[str, Any]]) -> bool:
    op = condition.get("op")
    if op == "teacher_teaches_on_day":
        teacher = condition.get("teacher")
        day = condition.get("day")
        return any(e.get("teacher") == teacher and e.get("day") == day for e in schedule)
    if op == "teacher_teaches_at_slot":
        teacher = condition.get("teacher")
        day = condition.get("day")
        period = condition.get("period")
        return any(
            e.get("teacher") == teacher
            and e.get("day") == day
            and _to_period(e.get("period")) == _to_period(period)
            for e in schedule
        )
    if op == "and":
        return all(_evaluate_condition(arg, schedule) for arg in condition.get("args", []))
    if op == "or":
        return any(_evaluate_condition(arg, schedule) for arg in condition.get("args", []))
    if op == "not":
        return not _evaluate_condition(condition.get("arg", {}), schedule)
    return False


def _violation(constraint_id: str, kind: str, message: str, entries: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "constraintId": constraint_id,
        "kind": kind,
        "message": message,
        "offendingEntries": entries,
    }


def _base_checks(schedule: list[dict[str, Any]], assignments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    violations: list[dict[str, Any]] = []
    teacher_slot: dict[str, list[dict[str, Any]]] = {}
    class_slot: dict[str, list[dict[str, Any]]] = {}

    for entry in schedule:
        tkey = f"{entry.get('teacher')}::{entry.get('day')}::{entry.get('period')}"
        ckey = f"{entry.get('class')}::{entry.get('day')}::{entry.get('period')}"
        teacher_slot.setdefault(tkey, []).append(entry)
        class_slot.setdefault(ckey, []).append(entry)

    for entries in teacher_slot.values():
        if len(entries) > 1:
            violations.append(
                _violation(
                    "base_teacher_clash",
                    "base_constraint",
                    "Teacher clash tại cùng slot.",
                    entries,
                )
            )

    for entries in class_slot.values():
        if len(entries) > 1:
            violations.append(
                _violation(
                    "base_class_clash",
                    "base_constraint",
                    "Class clash tại cùng slot.",
                    entries,
                )
            )

    for assignment in assignments:
        matched = [
            e
            for e in schedule
            if e.get("class") == assignment.get("class")
            and e.get("subject") == assignment.get("subject")
            and e.get("teacher") == assignment.get("teacher")
        ]
        expected = int(assignment.get("weeklyPeriods", 0))
        if len(matched) != expected:
            violations.append(
                _violation(
                    f"base_weekly_{assignment.get('id', 'unknown')}",
                    "base_constraint",
                    f"Weekly periods mismatch: expected {expected}, got {len(matched)}.",
                    matched,
                )
            )
    return violations


def _resolve_group_subjects(group_name: str, constraint_specs: list[dict[str, Any]]) -> set[Any]:
    subjects: set[Any] = set()
    for spec in constraint_specs:
        if spec.get("kind") != "subject_group":
            continue
        params = spec.get("params", {}) or {}
        if str(params.get("name", "")) != group_name:
            continue
        for subject in params.get("subjects", []) or []:
            subjects.add(subject)
    return subjects


def _check_single(
    spec: dict[str, Any],
    schedule: list[dict[str, Any]],
    constraint_specs: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    constraint_specs = constraint_specs or []
    kind = spec.get("kind")
    params = spec.get("params", {})
    cid = spec.get("id", "unknown")

    if kind == "subject_group":
        return []

    if kind == "teacher_block_day":
        entries = [e for e in schedule if e.get("teacher") == params.get("teacher") and e.get("day") == params.get("day")]
        return [] if not entries else [_violation(cid, kind, "teacher_block_day violated.", entries)]

    if kind == "teacher_block_period":
        period = _to_period(params.get("period"))
        entries = [e for e in schedule if e.get("teacher") == params.get("teacher") and _to_period(e.get("period")) == period]
        return [] if not entries else [_violation(cid, kind, "teacher_block_period violated.", entries)]

    if kind == "teacher_block_slot":
        period = _to_period(params.get("period"))
        entries = [
            e
            for e in schedule
            if e.get("teacher") == params.get("teacher")
            and e.get("day") == params.get("day")
            and _to_period(e.get("period")) == period
        ]
        return [] if not entries else [_violation(cid, kind, "teacher_block_slot violated.", entries)]

    if kind == "teacher_max_per_day":
        max_per_day = int(params.get("maxPerDay", 0))
        by_day: dict[str, list[dict[str, Any]]] = {}
        for entry in schedule:
            if entry.get("teacher") != params.get("teacher"):
                continue
            by_day.setdefault(str(entry.get("day")), []).append(entry)
        out: list[dict[str, Any]] = []
        for entries in by_day.values():
            if len(entries) > max_per_day:
                out.append(_violation(cid, kind, "teacher_max_per_day violated.", entries))
        return out

    if kind == "teacher_max_consecutive":
        max_consecutive = int(params.get("maxConsecutive", 0))
        by_day: dict[str, list[int]] = {}
        for entry in schedule:
            if entry.get("teacher") != params.get("teacher"):
                continue
            p = _to_period(entry.get("period"))
            if p is None:
                continue
            by_day.setdefault(str(entry.get("day")), []).append(p)

        out: list[dict[str, Any]] = []
        for day, periods in by_day.items():
            sorted_periods = sorted(periods)
            if not sorted_periods:
                continue
            streak = 1 if sorted_periods else 0
            longest = streak
            for i in range(1, len(sorted_periods)):
                if sorted_periods[i] == sorted_periods[i - 1] + 1:
                    streak += 1
                else:
                    streak = 1
                longest = max(longest, streak)
            if longest > max_consecutive:
                entries = [
                    e
                    for e in schedule
                    if e.get("teacher") == params.get("teacher") and e.get("day") == day
                ]
                out.append(_violation(cid, kind, "teacher_max_consecutive violated.", entries))
        return out

    if kind == "subject_pin_period":
        allowed = {_to_period(p) for p in params.get("periods", [])}
        classes = params.get("classes")
        entries = []
        for entry in schedule:
            if entry.get("subject") != params.get("subject"):
                continue
            if classes and entry.get("class") not in classes:
                continue
            if _to_period(entry.get("period")) not in allowed:
                entries.append(entry)
        return [] if not entries else [_violation(cid, kind, "subject_pin_period violated.", entries)]

    if kind == "subject_consecutive":
        length = int(params.get("length", 2))
        subject = params.get("subject")
        classes = params.get("classes")
        grouped: dict[str, list[dict[str, Any]]] = {}
        for entry in schedule:
            if entry.get("subject") != subject:
                continue
            if classes and entry.get("class") not in classes:
                continue
            grouped.setdefault(f"{entry.get('class')}::{entry.get('day')}", []).append(entry)

        out: list[dict[str, Any]] = []
        for entries in grouped.values():
            periods = sorted(
                p for p in (_to_period(e.get("period")) for e in entries) if p is not None
            )
            if len(periods) < length:
                continue
            total_periods = len(periods)
            required_runs = total_periods // length
            runs_of_correct_length = 0
            streak = 1
            for i in range(1, len(periods)):
                if periods[i] == periods[i - 1] + 1:
                    streak += 1
                else:
                    if streak >= length:
                        runs_of_correct_length += streak // length
                    streak = 1
            if streak >= length:
                runs_of_correct_length += streak // length
            if runs_of_correct_length < required_runs:
                out.append(_violation(cid, kind, "subject_consecutive violated.", entries))
        return out

    if kind == "class_no_double_subject_day":
        klass = params.get("class")
        subject = params.get("subject")
        try:
            max_per_day = int(params.get("maxPerDay", 1))
        except (TypeError, ValueError):
            max_per_day = 1
        if max_per_day < 1:
            max_per_day = 1
        grouped: dict[str, list[dict[str, Any]]] = {}
        for entry in schedule:
            if entry.get("class") != klass:
                continue
            if subject and entry.get("subject") != subject:
                continue
            key = f"{entry.get('day')}::{entry.get('subject')}"
            grouped.setdefault(key, []).append(entry)
        out: list[dict[str, Any]] = []
        for entries in grouped.values():
            if len(entries) > max_per_day:
                out.append(_violation(cid, kind, "class_no_double_subject_day violated.", entries))
        return out

    if kind == "weekly_periods_exact":
        expected = int(params.get("weeklyPeriods", 0))
        entries = [
            e
            for e in schedule
            if (not params.get("teacher") or e.get("teacher") == params.get("teacher"))
            and (not params.get("subject") or e.get("subject") == params.get("subject"))
            and (not params.get("class") or e.get("class") == params.get("class"))
        ]
        return [] if len(entries) == expected else [_violation(cid, kind, "weekly_periods_exact violated.", entries)]

    if kind == "pair_not_same_slot":
        teachers = params.get("teachers", [])
        if len(teachers) != 2:
            return []
        scope_day = (params.get("scope") or {}).get("day")
        relevant = [
            e
            for e in schedule
            if e.get("teacher") in teachers and (scope_day is None or e.get("day") == scope_day)
        ]
        slots: dict[str, list[dict[str, Any]]] = {}
        for entry in relevant:
            key = f"{entry.get('day')}::{entry.get('period')}"
            slots.setdefault(key, []).append(entry)
        out: list[dict[str, Any]] = []
        for entries in slots.values():
            if len({e.get("teacher") for e in entries}) > 1:
                out.append(_violation(cid, kind, "pair_not_same_slot violated.", entries))
        return out

    if kind == "if_then":
        condition = params.get("if", {})
        then_list = params.get("then", [])
        if not _evaluate_condition(condition, schedule):
            return []
        out: list[dict[str, Any]] = []
        for index, nested in enumerate(then_list):
            nested_spec = {
                "id": f"{cid}:then:{index + 1}",
                "kind": nested.get("kind", "custom_dsl"),
                "params": nested.get("params", {}),
            }
            for violation in _check_single(nested_spec, schedule, constraint_specs):
                out.append(
                    _violation(
                        cid,
                        kind,
                        f"if_then violated: {violation['message']}",
                        violation["offendingEntries"],
                    )
                )
        return out

    if kind == "resource_capacity":
        subject = params.get("subject")
        try:
            capacity = int(params.get("capacity", 1))
        except (TypeError, ValueError):
            capacity = 1
        by_slot: dict[str, list[dict[str, Any]]] = {}
        for entry in schedule:
            if entry.get("subject") != subject:
                continue
            key = f"{entry.get('day')}::{entry.get('period')}"
            by_slot.setdefault(key, []).append(entry)
        out: list[dict[str, Any]] = []
        for entries in by_slot.values():
            if len(entries) > capacity:
                out.append(_violation(cid, kind, "resource_capacity violated.", entries))
        return out

    if kind == "session_limit":
        teacher = params.get("teacher")
        try:
            max_periods = int(params.get("maxPeriods", 1))
        except (TypeError, ValueError):
            max_periods = 1
        if not teacher:
            return []
        by_day: dict[str, list[dict[str, Any]]] = {}
        for entry in schedule:
            if entry.get("teacher") != teacher:
                continue
            by_day.setdefault(str(entry.get("day")), []).append(entry)
        out: list[dict[str, Any]] = []
        for entries in by_day.values():
            if len(entries) > max_periods:
                out.append(_violation(cid, kind, "session_limit violated.", entries))
        return out

    if kind == "subject_group_daily_limit":
        group_name = str(params.get("groupName", ""))
        group_subjects = _resolve_group_subjects(group_name, constraint_specs)
        target_class = params.get("class")
        try:
            max_per_day = int(params.get("maxPerDay", 1))
        except (TypeError, ValueError):
            max_per_day = 1
        by_class_day_subjects: dict[str, set[Any]] = {}
        by_class_day_entries: dict[str, list[dict[str, Any]]] = {}
        for entry in schedule:
            if target_class and entry.get("class") != target_class:
                continue
            if group_subjects and entry.get("subject") not in group_subjects:
                continue
            key = f"{entry.get('class')}::{entry.get('day')}"
            by_class_day_subjects.setdefault(key, set()).add(entry.get("subject"))
            by_class_day_entries.setdefault(key, []).append(entry)
        out: list[dict[str, Any]] = []
        for key, subjects in by_class_day_subjects.items():
            if len(subjects) > max_per_day:
                out.append(
                    _violation(cid, kind, "subject_group_daily_limit violated.", by_class_day_entries.get(key, []))
                )
        return out

    return []


def validate_schedule(
    schedule: list[dict[str, Any]],
    constraint_specs: list[dict[str, Any]],
    assignments: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    assignments = assignments or []
    base_violations = _base_checks(schedule, assignments)
    violations = list(base_violations)
    unchecked: list[str] = []

    for spec in constraint_specs:
        if spec.get("kind") == "custom_dsl":
            unchecked.append(str(spec.get("id", "unknown")))
            continue
        violations.extend(_check_single(spec, schedule, constraint_specs))

    hard_ids = {spec.get("id") for spec in constraint_specs if spec.get("severity") == "hard"}
    soft_ids = {spec.get("id") for spec in constraint_specs if spec.get("severity") == "soft"}

    hard_violations = [
        v for v in violations if v.get("kind") == "base_constraint" or v.get("constraintId") in hard_ids
    ]
    soft_violations = [v for v in violations if v.get("constraintId") in soft_ids]

    return {
        "ok": len(violations) == 0,
        "baseConstraintPass": len(base_violations) == 0,
        "hardConstraintPass": len(hard_violations) == 0,
        "softConstraintPass": len(soft_violations) == 0,
        "violations": violations,
        "hardViolations": hard_violations,
        "softViolations": soft_violations,
        "uncheckedConstraintIds": unchecked,
    }
