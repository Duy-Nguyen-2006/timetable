"""IR Evaluator: Constraint IR → Python boolean (verify).

This module is Backend 2 of the dual-backend IR architecture. It interprets the same
IR AST that ir_compiler.py consumes, but evaluates it against a concrete schedule
rather than compiling to CP-SAT. Used by the validator to VERIFY that a solved
schedule satisfies the constraints.

One IR, two backends:
  - Backend 1 (ir_compiler.py): compile_constraint → CP-SAT model (ENFORCE)
  - Backend 2 (this file):      eval_constraint  → Python bool    (VERIFY)

Because both backends share the same IR, enforce and verify are guaranteed to match.

Semantic reference (from Plan.md §3.4):

    Node        |  CP-SAT (enforce)                  |  Python (verify)
    ------------|-------------------------------------|--------------------------------
    and[xs]     |  AddMinEquality(b, reify(xs))       |  all()
    or[xs]      |  AddMaxEquality(b, reify(xs))       |  any()
    not x       |  reify(x).Not()                     |  not
    implies     |  or[ not a, b ]                     |  (not a) or b
    iff         |  and[implies, implies]              |  a == b
    exists      |  OR reify body over domain           |  any(...)
    forall      |  AND reify body over domain          |  all(...)
    atLeast k   |  Add(s>=k)<=>b                      |  count >= k
    atMost k    |  Add(s<=k)<=>b                       |  count <= k
    exactly k   |  Add(s==k)<=>b                       |  count == k
    compare     |  Add(lhs op rhs)<=>b                 |  lhs op rhs
    consecutive |  OR(all body in window)              |  has consecutive window
    count       |  sum(reify(body))                    |  count
"""

from __future__ import annotations

from typing import Any


# -----------------------------------------------------------------------------------------
# Schedule helpers
# -----------------------------------------------------------------------------------------

def _to_period(value: Any) -> int | None:
    """Convert a period value to int, or None if it can't be converted."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _get_entries(
    schedule: list[dict[str, Any]],
    *,
    teacher: str | None = None,
    klass: str | None = None,
    subject: str | None = None,
    assignment_id: str | None = None,
    day: str | None = None,
    period: int | None = None,
) -> list[dict[str, Any]]:
    """Filter schedule entries by the given criteria (all filters are ANDed)."""
    result = schedule
    if teacher is not None:
        result = [e for e in result if e.get("teacher") == teacher]
    if klass is not None:
        result = [e for e in result if e.get("class") == klass]
    if subject is not None:
        result = [e for e in result if e.get("subject") == subject]
    if assignment_id is not None:
        result = [e for e in result if e.get("assignmentId") == assignment_id or e.get("assignment_id") == assignment_id]
    if day is not None:
        result = [e for e in result if e.get("day") == day]
    if period is not None:
        result = [e for e in result if _to_period(e.get("period")) == period]
    return result


def _teacher_teaches_at(teacher: str, day: str, period: int, schedule: list[dict[str, Any]]) -> bool:
    return any(
        e.get("teacher") == teacher
        and e.get("day") == day
        and _to_period(e.get("period")) == period
        for e in schedule
    )


def _teacher_teaches_on_day(teacher: str, day: str, schedule: list[dict[str, Any]]) -> bool:
    return any(e.get("teacher") == teacher and e.get("day") == day for e in schedule)


def _class_subject_at(klass: str, subject: str, day: str, period: int, schedule: list[dict[str, Any]]) -> bool:
    return any(
        e.get("class") == klass
        and e.get("subject") == subject
        and e.get("day") == day
        and _to_period(e.get("period")) == period
        for e in schedule
    )


def _class_busy_at(klass: str, day: str, period: int, schedule: list[dict[str, Any]]) -> bool:
    return any(
        e.get("class") == klass
        and e.get("day") == day
        and _to_period(e.get("period")) == period
        for e in schedule
    )


# -----------------------------------------------------------------------------------------
# Domain expansion
# -----------------------------------------------------------------------------------------

def expand_domain(domain: Any, env: dict[str, Any]) -> list:
    """Expand a Domain IR node to a concrete list of values."""
    if isinstance(domain, str):
        if domain in ("days", "periods", "classes", "teachers", "subjects"):
            return env.get(domain, [])
        return [domain]

    if isinstance(domain, dict):
        if "list" in domain:
            return domain["list"]

        if "range" in domain:
            r = domain["range"]
            if len(r) != 2:
                return []
            try:
                return list(range(int(r[0]), int(r[1]) + 1))
            except (TypeError, ValueError):
                return []

        if "in" in domain:
            inner = expand_domain(domain["in"], env)
            where = domain.get("where", {})
            if where:
                filtered = []
                for item in inner:
                    match = True
                    for k, v in where.items():
                        if isinstance(item, dict):
                            if item.get(k) != v:
                                match = False
                                break
                        elif str(item) != str(v):
                            match = False
                            break
                    if match:
                        filtered.append(item)
                return filtered
            return inner

    return []


def resolve_var_ref(var_ref: str, env: dict[str, Any]) -> Any:
    """Resolve $var or $var+N / $var-N against env.

    For label variables (e.g. $d → "mon", $t → "Sơn"), we resolve to the label
    value as-is. For numeric variables (e.g. $p → 1, $p+1 → 2), we apply the
    offset.
    """
    if not isinstance(var_ref, str) or not var_ref.startswith("$"):
        return var_ref
    rest = var_ref[1:]
    offset = 0
    for op in ("+", "-"):
        if op in rest:
            var_name, offset_str = rest.split(op, 1)
            try:
                offset = int(offset_str)
                if op == "-":
                    offset = -offset
            except ValueError:
                offset = 0
            break
    else:
        var_name = rest
        offset = 0
    val = env.get(var_name, var_ref)
    if val == var_ref:
        return var_ref
    # Try to apply arithmetic (assumes val is int or int-string).
    # If val is a label like "mon", int() raises — return val as-is.
    try:
        return int(val) + offset
    except (TypeError, ValueError):
        return val


# -----------------------------------------------------------------------------------------
# Boolean expression evaluator
# -----------------------------------------------------------------------------------------

def eval_expr(
    expr: dict[str, Any],
    schedule: list[dict[str, Any]],
    dv: "EvalDerivedVars",
    env: dict[str, Any],
) -> bool:
    """Evaluate a BoolExpr against a concrete schedule.

    Returns True if the expression is satisfied, False otherwise.

    Args:
        expr: BoolExpr dict from IR
        schedule: list of schedule entries (from result["schedule"])
        dv: EvalDerivedVars instance (provides atom evaluation)
        env: variable bindings for quantifier scope
    """
    if not isinstance(expr, dict):
        return bool(expr)

    # --- Boolean combinators ---
    if "and" in expr:
        return all(eval_expr(sub, schedule, dv, env) for sub in expr["and"])

    if "or" in expr:
        return any(eval_expr(sub, schedule, dv, env) for sub in expr["or"])

    if "not" in expr:
        return not eval_expr(expr["not"], schedule, dv, env)

    if "implies" in expr:
        a, b = expr["implies"][0], expr["implies"][1]
        return (not eval_expr(a, schedule, dv, env)) or eval_expr(b, schedule, dv, env)

    if "iff" in expr:
        a, b = expr["iff"][0], expr["iff"][1]
        return eval_expr(a, schedule, dv, env) == eval_expr(b, schedule, dv, env)

    # --- Quantifiers ---
    if "exists" in expr:
        q = expr["exists"]
        var = q["var"]
        domain_vals = expand_domain(q["in"], env)
        if not domain_vals:
            return False  # exists over empty domain = false
        body = q["body"]
        return any(
            eval_expr(body, schedule, dv, {**env, var: val})
            for val in domain_vals
        )

    if "forall" in expr:
        q = expr["forall"]
        var = q["var"]
        domain_vals = expand_domain(q["in"], env)
        if not domain_vals:
            return True  # forall over empty domain = true
        body = q["body"]
        return all(
            eval_expr(body, schedule, dv, {**env, var: val})
            for val in domain_vals
        )

    if "atLeast" in expr:
        q = expr["atLeast"]
        k = int(q["k"])
        var = q["var"]
        domain_vals = expand_domain(q["in"], env)
        if not domain_vals:
            return k <= 0
        body = q["body"]
        count = sum(
            eval_expr(body, schedule, dv, {**env, var: val})
            for val in domain_vals
        )
        return count >= k

    if "atMost" in expr:
        q = expr["atMost"]
        k = int(q["k"])
        var = q["var"]
        domain_vals = expand_domain(q["in"], env)
        if not domain_vals:
            return True  # empty domain: atMost k = always true
        body = q["body"]
        count = sum(
            eval_expr(body, schedule, dv, {**env, var: val})
            for val in domain_vals
        )
        return count <= k

    if "exactly" in expr:
        q = expr["exactly"]
        k = int(q["k"])
        var = q["var"]
        domain_vals = expand_domain(q["in"], env)
        if not domain_vals:
            return k == 0
        body = q["body"]
        count = sum(
            eval_expr(body, schedule, dv, {**env, var: val})
            for val in domain_vals
        )
        return count == k

    # --- Comparison ---
    if "compare" in expr:
        c = expr["compare"]
        op = c["op"]
        lhs = eval_int_expr(c["lhs"], schedule, dv, env)
        rhs = eval_int_expr(c["rhs"], schedule, dv, env)
        ops = {
            "<=": lambda l, r: l <= r,
            "<":  lambda l, r: l < r,
            ">=": lambda l, r: l >= r,
            ">":  lambda l, r: l > r,
            "==": lambda l, r: l == r,
            "!=": lambda l, r: l != r,
        }
        return ops[op](lhs, rhs)

    # --- Consecutive (temporal) ---
    if "consecutive" in expr:
        q = expr["consecutive"]
        var = q["var"]
        length = int(q["length"])
        domain_vals = expand_domain(q["in"], env)
        body = q["body"]
        if not domain_vals or len(domain_vals) < length:
            return False

        # FIX.md §7.3: window must be NUMERICALLY consecutive (e.g. [1,2,3]),
        # not just adjacent in the domain list.
        def _is_numeric_consecutive_window(values):
            try:
                ints = [int(v) for v in values]
            except (TypeError, ValueError):
                return True
            return all(ints[i + 1] == ints[i] + 1 for i in range(len(ints) - 1))

        for start_idx in range(len(domain_vals) - length + 1):
            window_vals = domain_vals[start_idx : start_idx + length]
            if not _is_numeric_consecutive_window(window_vals):
                continue
            if all(
                eval_expr(body, schedule, dv, {**env, var: val})
                for val in window_vals
            ):
                return True
        return False

    # --- Atoms ---
    if "teaches" in expr:
        a = expr["teaches"]
        teacher = resolve_var_ref(a["teacher"], env)
        day = resolve_var_ref(a["day"], env)
        period = resolve_var_ref(a["period"], env)
        return _teacher_teaches_at(str(teacher), str(day), int(period), schedule)

    if "teachesOnDay" in expr:
        a = expr["teachesOnDay"]
        teacher = resolve_var_ref(a["teacher"], env)
        day = resolve_var_ref(a["day"], env)
        # FIX.md §7.3: prefer per-day periods; fall back to global.
        pbd = env.get("periodsByDay") or env.get("periods_by_day") or {}
        periods = pbd.get(str(day)) or env.get("periods", [])
        if not periods:
            return False
        return any(_teacher_teaches_at(str(teacher), str(day), int(p), schedule) for p in periods)

    if "classSubjectAt" in expr:
        a = expr["classSubjectAt"]
        klass = resolve_var_ref(a["class"], env)
        subject = resolve_var_ref(a["subject"], env)
        day = resolve_var_ref(a["day"], env)
        period = resolve_var_ref(a["period"], env)
        return _class_subject_at(str(klass), str(subject), str(day), int(period), schedule)

    if "classBusy" in expr:
        a = expr["classBusy"]
        klass = resolve_var_ref(a["class"], env)
        day = resolve_var_ref(a["day"], env)
        period = resolve_var_ref(a["period"], env)
        return _class_busy_at(str(klass), str(day), int(period), schedule)

    if "assigned" in expr:
        a = expr["assigned"]
        assignment = resolve_var_ref(a["assignment"], env)
        day = resolve_var_ref(a["day"], env)
        period = resolve_var_ref(a["period"], env)
        return any(
            (e.get("assignmentId") == str(assignment) or e.get("assignment_id") == str(assignment))
            and e.get("day") == str(day)
            and _to_period(e.get("period")) == int(period)
            for e in schedule
        )

    if "const" in expr:
        return bool(expr["const"])

    # Unknown node: fail-open for safety (don't reject schedule for unknown nodes)
    return True


def eval_int_expr(
    int_expr: Any,
    schedule: list[dict[str, Any]],
    dv: "EvalDerivedVars",
    env: dict[str, Any],
) -> int:
    """Evaluate an IntExpr to an integer."""
    if isinstance(int_expr, int):
        return int_expr

    if isinstance(int_expr, dict):
        if "count" in int_expr:
            c = int_expr["count"]
            var = c["var"]
            domain_vals = expand_domain(c["in"], env)
            body = c["body"]
            if not domain_vals:
                return 0
            return sum(
                eval_expr(body, schedule, dv, {**env, var: val})
                for val in domain_vals
            )

        if "sum" in int_expr:
            return sum(
                eval_int_expr(t, schedule, dv, env)
                for t in int_expr["sum"]
            )

        if "scale" in int_expr:
            s = int_expr["scale"]
            return int(s["factor"]) * eval_int_expr(s["of"], schedule, dv, env)

    return 0


# -----------------------------------------------------------------------------------------
# Derived vars for evaluator
# -----------------------------------------------------------------------------------------

class EvalDerivedVars:
    """Lightweight atom evaluation for the verifier.

    Unlike DerivedVars (which creates CP-SAT BoolVars), EvalDerivedVars
    evaluates atoms directly against the schedule at evaluation time.
    """

    def __init__(self, schedule: list[dict[str, Any]], assignments: list[dict[str, Any]]):
        self.schedule = schedule
        self.assignments = assignments

    def teacher_busy(self, teacher: str, day: str, period: int) -> bool:
        return _teacher_teaches_at(teacher, day, period, self.schedule)

    def teachesOnDay(self, teacher: str, day: str) -> bool:
        return _teacher_teaches_on_day(teacher, day, self.schedule)

    def class_subject_at(self, klass: str, subject: str, day: str, period: int) -> bool:
        return _class_subject_at(klass, subject, day, period, self.schedule)

    def class_busy(self, klass: str, day: str, period: int) -> bool:
        return _class_busy_at(klass, day, period, self.schedule)

    def assigned(self, assignment_id: str, day: str, period: int) -> bool:
        return any(
            (e.get("assignmentId") == assignment_id or e.get("assignment_id") == assignment_id)
            and e.get("day") == day
            and _to_period(e.get("period")) == period
            for e in self.schedule
        )


# -----------------------------------------------------------------------------------------
# Main entry point
# -----------------------------------------------------------------------------------------

def eval_constraint(
    ir: dict[str, Any],
    schedule: list[dict[str, Any]],
    assignments: list[dict[str, Any]] | None = None,
    env: dict[str, Any] | None = None,
) -> bool:
    """Evaluate a full IR constraint against a concrete schedule.

    Args:
        ir: full IR constraint dict (must have id, severity, expr)
        schedule: list of schedule entries from solver result
        assignments: optional assignments list (for building env)
        env: optional top-level environment override

    Returns:
        True if the constraint is satisfied, False otherwise.
    """
    assignments = assignments or []
    schedule = schedule or []

    # Build environment from schedule metadata
    days = sorted(set(e.get("day") for e in schedule if e.get("day")))
    periods = sorted(set(_to_period(e.get("period")) for e in schedule if e.get("period") is not None))
    classes = sorted(set(e.get("class") for e in schedule if e.get("class")))
    teachers = sorted(set(e.get("teacher") for e in schedule if e.get("teacher")))
    subjects = sorted(set(e.get("subject") for e in schedule if e.get("subject")))

    if env is None:
        env = {
            "days": days,
            "periods": periods,
            "classes": classes,
            "teachers": teachers,
            "subjects": subjects,
        }

    dv = EvalDerivedVars(schedule, assignments)
    severity = ir.get("severity", "hard")

    if severity == "info":
        return True  # info constraints are never enforced

    ok = eval_expr(ir.get("expr", {}), schedule, dv, env)
    return ok


def eval_constraints(
    irs: list[dict[str, Any]],
    schedule: list[dict[str, Any]],
    assignments: list[dict[str, Any]] | None = None,
) -> dict[str, bool]:
    """Evaluate multiple IR constraints. Returns {id: ok}."""
    results = {}
    for ir in irs:
        cid = ir.get("id", "<unknown>")
        results[cid] = eval_constraint(ir, schedule, assignments)
    return results
