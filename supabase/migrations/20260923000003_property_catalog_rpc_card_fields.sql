-- Property card wiring (Step 6): widen lb_property_catalog_by_ids to also return
-- the canonical card fields the Map + Beast Companion cards now render — the
-- backup image, the verified current special, the three locator commission
-- columns, google review count, and verified_at (special-freshness gate).
--
-- Identical security model to 20260922000002: SECURITY DEFINER, id-scoped, 60-id
-- hard cap, authenticated-only, no direct-table read. Purely additive to the
-- RETURNS TABLE + SELECT list — existing callers (lib/propertyExplorer/catalog.ts)
-- map by column name and ignore new columns until wired. Commission is served
-- ONLY to authenticated locator surfaces; it is NEVER exposed on the client /r
-- page (which uses a different resolver, lb_resolve_client_recommendations).

-- Adding OUT columns changes the return type, which CREATE OR REPLACE cannot do,
-- so drop then recreate. Same signature (text[]) → the drop/create pair is atomic
-- within this migration and the grant below restores execute access.
drop function if exists public.lb_property_catalog_by_ids(text[]);

create function public.lb_property_catalog_by_ids(p_place_ids text[])
returns table (
  place_id                  text,
  neighborhood              text,
  location                  text,
  location_keywords         jsonb,
  zip                       text,
  website_url               text,
  google_rating             real,
  property_image_url        text,
  tour_url                  text,
  apply_url                 text,
  availability_url          text,
  -- Card-wiring additions (Step 6)
  property_image_url_backup text,
  current_special           text,
  send_commission           text,
  escort_commission         text,
  bonus_flat                text,
  google_review_count       integer,
  verified_at               timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids text[];
  v_n   int;
begin
  select array_agg(distinct id)
    into v_ids
    from unnest(coalesce(p_place_ids, array[]::text[])) as id
   where id is not null and length(trim(id)) > 0;

  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then
    return;
  end if;

  if v_n > 60 then
    raise exception 'property_catalog request exceeds the 60-id limit (got %)', v_n
      using errcode = 'check_violation';
  end if;

  return query
    select c.place_id, c.neighborhood, c.location, c.location_keywords, c.zip,
           c.website_url, c.google_rating, c.property_image_url,
           c.tour_url, c.apply_url, c.availability_url,
           c.property_image_url_backup, c.current_special,
           c.send_commission, c.escort_commission, c.bonus_flat,
           c.google_review_count, c.verified_at
      from public.property_catalog c
     where c.place_id = any (v_ids);
end;
$$;

revoke all on function public.lb_property_catalog_by_ids(text[]) from public, anon;
grant execute on function public.lb_property_catalog_by_ids(text[]) to authenticated;
