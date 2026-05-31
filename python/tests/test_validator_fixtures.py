import json
from pathlib import Path

import sys

sys.path.append(str(Path(__file__).parent.parent))

from validator_engine import validate_schedule

FIXTURES_DIR = Path(__file__).parents[2] / "tests" / "fixtures" / "validator"


def _load_fixtures():
    return sorted(FIXTURES_DIR.glob("*.json"))


def test_validator_fixtures_match_expected_violations():
    for fixture_path in _load_fixtures():
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
        report = validate_schedule(fixture["schedule"], fixture["constraints"])
        violation_ids = sorted({v["constraintId"] for v in report["violations"]})
        expected = sorted(fixture["expectedViolationIds"])
        assert violation_ids == expected, (
            f"{fixture_path.name} ({fixture['name']}): expected {expected}, got {violation_ids}"
        )
