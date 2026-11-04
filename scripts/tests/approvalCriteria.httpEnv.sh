#!/usr/bin/env bash
# A LOCAL, THROWAWAY STAGING STACK for the Approval Criteria HTTP test.
#
#   bash scripts/tests/approvalCriteria.httpEnv.sh start   # prints APPROVAL_HTTP_BASE etc.
#   bash scripts/tests/approvalCriteria.httpEnv.sh stop    # kills everything and deletes the data
#
# WHAT IT STARTS, and why each piece is what it is:
#   • PostgreSQL on 54329 — a brand-new cluster in a temp directory, loopback only.
#   • PostgREST on 54330  — the REAL binary, so the route's filters, maybeSingle(), the
#     optimistic-concurrency PATCH and the events insert are translated by the same software
#     production uses. `brew install postgrest`.
#   • an auth shim on 54331 — GoTrue needs Docker, and the route asks it one question
#     (GET /auth/v1/user). The shim answers that and proxies /rest/v1 to PostgREST.
#   • `next start` on 54332 — a PRODUCTION build of this branch, pointed at the shim.
#
# NOTHING here touches production. The Supabase URL the app is given is 127.0.0.1.
set -euo pipefail

PG_PORT=54329; PGRST_PORT=54330; SHIM_PORT=54331; APP_PORT=54332
DATADIR="${TMPDIR:-/tmp}/lb-approval-pg"
RUNDIR="${TMPDIR:-/tmp}/lb-approval-run"
DBNAME=lb_approval_test
DBURL="postgresql://postgres@127.0.0.1:$PG_PORT/$DBNAME"

for d in /opt/homebrew/opt/postgresql@17/bin /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@17/bin; do
  [ -x "$d/initdb" ] && PATH="$d:$PATH" && break
done
export PATH LC_ALL=C LANG=C

# HS256 JWTs for the three Supabase roles, signed with a secret this script makes up. PostgREST
# derives the database role from the token's `role` claim, which is how the service key gets
# service_role and the anon key gets anon — the same mapping as production.
mint() {
  # mint <role> <secret> [sub] [email] — a user token carries `sub`, which is what auth.uid()
  # and therefore is_platform_admin() read. The API keys carry only a role.
  node -e '
    const c = require("node:crypto")
    const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url")
    const h = b({ alg: "HS256", typ: "JWT" })
    const claims = { role: process.argv[1], iss: "supabase", iat: 1700000000, exp: 2000000000 }
    if (process.argv[3]) claims.sub = process.argv[3]
    if (process.argv[4]) claims.email = process.argv[4]
    const p = b(claims)
    const s = c.createHmac("sha256", process.argv[2]).update(`${h}.${p}`).digest("base64url")
    process.stdout.write(`${h}.${p}.${s}`)
  ' "$1" "$2" "${3:-}" "${4:-}"
}

ADMIN_UID=11111111-1111-4111-8111-111111111111
PLAIN_UID=22222222-2222-4222-8222-222222222222

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

    # ── schema, generated from the policy sets, then the MIGRATIONS UNDER TEST ─────────────
    npx tsx scripts/tests/approvalCriteria.schema.ts > "$RUNDIR/schema.sql"
    psql -v ON_ERROR_STOP=1 -q -d "$DBURL" -f "$RUNDIR/schema.sql"
    for m in 20261110000000_property_screening_requirements 20261110000004_approval_criteria_fields \
             20261112000000_property_criminal_background; do
      f="supabase/migrations/$m.sql"; [ -f "$f" ] || f="supabase/prepared/$m.sql"
      psql -v ON_ERROR_STOP=1 -q -d "$DBURL" -f "$f"
      echo "  applied $m" >&2
    done

    # ── the Supabase roles, and the one RPC the auth guard calls ─────────────────────────────
    psql -v ON_ERROR_STOP=1 -q -d "$DBURL" <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant select on all tables in schema public to authenticated;
-- The platform-admin table and the SECURITY DEFINER function the guard calls. Identity lives in
-- a table here exactly as it does in production — never a hard-coded id in code.
create table if not exists public.platform_admins (user_id uuid primary key);
-- auth.uid() in production reads the JWT claim. Staging has no GoTrue, so the equivalent reads
-- the same claim out of the request JWT that PostgREST sets. Defined BEFORE the function that
-- calls it, or the create fails on an unknown function.
create or replace function public.auth_uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid;
$$;
create or replace function public.is_platform_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = public.auth_uid());
$$;
grant execute on function public.is_platform_admin() to anon, authenticated, service_role;
grant execute on function public.auth_uid() to anon, authenticated, service_role;
SQL

    psql -v ON_ERROR_STOP=1 -q -d "$DBURL" \
      -c "insert into public.platform_admins (user_id) values ('$ADMIN_UID') on conflict do nothing"

    ANON_KEY="$(mint anon "$JWT_SECRET")"
    SERVICE_KEY="$(mint service_role "$JWT_SECRET")"
    ADMIN_TOKEN="$(mint authenticated "$JWT_SECRET" "$ADMIN_UID" admin@example.test)"
    PLAIN_TOKEN="$(mint authenticated "$JWT_SECRET" "$PLAIN_UID" plain@example.test)"

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

    for _ in $(seq 1 40); do
      curl -fsS "http://127.0.0.1:$SHIM_PORT/rest/v1/" -H "apikey: $ANON_KEY" >/dev/null 2>&1 && break
      sleep 0.5
    done

    # ── the app: BUILT AND RUN against the shim ─────────────────────────────────────────────
    #
    # The build, not just the server. Next INLINES every NEXT_PUBLIC_* value at build time, so a
    # bundle compiled with .env.local keeps talking to production no matter what the shell says
    # when it starts. That is not a detail: the first run of this harness reused the existing
    # build, the app went straight to the live project, and only the "is this production?" check
    # at the top of the test caught it. So the staging values are set for BOTH commands, and
    # .next is rebuilt from scratch under them.
    echo "  building the app against the staging URL (this takes a few minutes)" >&2
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
APPROVAL_HTTP_BASE=http://127.0.0.1:$APP_PORT
APPROVAL_TEST_DATABASE_URL=$DBURL
APPROVAL_SUPABASE_URL=http://127.0.0.1:$SHIM_PORT
APPROVAL_ANON_KEY=$ANON_KEY
APPROVAL_ADMIN_TOKEN=$ADMIN_TOKEN
APPROVAL_PLAIN_TOKEN=$PLAIN_TOKEN
ENV
    ;;
  stop)
    for p in app shim postgrest; do
      [ -f "$RUNDIR/$p.pid" ] && kill "$(cat "$RUNDIR/$p.pid")" 2>/dev/null || true
    done
    pg_ctl -D "$DATADIR" stop -m immediate >/dev/null 2>&1 || true
    rm -rf "$DATADIR" "$RUNDIR"
    echo "stopped; $DATADIR and $RUNDIR deleted"
    ;;
  *) echo "usage: $0 {start|stop}" >&2; exit 2 ;;
esac
