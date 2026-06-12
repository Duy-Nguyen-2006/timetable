"""JSON Schema definitions and validators for the Constraint IR.

This module defines the canonical grammar of the Constraint IR (Intermediate Representation)
and provides validation against that grammar. Every constraint that flows through the system
must conform to this schema before it is compiled or evaluated.

Grammar (informal BNF):
    Constraint   := { id, severity:"hard"|"soft", weight?:number,
                      original:string, explain:string, expr:BoolExpr }

    BoolExpr     :=
      | Atom
      | { "and":  [BoolExpr, ...] }
      | { "or":   [BoolExpr, ...] }
      | { "not":  BoolExpr }
      | { "implies": [BoolExpr, BoolExpr] }
      | { "iff":     [BoolExpr, BoolExpr] }
      | { "exists":  { var, in:Domain, body:BoolExpr } }
      | { "forall":  { var, in:Domain, body:BoolExpr } }
      | { "atLeast": { k:int, var, in:Domain, body:BoolExpr } }
      | { "atMost":  { k:int, var, in:Domain, body:BoolExpr } }
      | { "exactly": { k:int, var, in:Domain, body:BoolExpr } }
      | { "compare": { op:"<="|"<"|"=="|"!="|">="|">", lhs:IntExpr, rhs:IntExpr } }
      | { "consecutive": { var, in:Domain, length:int, body:BoolExpr } }

    IntExpr      :=
      | int
      | { "count": { var, in:Domain, body:BoolExpr } }
      | { "sum":   [IntExpr, ...] }
      | { "scale": { factor:int, of:IntExpr } }

    Atom         :=                          # must be reifiable to BoolVar
      | { "teaches":       { teacher, day, period } }
      | { "teachesOnDay":  { teacher, day } }
      | { "classSubjectAt": { class, subject, day, period } }
      | { "classBusy":     { class, day, period } }
      | { "assigned":       { assignment, day, period } }
      | { "const": true|false }

    Domain       :=
      | "days" | "periods" | "classes" | "teachers" | "subjects"
      | { "list": [ ... ] }
      | { "range": [from, to] }
      | { "filter": { in:Domain, where:<vị từ đơn giản> } }

Reference variables in quantifiers with "$<var>" syntax, e.g. "$p+1".
"""

from __future__ import annotations

import json
import re
from typing import Any

# -----------------------------------------------------------------------------------------
# JSON Schema (string form — validated with jsonschema library at runtime)
# -----------------------------------------------------------------------------------------

IR_CONSTRAINT_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "ConstraintIR",
    "description": "Canonical constraint representation — one IR, two backends: CP-SAT enforce + Python verify.",
    "type": "object",
    "required": ["id", "severity", "original", "expr"],
    "additionalProperties": True,
    "definitions": {
        "Domain": {
            "anyOf": [
                {"type": "string", "enum": ["days", "periods", "classes", "teachers", "subjects"]},
                {
                    "type": "object",
                    "required": ["list"],
                    "additionalProperties": False,
                    "properties": {
                        "list": {
                            "type": "array",
                            "items": {"type": ["string", "number"]},
                        }
                    },
                },
                {
                    "type": "object",
                    "required": ["range"],
                    "additionalProperties": False,
                    "properties": {
                        "range": {
                            "type": "array",
                            "minItems": 2,
                            "maxItems": 2,
                            "items": {"type": ["string", "number"]},
                        }
                    },
                },
                {
                    "type": "object",
                    "required": ["in"],
                    "additionalProperties": False,
                    "properties": {
                        "in": {"$ref": "#/definitions/Domain"},
                        "where": {"type": "object"},
                    },
                },
            ]
        },
        "Atom": {
            "type": "object",
            "description": "Base propositions — must be reifiable to a BoolVar.",
            "oneOf": [
                {
                    "type": "object",
                    "required": ["teaches"],
                    "additionalProperties": False,
                    "properties": {
                        "teaches": {
                            "type": "object",
                            "required": ["teacher", "day", "period"],
                            "additionalProperties": False,
                            "properties": {
                                "teacher": {"type": "string"},
                                "day": {"type": "string"},
                                "period": {"type": ["string", "number"]},
                            },
                        }
                    },
                },
                {
                    "type": "object",
                    "required": ["teachesOnDay"],
                    "additionalProperties": False,
                    "properties": {
                        "teachesOnDay": {
                            "type": "object",
                            "required": ["teacher", "day"],
                            "additionalProperties": False,
                            "properties": {
                                "teacher": {"type": "string"},
                                "day": {"type": "string"},
                            },
                        }
                    },
                },
                {
                    "type": "object",
                    "required": ["classSubjectAt"],
                    "additionalProperties": False,
                    "properties": {
                        "classSubjectAt": {
                            "type": "object",
                            "required": ["class", "subject", "day", "period"],
                            "additionalProperties": False,
                            "properties": {
                                "class": {"type": "string"},
                                "subject": {"type": "string"},
                                "day": {"type": "string"},
                                "period": {"type": ["string", "number"]},
                            },
                        }
                    },
                },
                {
                    "type": "object",
                    "required": ["classBusy"],
                    "additionalProperties": False,
                    "properties": {
                        "classBusy": {
                            "type": "object",
                            "required": ["class", "day", "period"],
                            "additionalProperties": False,
                            "properties": {
                                "class": {"type": "string"},
                                "day": {"type": "string"},
                                "period": {"type": ["string", "number"]},
                            },
                        }
                    },
                },
                {
                    "type": "object",
                    "required": ["assigned"],
                    "additionalProperties": False,
                    "properties": {
                        "assigned": {
                            "type": "object",
                            "required": ["assignment", "day", "period"],
                            "additionalProperties": False,
                            "properties": {
                                "assignment": {"type": "string"},
                                "day": {"type": "string"},
                                "period": {"type": ["string", "number"]},
                            },
                        }
                    },
                },
                {
                    "type": "object",
                    "required": ["const"],
                    "additionalProperties": False,
                    "properties": {
                        "const": {"type": "boolean"},
                    },
                },
            ],
        },
        "IntExpr": {
            "anyOf": [
                {"type": "integer"},
                # Phase 3: { var: "<name>" } — reference a forall/exists
                # variable name in the IR env. Resolved at compile/eval time
                # against the current env (a dict mapping var name → value).
                {
                    "type": "object",
                    "required": ["var"],
                    "additionalProperties": False,
                    "properties": {
                        "var": {"type": "string"},
                    },
                },
                {
                    "type": "object",
                    "required": ["count"],
                    "additionalProperties": False,
                    "properties": {
                        "count": {
                            "type": "object",
                            "required": ["var", "in", "body"],
                            "additionalProperties": False,
                            "properties": {
                                "var": {"type": "string"},
                                "in": {"$ref": "#/definitions/Domain"},
                                "body": {"$ref": "#/definitions/BoolExpr"},
                            },
                        }
                    },
                },
                {
                    "type": "object",
                    "required": ["sum"],
                    "additionalProperties": False,
                    "properties": {
                        "sum": {
                            "type": "array",
                            "items": {"$ref": "#/definitions/IntExpr"},
                        }
                    },
                },
                {
                    "type": "object",
                    "required": ["scale"],
                    "additionalProperties": False,
                    "properties": {
                        "scale": {
                            "type": "object",
                            "required": ["factor", "of"],
                            "additionalProperties": False,
                            "properties": {
                                "factor": {"type": "integer"},
                                "of": {"$ref": "#/definitions/IntExpr"},
                            },
                        }
                    },
                },
            ]
        },
        "BoolExpr": {
            "anyOf": [
                {"$ref": "#/definitions/Atom"},
                {
                    "type": "object",
                    "required": ["and"],
                    "additionalProperties": False,
                    "properties": {
                        "and": {
                            "type": "array",
                            "items": {"$ref": "#/definitions/BoolExpr"},
                        }
                    },
                },
                {
                    "type": "object",
                    "required": ["or"],
                    "additionalProperties": False,
                    "properties": {
                        "or": {
                            "type": "array",
                            "items": {"$ref": "#/definitions/BoolExpr"},
                        }
                    },
                },
                {
                    "type": "object",
                    "required": ["not"],
                    "additionalProperties": False,
                    "properties": {
                        "not": {"$ref": "#/definitions/BoolExpr"},
                    },
                },
                {
                    "type": "object",
                    "required": ["implies"],
                    "additionalProperties": False,
                    "properties": {
                        "implies": {
                            "type": "array",
                            "minItems": 2,
                            "maxItems": 2,
                            "items": {"$ref": "#/definitions/BoolExpr"},
                        }
                    },
                },
                {
                    "type": "object",
                    "required": ["iff"],
                    "additionalProperties": False,
                    "properties": {
                        "iff": {
                            "type": "array",
                            "minItems": 2,
                            "maxItems": 2,
                            "items": {"$ref": "#/definitions/BoolExpr"},
                        }
                    },
                },
                {
                    "type": "object",
                    "required": ["exists"],
                    "additionalProperties": False,
                    "properties": {
                        "exists": {
                            "type": "object",
                            "required": ["var", "in", "body"],
                            "additionalProperties": False,
                            "properties": {
                                "var": {"type": "string"},
                                "in": {"$ref": "#/definitions/Domain"},
                                "body": {"$ref": "#/definitions/BoolExpr"},
                            },
                        }
                    },
                },
                {
                    "type": "object",
                    "required": ["forall"],
                    "additionalProperties": False,
                    "properties": {
                        "forall": {
                            "type": "object",
                            "required": ["var", "in", "body"],
                            "additionalProperties": False,
                            "properties": {
                                "var": {"type": "string"},
                                "in": {"$ref": "#/definitions/Domain"},
                                "body": {"$ref": "#/definitions/BoolExpr"},
                            },
                        }
                    },
                },
                {
                    "type": "object",
                    "required": ["atLeast"],
                    "additionalProperties": False,
                    "properties": {
                        "atLeast": {
                            "type": "object",
                            "required": ["k", "var", "in", "body"],
                            "additionalProperties": False,
                            "properties": {
                                "k": {"type": "integer"},
                                "var": {"type": "string"},
                                "in": {"$ref": "#/definitions/Domain"},
                                "body": {"$ref": "#/definitions/BoolExpr"},
                            },
                        }
                    },
                },
                {
                    "type": "object",
                    "required": ["atMost"],
                    "additionalProperties": False,
                    "properties": {
                        "atMost": {
                            "type": "object",
                            "required": ["k", "var", "in", "body"],
                            "additionalProperties": False,
                            "properties": {
                                "k": {"type": "integer"},
                                "var": {"type": "string"},
                                "in": {"$ref": "#/definitions/Domain"},
                                "body": {"$ref": "#/definitions/BoolExpr"},
                            },
                        }
                    },
                },
                {
                    "type": "object",
                    "required": ["exactly"],
                    "additionalProperties": False,
                    "properties": {
                        "exactly": {
                            "type": "object",
                            "required": ["k", "var", "in", "body"],
                            "additionalProperties": False,
                            "properties": {
                                "k": {"type": "integer"},
                                "var": {"type": "string"},
                                "in": {"$ref": "#/definitions/Domain"},
                                "body": {"$ref": "#/definitions/BoolExpr"},
                            },
                        }
                    },
                },
                {
                    "type": "object",
                    "required": ["compare"],
                    "additionalProperties": False,
                    "properties": {
                        "compare": {
                            "type": "object",
                            "required": ["op", "lhs", "rhs"],
                            "additionalProperties": False,
                            "properties": {
                                "op": {"type": "string", "enum": ["<=", "<", "==", "!=", ">=", ">"]},
                                "lhs": {"$ref": "#/definitions/IntExpr"},
                                "rhs": {"$ref": "#/definitions/IntExpr"},
                            },
                        }
                    },
                },
                {
                    "type": "object",
                    "required": ["consecutive"],
                    "additionalProperties": False,
                    "properties": {
                        "consecutive": {
                            "type": "object",
                            "required": ["var", "in", "length", "body"],
                            "additionalProperties": False,
                            "properties": {
                                "var": {"type": "string"},
                                "in": {"$ref": "#/definitions/Domain"},
                                "length": {"type": "integer", "minimum": 2},
                                "body": {"$ref": "#/definitions/BoolExpr"},
                            },
                        }
                    },
                },
            ]
        },
    },
    "properties": {
        "id": {"type": "string"},
        "severity": {"type": "string", "enum": ["hard", "soft", "info"]},
        "weight": {"type": "number"},
        "original": {"type": "string"},
        "explain": {"type": "string"},
        "expr": {"$ref": "#/definitions/BoolExpr"},
    },
}

# Lazy-import jsonschema only when validate() is called
_jsonschema = None


def _get_jsonschema():
    global _jsonschema
    if _jsonschema is None:
        try:
            import jsonschema
            _jsonschema = jsonschema
        except ImportError:
            return None
    return _jsonschema


class ValidationError(ValueError):
    """Raised when an IR node fails schema validation.

    Attributes:
        path: JSON pointer path to the failing node.
        message: Human-readable error description.
        node: The invalid node itself.
    """

    def __init__(self, message: str, path: str = "", node: Any = None):
        super().__init__(f"{'[ ' + path + ' ] ' if path else ''}{message}")
        self.path = path
        self.node = node


def validate_constraint(ir: dict[str, Any]) -> list[ValidationError]:
    """Validate a single IR constraint against the schema.

    Returns a list of ValidationErrors (empty = valid).
    Does NOT raise — collects all errors so the caller can report them all.
    """
    jsonschema = _get_jsonschema()
    if jsonschema is None:
        return []  # jsonschema not installed; skip validation

    validator = jsonschema.Draft7Validator(IR_CONSTRAINT_SCHEMA)
    errors = []
    for err in validator.iter_errors(ir):
        path = "/".join(str(p) for p in err.path) if err.path else ""
        errors.append(ValidationError(err.message, path, err.instance))
    return errors


def validate_constraints(irs: list[dict[str, Any]]) -> dict[str, list[ValidationError]]:
    """Validate a list of IR constraints. Returns {constraint_id: [errors]}. """
    results: dict[str, list[ValidationError]] = {}
    for ir in irs:
        cid = ir.get("id", "<unknown>")
        results[cid] = validate_constraint(ir)
    return results


def is_valid_constraint(ir: dict[str, Any]) -> bool:
    """Return True iff the constraint passes schema validation."""
    return len(validate_constraint(ir)) == 0


def check_hard_has_expr(spec: dict[str, Any]) -> ValidationError | None:
    """Phase 0 hardenting: a hard constraint MUST have an expr field
    (either IR expr OR pythonPredicate, but not bare custom_dsl with no mechanism)."""
    if spec.get("severity") != "hard":
        return None
    kind = spec.get("kind", "")

    # Has IR expr
    if "expr" in spec and isinstance(spec["expr"], dict):
        return None

    # Has pythonPredicate (escape hatch — allowed)
    python_pred = (
        spec.get("pythonPredicate")
        or (spec.get("params") or {}).get("pythonPredicate")
    )
    if python_pred:
        return None

    # Has IR-based kind that we know how to compile
    # (these kinds have known encodings in the skeleton)
    from .macros import KNOWN_ENCODABLE_KINDS
    if kind in KNOWN_ENCODABLE_KINDS:
        return None

    return ValidationError(
        f"Hard constraint '{spec.get('id', '')}' (kind={kind}) has no expr, "
        f"no pythonPredicate, and is not in the known encodable kinds list. "
        f"It will be verify-only (not enforced in solver). "
        f"Add an 'expr' IR field or a 'pythonPredicate'.",
        path=f"/constraints/{spec.get('id', '')}",
        node=spec,
    )
