/**
 * The ISOLATED schema the move-in-date HTTP test runs against.
 *
 * Emitted rather than hand-written, so it cannot drift from the route: the column list is read
 * from app/api/leads/submit/route.ts itself. The two real migrations create the tables; the
 * generated ALTERs then make sure every field the route is willing to accept has somewhere to go,
 * even if a later migration added it. `add column if not exists` never changes an existing type,
 * so `move_date` stays the `date` column the core migration declares — which is the point: the
 * test has to meet the same column type production has.
 *
 *   npx tsx scripts/tests/moveDate.schema.ts > schema.sql
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const route = read("app/api/leads/submit/route.ts")

/** Pull a `const NAME = [ ... ] as const` list of quoted strings out of the route. */
function fieldList(name: string): string[] {
  const m = new RegExp(`const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`).exec(route)
  if (!m) throw new Error(`${name} not found in the submit route — the harness must be updated`)
  return [...m[1].matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1])
}

const strings = fieldList("STRING_FIELDS")
const integers = fieldList("NULLABLE_INTEGER_FIELDS")
const booleans = fieldList("BOOLEAN_FIELDS")
const timestamps = fieldList("NULLABLE_TIMESTAMP_FIELDS")

const out: string[] = []
out.push("-- THROWAWAY schema for the move-in-date HTTP test. Never run against production.")
// Supabase's own `auth` schema, which the real migrations reference (auth.uid(), auth.users).
// GoTrue is not running here, so this is the minimum shape they bind against — identical in
// purpose to the auth_uid() stand-in the Approval Criteria harness uses.
out.push(`create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $fn$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid;
$fn$;
create or replace function auth.role() returns text language sql stable as $fn$
  select coalesce(current_setting('request.jwt.claims', true)::json->>'role', 'anon');
$fn$;
create or replace function auth.email() returns text language sql stable as $fn$
  select current_setting('request.jwt.claims', true)::json->>'email';
$fn$;`)
out.push("drop table if exists public.lead_timeline cascade;")
out.push("drop table if exists public.leads cascade;")
out.push(read("supabase/migrations/20260601000000_core_crm_tables.sql"))
out.push(read("supabase/migrations/20260727000001_add_lead_timeline.sql"))
out.push("-- Every field the route will accept, so a column is never the reason a case fails.")
for (const f of strings) out.push(`alter table public.leads add column if not exists ${f} text;`)
for (const f of integers) out.push(`alter table public.leads add column if not exists ${f} integer;`)
for (const f of booleans) out.push(`alter table public.leads add column if not exists ${f} boolean;`)
for (const f of timestamps) out.push(`alter table public.leads add column if not exists ${f} timestamptz;`)
// Columns the route derives rather than accepts, and ownership columns it stamps on a public
// submit. Added here because they come from helpers (withPhoneIdentity, the classifier) rather
// than from the field lists above, so the generator cannot discover them.
out.push("alter table public.leads add column if not exists phone_e164 text;")
out.push("alter table public.leads add column if not exists client_type text;")
out.push("alter table public.leads add column if not exists lead_category text;")
out.push("alter table public.leads add column if not exists possible_duplicate_reason text;")
// Ownership columns the route stamps on a public submit.
out.push("alter table public.leads add column if not exists owner_user_id uuid;")
out.push("alter table public.leads add column if not exists workspace_id uuid;")
out.push("alter table public.leads add column if not exists possible_duplicate_of bigint;")
out.push("alter table public.leads add column if not exists crm_status text;")
// RLS off for the harness: PostgREST connects as service_role, exactly as the server does.
out.push("alter table public.leads disable row level security;")
out.push("alter table public.lead_timeline disable row level security;")
console.log(out.join("\n\n"))
