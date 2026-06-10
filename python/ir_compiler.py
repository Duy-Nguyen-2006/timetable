"""IR Compiler: Constraint IR → CP-SAT model.

This module is Backend 1 of the dual-backend IR architecture. It compiles an IR
constraint AST into CP-SAT variables and constraints that ENFORCE the constraint
inside the solver (not just verify after the fact).

One IR, two backends:
  - Backend 1 (this file):  compile_constraint → CP-SAT model constraints
  - Backend 2 (ir_eval.py):  eval_constraint  → Python boolean (verify)

Because both backends share the same IR, the enforce and verify semantics are
guaranteed to match — no more "checked but not encoded" bugs.

Standard reification recipe (copy-paste for implementers):
    def reify_and(model, lits, name):
        b = model.NewBoolVar(name)
        model.AddBoolAnd(lits).OnlyEnforceIf(b)
        model.AddBoolOr([l.Not() for l in lits]).OnlyEnforceIf(b.Not())
        return b

    def reify_or(model, lits, name):
        b = model.NewBoolVar(name)
        model.AddMaxEquality(b, lits)
        return b

    def reify_atleast(model, lits, k, name):
        b = model.NewBoolVar(name); s = sum(lits)
        model.Add(s >= k).OnlyEnforceIf(b)
        model.Add(s <= k - 1).OnlyEnforceIf(b.Not())
        return b

    def reify_compare(model, lhs, rhs, op, name):
        b = model.NewBoolVar(name)
        pos = {"<=":(lhs<=rhs),"<":(lhs<rhs),">=":(lhs>=rhs),">":(lhs>rhs),"==":(lhs==rhs),"!=":(lhs!=rhs)}
        neg = {"<=":(lhs>rhs),"<":(lhs>=rhs),">=":(lhs<rhs),">":(lhs<=rhs),"==":(lhs!=rhs),"!=":(lhs==rhs)}
        model.Add(pos[op]).OnlyEnforceIf(b)
        model.Add(neg[op]).OnlyEnforceIf(b.Not())
        return b

Hard/Soft semantics:
  - severity=="hard": model.Add(compile_expr(expr) == 1)
  - severity=="soft": viol = compile_expr(expr).Not(); penalty_terms.append((weight, viol))

Edge cases:
  - Domain rỗng (∃/∀): exists=false, forall=true, count=0
  - Chỉ số ngoài biên: range clamped at compile time
  - Cache DerivedVars to avoid blow-up of auxiliary variables
"""

from __future__ import annotations

from typing import Any

# -----------------------------------------------------------------------------------------
# Reification helpers
# -----------------------------------------------------------------------------------------


def reify_and(model: Any, lits: list, name: str) -> Any:
    """b = AND(lits) with reification."""
    b = model.NewBoolVar(name)
    if lits:
        model.AddBoolAnd(lits).OnlyEnforceIf(b)
        model.AddBoolOr([l.Not() for l in lits]).OnlyEnforceIf(b.Not())
    else:
        model.Add(b == 1)  # AND of empty set = true
    return b


def reify_or(model: Any, lits: list, name: str) -> Any:
    """b = OR(lits) with reification."""
    b = model.NewBoolVar(name)
    if lits:
        model.AddMaxEquality(b, lits)
    else:
        model.Add(b == 0)  # OR of empty set = false
    return b


def reify_atleast(model: Any, lits: list, k: int, name: str) -> Any:
    """b = (count(lits) >= k) with reification."""
    b = model.NewBoolVar(name)
    if not lits:
        # empty domain: atLeast k = (0 >= k) = (k <= 0)
        model.Add((0 >= k) == 1).OnlyEnforceIf(b)
        model.Add((0 >= k) == 0).OnlyEnforceIf(b.Not())
        return b
    s = sum(lits)
    model.Add(s >= k).OnlyEnforceIf(b)
    model.Add(s <= k - 1).OnlyEnforceIf(b.Not())
    return b


def reify_atmost(model: Any, lits: list, k: int, name: str) -> Any:
    """b = (count(lits) <= k) with reification."""
    b = model.NewBoolVar(name)
    if not lits:
        # empty domain: atMost k = (0 <= k) = always true
        model.Add(b == 1)
        return b
    s = sum(lits)
    model.Add(s <= k).OnlyEnforceIf(b)
    model.Add(s >= k + 1).OnlyEnforceIf(b.Not())
    return b


def reify_exactly(model: Any, lits: list, k: int, name: str) -> Any:
    """b = (count(lits) == k) with reification."""
    b = model.NewBoolVar(name)
    if not lits:
        # empty domain: exactly k = (0 == k)
        model.Add((0 == k) == 1).OnlyEnforceIf(b)
        model.Add((0 == k) == 0).OnlyEnforceIf(b.Not())
        return b
    s = sum(lits)
    model.Add(s == k).OnlyEnforceIf(b)
    model.Add((s <= k - 1) | (s >= k + 1)).OnlyEnforceIf(b.Not())
    return b


def reify_compare(model: Any, lhs: Any, rhs: Any, op: str, name: str) -> Any:
    """b = (lhs OP rhs) with reification."""
    b = model.NewBoolVar(name)
    pos = {
        "<=": lambda l, r: l <= r,
        "<":  lambda l, r: l < r,
        ">=": lambda l, r: l >= r,
        ">":  lambda l, r: l > r,
        "==": lambda l, r: l == r,
        "!=": lambda l, r: l != r,
    }
    neg = {
        "<=": lambda l, r: l > r,
        "<":  lambda l, r: l >= r,
        ">=": lambda l, r: l < r,
        ">":  lambda l, r: l <= r,
        "==": lambda l, r: l != r,
        "!=": lambda l, r: l == r,
    }
    model.Add(pos[op](lhs, rhs)).OnlyEnforceIf(b)
    model.Add(neg[op](lhs, rhs)).OnlyEnforceIf(b.Not())
    return b


def reify_not(model: Any, lit: Any, name: str) -> Any:
    """Boolean NOT with a named BoolVar."""
    b = model.NewBoolVar(name)
    model.Add(b + lit == 1)  # b = NOT lit
    return b


# -----------------------------------------------------------------------------------------
# Domain expansion helpers
# -----------------------------------------------------------------------------------------

def expand_domain(domain: Any, env: dict[str, Any]) -> list:
    """Expand a Domain node into a concrete list of values.

    Handles:
      - string literals: "days" → env["days"], etc.
      - {list: [...]} → literal list
      - {range: [from, to]} → integer range (from..to inclusive)
      - {filter: {in: Domain, where: pred}} → filter elements
    """
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
            start, end = r[0], r[1]
            # Handle string periods like "P-1" (P = total periods per day)
            # The IR author uses "$p+1" syntax; we handle simple integer ranges here.
            try:
                start_i = int(start)
                end_i = int(end)
                return list(range(start_i, end_i + 1))
            except (TypeError, ValueError):
                return []

        if "in" in domain:
            inner = expand_domain(domain["in"], env)
            # Simple filter: only support {field: value} style for now
            where = domain.get("where", {})
            if where:
                # Apply filter predicates
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
    """Resolve a variable reference like "$p" or "$p+1" or "$p-1" against env.

    var_ref is the raw string (e.g. "$p+1"). env maps var names to their values.
    Supports simple arithmetic: "$var+N" or "$var-N" where N is a small integer.

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
        # env didn't have the var
        return var_ref

    # Try to apply arithmetic (assumes val is int or int-string).
    # If val is a label like "mon", int() raises — return val as-is.
    try:
        return int(val) + offset
    except (TypeError, ValueError):
        return val


# -----------------------------------------------------------------------------------------
# Expression compiler
# -----------------------------------------------------------------------------------------

def compile_expr(
    model: Any,
    expr: dict[str, Any],
    dv: "DerivedVars",  # noqa: F821
    env: dict[str, Any],
    penalty_terms: list[tuple[int, Any]],
    name_prefix: str = "",
) -> Any:
    """Compile a BoolExpr IR node to a CP-SAT BoolVar.

    Returns a BoolVar b such that b == 1 iff the expression is true.
    For soft constraints, violations are appended to penalty_terms.

    Args:
        model: CpModel
        expr: BoolExpr dict from IR
        dv: DerivedVars instance (provides atom BoolVars)
        env: variable bindings for the current quantifier scope
        penalty_terms: list to append (weight, violation_var) for soft constraints
        name_prefix: prefix for new BoolVar names (for debugging)

    Returns:
        BoolVar representing the expression
    """
    if not isinstance(expr, dict):
        # Atom shorthand: plain True/False
        return dv.const(bool(expr))

    # --- Boolean combinators ---
    if "and" in expr:
        lits = [
            compile_expr(model, sub, dv, env, penalty_terms, f"{name_prefix}_and{i}")
            for i, sub in enumerate(expr["and"])
        ]
        return reify_and(model, lits, f"{name_prefix}_and")

    if "or" in expr:
        lits = [
            compile_expr(model, sub, dv, env, penalty_terms, f"{name_prefix}_or{i}")
            for i, sub in enumerate(expr["or"])
        ]
        return reify_or(model, lits, f"{name_prefix}_or")

    if "not" in expr:
        sub = compile_expr(model, expr["not"], dv, env, penalty_terms, f"{name_prefix}_not")
        return reify_not(model, sub, f"{name_prefix}_not")

    if "implies" in expr:
        a, b = expr["implies"][0], expr["implies"][1]
        a_var = compile_expr(model, a, dv, env, penalty_terms, f"{name_prefix}_imp_a")
        b_var = compile_expr(model, b, dv, env, penalty_terms, f"{name_prefix}_imp_b")
        # a → b  ≡  NOT a OR b
        return reify_or(model, [a_var.Not(), b_var], f"{name_prefix}_implies")

    if "iff" in expr:
        a, b = expr["iff"][0], expr["iff"][1]
        a_var = compile_expr(model, a, dv, env, penalty_terms, f"{name_prefix}_iff_a")
        b_var = compile_expr(model, b, dv, env, penalty_terms, f"{name_prefix}_iff_b")
        # a ↔ b  ≡  (a → b) AND (b → a)
        imp1 = reify_or(model, [a_var.Not(), b_var], f"{name_prefix}_iff_imp1")
        imp2 = reify_or(model, [b_var.Not(), a_var], f"{name_prefix}_iff_imp2")
        return reify_and(model, [imp1, imp2], f"{name_prefix}_iff")

    # --- Quantifiers ---
    if "exists" in expr:
        q = expr["exists"]
        var = q["var"]
        domain_vals = expand_domain(q["in"], env)
        body = q["body"]
        if not domain_vals:
            # empty domain: exists = false
            return dv.const(False)

        # exists var in D: OR over body(var=val) for each val in D
        lits = []
        for val in domain_vals:
            sub_env = {**env, var: val}
            lit = compile_expr(model, body, dv, sub_env, penalty_terms, f"{name_prefix}_ex_{var}_{val}")
            lits.append(lit)
        return reify_or(model, lits, f"{name_prefix}_exists_{var}")

    if "forall" in expr:
        q = expr["forall"]
        var = q["var"]
        domain_vals = expand_domain(q["in"], env)
        body = q["body"]
        if not domain_vals:
            # empty domain: forall = true
            return dv.const(True)

        # forall var in D: AND over body(var=val) for each val in D
        lits = []
        for val in domain_vals:
            sub_env = {**env, var: val}
            lit = compile_expr(model, body, dv, sub_env, penalty_terms, f"{name_prefix}_fa_{var}_{val}")
            lits.append(lit)
        return reify_and(model, lits, f"{name_prefix}_forall_{var}")

    if "atLeast" in expr:
        q = expr["atLeast"]
        k = int(q["k"])
        var = q["var"]
        domain_vals = expand_domain(q["in"], env)
        body = q["body"]
        if not domain_vals:
            # empty domain: count = 0; atLeast k = (0 >= k) = (k <= 0)
            return dv.const(k <= 0)

        lits = []
        for val in domain_vals:
            sub_env = {**env, var: val}
            lit = compile_expr(model, body, dv, sub_env, penalty_terms, f"{name_prefix}_al_{var}_{val}")
            lits.append(lit)
        return reify_atleast(model, lits, k, f"{name_prefix}_atLeast_{var}")

    if "atMost" in expr:
        q = expr["atMost"]
        k = int(q["k"])
        var = q["var"]
        domain_vals = expand_domain(q["in"], env)
        body = q["body"]
        if not domain_vals:
            return dv.const(True)  # empty domain: atMost k = always true

        lits = []
        for val in domain_vals:
            sub_env = {**env, var: val}
            lit = compile_expr(model, body, dv, sub_env, penalty_terms, f"{name_prefix}_am_{var}_{val}")
            lits.append(lit)
        return reify_atmost(model, lits, k, f"{name_prefix}_atMost_{var}")

    if "exactly" in expr:
        q = expr["exactly"]
        k = int(q["k"])
        var = q["var"]
        domain_vals = expand_domain(q["in"], env)
        body = q["body"]
        if not domain_vals:
            return dv.const(k == 0)

        lits = []
        for val in domain_vals:
            sub_env = {**env, var: val}
            lit = compile_expr(model, body, dv, sub_env, penalty_terms, f"{name_prefix}_ex_{var}_{val}")
            lits.append(lit)
        return reify_exactly(model, lits, k, f"{name_prefix}_exactly_{var}")

    # --- Comparison ---
    if "compare" in expr:
        c = expr["compare"]
        op = c["op"]
        lhs = compile_int_expr(model, c["lhs"], dv, env, penalty_terms, f"{name_prefix}_cmp_lhs")
        rhs = compile_int_expr(model, c["rhs"], dv, env, penalty_terms, f"{name_prefix}_cmp_rhs")
        return reify_compare(model, lhs, rhs, op, f"{name_prefix}_compare")

    # --- Consecutive (temporal) ---
    if "consecutive" in expr:
        q = expr["consecutive"]
        var = q["var"]
        length = int(q["length"])
        domain_vals = expand_domain(q["in"], env)
        body = q["body"]

        if not domain_vals or len(domain_vals) < length:
            return dv.const(False)

        # consecutive L: there exists a start position such that
        # body[$var], body[$var+1], ..., body[$var+L-1] are all true.
        # FIX.md §7.2: window must be NUMERICALLY consecutive (e.g. [1,2,3]),
        # not just adjacent in the domain list (which would wrongly accept
        # windows like [2, 4] when periods_by_day=[1, 2, 4, 5]).
        def _is_numeric_consecutive_window(values):
            try:
                ints = [int(v) for v in values]
            except (TypeError, ValueError):
                return True
            return all(ints[i + 1] == ints[i] + 1 for i in range(len(ints) - 1))

        window_vars = []
        for start_idx in range(len(domain_vals) - length + 1):
            window_vals = domain_vals[start_idx : start_idx + length]
            if not _is_numeric_consecutive_window(window_vals):
                continue
            window_lits = []
            for i, val in enumerate(window_vals):
                sub_env = {**env, var: val}
                lit = compile_expr(model, body, dv, sub_env, penalty_terms, f"{name_prefix}_con_{var}_{val}")
                window_lits.append(lit)
            window_b = reify_and(model, window_lits, f"{name_prefix}_con_wnd_{start_idx}")
            window_vars.append(window_b)
        return reify_or(model, window_vars, f"{name_prefix}_consecutive")

    # --- Atoms ---
    if "teaches" in expr:
        a = expr["teaches"]
        teacher = resolve_var_ref(a["teacher"], env)
        day = resolve_var_ref(a["day"], env)
        period = resolve_var_ref(a["period"], env)
        return dv.teacher_busy(str(teacher), str(day), period)

    if "teachesOnDay" in expr:
        a = expr["teachesOnDay"]
        teacher = resolve_var_ref(a["teacher"], env)
        day = resolve_var_ref(a["day"], env)
        # FIX.md §7.2: prefer periods for this day from periodsByDay; fall
        # back to global periods only when the per-day list is missing/empty.
        pbd = env.get("periodsByDay") or env.get("periods_by_day") or {}
        periods = pbd.get(str(day)) or env.get("periods", [])
        if not periods:
            return dv.const(False)
        lits = [dv.teacher_busy(str(teacher), str(day), p) for p in periods]
        return reify_or(model, lits, f"{name_prefix}_tod_{teacher}_{day}")

    if "classSubjectAt" in expr:
        a = expr["classSubjectAt"]
        klass = resolve_var_ref(a["class"], env)
        subject = resolve_var_ref(a["subject"], env)
        day = resolve_var_ref(a["day"], env)
        period = resolve_var_ref(a["period"], env)
        return dv.class_subject_at(str(klass), str(subject), str(day), period)

    if "classBusy" in expr:
        a = expr["classBusy"]
        klass = resolve_var_ref(a["class"], env)
        day = resolve_var_ref(a["day"], env)
        period = resolve_var_ref(a["period"], env)
        return dv.class_busy(str(klass), str(day), period)

    if "assigned" in expr:
        a = expr["assigned"]
        assignment = resolve_var_ref(a["assignment"], env)
        day = resolve_var_ref(a["day"], env)
        period = resolve_var_ref(a["period"], env)
        return dv.assigned(str(assignment), str(day), period)

    if "const" in expr:
        return dv.const(bool(expr["const"]))

    # Unknown node: treat as true (fail-open for soft, fail-closed for hard)
    # This prevents the solver from crashing on unexpected IR nodes.
    return dv.const(True)


def compile_int_expr(
    model: Any,
    int_expr: Any,
    dv: "DerivedVars",  # noqa: F821
    env: dict[str, Any],
    penalty_terms: list[tuple[int, Any]],
    name_prefix: str = "",
) -> Any:
    """Compile an IntExpr IR node to a CP-SAT IntVar or int.

    Returns an integer expression suitable for use in compare nodes.
    """
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
            lits = []
            for val in domain_vals:
                sub_env = {**env, var: val}
                lit = compile_expr(model, body, dv, sub_env, penalty_terms, f"{name_prefix}_cnt_{var}_{val}")
                lits.append(lit)
            s = sum(lits)
            return s

        if "sum" in int_expr:
            terms = [
                compile_int_expr(model, t, dv, env, penalty_terms, f"{name_prefix}_sum{i}")
                for i, t in enumerate(int_expr["sum"])
            ]
            return sum(terms)

        if "scale" in int_expr:
            s = int_expr["scale"]
            factor = int(s["factor"])
            inner = compile_int_expr(model, s["of"], dv, env, penalty_terms, f"{name_prefix}_scale")
            return factor * inner

    return 0


# -----------------------------------------------------------------------------------------
# Main entry point
# -----------------------------------------------------------------------------------------

def compile_constraint(
    model: Any,
    ir: dict[str, Any],
    dv: "DerivedVars",  # noqa: F821
    env: dict[str, Any],
    penalty_terms: list[tuple[int, Any]],
) -> None:
    """Compile a full IR Constraint into CP-SAT constraints.

    Reads ir["expr"] and ir["severity"] and ir["weight"] and adds the appropriate
    constraints to model. For soft constraints, appends (weight, violation_var)
    to penalty_terms.

    Args:
        model: CpModel (will be mutated)
        ir: full IR constraint dict
        dv: DerivedVars instance
        env: top-level environment (days, periods, classes, teachers, subjects)
        penalty_terms: list to append soft violation terms to
    """
    severity = ir.get("severity", "hard")
    expr = ir.get("expr", {})
    weight = int(ir.get("weight", 1) or 1)

    expr_var = compile_expr(model, expr, dv, env, penalty_terms, f"ir_{ir.get('id', 'x')}")

    if severity == "hard":
        model.Add(expr_var == 1)
    elif severity == "soft":
        # Soft: minimize violations = maximize expr satisfied
        # We add (weight, violation_var) where violation_var = NOT expr_var
        viol = expr_var.Not()
        penalty_terms.append((weight, viol))
    # severity == "info": no constraint added to model
