#!/usr/bin/env bash
# Milestone B — Companion auth DB layer proofs on an EPHEMERAL local Postgres
# (never a real database). Runs the REAL migration against stubbed FK deps and
# proves: atomic single-use auth-code consume (+ PKCE in the WHERE, no burn on
# wrong verifier), atomic refresh rotation, refresh reuse → family/access/
# connection revocation, and durable rate limiting.
# Requires postgres 16 server binaries. Usage: bash scripts/tests/run-companion-auth-db-tests.sh
set -euo pipefail
export LC_ALL="${LC_ALL:-en_US.UTF-8}" LANG="${LANG:-en_US.UTF-8}"
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
MIGRATION="$ROOT/supabase/migrations/20260806000003_companion_auth.sql"
PGDATA="$(mktemp -d)/pgdata"
SOCK="$(mktemp -d /tmp/cauth.XXXX)"
cleanup() { pg_ctl -D "$PGDATA" stop >/dev/null 2>&1 || true; rm -rf "$PGDATA" "$SOCK"; }
trap cleanup EXIT

initdb -D "$PGDATA" -U test --auth=trust >/dev/null 2>&1
pg_ctl -D "$PGDATA" -o "-k $SOCK -p 5433 -c listen_addresses=''" -w start >/dev/null 2>&1
createdb -h "$SOCK" -p 5433 -U test cauth
psql -h "$SOCK" -p 5433 -U test -d cauth -q -v migration="$MIGRATION" -f "$HERE/companion-auth-db-setup.sql" >/dev/null
OUT="$(psql -h "$SOCK" -p 5433 -U test -d cauth -f "$HERE/companion-auth-db-tests.sql" 2>&1)"
echo "$OUT" | grep -E "PASS|FAIL|ERROR" || true
if echo "$OUT" | grep -qiE "FAIL|ERROR"; then echo "RESULT: FAILURES"; exit 1; else echo "RESULT: ALL PASS"; fi
