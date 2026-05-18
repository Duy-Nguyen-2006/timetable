"""Unit tests for the AST validator."""

import sys
from pathlib import Path

# Ensure the solver package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from timetable_solver.validator import validate_code


def test_allow_basic_model_add():
    code = "model.Add(x[('a1', 's1')] == 0)"
    valid, err = validate_code(code)
    assert valid, f"Expected valid, got error: {err}"


def test_reject_import():
    code = "import os\nmodel.Add(x[('a1','s1')]==0)"
    valid, err = validate_code(code)
    assert not valid and "import" in err.lower(), f"Expected import rejection, got: {err}"


def test_reject_dunder():
    code = "model.__class__"
    assert not validate_code(code)[0]


def test_reject_exec():
    assert not validate_code("exec('print(1)')")[0]


def test_reject_open():
    assert not validate_code("open('/etc/passwd')")[0]


def test_reject_getattr():
    assert not validate_code("getattr(model, 'Add')(x[('a','s')]==0)")[0]


def test_allow_comprehension():
    code = "model.Add(sum(x[(a['assignmentId'], s['slotId'])] for a in assignments for s in slots) >= 1)"
    assert validate_code(code)[0]


def test_reject_function_def():
    assert not validate_code("def f(): return 1")[0]


def test_allow_assign_and_loops():
    code = """
ta = [a for a in assignments if a['teacherLabel'] == 'Lan']
for a in ta:
    for s in slots:
        if s['dayId'] == 'saturday':
            model.Add(x[(a['assignmentId'], s['slotId'])] == 0)
"""
    assert validate_code(code)[0]


def test_reject_class_def():
    assert not validate_code("class Foo: pass")[0]


def test_reject_global():
    assert not validate_code("global x")[0]


def test_reject_try():
    assert not validate_code("try:\n    pass\nexcept:\n    pass")[0]


def test_reject_with():
    assert not validate_code("with open('f') as f:\n    pass")[0]


def test_reject_yield():
    assert not validate_code("yield 1")[0]


def test_reject_eval():
    assert not validate_code("eval('1+1')")[0]


def test_reject_compile():
    assert not validate_code("compile('1+1','','eval')")[0]


def test_reject_setattr():
    assert not validate_code("setattr(model, 'x', 1)")[0]


def test_allow_model_NewBoolVar():
    code = "p = model.NewBoolVar('c6_pair')"
    assert validate_code(code)[0]


def test_allow_model_AddBoolOr():
    code = "model.AddBoolOr([x[('a1','s1')], x[('a1','s2')]])"
    assert validate_code(code)[0]


def test_reject_disallowed_model_attr():
    code = "model.SomeRandomMethod()"
    valid, err = validate_code(code)
    assert not valid
    assert "SomeRandomMethod" in err


def test_allow_lambda():
    code = "sorted(slots, key=lambda s: s['period'])"
    assert validate_code(code)[0]


def test_allow_augmented_assign():
    code = "x_val = 0\nx_val += 1"
    assert validate_code(code)[0]


def test_syntax_error():
    code = "def +- invalid"
    valid, err = validate_code(code)
    assert not valid
    assert "SyntaxError" in err


def test_reject_private_name():
    code = "_private = 1"
    valid, err = validate_code(code)
    assert not valid
    assert "_" in err
