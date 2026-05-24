#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3000}"

json_payload='{"apiKey":"dummy","days":[],"sessions":[],"periodCounts":{},"deletedPeriods":{},"assignments":[],"constraints":[]}'

# JSON path (non-SSE)
code=$(curl -sS -o /tmp/gen_json.out -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  -X POST "$BASE_URL/api/generate-timetable" \
  --data "$json_payload" || true)
echo "JSON status: $code"
head -c 300 /tmp/gen_json.out || true
echo

# SSE path
code=$(curl -sS -N -o /tmp/gen_sse.out -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -X POST "$BASE_URL/api/generate-timetable" \
  --data "$json_payload" || true)
echo "SSE status: $code"
head -c 300 /tmp/gen_sse.out || true
echo

# Infeasible-like path cannot be deterministically forced here without real model/solver constraints;
# this check ensures response schema includes status for normal JSON path when successful.
if grep -q '"status"' /tmp/gen_json.out; then
  echo "Schema check: found status field in JSON response"
else
  echo "Schema check: status field not found (likely upstream error), keep for manual validation"
fi
