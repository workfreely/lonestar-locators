#!/usr/bin/env bash
# Run EVERY test suite in the repo and report by EXIT CODE, not by scraping output.
#
# Why exit code: the suites print at least four different summary lines
# ("27 passed, 0 failed", "ALL PASS ✅ (19 passed, 0 failed)", "All passed",
# "PASS — 52 passed"), so any grep-based runner silently reports a passing suite as
# unknown — or, worse, a failing one as fine. Every suite ends with
# `process.exit(fail === 0 ? 0 : 1)`, so the exit code is the one reliable signal.
#
# Usage: bash scripts/runAllTests.sh [name-filter]
set -uo pipefail
cd "$(dirname "$0")/.."

filter="${1:-}"
red=0; green=0; failed=()

for f in scripts/tests/*.test.ts scripts/leads/*.test.ts scripts/matching/*.test.ts \
         scripts/share/*.test.ts scripts/social/*.test.ts; do
  [ -e "$f" ] || continue
  [ -n "$filter" ] && [[ "$f" != *"$filter"* ]] && continue
  out=$(npx tsx "$f" 2>&1); code=$?
  # Purely for display; the verdict above is the exit code.
  line=$(printf '%s\n' "$out" | grep -oE '[0-9]+ passed, [0-9]+ failed' | tail -1)
  [ -z "$line" ] && line=$(printf '%s\n' "$out" | grep -oE '(ALL PASS|All passed)[^ ]*' | tail -1)
  if [ "$code" -eq 0 ]; then
    green=$((green+1)); printf '  \033[32m✓\033[0m %-48s %s\n' "$(basename "$f")" "$line"
  else
    red=$((red+1)); failed+=("$f")
    printf '  \033[31m✗\033[0m %-48s %s\n' "$(basename "$f")" "${line:-exit $code}"
  fi
done

# TYPECHECK lib/ + scripts/ — tsconfig.json's `include` is app/** plus two named
# components, so `tsc --noEmit` never reaches code imported only by scripts or
# tests. That gap let a LeadSnapshot literal go missing a required field and
# silently turned an On Hold assertion into a pass. Judged by exit code like the
# suites above.
if [ -z "$filter" ]; then
  if npx tsc --noEmit -p tsconfig.libcheck.json >/dev/null 2>&1; then
    green=$((green+1)); printf '  \033[32m✓\033[0m %-48s %s\n' "tsconfig.libcheck.json" "types clean"
  else
    red=$((red+1)); failed+=("tsconfig.libcheck.json (npx tsc --noEmit -p tsconfig.libcheck.json)")
    printf '  \033[31m✗\033[0m %-48s %s\n' "tsconfig.libcheck.json" "TYPE ERRORS"
  fi
fi

echo
if [ "$red" -eq 0 ]; then
  printf '\033[32m%s suites passed, 0 failed\033[0m\n' "$green"
else
  printf '\033[31m%s suites passed, %s FAILED\033[0m\n' "$green" "$red"
  for f in "${failed[@]}"; do echo "    $f"; done
fi
exit $([ "$red" -eq 0 ] && echo 0 || echo 1)
