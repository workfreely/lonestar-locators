-- Security Beast — Property Catalog hardening.
--
-- Closes the authenticated bulk-extraction path on public.property_catalog. The
-- table held the whole proprietary Property Intelligence corpus (4,202 rows:
-- keywords, ratings, images, website/tour/apply/availability URLs) behind a
-- broad `select to authenticated using (true)` policy — so ANY authenticated
-- account could enumerate the entire catalog via direct PostgREST.
--
-- New model: browser/server → this ID-scoped SECURITY DEFINER RPC → only the
-- rows for the specific place_ids requested. The broad SELECT policy is removed,
-- so a direct authenticated `select * from property_catalog` now returns nothing;
-- the whole corpus can no longer be listed without already knowing the ids (which
-- are Google Place IDs, obtained legitimately from Google, never enumerable here).
--
-- HARD CAP = 60 unique ids — the exact ceiling of the only legitimate browser Map
-- operation (max 3 preferred areas × 20 candidates/area, deduped by place_id).
-- The cap reflects product behavior, NOT database capacity. Over-cap requests are
-- REJECTED with a clear error (never silently truncated). The cap is enforced
-- against the UNIQUE, non-empty id set so duplicates neither fail a legitimate
-- request nor distort the cap. Legitimate server sets larger than 60 (the
-- /admin/leads workspace enrichment) are chunked into ≤60-id batches by the
-- single caller (lib/propertyExplorer/catalog.ts) — there is no privileged
-- higher-cap path.

create or replace function public.lb_property_catalog_by_ids(p_place_ids text[])
returns table (
  place_id          text,
  neighborhood      text,
  location          text,
  location_keywords jsonb,
  zip               text,
  website_url       text,
  google_rating     real,
  property_image_url text,
  tour_url          text,
  apply_url         text,
  availability_url  text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Deduplicated, non-empty id set — the cap and the lookup both use this, so
  -- duplicates can't fail a legitimate request or be used to distort the cap.
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

  -- Hard reject over-cap (Option A): fail clearly, never truncate. 60 = the max
  -- legitimate browser Map candidate set. Direct callers get an error; our own
  -- read path stays ≤60 by chunking, so this never fires for legitimate use.
  if v_n > 60 then
    raise exception 'property_catalog request exceeds the 60-id limit (got %)', v_n
      using errcode = 'check_violation';
  end if;

  return query
    select c.place_id, c.neighborhood, c.location, c.location_keywords, c.zip,
           c.website_url, c.google_rating, c.property_image_url,
           c.tour_url, c.apply_url, c.availability_url
      from public.property_catalog c
     where c.place_id = any (v_ids);
end;
$$;

-- Authenticated CRM users only; never anon/public.
revoke all on function public.lb_property_catalog_by_ids(text[]) from public, anon;
grant execute on function public.lb_property_catalog_by_ids(text[]) to authenticated;

-- Remove the broad direct-table read. RLS STAYS ENABLED with no SELECT policy, so
-- authenticated `select * from property_catalog` returns []; the RPC (definer)
-- still reads it. Writes remain service-role only (unchanged).
drop policy if exists property_catalog_read on public.property_catalog;
