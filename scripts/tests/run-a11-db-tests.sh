#!/usr/bin/env bash
# Milestone A.1.1 guest-card uniqueness proofs, run against an EPHEMERAL local
# Postgres cluster (never touches any real database). Proves, at the DB level:
#   1. same lead/property cannot have two OPEN Email Guest Card actions
#   2. different properties for the same lead can each have one OPEN one
#   3. a COMPLETED guest card does not block a later new OPEN one for that property
#   + a workflow email_guest_card requires property_id
#   + the general one-open-per-action index still dedups (follow_up_1)
#   + manual/custom tasks are exempt from workflow dedup
#
# Requires postgres 16 server binaries (brew install postgresql@16). Usage:
#   bash scripts/tests/run-a11-db-tests.sh
set -euo pipefail
export LC_ALL="${LC_ALL:-en_US.UTF-8}" LANG="${LANG:-en_US.UTF-8}"
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PGDATA="$(mktemp -d)/pgdata"
SOCK="$(mktemp -d /tmp/a11pg.XXXX)"   # short path (unix socket <103 bytes)
cleanup() { pg_ctl -D "$PGDATA" stop >/dev/null 2>&1 || true; rm -rf "$PGDATA" "$SOCK"; }
trap cleanup EXIT

initdb -D "$PGDATA" -U test --auth=trust >/dev/null 2>&1
pg_ctl -D "$PGDATA" -o "-k $SOCK -p 5433 -c listen_addresses=''" -w start >/dev/null 2>&1
createdb -h "$SOCK" -p 5433 -U test a11
psql -h "$SOCK" -p 5433 -U test -d a11 -q -f "$HERE/a11-guest-card-schema.sql"

# Run the proofs ONCE (the DB is stateful) and capture the output.
OUT="$(psql -h "$SOCK" -p 5433 -U test -d a11 -f "$HERE/a11-guest-card-tests.sql" 2>&1)"
echo "$OUT" | grep -E "PROOF|PASS|FAIL|PROP|GEN|CUSTOM" || true

if echo "$OUT" | grep -q "FAIL"; then echo "RESULT: FAILURES"; exit 1; else echo "RESULT: ALL PASS"; fi
