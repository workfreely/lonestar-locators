-- READ-ONLY verification for 20261103000000_lead_voicemail_script.
-- Six rows, all should read PASS. This statement only reads catalogs and counts rows.
--
-- NOTE ON AN EARLIER VERSION: it aliased a column `as check`. CHECK is a fully RESERVED keyword
-- in Postgres, so that was a syntax error, and the SQL editor's linter — unable to parse it —
-- fell back to its generic "creates a table without RLS" warning. Nothing in that query created
-- anything. Every alias below is a plain, unreserved identifier.

select 'voicemail_script column' as item,
       case when data_type = 'jsonb' and is_nullable = 'YES'
            then 'PASS (jsonb, nullable)'
            else 'FAIL: ' || coalesce(data_type, 'missing') end as result
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'leads'
   and column_name = 'voicemail_script'

union all
select 'no lead rows rewritten',
       case when count(*) filter (where voicemail_script is not null) = 0
            then 'PASS (' || count(*) || ' leads, all null)'
            else 'FAIL: ' || count(*) filter (where voicemail_script is not null) || ' non-null' end
  from public.leads

union all
select 'both RPCs exist as security definer',
       case when count(*) = 2 and bool_and(prosecdef) then 'PASS' else 'FAIL: found ' || count(*) end
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('save_lead_voicemail_script', 'clear_lead_voicemail_script')

union all
-- THE ONE THAT MATTERS. Granting `authenticated` excludes nobody on its own: Postgres grants
-- EXECUTE to PUBLIC by default and anon inherits it. This asserts the revoke actually landed.
select 'anon cannot execute either RPC',
       case when bool_and(not has_function_privilege('anon', oid, 'EXECUTE'))
            then 'PASS' else 'FAIL: anon can execute' end
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('save_lead_voicemail_script', 'clear_lead_voicemail_script')

union all
select 'authenticated can execute both',
       case when bool_and(has_function_privilege('authenticated', oid, 'EXECUTE'))
            then 'PASS' else 'FAIL' end
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('save_lead_voicemail_script', 'clear_lead_voicemail_script')

union all
select 'renter share RPC excludes it',
       case when bool_and(position('voicemail' in pg_get_functiondef(oid)) = 0)
            then 'PASS' else 'FAIL: leaked into the public share RPC' end
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname = 'lb_resolve_client_recommendations';
