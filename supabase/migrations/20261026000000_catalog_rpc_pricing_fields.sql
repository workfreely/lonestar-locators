-- Owner-only property pricing (Phase 1): widen lb_property_catalog_by_ids to also return the
-- bedroom starting rents and their freshness stamp, so the Recommended Properties card can
-- derive "2BR from $1,400" from the CANONICAL record at render time.
--
-- WHY THE RPC AND NOT A NEW TABLE. property_catalog already owns these columns
-- (onebr/twobr/threebr_starting_rent, pricing_last_verified) and Social Beast's Property
-- Research form is already keyed by these exact column names. Returning them here is what
-- makes the record shared: both products read one row, and neither needs a sync path.
--
-- PURELY ADDITIVE. Same signature, same security model as 20260922000002 / 20260923000003:
-- SECURITY DEFINER, id-scoped, 60-id hard cap, authenticated-only, no direct-table read.
-- Existing callers (lib/propertyExplorer/catalog.ts) map by column NAME and ignore columns
-- they do not read, so nothing breaks before the reader is wired.
--
-- NOT EXPOSED TO CLIENTS. The client-facing /r share page uses a different resolver
-- (lb_resolve_client_recommendations) and is untouched by this migration, so widening this
-- function cannot surface a price on a shared list.
--
-- ROLLBACK is the previous definition in 20260923000003 — re-running that file restores the
-- 18-column shape exactly. Nothing reads the four new columns until the reader ships.

-- Adding OUT columns changes the return type, which CREATE OR REPLACE cannot do, so drop
-- then recreate. Same signature (text[]) → the drop/create pair is atomic within this
-- migration and the grant below restores execute access.
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
  verified_at               timestamptz,
  -- Owner-entered bedroom pricing (Phase 1). Numeric so the reader never parses currency
  -- text; NULL means "not entered" and the card then shows no pricing at all.
  onebr_starting_rent       numeric,
  twobr_starting_rent       numeric,
  threebr_starting_rent     numeric,
  -- When the pricing above was last checked. Display/staleness only — it never gates
  -- whether the price renders, because a dated price is still the price we hold.
  --
  -- DATE, NOT TIMESTAMPTZ. property_catalog.pricing_last_verified is a `date`, and a
  -- RETURNS TABLE column type must match the SELECT exactly: PL/pgSQL does not coerce, it
  -- raises "structure of query does not match function result type" at CALL time. Declaring
  -- this timestamptz creates the function cleanly and then breaks EVERY call — which is how
  -- the rehearsal caught it before it reached production.
  pricing_last_verified     date
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
    return; -- nothing requested → nothing returned
  end if;

  -- Hard reject over-cap: fail clearly, never truncate. 60 = the max legitimate browser
  -- Map candidate set; our own read path chunks to stay under it.
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
           c.google_review_count, c.verified_at,
           c.onebr_starting_rent, c.twobr_starting_rent, c.threebr_starting_rent,
           c.pricing_last_verified
      from public.property_catalog c
     where c.place_id = any (v_ids);
end;
$$;

revoke all on function public.lb_property_catalog_by_ids(text[]) from public, anon;
grant execute on function public.lb_property_catalog_by_ids(text[]) to authenticated;
