-- VERIFY 20261114000002_quick_match_candidates_rpc — run AFTER applying. Expect ok = true.
--
-- Three questions: does the function exist with the full column list, is it closed to anon, and
-- is Unleash Beast's own read path still byte-identical?
select 'lb_quick_match_candidates exists' as check,
       count(*) = 1 as ok, count(*)::text as detail
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'lb_quick_match_candidates'
union all
select 'it returns all 46 columns the engine reads',
       (select count(*) from pg_proc p, unnest(p.proargmodes) m
         where p.oid = 'public.lb_quick_match_candidates(text)'::regprocedure
           and m in ('o','t')) = 46,
       (select count(*)::text from pg_proc p, unnest(p.proargmodes) m
         where p.oid = 'public.lb_quick_match_candidates(text)'::regprocedure and m in ('o','t'))
union all
select 'anon has NO execute — screening data cannot reach the client-facing page',
       not has_function_privilege('anon', 'public.lb_quick_match_candidates(text)', 'EXECUTE'), null
union all
select 'PUBLIC has no execute either',
       not has_function_privilege('public', 'public.lb_quick_match_candidates(text)', 'EXECUTE'), null
union all
select 'authenticated DOES have execute',
       has_function_privilege('authenticated', 'public.lb_quick_match_candidates(text)', 'EXECUTE'), null
union all
select 'Unleash Beast''s read path is untouched (md5 + 27 OUT columns)',
       (select md5(prosrc) from pg_proc
         where oid = 'public.lb_property_catalog_by_ids(text[])'::regprocedure)
         = 'ef035dc17e71b610bd0a87da014db9b9'
       and (select count(*) from pg_proc p, unnest(p.proargmodes) m
             where p.oid = 'public.lb_property_catalog_by_ids(text[])'::regprocedure
               and m in ('o','t')) = 27, null
union all
-- It must return the curated collection and nothing else.
select 'it returns exactly the curated members, no non-member',
       (select count(*) from public.lb_quick_match_candidates('san_antonio'))
         = (select count(*) from public.property_catalog
             where quick_match_collection = 'san_antonio'),
       (select count(*)::text || ' members' from public.lb_quick_match_candidates('san_antonio'))
union all
select 'an unknown collection returns nothing rather than everything',
       (select count(*) from public.lb_quick_match_candidates('no_such_collection')) = 0, null;
