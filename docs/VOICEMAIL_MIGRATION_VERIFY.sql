-- READ-ONLY verification for 20261103000000_lead_voicemail_script.
-- Paste into the Supabase SQL editor AFTER applying the migration.
-- Every row should read PASS. Nothing here writes.

select 'column exists, nullable, jsonb' as check,
       case when data_type = 'jsonb' and is_nullable = 'YES' then 'PASS'
            else 'FAIL: ' || coalesce(data_type,'missing') || '/' || coalesce(is_nullable,'?') end as result
  from information_schema.columns
 where table_schema = 'public' and table_name = 'leads' and column_name = 'voicemail_script'

union all
select 'no existing lead rows were rewritten',
       case when count(*) filter (where voicemail_script is not null) = 0
            then 'PASS (' || count(*) || ' leads, all null)'
            else 'FAIL: ' || count(*) filter (where voicemail_script is not null) || ' non-null' end
  from public.leads

union all
select 'both functions exist, security definer',
       case when count(*) = 2 and bool_and(p.prosecdef) then 'PASS'
            else 'FAIL: found ' || count(*) end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('save_lead_voicemail_script','clear_lead_voicemail_script')

union all
-- THE PERMISSION THAT MATTERS. A grant to authenticated does not exclude anyone on its own:
-- Postgres grants EXECUTE to PUBLIC by default and anon inherits it. This asserts the revoke.
select 'anon CANNOT execute either function',
       case when bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE')) then 'PASS'
            else 'FAIL: anon can execute' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('save_lead_voicemail_script','clear_lead_voicemail_script')

union all
select 'authenticated CAN execute both',
       case when bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')) then 'PASS'
            else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('save_lead_voicemail_script','clear_lead_voicemail_script')

union all
-- The raw ACL, for your eyes. An entry beginning "=" is PUBLIC; after the revoke there should be
-- none, leaving only the owner and authenticated=X. Printed rather than judged, because a
-- hand-written pattern match here could pass for the wrong reason.
select 'ACL on ' || p.proname,
       coalesce(array_to_string(p.proacl, '  '), '(default — REVOKE DID NOT APPLY)')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('save_lead_voicemail_script','clear_lead_voicemail_script')

union all
select 'the renter share RPC still excludes it',
       case when bool_and(position('voicemail' in pg_get_functiondef(p.oid)) = 0)
            then 'PASS' else 'FAIL: leaked into the public share RPC' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'lb_resolve_client_recommendations';
