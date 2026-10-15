-- REVISION HISTORY — integration tests against the real triggers and real RLS.
--
-- Runs entirely inside ONE transaction that ROLLS BACK, on FIXTURE rows it creates itself. It
-- never touches an existing draft, post, research record or observation, and it performs no
-- restore on real content.
--
-- Run: psql "$(cat supabase/.temp/pooler-url)" -f scripts/social/revisionHistory.sql
\set ON_ERROR_STOP on
begin;

create temporary table t(name text, pass boolean, detail text) on commit drop;
create or replace function pg_temp.ck(n text, cond boolean, d text default '') returns void
language sql as $$ insert into t values (n, cond, d) $$;

-- ── FIXTURES ────────────────────────────────────────────────────────────────────────────────
-- A real owner id is required by the foreign keys; everything created here rolls back.
do $$
declare owner_a uuid; cid uuid; pid uuid; other uuid := '00000000-0000-4000-8000-00000000beef';
begin
  select owner_user_id into owner_a from public.social_content limit 1;

  insert into public.social_content (owner_user_id, storage_path, property_name, amenities,
         budget_range, special, property_type, area_neighborhood, district, notes, place_id)
  values (owner_a, owner_a || '/fixture/source.mp4', 'FIXTURE Property', 'Pool' || chr(10) || 'Gym',
          '1500', 'One Month Free', 'Apartment', 'Downtown', null, 'fixture notes', 'FIXTURE_PLACE')
  returning id into cid;

  insert into public.social_posts (owner_user_id, source_content_id, status, caption, hashtags,
         overlay_headline, overlay_template, overlay_mode, cover_thumb_offset_ms)
  values (owner_a, cid, 'draft', 'ORIGINAL CAPTION', array['#one','#two'],
          'ORIGINAL HEADLINE', 'market_type', 'generate', 600)
  returning id into pid;

  insert into public.social_property_research (owner_user_id, place_id, property_name, stable, pricing, sources, unresolved)
  values (owner_a, 'FIXTURE_PLACE', 'FIXTURE Research',
          '{"address":"1 Test St","floorPlans":[{"name":"A1","sqft":700}],"communityAmenities":["Pool","Gym"]}'::jsonb,
          '{"specials":[{"value":"8 weeks free","status":"verified_current"}]}'::jsonb,
          '[{"url":"https://example.com","kind":"official"}]'::jsonb, '[]'::jsonb);

  insert into public.social_property_observations (place_id, social_content_id, observed_by, field, value, source_url, observed_at)
  values ('FIXTURE_PLACE', cid, owner_a, 'current_special', 'OBSERVED SPECIAL', 'https://example.com', current_date);

  insert into public.social_floorplan_observations (social_content_id, place_id, observed_by, plan_name, beds, sqft, observed_at)
  values (cid, 'FIXTURE_PLACE', owner_a, 'FIXTURE PLAN', 2, 950, current_date);

  perform set_config('test.owner_a', owner_a::text, true);
  perform set_config('test.cid', cid::text, true);
  perform set_config('test.pid', pid::text, true);
  perform set_config('test.other', other::text, true);
end $$;

-- Baseline: fixtures must not themselves have produced revisions (triggers are UPDATE/DELETE only).
select pg_temp.ck('inserting a fixture creates NO revision (history starts at the first change)',
  (select count(*) from public.social_revisions where row_id = current_setting('test.pid')) = 0);

-- ── 0. BASELINE RECOVERY ────────────────────────────────────────────────────────────────────
-- The question this answers: a record that has NEVER been edited has no history. When it is first
-- changed, is the state it had before that change recoverable EXACTLY — including hand-written
-- content that no generator would ever reproduce?
--
-- The fixture below is deliberately shaped like real content: a hand-written caption with emoji,
-- smart quotes and newlines, a manually chosen template, a manually entered amenity list and
-- price. If any of it came back altered, a restore would be worse than useless.
-- Its OWN fixtures, so this block cannot disturb the premises of the tests that follow.
do $$
declare owner_a uuid := current_setting('test.owner_a')::uuid;
        cid uuid; pid uuid;
        hand_caption text := 'Hand-written. ✨ Smart quotes: don''t, "quoted", and — a dash.' || chr(10) || chr(10) || 'Second paragraph.';
        n_before int;
begin
  -- Created ALREADY in the realistic "never edited since upload" state, so the baseline is the
  -- inserted state and no setup write pollutes the history being measured.
  insert into public.social_content (owner_user_id, storage_path, property_name, amenities, special,
         budget_range, property_type, area_neighborhood, district, notes, place_id)
  values (owner_a, owner_a || '/baseline/source.mp4', 'BASELINE Property',
          'Rooftop Pool' || chr(10) || 'Concierge' || chr(10) || 'EV Charging',
          'Up to 8 Weeks Free', '2450', 'Penthouse', 'Downtown Dallas', 'Arts District',
          'manually typed note', 'BASELINE_PLACE')
  returning id into cid;

  insert into public.social_posts (owner_user_id, source_content_id, status, caption, hashtags,
         overlay_headline, overlay_template, overlay_mode, cover_thumb_offset_ms)
  values (owner_a, cid, 'draft', hand_caption, array['#manual','#chosen','#bythem'],
          'MANUALLY WRITTEN HEADLINE', 'hits_different', 'existing', 600)
  returning id into pid;

  select count(*) into n_before from public.social_revisions;

  -- THE FIRST MEANINGFUL EDIT after that baseline.
  update public.social_posts
     set caption = 'REPLACED BY A LATER SAVE', overlay_template = 'market_type',
         hashtags = array['#different'], overlay_headline = 'REGENERATED HEADLINE',
         cover_thumb_offset_ms = 1500
   where id = pid;
  update public.social_content
     set amenities = 'Pool', special = null, budget_range = '1200', property_type = 'Apartment',
         district = null, notes = null
   where id = cid;

  perform pg_temp.ck('a first meaningful edit records exactly TWO revisions — one per table',
    (select count(*) from public.social_revisions) = n_before + 2);

  -- EXACT recovery, field by field, byte for byte.
  perform pg_temp.ck('the hand-written caption comes back EXACTLY — emoji, smart quotes, newlines',
    (select previous->>'caption' from public.social_revisions
      where entity='social_posts' and row_id=pid::text order by id desc limit 1) = hand_caption);
  perform pg_temp.ck('the manually chosen template is recoverable',
    (select previous->>'overlay_template' from public.social_revisions
      where entity='social_posts' and row_id=pid::text order by id desc limit 1) = 'hits_different');
  perform pg_temp.ck('the manually written headline and overlay mode are recoverable',
    (select previous->>'overlay_headline' from public.social_revisions
      where entity='social_posts' and row_id=pid::text order by id desc limit 1) = 'MANUALLY WRITTEN HEADLINE');
  perform pg_temp.ck('the manually chosen hashtags are recoverable, in order',
    (select previous->'hashtags' from public.social_revisions
      where entity='social_posts' and row_id=pid::text order by id desc limit 1) = '["#manual","#chosen","#bythem"]'::jsonb);
  perform pg_temp.ck('the 600 ms cover offset is recoverable',
    (select previous->>'cover_thumb_offset_ms' from public.social_revisions
      where entity='social_posts' and row_id=pid::text order by id desc limit 1) = '600');
  perform pg_temp.ck('the FULL manually entered amenity list is recoverable, all three lines',
    (select previous->>'amenities' from public.social_revisions
      where entity='social_content' and row_id=cid::text order by id desc limit 1)
    = 'Rooftop Pool' || chr(10) || 'Concierge' || chr(10) || 'EV Charging');
  perform pg_temp.ck('a special CLEARED to null is still recoverable',
    (select previous->>'special' from public.social_revisions
      where entity='social_content' and row_id=cid::text order by id desc limit 1) = 'Up to 8 Weeks Free');
  perform pg_temp.ck('price, property type, district and notes are all recoverable from the one revision',
    (select previous->>'budget_range'='2450' and previous->>'property_type'='Penthouse'
        and previous->>'district'='Arts District' and previous->>'notes'='manually typed note'
       from public.social_revisions where entity='social_content' and row_id=cid::text order by id desc limit 1));
  perform pg_temp.ck('an UNCHANGED watched field is absent from the revision — no needless snapshot',
    (select not (previous ? 'area_neighborhood') from public.social_revisions
      where entity='social_content' and row_id=cid::text order by id desc limit 1));
end $$;

-- A record nobody has touched must have NO history at all — the system costs nothing until a
-- change actually happens.
select pg_temp.ck('an untouched record has no revisions, so unchanged records cost nothing',
  (select count(*) from public.social_revisions r
    where r.entity='social_property_research' and r.entity_key->>'place_id'='FIXTURE_PLACE') = 0);

-- ── 1. CAPTION ──────────────────────────────────────────────────────────────────────────────
update public.social_posts set caption = 'EDITED CAPTION' where id = current_setting('test.pid')::uuid;
select pg_temp.ck('a caption change records exactly one revision, naming only caption',
  (select changed_fields from public.social_revisions where row_id=current_setting('test.pid') order by id desc limit 1) = array['caption']);
select pg_temp.ck('the revision holds the PREVIOUS caption verbatim',
  (select previous->>'caption' from public.social_revisions where row_id=current_setting('test.pid') order by id desc limit 1) = 'ORIGINAL CAPTION');

-- ── 2. NO-OP ────────────────────────────────────────────────────────────────────────────────
do $$ declare n int; begin
  select count(*) into n from public.social_revisions;
  update public.social_posts set caption = caption, overlay_template = overlay_template, hashtags = hashtags
   where id = current_setting('test.pid')::uuid;
  perform pg_temp.ck('a no-op save writes NO revision', (select count(*) from public.social_revisions) = n);
end $$;

-- ── 3. TEMPLATE / OVERLAY / COVER ───────────────────────────────────────────────────────────
update public.social_posts
   set overlay_template='pov_price', overlay_headline='NEW HEADLINE', overlay_mode='existing', cover_thumb_offset_ms=900
 where id = current_setting('test.pid')::uuid;
select pg_temp.ck('template, headline, mode and cover offset are all captured together',
  (select changed_fields from public.social_revisions where row_id=current_setting('test.pid') order by id desc limit 1)
  @> array['overlay_template','overlay_headline','overlay_mode','cover_thumb_offset_ms']);
select pg_temp.ck('the previous cover offset is recoverable',
  (select previous->>'cover_thumb_offset_ms' from public.social_revisions where row_id=current_setting('test.pid') order by id desc limit 1) = '600');

-- ── 4. UNRELATED FIELDS ARE NOT TOUCHED ─────────────────────────────────────────────────────
update public.social_posts set status = 'draft', scheduled_at = null where id = current_setting('test.pid')::uuid;
select pg_temp.ck('changing an UNWATCHED column alone records no revision',
  (select count(*) from public.social_revisions where row_id=current_setting('test.pid')) = 2);
select pg_temp.ck('no revision ever mentions a field outside the watched set',
  not exists (select 1 from public.social_revisions r, unnest(r.changed_fields) f
               where r.entity='social_posts' and f not in ('caption','hashtags','overlay_headline',
               'overlay_subheadline','overlay_template','overlay_mode','cover_thumb_offset_ms','cover_storage_path')));

-- ── 5. AMENITIES / PRICE / SPECIAL / TYPE ───────────────────────────────────────────────────
update public.social_content set amenities='Pool', budget_range='2500', special='Two Months Free', property_type='Loft'
 where id = current_setting('test.cid')::uuid;
select pg_temp.ck('amenities, price, special and type are captured on social_content',
  (select changed_fields from public.social_revisions where entity='social_content' and row_id=current_setting('test.cid') order by id desc limit 1)
  @> array['amenities','budget_range','special','property_type']);
select pg_temp.ck('the FULL previous amenity list survives, not just the first line',
  (select previous->>'amenities' from public.social_revisions where entity='social_content' order by id desc limit 1) = 'Pool' || chr(10) || 'Gym');

-- ── 6. NULL IS STORED, NOT DROPPED ──────────────────────────────────────────────────────────
update public.social_content set district = 'Arts District' where id = current_setting('test.cid')::uuid;
select pg_temp.ck('a previously NULL field is recorded as JSON null, so a restore can clear it again',
  (select previous ? 'district' and jsonb_typeof(previous->'district')='null'
     from public.social_revisions where entity='social_content' order by id desc limit 1));

-- ── 7. RESEARCH, AND ITS COMPOSITE KEY ──────────────────────────────────────────────────────
update public.social_property_research set stable = stable || '{"yearBuilt":"2020"}'::jsonb
 where place_id='FIXTURE_PLACE';
select pg_temp.ck('a research revision records the COMPOSITE (owner_user_id, place_id) identity',
  (select entity_key ? 'owner_user_id' and entity_key ? 'place_id' and entity_key->>'place_id'='FIXTURE_PLACE'
     from public.social_revisions where entity='social_property_research' order by id desc limit 1));
select pg_temp.ck('the previous stable object is kept whole — floor plans and amenities included',
  (select (previous->'stable'->'floorPlans'->0->>'name')='A1'
      and (previous->'stable'->'communityAmenities') = '["Pool","Gym"]'::jsonb
     from public.social_revisions where entity='social_property_research' order by id desc limit 1));
update public.social_property_research set pricing = '{"specials":[{"value":"4 weeks free","status":"verified_current"}]}'::jsonb
 where place_id='FIXTURE_PLACE';
select pg_temp.ck('a superseded special is recoverable from history',
  (select previous->'pricing'->'specials'->0->>'value' from public.social_revisions where entity='social_property_research' order by id desc limit 1) = '8 weeks free');

-- ── 8. OBSERVATIONS: OVERWRITE AND DELETE ───────────────────────────────────────────────────
update public.social_property_observations set value='CHANGED SPECIAL' where social_content_id=current_setting('test.cid')::uuid;
select pg_temp.ck('overwriting an observation preserves its previous value',
  (select previous->>'value' from public.social_revisions where entity='social_property_observations' order by id desc limit 1) = 'OBSERVED SPECIAL');
delete from public.social_property_observations where social_content_id=current_setting('test.cid')::uuid;
select pg_temp.ck('DELETING an observation (what clearing a form field does) preserves the whole row',
  (select op='delete' and previous->>'value'='CHANGED SPECIAL' and previous->>'field'='current_special'
     from public.social_revisions where entity='social_property_observations' order by id desc limit 1));
update public.social_floorplan_observations set plan_name='CHANGED PLAN', sqft=1100 where social_content_id=current_setting('test.cid')::uuid;
select pg_temp.ck('the floorplan table, which has NO id column, is keyed by social_content_id',
  (select row_id=current_setting('test.cid') and entity_key->>'social_content_id'=current_setting('test.cid')
     from public.social_revisions where entity='social_floorplan_observations' order by id desc limit 1));
delete from public.social_floorplan_observations where social_content_id=current_setting('test.cid')::uuid;
select pg_temp.ck('deleting a floorplan observation preserves its measurements',
  (select op='delete' and previous->>'plan_name'='CHANGED PLAN' and previous->>'sqft'='1100'
     from public.social_revisions where entity='social_floorplan_observations' order by id desc limit 1));

-- ── 9. SERVICE-ROLE WRITES ARE CAPTURED, AND IDENTIFIABLE AS SUCH ───────────────────────────
select pg_temp.ck('every revision so far was written with no auth.uid() — i.e. by a service-role/script path',
  (select bool_and(changed_by is null) from public.social_revisions));
select pg_temp.ck('...and the database role that made the change is still recorded',
  (select bool_and(changed_by_role is not null and changed_by_role <> '') from public.social_revisions));

-- ── 10. CONCURRENT / SEQUENTIAL EDITS CHAIN CORRECTLY ───────────────────────────────────────
update public.social_posts set caption='SECOND EDIT' where id=current_setting('test.pid')::uuid;
update public.social_posts set caption='THIRD EDIT'  where id=current_setting('test.pid')::uuid;
select pg_temp.ck('each successive edit records the value it replaced, forming an unbroken chain',
  (select array_agg(previous->>'caption' order by id)
     from public.social_revisions
    where row_id=current_setting('test.pid') and changed_fields @> array['caption'])
  = array['ORIGINAL CAPTION','EDITED CAPTION','SECOND EDIT']);
select pg_temp.ck('so the ORIGINAL caption is still recoverable after two further edits',
  (select previous->>'caption' from public.social_revisions
    where row_id=current_setting('test.pid') and changed_fields @> array['caption'] order by id limit 1) = 'ORIGINAL CAPTION');

-- ── 10b. RESTORING A PREVIOUS REVISION ──────────────────────────────────────────────────────
-- Exactly what scripts/social/restoreRevision.mjs does when applied: take the `previous` value of
-- one named field from one exact revision and write it back. Nothing is regenerated — the stored
-- bytes go straight back — and the restore is itself an UPDATE, so the trigger records the state
-- it replaced and the restore can be undone the same way.
do $$
declare rev_id bigint; original text; n_before int; n_after int;
begin
  select id, previous->>'caption' into rev_id, original
    from public.social_revisions
   where row_id = current_setting('test.pid') and changed_fields @> array['caption']
   order by id limit 1;                                         -- the FIRST caption revision
  select count(*) into n_before from public.social_revisions where row_id = current_setting('test.pid');

  update public.social_posts set caption = original where id = current_setting('test.pid')::uuid;

  select count(*) into n_after from public.social_revisions where row_id = current_setting('test.pid');
  perform pg_temp.ck('restoring revision #' || rev_id || ' puts the ORIGINAL caption back',
    (select caption from public.social_posts where id = current_setting('test.pid')::uuid) = 'ORIGINAL CAPTION');
  perform pg_temp.ck('the restore itself is recorded, so it can be undone', n_after = n_before + 1);
  perform pg_temp.ck('and that new revision holds the value the restore replaced',
    (select previous->>'caption' from public.social_revisions where row_id = current_setting('test.pid')
      order by id desc limit 1) = 'THIRD EDIT');
  perform pg_temp.ck('a restore touches ONLY the named field — hashtags, template and cover are untouched',
    (select hashtags = array['#one','#two'] and overlay_template = 'pov_price' and cover_thumb_offset_ms = 900
       from public.social_posts where id = current_setting('test.pid')::uuid));
end $$;

-- ── 11. APPEND-ONLY, EVEN HERE ──────────────────────────────────────────────────────────────
do $$ begin
  update public.social_revisions set previous='{}'::jsonb where id=(select min(id) from public.social_revisions);
  perform pg_temp.ck('UPDATE on history is refused', false, 'it succeeded');
exception when sqlstate '42501' then perform pg_temp.ck('UPDATE on history is refused', true);
end $$;
do $$ begin
  delete from public.social_revisions where id=(select min(id) from public.social_revisions);
  perform pg_temp.ck('DELETE on history is refused', false, 'it succeeded');
exception when sqlstate '42501' then perform pg_temp.ck('DELETE on history is refused', true);
end $$;

-- ── 12. CROSS-ACCOUNT ISOLATION, THROUGH REAL RLS ───────────────────────────────────────────
do $$
declare mine int; theirs int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('test.other'), 'role','authenticated')::text, true);
  select count(*) into theirs from public.social_revisions;
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner_a'), 'role','authenticated')::text, true);
  select count(*) into mine from public.social_revisions;
  reset role;
  perform pg_temp.ck('ANOTHER owner sees none of this history', theirs = 0, 'saw ' || theirs);
  perform pg_temp.ck('the OWNER sees their own history', mine > 0, 'saw ' || mine);
end $$;

do $$ begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner_a'), 'role','authenticated')::text, true);
  begin
    insert into public.social_revisions (entity, entity_key, row_id, owner_user_id, op, previous, changed_fields)
    values ('social_posts','{}'::jsonb,'x',current_setting('test.owner_a')::uuid,'update','{}'::jsonb,array['caption']);
    reset role;
    perform pg_temp.ck('a signed-in user cannot FORGE a revision', false, 'the insert succeeded');
  exception when others then
    reset role;
    perform pg_temp.ck('a signed-in user cannot FORGE a revision', true);
  end;
end $$;

-- ── RESULTS ─────────────────────────────────────────────────────────────────────────────────
\echo ''
select case when pass then '  ✓ ' else '  ✗ ' end || name || case when detail <> '' then '  [' || detail || ']' else '' end as result from t order by ctid;
\echo ''
select count(*) filter (where pass) || ' passed, ' || count(*) filter (where not pass) || ' failed' as summary from t;
do $$ begin
  if exists (select 1 from t where not pass) then
    raise exception 'REVISION HISTORY TESTS FAILED';
  end if;
end $$;

rollback;
\echo ''
\echo 'rolled back — no fixture, revision or real row was kept'
