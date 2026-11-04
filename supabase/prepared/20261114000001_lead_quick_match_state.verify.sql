-- VERIFY 20261114000001_lead_quick_match_state — run AFTER applying. Expect ok = true throughout.
--
-- The three things that have to be true: the columns exist and are empty (so every existing
-- recommendation keeps its current meaning with origin NULL), the origin vocabulary is
-- constrained, and THE SHARE PATH CANNOT SEE THE NEW COLUMNS — which is what keeps internal
-- screening detail off a renter's page.
select 'lead_recommendations columns exist with the right types' as check,
       count(*) = 3 as ok, count(*)::text as detail
  from information_schema.columns
 where table_schema = 'public' and table_name = 'lead_recommendations'
   and (column_name, data_type) in
       (('origin','text'), ('reviewed_at','timestamp with time zone'), ('screening','jsonb'))
union all
select 'leads.quick_match_at exists', count(*) = 1, count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'leads'
   and column_name = 'quick_match_at' and data_type = 'timestamp with time zone'
union all
select 'every existing recommendation still reads as the agent''s (origin NULL)',
       (select count(*) from public.lead_recommendations where origin is not null) = 0,
       (select count(*)::text || ' rows on file' from public.lead_recommendations)
union all
select 'no row was marked reviewed and none carries screening detail',
       (select count(*) from public.lead_recommendations
         where reviewed_at is not null or screening is not null) = 0, null
union all
select 'no lead was stamped as having run',
       (select count(*) from public.leads where quick_match_at is not null) = 0, null
union all
select 'origin vocabulary CHECK present',
       exists (select 1 from pg_constraint where conname = 'lead_recommendations_origin_vocab'),
       (select pg_get_constraintdef(oid) from pg_constraint
         where conname = 'lead_recommendations_origin_vocab')
union all
select 'the partial index for the refresh predicate exists',
       exists (select 1 from pg_indexes
                where tablename = 'lead_recommendations'
                  and indexname = 'lead_recommendations_quick_match_idx'), null
union all
-- THE ONE THAT MATTERS MOST. Both share functions name their columns, so neither mentions the
-- three added here. If a future edit makes one of them select *, this check fails loudly.
select 'neither share function references origin / reviewed_at / screening',
       not exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('lb_create_client_share','lb_prepare_client_share')
            and (p.prosrc ~ '\breviewed_at\b' or p.prosrc ~ '\bscreening\b'
                 or p.prosrc ~ '\borigin\b' or p.prosrc ~ 'select\s+\*')
       ), null;

-- The origin CHECK must refuse an unknown token. Written to a real row, then rolled back.
do $v$
declare v_id bigint; v_rejected boolean := false;
begin
  select id into v_id from public.lead_recommendations order by id limit 1;
  if v_id is null then raise notice 'SKIPPED: no recommendations to probe'; return; end if;
  begin
    update public.lead_recommendations set origin = 'robot' where id = v_id;
  exception when check_violation then v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'FAIL: the CHECK accepted ''robot'', which is outside the vocabulary';
  end if;
  update public.lead_recommendations set origin = 'quick_match' where id = v_id;
  raise notice 'OK: ''robot'' rejected, ''quick_match'' accepted (row %), rolling back', v_id;
  raise exception 'VERIFY ROLLBACK — nothing was kept';
exception when raise_exception then
  if sqlerrm = 'VERIFY ROLLBACK — nothing was kept' then
    raise notice 'OK: probe rolled back, no recommendation was modified';
  else raise;
  end if;
end
$v$;

select 'nothing persisted from the probe' as check,
       count(*) = 0 as ok, count(*)::text as detail
  from public.lead_recommendations where origin is not null;
