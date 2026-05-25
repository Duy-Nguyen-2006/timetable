#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3000}"

if [[ -z "${LOWPRIZO_API_KEY:-}" ]]; then
  echo "LOWPRIZO_API_KEY is required for dataset API tests." >&2
  exit 1
fi

TIMETABLE_API_BASE="$BASE_URL" ./.venv/bin/pytest test_datasets.py -q
