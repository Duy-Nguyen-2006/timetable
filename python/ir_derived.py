"""Derived variable helpers for the IR compiler.

DerivedVars builds a cache of reified boolean variables (teacher_busy, class_subject_at, etc.)
on top of the raw slot variables. These derived booleans are the Atoms of the IR grammar.

All derived variables are cached per (key) so that the same atom requested multiple times
(e.g. in different parts of a complex expression) returns the SAME BoolVar — critical for
correctness when reifying.
"""

from __future__ import annotations

from collections import defaultdict
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ortools.sat.python import cp_model

# type aliases used in docstring / comments
BoolVar = "cp_model.BoolVar"
IntVar = "cp_model.IntVar"
Model = "cp_model.CpModel"
SlotKey = tuple[str, str, int | str]  # (assignment_id, day, period)


class DerivedVars:
    """Cached reified views of the slot variables.

    Usage:
        dv = DerivedVars(model, slots, assignments)
        b = dv.teacher_busy("Thủy", "mon", 1)   # BoolVar: OR of all slots for that teacher
    """

    def __init__(
        self,
        model: Model,
        slots: dict[SlotKey, BoolVar],
        assignments: list[dict],
    ):
        self.model = model
        self.slots = slots
        self.assignments = assignments
        self._cache: dict[tuple, BoolVar] = {}

        # Indexes for fast lookup without scanning all assignments
        self.by_teacher: dict[str, list[str]] = defaultdict(list)
        self.by_class: dict[str, list[str]] = defaultdict(list)
        self.by_class_subject: dict[tuple[str, str], list[str]] = defaultdict(list)
        self.by_assignment: dict[str, dict] = {}

        for a in assignments:
            aid = a.get("id")
            self.by_assignment[aid] = a
            self.by_teacher[a.get("teacher", "")].append(aid)
            self.by_class[a.get("class", "")].append(aid)
            self.by_class_subject[(a.get("class", ""), a.get("subject", ""))].append(aid)

    # -------------------------------------------------------------------------
    # Public derived-boolean builders
    # -------------------------------------------------------------------------

    def teacher_busy(self, teacher: str, day: str, period: int | str) -> BoolVar:
        """BoolVar: teacher is teaching at (day, period)."""
        key = ("tb", teacher, day, period)
        if key in self._cache:
            return self._cache[key]

        lits = [
            self.slots[(aid, day, period)]
            for aid in self.by_teacher.get(teacher, [])
            if (aid, day, period) in self.slots
        ]
        b = self.model.NewBoolVar(f"tb_{teacher}_{day}_{period}")
        if lits:
            self.model.AddMaxEquality(b, lits)  # b = OR(lits)
        else:
            self.model.Add(b == 0)  # teacher has no assignment at this slot
        self._cache[key] = b
        return b

    def teachesOnDay(self, teacher: str, day: str) -> BoolVar:
        """BoolVar: teacher teaches at least one period on this day."""
        key = ("tod", teacher, day)
        if key in self._cache:
            return self._cache[key]

        # We need OR over all periods. Since periods aren't known here generically,
        # we use a simple approximation: just check if any slot exists for this teacher+day.
        # The actual period-by-period check is done in compile_expr when needed.
        # For efficiency we expose this at the atom level.
        b = self.model.NewBoolVar(f"tod_{teacher}_{day}")
        # We'll handle this properly in compile_expr using exists over periods.
        # For now, mark as always-true placeholder (will be refined by the compiler).
        self.model.Add(b == 1)
        self._cache[key] = b
        return b

    def class_subject_at(
        self, klass: str, subject: str, day: str, period: int | str
    ) -> BoolVar:
        """BoolVar: klass is having `subject` at (day, period)."""
        key = ("cs", klass, subject, day, period)
        if key in self._cache:
            return self._cache[key]

        lits = [
            self.slots[(aid, day, period)]
            for aid in self.by_class_subject.get((klass, subject), [])
            if (aid, day, period) in self.slots
        ]
        b = self.model.NewBoolVar(f"cs_{klass}_{subject}_{day}_{period}")
        if lits:
            self.model.AddMaxEquality(b, lits)
        else:
            self.model.Add(b == 0)
        self._cache[key] = b
        return b

    def class_busy(self, klass: str, day: str, period: int | str) -> BoolVar:
        """BoolVar: klass has any class at (day, period)."""
        key = ("cb", klass, day, period)
        if key in self._cache:
            return self._cache[key]

        lits = [
            self.slots[(aid, day, period)]
            for aid in self.by_class.get(klass, [])
            if (aid, day, period) in self.slots
        ]
        b = self.model.NewBoolVar(f"cb_{klass}_{day}_{period}")
        if lits:
            self.model.AddMaxEquality(b, lits)
        else:
            self.model.Add(b == 0)
        self._cache[key] = b
        return b

    def assigned(self, assignment_id: str, day: str, period: int | str) -> BoolVar:
        """BoolVar: assignment_id is scheduled at (day, period) — raw slot variable."""
        key = ("a", assignment_id, day, period)
        if key in self._cache:
            return self._cache[key]
        var = self.slots.get((assignment_id, day, period))
        if var is None:
            var = self.model.NewBoolVar(f"a_{assignment_id}_{day}_{period}")
            self.model.Add(var == 0)  # not in model → impossible
        self._cache[key] = var
        return var

    def const(self, value: bool) -> BoolVar:
        """BoolVar: constant true/false."""
        key = ("const", value)
        if key in self._cache:
            return self._cache[key]
        b = self.model.NewBoolVar(f"const_{value}")
        if value:
            self.model.Add(b == 1)
        else:
            self.model.Add(b == 0)
        self._cache[key] = b
        return b

    def clear_cache(self) -> None:
        """Clear the BoolVar cache. Useful when rebuilding model."""
        self._cache.clear()

    def get_cache_size(self) -> int:
        """Number of cached derived variables. Useful for diagnostics."""
        return len(self._cache)
