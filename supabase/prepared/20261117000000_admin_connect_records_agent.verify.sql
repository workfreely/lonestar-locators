-- VERIFICATION for 20261117000000_admin_connect_records_agent.sql.
-- Every statement is a SELECT. Safe to run before and after, and against production. 8 rows.
--
-- Row 1 is the state. Rows 2-3 FAIL before the migration — the expected pre-state.
-- Rows 4-6 must PASS in BOTH states: they assert what this must NOT change.

select '1. state' as check,
  case
    when (select count(*) from pg_proc
           where proname in ('sa_connect_instagram','sa_connect_tiktok')
             and pg_get_functiondef(oid) like '%agent_user_id, updated_at)%') = 0 then 'NOT YET APPLIED'
    when (select count(*) from pg_proc
           where proname in ('sa_connect_instagram','sa_connect_tiktok')
             and pg_get_functiondef(oid) like '%agent_user_id, updated_at)%') = 2 then 'APPLIED'
    else 'PARTIAL — INVESTIGATE'
  end as result;

-- Scoped to the INSERT's column list, not the whole body: the UPDATE branch's comment names
-- agent_user_id too, and matching that prose instead of the code is a mistake this file's
-- predecessors made twice.
select '2. the INSERT records the agent' as check,
  case when (
    with b as (select regexp_replace(pg_get_functiondef(oid), '--[^\n]*', '', 'g') as d
                 from pg_proc where proname = 'sa_connect_instagram'),
         ins as (select substring(d from position('insert into public.social_connections' in d)) as i from b)
    select substring(i from 1 for position('values' in i)) like '%agent_user_id%' from ins)
       then 'PASS' else 'FAIL' end as result;

select '3. and sets it to the connecting admin' as check,
  case when (select pg_get_functiondef(oid) like '%p_expires_at, v_uid, now())%'
               from pg_proc where proname = 'sa_connect_instagram')
       then 'PASS' else 'FAIL' end as result;

-- The reconnect guarantee. The UPDATE's SET clause must still omit every setting a reconnect
-- must not reset, agent included.
select '4. the UPDATE branch still resets nothing' as check,
  case when (
    with b as (select regexp_replace(pg_get_functiondef(oid), '--[^\n]*', '', 'g') as d
                 from pg_proc where proname = 'sa_connect_instagram'),
         u as (select substring(d from position('update public.social_connections' in d)
                                  for position(' where ' in substr(d, position('update public.social_connections' in d)))) as sc from b)
    select sc not like '%agent_user_id%' and sc not like '%posting_paused%'
       and sc not like '%posts_per_day%' and sc not like '%stagger_offset_minutes%'
      from u)
       then 'PASS' else 'FAIL' end as result;

select '5. new destinations still arrive PAUSED by column default' as check,
  case when (select column_default from information_schema.columns
              where table_name = 'social_connections' and column_name = 'posting_paused') = 'true'
       then 'PASS' else 'FAIL' end as result;

select '6. the live destinations are untouched' as check,
  case when (select count(*) from social_connections where token_secret_id is null) = 0
        and (select count(*) from social_connections where status <> 'connected') = 0
       then 'PASS' else 'FAIL' end as result,
  (select string_agg(coalesce(username,'?') || ' agent=' ||
                     case when agent_user_id is null then 'none' else 'set' end, ', ' order by provider)
     from social_connections) as destinations;

select '7. the TikTok INSERT records the agent, set to the connecting admin' as check,
  case when (
    with b as (select regexp_replace(pg_get_functiondef(oid), '--[^\n]*', '', 'g') as d
                 from pg_proc where proname = 'sa_connect_tiktok'),
         ins as (select substring(d from position('insert into public.social_connections' in d)) as i from b)
    select substring(i from 1 for position('values' in i)) like '%agent_user_id%'
       and i like '%p_expires_at, v_uid, now())%' from ins)
       then 'PASS' else 'FAIL' end as result;

-- The TikTok reconnect guarantee: the ON CONFLICT branch must still omit every setting a
-- re-authorization must not reset.
select '8. the TikTok ON CONFLICT branch still resets nothing' as check,
  case when (
    with b as (select regexp_replace(pg_get_functiondef(oid), '--[^\n]*', '', 'g') as d
                 from pg_proc where proname = 'sa_connect_tiktok'),
         c as (select substring(d from position('on conflict' in d)) as oc from b)
    select oc not like '%agent_user_id%' and oc not like '%posting_paused%'
       and oc not like '%posts_per_day%' and oc not like '%stagger_offset_minutes%'
       and oc not like '%market_restriction%' and oc like '%token_secret_id%'
      from c)
       then 'PASS' else 'FAIL' end as result;
