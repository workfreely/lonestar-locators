-- VERIFICATION for 20261115000000_tiktok_connection_scoped_tokens.sql.
-- Every statement is a SELECT. This file writes nothing, so it is safe to run BEFORE and AFTER the
-- migration and safe to run against production. Expect 9 rows.
--
-- Row 1 says which state the database is in:
--   NOT YET APPLIED -> the two per-connection functions are absent and sa_connect_tiktok still
--                      scopes its old-secret lookup by owner+provider only. This is what
--                      production reported on 2026-11-12.
--   APPLIED         -> both new functions exist and all four repairs are present.
--   Anything else   -> a partial apply. Stop and investigate.
--
-- Rows 2-7 FAIL before the migration; that is the expected pre-state, not a fault.
-- Rows 8-9 MUST PASS in both states: no credential moved, and Instagram was not touched.

with f as (
  select p.proname, p.prosrc, p.prosecdef,
         pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('sa_get_tiktok_token_by_connection','sa_update_tiktok_token_by_connection',
                      'sa_connect_tiktok','sa_get_tiktok_token','sa_update_tiktok_token',
                      'sa_disconnect_tiktok')
),
src as (select proname, prosrc from f)

-- 1. Which state are we in?
select
  'current state' as assertion,
  (select count(*) from f where proname like '%_by_connection')::text || ' of 2 per-connection functions' as value,
  case
    when (select count(*) from f where proname like '%_by_connection') = 2
     and (select bool_or(prosrc like '%external_account_id is not distinct from p_open_id%') from src where proname = 'sa_connect_tiktok')
      then 'APPLIED'
    when (select count(*) from f where proname like '%_by_connection') = 0
     and not (select bool_or(prosrc like '%external_account_id is not distinct from p_open_id%') from src where proname = 'sa_connect_tiktok')
      then 'NOT YET APPLIED — expected pre-apply state'
    else 'UNEXPECTED — partial apply, stop and investigate'
  end as result

union all

-- 2. THE DEFECT THAT DESTROYS A TOKEN. sa_connect_tiktok must scope its old-secret lookup to the
--    account being authorized; without the filter, connecting a second account deletes the first
--    account's Vault secret.
select 'sa_connect_tiktok scopes the old secret to THIS account',
  coalesce((select case when prosrc like '%external_account_id is not distinct from p_open_id%'
                        then 'scoped by open_id' else 'owner+provider ONLY (defect)' end
            from src where proname = 'sa_connect_tiktok'), '(MISSING)'),
  case when (select bool_or(prosrc like '%external_account_id is not distinct from p_open_id%') from src where proname = 'sa_connect_tiktok')
       then 'PASS' else 'FAIL' end

union all

-- 3. Reading one destination's bundle by id, service-role only, same shape as the Instagram sibling.
select 'sa_get_tiktok_token_by_connection reads one row by id',
  coalesce((select args from f where proname = 'sa_get_tiktok_token_by_connection'), '(MISSING)'),
  case when exists (select 1 from f where proname = 'sa_get_tiktok_token_by_connection'
                     and prosecdef and prosrc like '%sc.id = p_connection_id%'
                     and prosrc like '%posting_paused%' and prosrc like '%owner_user_id%')
       then 'PASS' else 'FAIL' end

union all

-- 4. THE CONCURRENCY FIX. The rotate function must lock the connection row, write by id, and
--    supersede only the secret it read. Without the lock, two overlapping refreshes each orphan
--    the other's secret; without `where id`, a refresh rewrites every TikTok row the owner has.
select 'sa_update_tiktok_token_by_connection locks the row and writes by id',
  coalesce((select case when prosrc like '%for update%' then 'for update present' else 'NO LOCK' end
            from f where proname = 'sa_update_tiktok_token_by_connection'), '(MISSING)'),
  case when exists (select 1 from f where proname = 'sa_update_tiktok_token_by_connection'
                     and prosecdef
                     and prosrc like '%for update%'
                     and prosrc like '%where id = p_connection_id%'
                     and prosrc not like '%provider = ''tiktok''%where owner_user_id%')
       then 'PASS' else 'FAIL' end

union all

-- 5. The two per-connection functions are service_role ONLY — never reachable from a browser
--    session, so a token can never be resolved by a signed-in client.
select 'per-connection token functions are not granted to authenticated/anon',
  coalesce((select string_agg(proname || '→' || coalesce(nullif(array_to_string(array(
             select unnest(string_to_array(array_to_string(p2.proacl, ','), ','))
           ), ' '), ''), '(owner only)'), ', ')
     from pg_proc p2 join pg_namespace n2 on n2.oid = p2.pronamespace
    where n2.nspname = 'public' and p2.proname like 'sa_%_tiktok_token_by_connection'), '(MISSING)'),
  case when not exists (
    select 1 from pg_proc p2 join pg_namespace n2 on n2.oid = p2.pronamespace
     where n2.nspname = 'public' and p2.proname like 'sa_%_tiktok_token_by_connection'
       and (has_function_privilege('authenticated', p2.oid, 'EXECUTE')
         or has_function_privilege('anon', p2.oid, 'EXECUTE'))
  ) and exists (select 1 from f where proname like '%_by_connection')
       then 'PASS' else 'FAIL' end

union all

-- 6. The owner-scoped READ refuses rather than guessing. The old body ended in an unordered
--    `limit 1`, which returned an arbitrary account's credentials.
select 'sa_get_tiktok_token refuses when the owner has several TikTok accounts',
  coalesce((select case when prosrc like '%if v_n > 1 then%' then 'guarded' else 'UNGUARDED limit 1' end
            from src where proname = 'sa_get_tiktok_token'), '(MISSING)'),
  case when (select bool_or(prosrc like '%v_n > 1%' and prosrc like '%order by sc.created_at%') from src where proname = 'sa_get_tiktok_token')
       then 'PASS' else 'FAIL' end

union all

-- 7. The owner-scoped WRITES raise rather than touching two rows. Disconnect in particular used to
--    delete every TikTok row for the owner while revoking one Vault secret.
select 'owner-scoped TikTok writes raise when ambiguous',
  coalesce((select string_agg(proname || '=' || case when prosrc like '%raise exception%' and prosrc like '%v_n > 1%' then 'guarded' else 'UNGUARDED' end, ', ' order by proname)
            from src where proname in ('sa_update_tiktok_token','sa_disconnect_tiktok')), '(MISSING)'),
  case when (select count(*) from src
              where proname in ('sa_update_tiktok_token','sa_disconnect_tiktok')
                and prosrc like '%v_n > 1%' and prosrc like '%raise exception%') = 2
       then 'PASS' else 'FAIL' end

union all

-- 8. MUST PASS IN BOTH STATES. No credential moved. Every TikTok connection still points at a Vault
--    secret that exists — the exact property defect 1 breaks. A dangling pointer here means a token
--    was deleted out from under a connection.
select 'every TikTok connection still has a live Vault secret',
  (select count(*)::text || ' of ' || (select count(*)::text from public.social_connections where provider = 'tiktok')
     from public.social_connections sc
     join vault.secrets v on v.id = sc.token_secret_id
    where sc.provider = 'tiktok'),
  case when (select count(*) from public.social_connections where provider = 'tiktok' and token_secret_id is not null)
          = (select count(*) from public.social_connections sc join vault.secrets v on v.id = sc.token_secret_id where sc.provider = 'tiktok')
       then 'PASS' else 'FAIL — a connection points at a secret that no longer exists' end

union all

-- 9. MUST PASS IN BOTH STATES. Instagram's token path is untouched by this migration.
select 'Instagram token resolution unchanged',
  coalesce((select case when prosecdef then 'present, definer' else 'present, NOT definer' end
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'sa_get_instagram_token_by_connection'), '(MISSING)'),
  case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'sa_get_instagram_token_by_connection'
                       and p.prosecdef and p.prosrc like '%provider = ''instagram''%')
       then 'PASS' else 'FAIL' end;
