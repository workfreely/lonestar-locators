#!/usr/bin/env bash
# A LOCAL, THROWAWAY STACK for the move-in-date HTTP test.
#
#   bash scripts/tests/moveDate.httpEnv.sh start   # prints MOVEDATE_* env
#   bash scripts/tests/moveDate.httpEnv.sh stop    # kills everything and deletes the data
#
# Same shape as approvalCriteria.httpEnv.sh, on its own ports so the two can coexist:
#   • PostgreSQL on 54339 — a brand-new cluster in a temp directory, loopback only
#   • PostgREST on 54341  — the REAL binary, so the route's inserts are translated by the same
#     software production uses
#   • the auth shim on 54343 — supabase-js addresses /rest/v1/<table>, which PostgREST does not
#     serve; the shim is the same one the Approval Criteria harness uses and proxies it through
#   • `next start` on 54342 — a PRODUCTION build of this branch, pointed at PostgREST
#
# NOTHING here touches production. The Supabase URL the app is given is 127.0.0.1, and the test
# asserts that before it writes anything.
set -euo pipefail

PG_PORT=54339; PGRST_PORT=54341; SHIM_PORT=54343; APP_PORT=54342
DATADIR="${TMPDIR:-/tmp}/lb-movedate-pg"
RUNDIR="${TMPDIR:-/tmp}/lb-movedate-run"
DBNAME=lb_movedate_test
DBURL="postgresql://postgres@127.0.0.1:$PG_PORT/$DBNAME"

for d in /opt/homebrew/opt/postgresql@17/bin /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@17/bin; do
  [ -x "$d/initdb" ] && PATH="$d:$PATH" && break
done
export PATH LC_ALL=C LANG=C

mint() {
  node -e '
    const c = require("node:crypto")
    const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url")
    const h = b({ alg: "HS256", typ: "JWT" })
    const p = b({ role: process.argv[1], iss: "supabase", iat: 1700000000, exp: 2000000000 })
    const s = c.createHmac("sha256", process.argv[2]).update(`${h}.${p}`).digest("base64url")
    process.stdout.write(`${h}.${p}.${s}`)
  ' "$1" "$2"
}

case "${1:-start}" in
  start)
    mkdir -p "$RUNDIR"
    JWT_SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
    echo "$JWT_SECRET" > "$RUNDIR/jwt.secret"

    [ -d "$DATADIR" ] || initdb -D "$DATADIR" -U postgres --auth=trust -E UTF8 >/dev/null
    pg_ctl -D "$DATADIR" -o "-p $PG_PORT -c unix_socket_directories= -c listen_addresses=127.0.0.1" \
      -l "$DATADIR/server.log" start >/dev/null 2>&1 || true
    for _ in $(seq 1 20); do psql "postgresql://postgres@127.0.0.1:$PG_PORT/postgres" -tAc "select 1" >/dev/null 2>&1 && break; sleep 0.5; done
    psql "postgresql://postgres@127.0.0.1:$PG_PORT/postgres" -tAc "select 1 from pg_database where datname='$DBNAME'" | grep -q 1 \
      || psql "postgresql://postgres@127.0.0.1:$PG_PORT/postgres" -qc "create database $DBNAME"

    # ── the leads schema, generated from the route's own field lists ────────────────────────
    npx tsx scripts/tests/moveDate.schema.ts > "$RUNDIR/schema.sql"
    psql -v ON_ERROR_STOP=1 -q -d "$DBURL" -f "$RUNDIR/schema.sql" >/dev/null
    echo "  leads schema applied" >&2

    psql -v ON_ERROR_STOP=1 -q -d "$DBURL" <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
SQL

    ANON_KEY="$(mint anon "$JWT_SECRET")"
    SERVICE_KEY="$(mint service_role "$JWT_SECRET")"

    cat > "$RUNDIR/postgrest.conf" <<CONF
db-uri = "$DBURL"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-port = $PGRST_PORT
server-host = "127.0.0.1"
CONF
    nohup postgrest "$RUNDIR/postgrest.conf" > "$RUNDIR/postgrest.log" 2>&1 &
    echo $! > "$RUNDIR/postgrest.pid"
    APPROVAL_JWT_SECRET="$JWT_SECRET" nohup node scripts/tests/approvalCriteria.authShim.cjs "$SHIM_PORT" "$PGRST_PORT" > "$RUNDIR/shim.log" 2>&1 &
    echo $! > "$RUNDIR/shim.pid"
    for _ in $(seq 1 40); do curl -fsS "http://127.0.0.1:$SHIM_PORT/rest/v1/" -H "apikey: $ANON_KEY" >/dev/null 2>&1 && break; sleep 0.5; done
    # PostgREST caches the schema at connect. The DDL above runs first, so this is belt and
    # braces — but a cache a step behind reports a real column as missing, and that failure
    # reads exactly like a product bug. Cheap insurance against a confusing hour.
    psql -q -d "$DBURL" -c "notify pgrst, 'reload schema'" >/dev/null 2>&1 || true

    # THE BUILD, NOT JUST THE SERVER. Next inlines every NEXT_PUBLIC_* at build time, so a bundle
    # compiled with .env.local keeps talking to production no matter what the shell says at start.
    echo "  building the app against the throwaway database (a few minutes)" >&2
    rm -rf .next
    NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:$SHIM_PORT" \
    NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
    SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" \
      npx next build > "$RUNDIR/build.log" 2>&1 || { echo "BUILD FAILED — see $RUNDIR/build.log" >&2; exit 1; }
    NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:$SHIM_PORT" \
    NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
    SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" \
      nohup npx next start -p $APP_PORT > "$RUNDIR/app.log" 2>&1 &
    echo $! > "$RUNDIR/app.pid"
    for _ in $(seq 1 60); do curl -fsS -o /dev/null "http://127.0.0.1:$APP_PORT/" && break; sleep 1; done

    cat <<ENV
MOVEDATE_HTTP_BASE=http://127.0.0.1:$APP_PORT
MOVEDATE_DATABASE_URL=$DBURL
MOVEDATE_SUPABASE_URL=http://127.0.0.1:$SHIM_PORT
ENV
    ;;
  stop)
    for p in app shim postgrest; do
      [ -f "$RUNDIR/$p.pid" ] && kill "$(cat "$RUNDIR/$p.pid")" 2>/dev/null || true
    done
    pg_ctl -D "$DATADIR" stop -m immediate >/dev/null 2>&1 || true
    rm -rf "$DATADIR" "$RUNDIR"
    echo "stopped and deleted" >&2
    ;;
  *) echo "usage: $0 start|stop" >&2; exit 2 ;;
esac
