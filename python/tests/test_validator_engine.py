from pathlib import Path
import sys

sys.path.append(str(Path(__file__).parent.parent))

from validator_engine import validate_schedule


def _entry(klass: str, day: str, period: int, subject: str, teacher: str) -> dict:
    return {
        "class": klass,
        "day": day,
        "period": period,
        "subject": subject,
        "teacher": teacher,
    }


def _spec(spec_id: str, kind: str, params: dict, severity: str = "hard") -> dict:
    return {
        "id": spec_id,
        "kind": kind,
        "severity": severity,
        "params": params,
    }


def test_subject_consecutive_allows_remainder_periods_rule_a():
    report = validate_schedule(
        [
            _entry("6A", "mon", 1, "Toán", "Sơn"),
            _entry("6A", "mon", 2, "Toán", "Sơn"),
            _entry("6A", "wed", 1, "Toán", "Sơn"),
            _entry("6A", "wed", 2, "Toán", "Sơn"),
            _entry("6A", "fri", 5, "Toán", "Sơn"),
        ],
        [_spec("subject_consecutive_rule_a", "subject_consecutive", {"subject": "Toán", "length": 2})],
    )

    assert report["violations"] == []


def test_class_no_double_subject_day_honors_custom_max_per_day():
    report = validate_schedule(
        [
            _entry("6A", "mon", 1, "Toán", "Sơn"),
            _entry("6A", "mon", 2, "Toán", "Sơn"),
            _entry("6A", "mon", 3, "Toán", "Sơn"),
        ],
        [
            _spec(
                "class_no_double_custom",
                "class_no_double_subject_day",
                {"class": "6A", "subject": "Toán", "maxPerDay": 2},
            )
        ],
    )

    assert len(report["violations"]) == 1
    assert report["violations"][0]["constraintId"] == "class_no_double_custom"


def test_validator_ignores_resource_capacity_and_checks_supported_limits():
    schedule = [
        _entry("6A", "mon", 1, "Toán", "Sơn"),
        _entry("6B", "mon", 1, "Toán", "Mai"),
        _entry("6A", "tue", 1, "Văn", "Sơn"),
        _entry("6A", "tue", 2, "Anh", "Sơn"),
        _entry("6A", "tue", 3, "Sử", "Sơn"),
    ]
    specs = [
        _spec("capacity", "resource_capacity", {"subject": "Toán", "capacity": 1}),
        _spec("session", "session_limit", {"teacher": "Sơn", "maxPeriods": 2}),
        _spec("group", "subject_group_daily_limit", {"class": "6A", "maxPerDay": 2}),
    ]

    report = validate_schedule(schedule, specs)

    assert {violation["constraintId"] for violation in report["violations"]} == {"session", "group"}
