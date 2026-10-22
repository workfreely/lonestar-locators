-- READ-ONLY verification for 20261104000000_voicemail_pre_tour_key.
-- Four rows, all should read PASS. This statement only reads catalogs.
--
-- The updated_at row strips SQL comments before matching: pg_get_functiondef returns the whole
-- source, and the function contains a comment naming that column on purpose.

select 'pre_tour is now accepted' as item,
       case when position('''pre_tour''' in pg_get_functiondef(oid)) > 0
            then 'PASS' else 'FAIL: key not in the allowlist' end as result
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname = 'save_lead_voicemail_script'

union all
select 'the two List Sent keys are still accepted',
       case when position('list_sent_30_90' in pg_get_functiondef(oid)) > 0
             and position('list_sent_over_90' in pg_get_functiondef(oid)) > 0
            then 'PASS' else 'FAIL' end
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname = 'save_lead_voicemail_script'

union all
-- COMMENTS STRIPPED FIRST. pg_get_functiondef returns the whole source, comments included, and
-- the function deliberately CONTAINS a comment naming updated_at to stop anyone adding it back.
-- Matching the bare string therefore failed on correct code. Strip -- comments, then any
-- remaining occurrence is real SQL.
select 'no updated_at assignment in the function body',
       case when regexp_replace(pg_get_functiondef(oid), '--[^\n]*', '', 'g') !~ 'updated_at'
            then 'PASS' else 'FAIL: would break on save' end
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname = 'save_lead_voicemail_script'

union all
select 'anon still cannot execute it',
       case when not has_function_privilege('anon', oid, 'EXECUTE')
            then 'PASS' else 'FAIL: anon can execute' end
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname = 'save_lead_voicemail_script';
