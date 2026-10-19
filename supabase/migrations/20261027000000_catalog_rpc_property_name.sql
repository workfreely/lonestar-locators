-- Building Type on newly added properties: widen lb_property_catalog_by_ids by ONE column,
-- property_name.
--
-- WHY. The property-research PATCH may now create a research row for a property that has never
-- been through the research pipeline. That row should be self-describing, and its name must come
-- from the canonical catalog record — not from the request body (untrusted) and not from
-- social_content (that route is deliberately isolated from it, and a test enforces the isolation).
--
-- property_catalog has RLS ENABLED WITH NO SELECT POLICY, so a request-scoped client can read
-- nothing from it directly. This id-scoped SECURITY DEFINER RPC is the one sanctioned read path,
-- and it is also the identity gate the create path already calls — so returning the name costs
-- the route nothing: no extra round trip, no new table, no new function.
--
-- PURELY ADDITIVE, same security model as 20260922000002 / 20260923000003 / 20261026000000:
-- SECURITY DEFINER, id-scoped, 60-id hard cap, authenticated-only, no direct-table read. Existing
-- callers map by column NAME and ignore columns they do not read, so nothing breaks.
--
-- NOT CLIENT-FACING. The /r share page uses lb_resolve_client_recommendations, a different
-- resolver, untouched here.
--
-- ROLLBACK is the previous definition in 20261026000000 — re-running that file restores the
-- 22-column shape exactly.

-- Adding an OUT column changes the return type, which CREATE OR REPLACE cannot do, so drop then
-- recreate. Same signature (text[]); the grant below restores execute access.
drop function if exists public.lb_property_catalog_by_ids(text[]);

create function public.lb_property_catalog_by_ids(p_place_ids text[])
returns table (
  place_id                  text,
  -- Canonical property name. Added so a research row created from the editor can carry the
  -- catalog's own name rather than one supplied by the browser.
  property_name             text,
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
  property_image_url_backup text,
  current_special           text,
  send_commission           text,
  escort_commission         text,
  bonus_flat                text,
  google_review_count       integer,
  verified_at               timestamptz,
  onebr_starting_rent       numeric,
  twobr_starting_rent       numeric,
  threebr_starting_rent     numeric,
  -- DATE, not timestamptz: property_catalog.pricing_last_verified is a `date`, and a RETURNS
  -- TABLE column type must match the SELECT exactly or every call raises at run time.
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

  -- Hard reject over-cap: fail clearly, never truncate.
  if v_n > 60 then
    raise exception 'property_catalog request exceeds the 60-id limit (got %)', v_n
      using errcode = 'check_violation';
  end if;

  return query
    select c.place_id, c.property_name, c.neighborhood, c.location, c.location_keywords, c.zip,
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
