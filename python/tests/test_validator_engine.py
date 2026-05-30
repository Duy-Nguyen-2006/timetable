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


def test_validator_checks_resource_capacity_session_limit_and_subject_group_daily_limit():
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
        _spec("group_def", "subject_group", {"name": "core", "subjects": ["Văn", "Anh", "Sử"]}),
        _spec("group", "subject_group_daily_limit", {"class": "6A", "groupName": "core", "maxPerDay": 2}),
    ]

    report = validate_schedule(schedule, specs)

    assert {violation["constraintId"] for violation in report["violations"]} == {"capacity", "session", "group"}


def test_subject_group_daily_limit_is_per_class():
    schedule = [
        _entry("6A", "mon", 1, "Toán", "An"),
        _entry("6A", "mon", 2, "Văn", "Bình"),
        _entry("6A", "mon", 3, "KHTN", "Chi"),
        _entry("6B", "mon", 1, "Toán", "Duy"),
        _entry("6B", "mon", 2, "Văn", "Em"),
        _entry("6B", "mon", 3, "KHTN", "Giang"),
    ]
    specs = [
        _spec("core_group", "subject_group", {"name": "core", "subjects": ["Toán", "Văn", "KHTN"]}),
        _spec("core_limit", "subject_group_daily_limit", {"groupName": "core", "maxPerDay": 3}),
    ]

    report = validate_schedule(schedule, specs)

    assert report["violations"] == []
