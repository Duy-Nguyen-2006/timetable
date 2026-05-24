"""Canonical generated-solver template.

Used as a deterministic fallback when the Coder LLM fails to return valid code.
Implements the common Vietnamese constraint patterns directly so that schedules
remain solvable even without a working LLM artifact.
"""

import re

from timetable_solver.base_solver_template import solve_base_model


VN_DAY_MAP = {
    "thứ 2": "monday", "thứ hai": "monday",
    "thứ 3": "tuesday", "thứ ba": "tuesday",
    "thứ 4": "wednesday", "thứ tư": "wednesday",
    "thứ 5": "thursday", "thứ năm": "thursday",
    "thứ 6": "friday", "thứ sáu": "friday",
    "thứ 7": "saturday", "thứ bảy": "saturday",
    "chủ nhật": "sunday",
}


def solve_timetable(problem):
    hard_constraints = problem.get("hardConstraints", [])
    soft_constraints = problem.get("softConstraints", [])
    meta = problem.get("meta", {}) or {}
    teacher_to_asgs = meta.get("teacherToAsgIds", {})
    class_to_asgs = meta.get("classToAsgIds", {})
    subject_to_asgs = meta.get("subjectToAsgIds", {})
    slots_by_day = meta.get("slotsByDayId", {})
    slots_by_period = meta.get("slotsByPeriod", {})

    def find_day(text):
        for k, v in VN_DAY_MAP.items():
            if k in text:
                return v
        return None

    def find_period(text):
        m = re.search(r"tiết\s+(\d+)", text)
        return int(m.group(1)) if m else None

    def find_asgs(text, label_map):
        for label, ids in label_map.items():
            if label and label.lower() in text:
                return ids
        return []

    def extra_setup(base, objective_terms, diagnostics):
        model = base["model"]
        x = base["x"]
        slots = base["slots"]
        hc_lits = base.get("hardConstraintLiterals", {})
        slot_map = {s["slotId"]: s for s in slots}

        # ── Hard constraints ──────────────────────────────────────────────────
        for hc in hard_constraints:
            lit = hc_lits.get(hc["id"])
            if lit is None:
                continue
            text = hc["text"].lower().strip()
            day_id = find_day(text)
            period_num = find_period(text)

            if "không dạy" in text or "khong day" in text:
                asg_ids = find_asgs(text, teacher_to_asgs)
                if asg_ids and day_id:
                    for asg_id in asg_ids:
                        for slot_id in slots_by_day.get(day_id, []):
                            model.Add(x[(asg_id, slot_id)] == 0).OnlyEnforceIf(lit)
                elif asg_ids and period_num is not None:
                    for asg_id in asg_ids:
                        for slot_id in slots_by_period.get(str(period_num), []):
                            model.Add(x[(asg_id, slot_id)] == 0).OnlyEnforceIf(lit)

            elif "không học" in text or "khong hoc" in text:
                asg_ids = find_asgs(text, class_to_asgs)
                if asg_ids and day_id:
                    for asg_id in asg_ids:
                        for slot_id in slots_by_day.get(day_id, []):
                            model.Add(x[(asg_id, slot_id)] == 0).OnlyEnforceIf(lit)
                elif asg_ids and period_num is not None:
                    for asg_id in asg_ids:
                        for slot_id in slots_by_period.get(str(period_num), []):
                            model.Add(x[(asg_id, slot_id)] == 0).OnlyEnforceIf(lit)

        # ── Soft constraints ──────────────────────────────────────────────────
        for sc in soft_constraints:
            text = sc["text"].lower().strip()
            w = int(sc.get("weight", 5))

            if "xếp tiết" in text or "xep tiet" in text or "nên tiết" in text:
                rng = re.search(r"tiết\s+(\d+)\s*[\-–]\s*(\d+)", text)
                if rng:
                    lo, hi = int(rng.group(1)), int(rng.group(2))
                    periods = list(range(lo, hi + 1))
                else:
                    single = re.search(r"tiết\s+(\d+)", text)
                    periods = [int(single.group(1))] if single else []
                if not periods:
                    continue
                asg_ids = (
                    find_asgs(text, subject_to_asgs)
                    or find_asgs(text, teacher_to_asgs)
                    or find_asgs(text, class_to_asgs)
                )
                for asg_id in asg_ids:
                    for p in periods:
                        for slot_id in slots_by_period.get(str(p), []):
                            objective_terms.append(w * x[(asg_id, slot_id)])

            elif "liên tiếp" in text or "lien tiep" in text:
                m = re.search(r"(\d+)\s*tiết", text)
                block_size = int(m.group(1)) if m else 2
                asg_ids = (
                    find_asgs(text, subject_to_asgs)
                    or find_asgs(text, teacher_to_asgs)
                    or find_asgs(text, class_to_asgs)
                )
                for asg_id in asg_ids:
                    for day_id, day_sids in slots_by_day.items():
                        day_slots_sorted = sorted(
                            [slot_map[s] for s in day_sids if s in slot_map],
                            key=lambda s: s["period"],
                        )
                        for i in range(len(day_slots_sorted) - block_size + 1):
                            window = day_slots_sorted[i:i + block_size]
                            if any(
                                window[j + 1]["period"] != window[j]["period"] + 1
                                for j in range(block_size - 1)
                            ):
                                continue
                            reward = model.NewBoolVar(
                                f"blk_{sc['id']}_{asg_id}_{day_id}_{i}"
                            )
                            for slot_obj in window:
                                model.Add(x[(asg_id, slot_obj["slotId"])] >= reward)
                            objective_terms.append(w * reward)

    return solve_base_model(problem, extra_setup=extra_setup)
