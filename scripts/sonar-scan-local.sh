#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_ENV_FILE="$ROOT_DIR/.sonar.local.env"

if [[ -f "$LOCAL_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$LOCAL_ENV_FILE"
  set +a
fi

export SONAR_HOST_URL="${SONAR_HOST_URL:-http://localhost:9000}"

if [[ -z "${SONAR_TOKEN:-}" ]]; then
  echo "SONAR_TOKEN is missing. Create a local token at http://localhost:9000 -> My Account -> Security, then store it in .sonar.local.env." >&2
  exit 1
fi

cd "$ROOT_DIR"
npm run lint
npm test
npx @sonar/scan
