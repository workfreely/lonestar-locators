-- VERIFICATION for 20261114000000_destination_market_restriction.sql.
-- Every statement is a SELECT. This file writes nothing — not a row, not a temporary table — so
-- it is safe to run BEFORE and AFTER the migration, and safe to run against production. Expect
-- 8 rows.
--
-- Row 1 says which state the database is in:
--   NOT YET APPLIED -> social_connections has no market_restriction column. This is what
--                      production reported on 2026-11-12 (18 columns, none of them this one).
--   APPLIED         -> the column, its shape CHECK and sa_update_destination_markets all exist.
--   Anything else   -> a partial apply. Stop and investigate before re-running the migration.
--
-- Rows 2-4 FAIL before the migration is applied; that is the expected pre-state, not a fault.
--
-- Rows 5-8 are the ones that must read PASS in BOTH states, because they assert what the
-- migration must NOT have changed: every pre-existing destination still unrestricted, no token /
-- scope / pause / cadence column touched, and the three RPCs the working integrations depend on
-- still present and still SECURITY DEFINER.

with col as (
  select a.attname, format_type(a.atttypid, a.atttypmod) as typ, a.attnotnull, a.atthasdef
  from pg_attribute a
  where a.attrelid = 'public.social_connections'::regclass
    and a.attname = 'market_restriction'
    and a.attnum > 0 and not a.attisdropped
),
shape as (
  select pg_get_constraintdef(oid) as def
  from pg_constraint
  where conrelid = 'public.social_connections'::regclass
    and conname = 'social_connections_market_restriction_shape'
),
fn as (
  select p.prosecdef, p.prosrc
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'sa_update_destination_markets'
)

-- 1. Which state are we in?
select
  'current state' as assertion,
  (select count(*) from col)::text || ' column, '
    || (select count(*) from shape)::text || ' check, '
    || (select count(*) from fn)::text || ' function' as value,
  case
    when (select count(*) from col) = 1 and (select count(*) from shape) = 1 and (select count(*) from fn) = 1
      then 'APPLIED'
    when (select count(*) from col) = 0 and (select count(*) from shape) = 0 and (select count(*) from fn) = 0
      then 'NOT YET APPLIED — expected pre-apply state'
    else 'UNEXPECTED — partial apply, stop and investigate'
  end as result

union all

-- 2. The column is text[], NULLABLE and with NO DEFAULT. All three matter: nullable is what lets
--    NULL mean "unrestricted", and no default is what guarantees an existing row cannot acquire a
--    restriction by being migrated.
select 'market_restriction is a nullable text[] with no default',
  coalesce((select typ || (case when attnotnull then ' NOT NULL' else ' nullable' end)
                 || (case when atthasdef then ' WITH DEFAULT' else ' no default' end) from col), '(MISSING)'),
  case when exists (select 1 from col where typ = 'text[]' and not attnotnull and not atthasdef)
       then 'PASS' else 'FAIL' end

union all

-- 3. The shape CHECK rejects an empty array, a NULL member and an empty-string member — so
--    "unrestricted" can only ever be spelled NULL, never ARRAY[]::text[].
select 'shape CHECK rejects empty array / null member / blank member',
  coalesce((select def from shape), '(MISSING)'),
  case when exists (select 1 from shape
                     where def like '%cardinality%'
                       and def like '%array_position%'
                       and def like '%array_remove%')
       then 'PASS' else 'FAIL' end

union all

-- 4. The writer exists, is SECURITY DEFINER, and goes through the SAME ownership guard every
--    other destination RPC uses. Without that guard an admin could restrict someone else's row.
select 'sa_update_destination_markets is definer and ownership-guarded',
  coalesce((select case when prosecdef then 'security definer' else 'NOT security definer' end from fn), '(MISSING)'),
  case when exists (select 1 from fn
                     where prosecdef
                       and prosrc like '%_sa_require_owned_connection%'
                       and prosrc like '%owner_user_id = v_uid%')
       then 'PASS' else 'FAIL' end

union all

-- 5. MUST PASS IN BOTH STATES. No existing destination is restricted. Before the migration there
--    is no column to be restricted by; after it, every pre-existing row reads NULL. A non-zero
--    count after a fresh apply would mean the migration wrote data, which it must never do.
--
--    Read through to_jsonb rather than as a column, deliberately: Postgres resolves column names
--    at PARSE time, so naming market_restriction directly would make this whole file fail to run
--    before the migration — and a verification you cannot run pre-apply cannot establish a
--    pre-state. A missing jsonb key simply reads NULL.
select 'no destination carries a restriction',
  case when exists (select 1 from col)
       then (select (count(*) filter (where to_jsonb(sc) ->> 'market_restriction' is not null))::text
                    || ' restricted of ' || count(*)::text
               from public.social_connections sc)
       else 'column absent — nothing can be restricted' end,
  case when not exists (select 1 from col) then 'PASS'
       when (select count(*) from public.social_connections sc
              where to_jsonb(sc) ->> 'market_restriction' is not null) = 0 then 'PASS'
       else 'REVIEW — a restriction is set; expected only after an operator sets one deliberately' end

union all

-- 6. MUST PASS IN BOTH STATES. Nothing about identity, credentials, pausing or cadence moved.
--    These are the columns the live Instagram and TikTok integrations publish through.
select 'token / scope / pause / cadence columns unchanged',
  (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attname)
     from pg_attribute a
    where a.attrelid = 'public.social_connections'::regclass
      and a.attname in ('token_secret_id','token_expires_at','scopes','status','posting_paused',
                        'posts_per_day','stagger_offset_minutes','external_account_id','provider')),
  case when (select count(*) from pg_attribute a
              where a.attrelid = 'public.social_connections'::regclass
                and a.attnum > 0 and not a.attisdropped
                and ((a.attname = 'token_secret_id'         and format_type(a.atttypid, a.atttypmod) = 'uuid')
                  or (a.attname = 'token_expires_at'        and format_type(a.atttypid, a.atttypmod) = 'timestamp with time zone')
                  or (a.attname = 'scopes'                  and format_type(a.atttypid, a.atttypmod) = 'text[]')
                  or (a.attname = 'status'                  and format_type(a.atttypid, a.atttypmod) = 'text')
                  or (a.attname = 'posting_paused'          and format_type(a.atttypid, a.atttypmod) = 'boolean')
                  or (a.attname = 'posts_per_day'           and format_type(a.atttypid, a.atttypmod) = 'integer')
                  or (a.attname = 'stagger_offset_minutes'  and format_type(a.atttypid, a.atttypmod) = 'integer')
                  or (a.attname = 'external_account_id'     and format_type(a.atttypid, a.atttypmod) = 'text')
                  or (a.attname = 'provider'                and format_type(a.atttypid, a.atttypmod) = 'text'))) = 9
       then 'PASS' else 'FAIL' end

union all

-- 7. MUST PASS IN BOTH STATES. The destination RPCs the accounts screen and the OAuth callback
--    depend on are still there and still definer. This migration adds a sibling; it replaces none
--    of them.
select 'existing destination RPCs still present and definer',
  (select string_agg(p.proname, ', ' order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and p.proname in ('sa_pause_destination','sa_resume_destination','sa_disconnect_destination',
                        'sa_update_destination_label','sa_update_destination_cadence',
                        'sa_consume_destination_invitation','_sa_require_owned_connection')),
  case when (select count(distinct p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prosecdef
                and p.proname in ('sa_pause_destination','sa_resume_destination','sa_disconnect_destination',
                                  'sa_update_destination_label','sa_update_destination_cadence',
                                  'sa_consume_destination_invitation','_sa_require_owned_connection')) = 7
       then 'PASS' else 'FAIL' end

union all

-- 8. The destination inventory, for the eye — one row per connected account, with whatever
--    restriction it carries. Informational in both states.
select 'destination inventory (informational)',
  coalesce((select string_agg(
             provider || '/' || coalesce(username, '(no username)')
             || ' paused=' || coalesce(posting_paused::text, 'null')
             || ' per_day=' || coalesce(posts_per_day::text, 'default'),
             ' | ' order by provider, created_at)
           from public.social_connections), '(none)'),
  'INFO';
