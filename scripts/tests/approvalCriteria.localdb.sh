#!/usr/bin/env bash
# A THROWAWAY POSTGRES FOR THE APPROVAL CRITERIA INTEGRATION TEST.
#
# Creates a brand-new cluster in a temp directory, starts it on a non-default port bound to
# 127.0.0.1, and prints the connection URL. It touches no existing cluster, no existing database
# and nothing remote — and `stop` deletes the whole thing.
#
#   bash scripts/tests/approvalCriteria.localdb.sh start
#   APPROVAL_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/lb_approval_test \
#     npx tsx scripts/tests/approvalCriteria.integration.test.ts
#   bash scripts/tests/approvalCriteria.localdb.sh stop
#
# Requires a local PostgreSQL 14+ (`brew install postgresql@17`). It does NOT require Docker and
# does NOT require the Supabase CLI.
set -euo pipefail

PORT="${APPROVAL_TEST_PG_PORT:-54329}"
DBNAME=lb_approval_test
DATADIR="${APPROVAL_TEST_PG_DATADIR:-${TMPDIR:-/tmp}/lb-approval-pg}"

# Homebrew keeps the binaries off PATH for versioned formulae.
for d in /opt/homebrew/opt/postgresql@17/bin /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@17/bin /usr/lib/postgresql/16/bin; do
  [ -x "$d/initdb" ] && PATH="$d:$PATH" && break
done
export PATH
# Postgres refuses to start when the postmaster goes multithreaded during startup, which a
# locale lookup on macOS can cause. C is enough for a schema test.
export LC_ALL=C LANG=C

case "${1:-start}" in
  start)
    if [ ! -d "$DATADIR" ]; then
      initdb -D "$DATADIR" -U postgres --auth=trust -E UTF8 >/dev/null
    fi
    # unix_socket_directories is emptied on purpose: a socket path over 103 bytes is rejected,
    # and a temp directory is easily longer than that. TCP on loopback only.
    pg_ctl -D "$DATADIR" -o "-p $PORT -c unix_socket_directories= -c listen_addresses=127.0.0.1" \
      -l "$DATADIR/server.log" start >/dev/null 2>&1 || true
    for _ in $(seq 1 20); do
      psql "postgresql://postgres@127.0.0.1:$PORT/postgres" -tAc "select 1" >/dev/null 2>&1 && break
      sleep 0.5
    done
    psql "postgresql://postgres@127.0.0.1:$PORT/postgres" -tAc \
      "select 1 from pg_database where datname='$DBNAME'" | grep -q 1 \
      || psql "postgresql://postgres@127.0.0.1:$PORT/postgres" -qc "create database $DBNAME"
    echo "postgresql://postgres@127.0.0.1:$PORT/$DBNAME"
    ;;
  stop)
    pg_ctl -D "$DATADIR" stop -m immediate >/dev/null 2>&1 || true
    rm -rf "$DATADIR"
    echo "stopped and deleted $DATADIR"
    ;;
  *)
    echo "usage: $0 {start|stop}" >&2
    exit 2
    ;;
esac
