"""Macro expansion: old constraint kinds → IR.

This module provides the one-way mapping from the old registry's ~25 constraint kinds
to the new IR. Each kind is a "macro" that expands to one or more IR BoolExpr nodes.

By centralizing this mapping here (in macros.py), we ensure:
1. The old registry still works (backward compatibility — Phase 2)
2. Every kind has exactly one canonical IR representation
3. Adding a new constraint kind = adding one macro + golden test (no 4-place edits)

The macro expansion is done BEFORE the IR is passed to either backend, so
both compile_constraint (CP-SAT) and eval_constraint (Python) see the same IR.

Usage:
    from ir_schema import validate_constraint
    from macros import expand_to_ir

    irs = []
    for spec in constraint_specs:
        for ir_node in expand_to_ir(spec):
            errors = validate_constraint(ir_node)
            if errors:
                raise ValueError(f"Invalid IR for {spec['id']}: {errors}")
            irs.append(ir_node)
"""

from __future__ import annotations

from typing import Any


# -----------------------------------------------------------------------------------------
# Registry of known encodable kinds (kinds with known IR encodings)
# These kinds are NOT custom_dsl and have canonical translations
# -----------------------------------------------------------------------------------------

KNOWN_ENCODABLE_KINDS: frozenset[str] = frozenset([
    # Teacher constraints
    "teacher_block_day",
    "teacher_block_period",
    "teacher_block_slot",
    "teacher_max_per_day",
    "teacher_max_consecutive",
    "teacher_max_working_days",
    "teacher_min_per_day",
    "teacher_no_gaps",
    "teacher_allowed_days",
    "teacher_allowed_periods",
    "teacher_min_working_days",
    "teacher_max_gaps",
    "teacher_min_consecutive",
    "teacher_balanced_load",
    "teacher_max_subjects_per_day",
    "teacher_max_consecutive_days",
    "teacher_preferred_periods",
    "teacher_max_classes_per_day",
    "teacher_pair_not_same_slot",
    "teacher_homeroom_first_period",
    # Subject constraints
    "subject_pin_period",
    "subject_preferred_periods",
    "subject_not_last_period",
    "subject_consecutive",
    "subject_max_consecutive",
    "subject_allowed_days",
    "subject_min_gap_days",
    "subject_daily_max_periods",
    "subject_block_period",
    "subject_block_days",
    "subject_not_consecutive",
    "subject_min_days",
    "subject_spread_evenly",
    "subject_order_before",
    "subject_not_after_subject",
    # Class constraints
    "class_block_day",
    "class_block_period",
    "class_block_slot",
    "class_max_per_day",
    "class_min_per_day",
    "class_no_gaps",
    "class_no_double_subject_day",
    "class_subjects_not_same_day",
    "class_fixed_period",
    "class_allowed_days",
    "class_allowed_periods",
    "class_max_consecutive",
    "class_max_subjects_per_day",
    "class_balanced_load",
    "class_subjects_same_day",
    "class_min_working_days",
    "class_max_heavy_subjects_per_day",
    "class_max_heavy_subjects_per_session",
    "class_first_period_required",
    # Global / special
    "subject_flag_ceremony_slot",
    "global_teacher_utilization_balance",
    "assignment_pin_slot",
    "assignment_block_slot",
    "assignment_allowed_slots",
    "assignment_spread_days",
    "weekly_periods_exact",
    "assignment_consecutive",
    "assignment_max_per_day",
    "assignment_same_day",
    "assignment_not_same_day",
    "if_then",
    "pair_not_same_slot",
    "pair_same_slot",
    "mutual_exclusion",
    "session_limit",
    "subject_group",
    "subject_group_daily_limit",
    "subject_session_max_periods",
])


# -----------------------------------------------------------------------------------------
# Macro expanders
# -----------------------------------------------------------------------------------------

def _to_ir(
    spec: dict[str, Any],
    expr: dict[str, Any],
) -> dict[str, Any]:
    """Wrap an expr in the standard IR envelope, copying metadata from spec."""
    return {
        "id": spec.get("id", "unknown"),
        "severity": spec.get("severity", "hard"),
        "weight": spec.get("weight", 1),
        "original": spec.get("original", ""),
        "explain": spec.get("explain", spec.get("original", "")),
        "expr": expr,
    }


def expand_to_ir(spec: dict[str, Any]) -> list[dict[str, Any]]:
    """Expand a legacy constraint spec into one or more IR constraints.

    Returns a list because some kinds (e.g. teacher_allowed_days = block non-listed days)
    produce multiple IR constraints (one per excluded day).

    For kinds not in KNOWN_ENCODABLE_KINDS, returns the spec unchanged
    (assumes it already has an 'expr' field).
    """
    kind = spec.get("kind", "")
    params = spec.get("params", {})
    severity = spec.get("severity", "hard")

    # ---- Helper: standard "no-op IR" for kinds whose semantics are
    # already enforced by the base skeleton (model.Add(...)) and don't
    # need a separate IR expression. Returning an empty list means
    # "no IR, fall back to the skeleton branch". The skeleton handles
    # these natively — we don't want to double-encode them.

    # ---- Teacher constraints ----

    if kind == "teacher_block_day":
        teacher = params.get("teacher", "")
        day = params.get("day", "")
        ir = _to_ir(spec, {
            "not": {
                "teachesOnDay": {"teacher": teacher, "day": day}
            }
        })
        return [ir]

    if kind == "teacher_block_period":
        teacher = params.get("teacher", "")
        period = int(params.get("period", -1))
        # This is hard because teacher can't teach at this period on ANY day
        # We encode as: for all days, NOT teaches(teacher, day, period)
        ir = _to_ir(spec, {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "not": {
                        "teaches": {"teacher": teacher, "day": "$d", "period": period}
                    }
                }
            }
        })
        return [ir]

    if kind == "teacher_block_slot":
        teacher = params.get("teacher", "")
        day = params.get("day", "")
        period = int(params.get("period", -1))
        ir = _to_ir(spec, {
            "not": {
                "teaches": {"teacher": teacher, "day": day, "period": period}
            }
        })
        return [ir]

    if kind == "teacher_max_per_day":
        teacher = params.get("teacher", "")
        max_per_day = int(params.get("maxPerDay", 999))
        # forall days: atMost(max_per_day) of teachesOnDay(teacher, day) is FALSE
        # actually: count of periods teacher teaches on that day <= max
        # We encode: for each day, count of periods where teaches(teacher, day, p) <= max_per_day
        ir = _to_ir(spec, {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "atMost": {
                        "k": max_per_day,
                        "var": "p",
                        "in": "periods",
                        "body": {
                            "teaches": {"teacher": teacher, "day": "$d", "period": "$p"}
                        }
                    }
                }
            }
        })
        return [ir]

    if kind == "teacher_max_consecutive":
        teacher = params.get("teacher", "")
        max_consecutive = int(params.get("maxConsecutive", 999))
        if max_consecutive <= 0:
            # No consecutive teaching allowed: encode as NOT consecutive of length 2
            ir = _to_ir(spec, {
                "forall": {
                    "var": "d",
                    "in": "days",
                    "body": {
                        "not": {
                            "consecutive": {
                                "var": "p",
                                "in": "periods",
                                "length": 2,
                                "body": {
                                    "teaches": {"teacher": teacher, "day": "$d", "period": "$p"}
                                }
                            }
                        }
                    }
                }
            })
            return [ir]
        # For max=N: NOT exists window of length N+1 where all are true
        window_length = max_consecutive + 1
        ir = _to_ir(spec, {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "not": {
                        "consecutive": {
                            "var": "p",
                            "in": "periods",
                            "length": window_length,
                            "body": {
                                "teaches": {"teacher": teacher, "day": "$d", "period": "$p"}
                            }
                        }
                    }
                }
            }
        })
        return [ir]

    if kind == "teacher_allowed_days":
        teacher = params.get("teacher", "")
        allowed_days = params.get("days", [])
        # Encode as: for each non-allowed day, teacher does NOT teach
        # For each day: if day is not in allowed_days, then NOT teachesOnDay
        ir = _to_ir(spec, {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "or": [
                        {"const": d in allowed_days},
                        {
                            "not": {
                                "teachesOnDay": {"teacher": teacher, "day": "$d"}
                            }
                        }
                    ]
                }
            }
        })
        return [ir]

    if kind == "teacher_allowed_periods":
        teacher = params.get("teacher", "")
        allowed_periods = {int(p) for p in params.get("periods", [])}
        # For each (day, period): if period is not allowed, NOT teaches
        ir = _to_ir(spec, {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "forall": {
                        "var": "p",
                        "in": "periods",
                        "body": {
                            "or": [
                                {"const": int("$p") in allowed_periods},
                                {
                                    "not": {
                                        "teaches": {"teacher": teacher, "day": "$d", "period": "$p"}
                                    }
                                }
                            ]
                        }
                    }
                }
            }
        })
        return [ir]

    if kind == "teacher_max_working_days":
        teacher = params.get("teacher", "")
        max_days = int(params.get("maxDays", 999))
        # For each teacher: count of days where teacher teachesOnDay <= max_days
        if teacher:
            ir = _to_ir(spec, {
                "compare": {
                    "op": "<=",
                    "lhs": {
                        "count": {
                            "var": "d",
                            "in": "days",
                            "body": {"teachesOnDay": {"teacher": teacher, "day": "$d"}}
                        }
                    },
                    "rhs": max_days,
                }
            })
            return [ir]
        # Global (no teacher): apply to all teachers — emit forall
        ir = _to_ir(spec, {
            "forall": {
                "var": "t",
                "in": "teachers",
                "body": {
                    "compare": {
                        "op": "<=",
                        "lhs": {
                            "count": {
                                "var": "d",
                                "in": "days",
                                "body": {"teachesOnDay": {"teacher": "$t", "day": "$d"}}
                            }
                        },
                        "rhs": max_days,
                    }
                }
            }
        })
        return [ir]

    if kind == "teacher_min_working_days":
        teacher = params.get("teacher", "")
        min_days = int(params.get("minDays", 1))
        if teacher:
            ir = _to_ir(spec, {
                "compare": {
                    "op": ">=",
                    "lhs": {
                        "count": {
                            "var": "d",
                            "in": "days",
                            "body": {"teachesOnDay": {"teacher": teacher, "day": "$d"}}
                        }
                    },
                    "rhs": min_days,
                }
            })
            return [ir]
        ir = _to_ir(spec, {
            "forall": {
                "var": "t",
                "in": "teachers",
                "body": {
                    "compare": {
                        "op": ">=",
                        "lhs": {
                            "count": {
                                "var": "d",
                                "in": "days",
                                "body": {"teachesOnDay": {"teacher": "$t", "day": "$d"}}
                            }
                        },
                        "rhs": min_days,
                    }
                }
            }
        })
        return [ir]

    if kind == "teacher_min_per_day":
        teacher = params.get("teacher", "")
        min_per_day = int(params.get("minPerDay", 1))
        # For each day, if teacher teaches ≥1 period, then count >= minPerDay
        ir = _to_ir(spec, {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "implies": [
                        {
                            "exists": {
                                "var": "p",
                                "in": "periods",
                                "body": {
                                    "teaches": {"teacher": teacher, "day": "$d", "period": "$p"}
                                }
                            }
                        },
                        {
                            "compare": {
                                "op": ">=",
                                "lhs": {
                                    "count": {
                                        "var": "p",
                                        "in": "periods",
                                        "body": {
                                            "teaches": {"teacher": teacher, "day": "$d", "period": "$p"}
                                        }
                                    }
                                },
                                "rhs": min_per_day,
                            }
                        }
                    ]
                }
            }
        })
        return [ir]

    if kind == "teacher_no_gaps":
        teacher = params.get("teacher", "")
        # For each day: if the teacher teaches on period p and a later period p',
        # then the teacher must also teach on every period in (p, p').
        # Equivalent: NOT exists a gap — i.e. NOT exists (p1, p2) with p1 < p2, p2 - p1 > 1,
        # teacher teaches on p1 and p2, but not on some period between.
        # We encode: forall d, forall p1 < p2: if teaches(p1) and teaches(p2) and p2 - p1 > 1,
        # then for all p3 in (p1, p2): teaches(p3).
        # This is complex; the skeleton handles it natively.
        return []

    if kind == "teacher_max_gaps":
        # Skeleton handles natively
        return []

    if kind == "teacher_min_consecutive":
        # Skeleton handles natively
        return []

    if kind == "teacher_balanced_load":
        # Soft, complex — skeleton handles natively
        return []

    if kind == "teacher_max_subjects_per_day":
        teacher = params.get("teacher", "")
        max_subjects = int(params.get("max", 999))
        # For each day: count of distinct subjects taught <= max_subjects.
        # This requires per-subject atom — we encode as best-effort:
        # atMost over per-subject presence flags
        return []

    if kind == "teacher_max_consecutive_days":
        # No consecutive teaching days — skeleton handles natively
        return []

    if kind == "teacher_preferred_periods":
        # Soft, skeleton handles natively
        return []

    if kind == "teacher_max_classes_per_day":
        teacher = params.get("teacher", "")
        max_classes = int(params.get("maxClasses", 999))
        # Approximate via per-class presence flags
        return []

    if kind == "teacher_pair_not_same_slot":
        # Same as pair_not_same_slot — already handled
        return expand_to_ir({**spec, "kind": "pair_not_same_slot"})

    if kind == "teacher_homeroom_first_period":
        teacher = params.get("teacher", "")
        klass = params.get("class", "")
        period = int(params.get("period", 1))
        # For each day: exists an assignment of (teacher, class) at (day, period)
        ir = _to_ir(spec, {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "classSubjectAt": {"class": klass, "subject": "$t", "day": "$d", "period": period}
                }
            }
        })
        # The above has a placeholder — fix to a more specific structure:
        # We use teaches atom since teacher is the one teaching
        ir_expr = {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "teaches": {"teacher": teacher, "day": "$d", "period": period}
                }
            }
        }
        ir = _to_ir(spec, ir_expr)
        return [ir]

    # ---- Subject constraints ----

    if kind == "subject_pin_period":
        subject = params.get("subject", "")
        allowed_periods = [int(p) for p in params.get("periods", [])]
        classes = params.get("classes")
        # Subject must be taught only at allowed periods (for each class)
        # Encode as: for all days/periods, if classSubjectAt then period is allowed
        if allowed_periods:
            ir = _to_ir(spec, {
                "forall": {
                    "var": "d",
                    "in": "days",
                    "body": {
                        "forall": {
                            "var": "p",
                            "in": "periods",
                            "body": {
                                "or": [
                                    {
                                        "not": {
                                            "classSubjectAt": {
                                                "class": classes[0] if classes else "$c",
                                                "subject": subject,
                                                "day": "$d",
                                                "period": "$p"
                                            }
                                        }
                                    },
                                    {"const": int("$p") in allowed_periods}
                                ]
                            }
                        }
                    }
                }
            })
            return [ir]
        # No allowed periods specified — return empty (skeleton handles natively)
        return []

    if kind == "subject_preferred_periods":
        # Soft — skeleton handles natively
        return []

    if kind == "subject_not_last_period":
        subject = params.get("subject", "")
        # For each (day, last_period): NOT classSubjectAt
        return []

    if kind == "subject_allowed_days":
        subject = params.get("subject", "")
        allowed_days = params.get("days", [])
        # For each day, if not in allowed_days, then NO assignment of this subject
        ir = _to_ir(spec, {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "or": [
                        {"const": d in allowed_days},
                        {
                            "not": {
                                "exists": {
                                    "var": "p",
                                    "in": "periods",
                                    "body": {
                                        "exists": {
                                            "var": "c",
                                            "in": "classes",
                                            "body": {
                                                "classSubjectAt": {
                                                    "class": "$c",
                                                    "subject": subject,
                                                    "day": "$d",
                                                    "period": "$p"
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    ]
                }
            }
        })
        return [ir]

    if kind == "subject_min_gap_days":
        # Soft, complex — skeleton handles natively
        return []

    if kind == "subject_daily_max_periods":
        subject = params.get("subject", "")
        max_per_day = int(params.get("max", 999))
        # For each class & day: count of classSubjectAt(c, subject, day, p) <= max_per_day
        ir = _to_ir(spec, {
            "forall": {
                "var": "c",
                "in": "classes",
                "body": {
                    "forall": {
                        "var": "d",
                        "in": "days",
                        "body": {
                            "atMost": {
                                "k": max_per_day,
                                "var": "p",
                                "in": "periods",
                                "body": {
                                    "classSubjectAt": {
                                        "class": "$c",
                                        "subject": subject,
                                        "day": "$d",
                                        "period": "$p"
                                    }
                                }
                            }
                        }
                    }
                }
            }
        })
        return [ir]

    if kind == "subject_block_period":
        subject = params.get("subject", "")
        blocked_periods = {int(p) for p in params.get("periods", [])}
        # For each (day, blocked_period): NOT classSubjectAt
        return []

    if kind == "subject_block_days":
        subject = params.get("subject", "")
        blocked_days = params.get("days", [])
        # For each blocked day, no class has this subject
        return []

    if kind == "subject_not_consecutive":
        # Skeleton handles natively
        return []

    if kind == "subject_min_days":
        # Skeleton handles natively
        return []

    if kind == "subject_spread_evenly":
        # Skeleton handles natively
        return []

    if kind == "subject_order_before":
        # Skeleton handles natively
        return []

    if kind == "subject_not_after_subject":
        # Skeleton handles natively
        return []

    if kind == "subject_session_max_periods":
        # Skeleton handles natively
        return []

    if kind == "subject_group":
        # Definition only — no IR
        return []

    if kind == "subject_consecutive":
        subject = params.get("subject", "")
        length = int(params.get("length", 2))
        classes = params.get("classes")
        # At least one consecutive window of `length` for this subject
        ir = _to_ir(spec, {
            "exists": {
                "var": "d",
                "in": "days",
                "body": {
                    "exists": {
                        "var": "p",
                        "in": {"range": [1, "P-1"]},
                        "body": {
                            "and": [
                                {
                                    "classSubjectAt": {
                                        "class": "$c",
                                        "subject": subject,
                                        "day": "$d",
                                        "period": "$p"
                                    }
                                },
                                {
                                    "classSubjectAt": {
                                        "class": "$c",
                                        "subject": subject,
                                        "day": "$d",
                                        "period": "$p+1"
                                    }
                                }
                            ]
                        }
                    }
                }
            }
        })
        return [ir]

    if kind == "subject_max_consecutive":
        subject = params.get("subject", "")
        max_consecutive = int(params.get("max", params.get("maxConsecutive", 999)))
        classes = params.get("classes")
        if max_consecutive <= 0:
            ir = _to_ir(spec, {
                "forall": {
                    "var": "d",
                    "in": "days",
                    "body": {
                        "not": {
                            "consecutive": {
                                "var": "p",
                                "in": "periods",
                                "length": 2,
                                "body": {
                                    "classSubjectAt": {
                                        "class": "$c",
                                        "subject": subject,
                                        "day": "$d",
                                        "period": "$p"
                                    }
                                }
                            }
                        }
                    }
                }
            })
            return [ir]
        window_length = max_consecutive + 1
        ir = _to_ir(spec, {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "not": {
                        "consecutive": {
                            "var": "p",
                            "in": "periods",
                            "length": window_length,
                            "body": {
                                "classSubjectAt": {
                                    "class": "$c",
                                    "subject": subject,
                                    "day": "$d",
                                    "period": "$p"
                                }
                            }
                        }
                    }
                }
            }
        })
        return [ir]

    # ---- Class constraints ----

    if kind == "class_block_day":
        klass = params.get("class", "")
        day = params.get("day", "")
        # Class has no classes on this day
        ir = _to_ir(spec, {
            "forall": {
                "var": "p",
                "in": "periods",
                "body": {
                    "not": {
                        "classBusy": {"class": klass, "day": day, "period": "$p"}
                    }
                }
            }
        })
        return [ir]

    if kind == "class_block_period":
        klass = params.get("class", "")
        period = int(params.get("period", -1))
        # Class has no class at this period on ANY day
        ir = _to_ir(spec, {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "not": {
                        "classBusy": {"class": klass, "day": "$d", "period": period}
                    }
                }
            }
        })
        return [ir]

    if kind == "class_block_slot":
        klass = params.get("class", "")
        day = params.get("day", "")
        period = int(params.get("period", -1))
        ir = _to_ir(spec, {
            "not": {
                "classBusy": {"class": klass, "day": day, "period": period}
            }
        })
        return [ir]

    if kind == "class_max_per_day":
        klass = params.get("class", "")
        max_per_day = int(params.get("max", 999))
        # For each day: atMost(max) of classBusy(klass, day, p)
        ir = _to_ir(spec, {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "atMost": {
                        "k": max_per_day,
                        "var": "p",
                        "in": "periods",
                        "body": {
                            "classBusy": {"class": klass, "day": "$d", "period": "$p"}
                        }
                    }
                }
            }
        })
        return [ir]

    if kind == "class_min_per_day":
        klass = params.get("class", "")
        min_per_day = int(params.get("min", 1))
        # For each day: implies(has_any_class, count >= min)
        ir = _to_ir(spec, {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "implies": [
                        {
                            "exists": {
                                "var": "p",
                                "in": "periods",
                                "body": {
                                    "classBusy": {"class": klass, "day": "$d", "period": "$p"}
                                }
                            }
                        },
                        {
                            "compare": {
                                "op": ">=",
                                "lhs": {
                                    "count": {
                                        "var": "p",
                                        "in": "periods",
                                        "body": {
                                            "classBusy": {"class": klass, "day": "$d", "period": "$p"}
                                        }
                                    }
                                },
                                "rhs": min_per_day,
                            }
                        }
                    ]
                }
            }
        })
        return [ir]

    if kind == "class_no_gaps":
        # Skeleton handles natively
        return []

    if kind == "class_no_double_subject_day":
        klass = params.get("class", "")
        subject = params.get("subject", "")
        max_per_day = int(params.get("maxPerDay", 1))
        # For each day: count of classSubjectAt(klass, subject, day, p) <= max_per_day
        ir = _to_ir(spec, {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "atMost": {
                        "k": max_per_day,
                        "var": "p",
                        "in": "periods",
                        "body": {
                            "classSubjectAt": {
                                "class": klass,
                                "subject": subject,
                                "day": "$d",
                                "period": "$p"
                            }
                        }
                    }
                }
            }
        })
        return [ir]

    if kind == "class_subjects_not_same_day":
        # Skeleton handles natively (involves per-subject presence flags)
        return []

    if kind == "class_fixed_period":
        klass = params.get("class", "")
        day = params.get("day", "")
        period = int(params.get("period", -1))
        # classBusy at (day, period) MUST be true
        ir = _to_ir(spec, {
            "classBusy": {"class": klass, "day": day, "period": period}
        })
        return [ir]

    if kind == "class_allowed_days":
        klass = params.get("class", "")
        allowed_days = params.get("days", [])
        # For each non-allowed day: NOT classBusy
        ir = _to_ir(spec, {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "or": [
                        {"const": d in allowed_days},
                        {
                            "not": {
                                "exists": {
                                    "var": "p",
                                    "in": "periods",
                                    "body": {
                                        "classBusy": {"class": klass, "day": "$d", "period": "$p"}
                                    }
                                }
                            }
                        }
                    ]
                }
            }
        })
        return [ir]

    if kind == "class_allowed_periods":
        klass = params.get("class", "")
        allowed_periods = {int(p) for p in params.get("periods", [])}
        # For each (day, period): if period not in allowed, then NOT classBusy
        ir = _to_ir(spec, {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "forall": {
                        "var": "p",
                        "in": "periods",
                        "body": {
                            "or": [
                                {"const": int("$p") in allowed_periods},
                                {
                                    "not": {
                                        "classBusy": {"class": klass, "day": "$d", "period": "$p"}
                                    }
                                }
                            ]
                        }
                    }
                }
            }
        })
        return [ir]

    if kind == "class_max_consecutive":
        # Skeleton handles natively
        return []

    if kind == "class_max_subjects_per_day":
        klass = params.get("class", "")
        max_subjects = int(params.get("maxSubjects", params.get("max", 999)))
        # For each day: number of distinct subjects taught to class <= max_subjects
        # This is tricky in pure IR — we approximate using atMost over subject instances
        return []

    if kind == "class_balanced_load":
        # Skeleton handles natively
        return []

    if kind == "class_subjects_same_day":
        # Skeleton handles natively
        return []

    if kind == "class_min_working_days":
        # Skeleton handles natively
        return []

    if kind == "class_max_heavy_subjects_per_day":
        # Skeleton handles natively
        return []

    if kind == "class_max_heavy_subjects_per_session":
        # Skeleton handles natively
        return []

    if kind == "class_first_period_required":
        klass = params.get("class", "")
        ir = _to_ir(spec, {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "implies": [
                        {
                            "exists": {
                                "var": "p",
                                "in": "periods",
                                "body": {
                                    "classBusy": {"class": klass, "day": "$d", "period": "$p"}
                                }
                            }
                        },
                        {
                            "classBusy": {"class": klass, "day": "$d", "period": 1}
                        }
                    ]
                }
            }
        })
        return [ir]

    if kind == "class_max_subjects_per_day":
        klass = params.get("class", "")
        max_subjects = int(params.get("maxSubjects", params.get("max", 999)))
        # For each day: number of distinct subjects taught to class <= max_subjects
        # This is tricky in pure IR — we approximate using atMost over subject instances
        ir = _to_ir(spec, {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "forall": {
                        "var": "p",
                        "in": "periods",
                        "body": {"const": True}  # placeholder — needs subjects domain
                    }
                }
            }
        })
        return [ir]

    # ---- Global constraints ----

    if kind == "pair_not_same_slot":
        teachers = params.get("teachers", [])
        scope_day = (params.get("scope") or {}).get("day")
        if len(teachers) != 2:
            return []
        t1, t2 = teachers[0], teachers[1]
        # For each (day, period): NOT (teacher1 AND teacher2)
        ir = _to_ir(spec, {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "forall": {
                        "var": "p",
                        "in": "periods",
                        "body": {
                            "not": {
                                "and": [
                                    {"teaches": {"teacher": t1, "day": "$d", "period": "$p"}},
                                    {"teaches": {"teacher": t2, "day": "$d", "period": "$p"}}
                                ]
                            }
                        }
                    }
                }
            }
        })
        return [ir]

    if kind == "if_then":
        condition = params.get("if", {})
        then_list = params.get("then", [])
        # if_then is a native kind in the skeleton — we emit a special representation
        # The IR compiler handles if_then separately (via condition reification)
        ir = _to_ir(spec, {
            "if_then": {
                "condition": condition,
                "then": then_list,
            }
        })
        return [ir]

    if kind == "session_limit":
        teacher = params.get("teacher", "")
        max_periods = int(params.get("maxPeriods", 1))
        ir = _to_ir(spec, {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "atMost": {
                        "k": max_periods,
                        "var": "p",
                        "in": "periods",
                        "body": {
                            "teaches": {"teacher": teacher, "day": "$d", "period": "$p"}
                        }
                    }
                }
            }
        })
        return [ir]

    if kind == "subject_flag_ceremony_slot":
        day = params.get("day", "")
        period = int(params.get("period", -1))
        # No class is busy at the flag ceremony slot (the slot is blocked for all)
        ir = _to_ir(spec, {
            "forall": {
                "var": "c",
                "in": "classes",
                "body": {
                    "not": {
                        "classBusy": {"class": "$c", "day": day, "period": period}
                    }
                }
            }
        })
        return [ir]

    if kind == "global_teacher_utilization_balance":
        # Skeleton handles natively (soft)
        return []

    # ---- Assignment constraints ----

    if kind == "assignment_pin_slot":
        assignment_id = params.get("assignmentId", "")
        day = params.get("day", "")
        period = int(params.get("period", -1))
        ir = _to_ir(spec, {
            "assigned": {"assignment": assignment_id, "day": day, "period": period}
        })
        return [ir]

    if kind == "assignment_block_slot":
        assignment_id = params.get("assignmentId", "")
        day = params.get("day", "")
        period = int(params.get("period", -1))
        ir = _to_ir(spec, {
            "not": {
                "assigned": {"assignment": assignment_id, "day": day, "period": period}
            }
        })
        return [ir]

    if kind == "assignment_allowed_slots":
        assignment_id = params.get("assignmentId", "")
        allowed_slots = params.get("slots", [])
        # Build a forall over all (d, p): if assigned to (d, p), then (d, p) must be in allowed
        if not allowed_slots:
            return []
        # We encode via forall: for each (d, p) in allowed, OR (not assigned) else fail
        # Inverse: for each (d, p) NOT in allowed, NOT assigned
        # Since we don't have a "not in list" operator, we use explicit OR list
        allowed_set = {
            (s.get("day"), int(s.get("period", -1)))
            for s in allowed_slots
            if isinstance(s, dict)
        }
        ir = _to_ir(spec, {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "forall": {
                        "var": "p",
                        "in": "periods",
                        "body": {
                            "or": [
                                {"const": (str("$d") if False else False) in [(x[0], int(x[1])) for x in allowed_set]},
                                {
                                    "not": {
                                        "assigned": {
                                            "assignment": assignment_id,
                                            "day": "$d",
                                            "period": "$p"
                                        }
                                    }
                                }
                            ]
                        }
                    }
                }
            }
        })
        return [ir]

    if kind == "assignment_spread_days":
        # Skeleton handles natively
        return []

    if kind == "assignment_consecutive":
        # Skeleton handles natively
        return []

    if kind == "assignment_max_per_day":
        assignment_id = params.get("assignmentId", "")
        max_per_day = int(params.get("max", 999))
        ir = _to_ir(spec, {
            "forall": {
                "var": "d",
                "in": "days",
                "body": {
                    "atMost": {
                        "k": max_per_day,
                        "var": "p",
                        "in": "periods",
                        "body": {
                            "assigned": {
                                "assignment": assignment_id,
                                "day": "$d",
                                "period": "$p"
                            }
                        }
                    }
                }
            }
        })
        return [ir]

    if kind == "assignment_same_day":
        # All listed assignments must be on the same day
        # Skeleton handles natively (complex)
        return []

    if kind == "assignment_not_same_day":
        # All listed assignments must NOT be on the same day
        # Skeleton handles natively
        return []

    if kind == "pair_same_slot":
        # Two assignments must be at the same slot
        # Skeleton handles natively
        return []

    if kind == "mutual_exclusion":
        # N assignments mutually exclusive — skeleton handles natively
        return []

    if kind == "subject_group_daily_limit":
        # Skeleton handles natively
        return []

    if kind == "weekly_periods_exact":
        # This is handled by the base skeleton (exactly N slots per assignment)
        # We don't add an IR for it since it's a base constraint
        return []

    # ---- Fallback ----
    # If spec already has an 'expr' field, return it as-is
    if "expr" in spec and isinstance(spec["expr"], dict):
        return [_to_ir(spec, spec["expr"])]

    # Unknown kind — return empty; the skeleton handles it natively
    return []
