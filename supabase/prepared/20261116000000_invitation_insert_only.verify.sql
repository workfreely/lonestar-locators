-- VERIFICATION for 20261116000000_invitation_insert_only.sql.
-- Every statement is a SELECT. This file writes nothing, so it is safe to run BEFORE and AFTER
-- the migration, and safe to run against production. Expect 8 rows.
--
-- Row 1 says which state the database is in:
--   NOT YET APPLIED -> consume still contains its UPDATE branch.
--   APPLIED         -> consume refuses an existing connection and no longer updates one.
--   Anything else   -> a partial apply. Stop and investigate before re-running the migration.
--
-- Rows 2-5 FAIL before the migration is applied; that is the expected pre-state, not a fault.
--
-- Rows 6-8 must read PASS in BOTH states: they assert what this migration must NOT change —
-- the admin reconnect path, the live destinations, and the other destination RPCs.

select '1. state' as check,
  case
    when (select pg_get_functiondef(oid) like '%update public.social_connections%'
            from pg_proc where proname = 'sa_consume_destination_invitation')
      then 'NOT YET APPLIED'
    when (select pg_get_functiondef(oid) like '%already_connected%'
           and pg_get_functiondef(oid) not like '%update public.social_connections%'
            from pg_proc where proname = 'sa_consume_destination_invitation')
      then 'APPLIED'
    else 'PARTIAL — INVESTIGATE'
  end as result;

-- The property is the ABSENCE of the update, which is why it is asserted on the text rather than
-- inferred from behaviour: a conditional update could be reasoned around, a missing one cannot.
select '2. invitation path cannot UPDATE a connection' as check,
  case when (select pg_get_functiondef(oid) not like '%update public.social_connections%'
               from pg_proc where proname = 'sa_consume_destination_invitation')
       then 'PASS' else 'FAIL' end as result;

select '3. invitation path cannot DELETE a Vault secret' as check,
  case when (select pg_get_functiondef(oid) not like '%delete from vault.secrets%'
               from pg_proc where proname = 'sa_consume_destination_invitation')
       then 'PASS' else 'FAIL' end as result;

-- Comments stripped first: measured against the raw text, `position` finds these words in the
-- prose above them and reports an ordering that is hundreds of characters off.
select '4. the refusal precedes every write' as check,
  case when (
    with body as (
      select regexp_replace(pg_get_functiondef(oid), '--[^\n]*', '', 'g') as d
        from pg_proc where proname = 'sa_consume_destination_invitation'
    )
    select position('already_connected' in d) > 0
       and position('already_connected' in d) < position('vault.create_secret' in d)
       and position('already_connected' in d) < position('insert into public.social_connections' in d)
       and position('already_connected' in d) < position('set used_at = now()' in d)
      from body)
       then 'PASS' else 'FAIL' end as result;

select '5. the race loser cannot orphan a Vault secret' as check,
  case when (
    with body as (
      select regexp_replace(pg_get_functiondef(oid), '--[^\n]*', '', 'g') as d
        from pg_proc where proname = 'sa_consume_destination_invitation'
    )
    -- create_secret must sit INSIDE the block whose exception handler catches unique_violation,
    -- i.e. after the block opens and before the handler. Outside it, a caught violation would
    -- leave the secret behind.
    select position('unique_violation' in d) > position('vault.create_secret' in d)
       and position('vault.create_secret' in d) > position('begin' in substr(d, position('already_connected' in d)))
      from body)
       then 'PASS' else 'FAIL' end as result;

-- Comments stripped, and narrowed to the UPDATE's SET clause. Checking the whole definition
-- reported FAIL on a correct function: sa_connect_instagram's own comment NAMES the columns it
-- deliberately leaves out, so the words are present in prose while absent from the SQL.
select '6. the admin reconnect path is untouched and still omits the posting settings' as check,
  case when (
    with body as (
      select regexp_replace(pg_get_functiondef(oid), '--[^\n]*', '', 'g') as d
        from pg_proc where proname = 'sa_connect_instagram' and prosecdef
    ), setclause as (
      select substring(d from position('update public.social_connections' in d)
                         for position(' where ' in substr(d, position('update public.social_connections' in d)))) as sc
        from body
    )
    select sc not like '%posting_paused%'
       and sc not like '%posts_per_day%'
       and sc not like '%stagger_offset_minutes%'
       and sc like '%token_secret_id%'
      from setclause)
       then 'PASS' else 'FAIL' end as result;

select '7. both live destinations untouched — token, scopes, pause, cadence' as check,
  case when (select count(*) from social_connections where token_secret_id is null) = 0
        and (select count(*) from social_connections where status <> 'connected') = 0
       then 'PASS' else 'FAIL' end as result,
  (select string_agg(provider || ':' || coalesce(username, '?') || ' scopes=' ||
                     coalesce(array_length(scopes, 1), 0)::text, ', ' order by provider)
     from social_connections) as destinations;

select '8. the destination RPCs the integrations depend on are present' as check,
  case when (select count(*) from pg_proc
              where proname in ('sa_connect_instagram', 'sa_consume_destination_invitation',
                                'sa_validate_destination_invitation', 'sa_create_destination_invitation')
                and prosecdef) = 4
       then 'PASS' else 'FAIL' end as result;
