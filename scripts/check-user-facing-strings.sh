#!/usr/bin/env bash
# scripts/check-user-facing-strings.sh
#
# Build-time guard (PRD M1 §3): fail CI if any debug-style message
# leaks into source files other than constraint-humanizer.ts.
#
# The debug string "chưa có mô tả tiếng Việt chi tiết" is a code smell —
# it indicates a fallback was reached in constraint-humanizer.ts that the
# user should never see. If it appears in a UI component, helper, or
# formatter, the original bug from FIX.md §3 has regressed.
#
# Usage: bash scripts/check-user-facing-strings.sh
# Exit:  0 on clean, 1 on leak.

set -euo pipefail

PATTERN="chưa có mô tả tiếng Việt chi tiết"
ALLOWED_FILE="src/features/timetable/ai/constraint-humanizer.ts"
# Test files legitimately reference the pattern as a fixture/assertion.
ALLOWED_TEST="src/features/timetable/ai/constraint-humanizer.test.ts"

# Find leaks (excluding allowed file/test and node_modules).
LEAKS=$(grep -rln "$PATTERN" src \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
  2>/dev/null | grep -v "$ALLOWED_FILE" | grep -v "$ALLOWED_TEST" || true)

if [ -n "$LEAKS" ]; then
  echo "❌ Debug string '$PATTERN' leaked outside $ALLOWED_FILE:"
  echo "$LEAKS" | sed 's/^/   - /'
  echo ""
  echo "Fix: this string should only appear as a fallback in"
  echo "     $ALLOWED_FILE (or be removed entirely — see PRD M1)."
  exit 1
fi

echo "✅ No user-facing debug-string leaks detected."
exit 0
