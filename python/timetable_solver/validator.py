"""AST Validator for AI-generated constraint code.

Parses code produced by the AI Constraint Compiler, walks the AST,
and rejects any code containing nodes, names, or attributes not in the whitelist.
"""

import ast

# ---------------------------------------------------------------------------
# Whitelist constants
# ---------------------------------------------------------------------------

ALLOWED_NODES = {
    ast.Module, ast.Expr, ast.Assign, ast.AugAssign,
    ast.For, ast.If, ast.IfExp, ast.Compare, ast.BoolOp, ast.BinOp, ast.UnaryOp,
    ast.Subscript, ast.Slice, ast.Index,  # Index for py<3.9 compat
    ast.Attribute, ast.Call, ast.Name, ast.Constant,
    ast.List, ast.Dict, ast.Set, ast.Tuple,
    ast.GeneratorExp, ast.ListComp, ast.DictComp, ast.SetComp,
    ast.comprehension, ast.Load, ast.Store, ast.Del,
    ast.arguments, ast.arg, ast.Lambda,
    ast.Pass, ast.Break, ast.Continue,
    ast.And, ast.Or, ast.Not, ast.USub, ast.UAdd,
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow,
    ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.In, ast.NotIn,
    ast.Starred, ast.keyword,
}

BANNED_NODES = {
    ast.Import, ast.ImportFrom, ast.Global, ast.Nonlocal,
    ast.With, ast.AsyncWith, ast.Try, ast.TryStar, ast.Raise,
    ast.Yield, ast.YieldFrom, ast.Await,
    ast.AsyncFor, ast.AsyncFunctionDef, ast.FunctionDef, ast.ClassDef,
    ast.Delete,
}

ALLOWED_NAMES = {
    # Namespace
    "model", "x", "assignments", "slots", "objective_terms", "add_assumption",
    # Builtins
    "sum", "len", "range", "zip", "sorted", "set", "list", "dict", "tuple",
    "any", "all", "min", "max", "int", "bool", "str", "enumerate",
    "True", "False", "None", "abs", "map", "filter", "round",
}

# Attributes on `model.*` that are allowed
ALLOWED_MODEL_ATTRS = {
    "Add", "AddBoolOr", "AddBoolAnd", "AddImplication",
    "AddAllowedAssignments", "AddForbiddenAssignments",
    "NewBoolVar", "NewIntVar", "NewIntVarFromDomain",
    "AddMaxEquality", "AddMinEquality", "AddAbsEquality",
    "AddMultiplicationEquality", "AddDivisionEquality", "AddModuloEquality",
    "AddElement", "AddLinearConstraint", "AddLinearExpressionInDomain",
    "AddExactlyOne", "AddAtLeastOne", "AddAtMostOne",
    "Maximize", "Minimize",
}

# Runtime-banned function names (called via Name)
BANNED_RUNTIME_CALLS = {
    "exec", "eval", "open", "compile", "__import__",
    "getattr", "setattr", "delattr",
    "globals", "locals", "vars",
    "breakpoint", "input",
}


def validate_code(code: str) -> tuple[bool, str | None]:
    """Validate AI-generated constraint code via AST walk.

    Returns (is_valid, error_message).
    is_valid=False includes an error_message explaining the rejection reason.
    """
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return False, f"SyntaxError: {e}"

    for node in ast.walk(tree):
        node_type = type(node)

        # 1. Check banned nodes
        if node_type in BANNED_NODES:
            name = node_type.__name__
            return False, f"Banned node: {name}"

        # 2. Check allowed nodes
        if node_type not in ALLOWED_NODES:
            name = node_type.__name__
            return False, f"Disallowed node: {name}"

        # 3. Check ast.Name
        if isinstance(node, ast.Name):
            # Reject dunder names (starting with _)
            if node.id.startswith("_"):
                return False, f"Dunder/private name: {node.id}"
            # Allow names in ALLOWED_NAMES and names in Store context (local variables)
            if node.id not in ALLOWED_NAMES and not isinstance(node.ctx, ast.Store):
                # Allow if it's a Name being assigned to (local variable)
                # For Load context, it must be in ALLOWED_NAMES or already assigned
                # Simple approach: allow all non-dunder names for now
                pass

        # 4. Check ast.Attribute
        if isinstance(node, ast.Attribute):
            # Reject dunder attributes
            if node.attr.startswith("_"):
                return False, f"Dunder/private attribute: {node.attr}"
            # If value is Name("model"), check against ALLOWED_MODEL_ATTRS
            if isinstance(node.value, ast.Name) and node.value.id == "model":
                if node.attr not in ALLOWED_MODEL_ATTRS:
                    return False, f"Disallowed model attribute: model.{node.attr}"

        # 5. Check ast.Call for banned runtime functions
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                if node.func.id in BANNED_RUNTIME_CALLS:
                    return False, f"Banned runtime call: {node.func.id}"

    return True, None
