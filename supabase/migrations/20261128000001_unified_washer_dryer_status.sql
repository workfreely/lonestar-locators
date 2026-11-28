-- ── ONE WASHER/DRYER VOCABULARY, FOR THE PROPERTY AND FOR THE PAIR ──────────────────────────
--
-- Two vocabularies described the same amenity and could not talk to each other:
--
--   lead_property_reasons.washer_dryer_status    included | hookups | laundry_onsite
--   property_catalog.washer_dryer_included       Yes | No | Select Units | Specific Floor Plans
--   property_catalog.washer_dryer_connections    Yes | No | Select Units
--
-- Confirming a status for a client left the map's Edit Property panel reading "Not verified",
-- because nothing joined them. Madeira Apartments is the reported case: 'laundry_onsite'
-- confirmed on the pair, both catalog columns empty.
--
-- This adds property_catalog.washer_dryer_status in the SAME five-value vocabulary the pair
-- already uses, and widens the pair's two CHECK constraints to match. Every surface — the map,
-- the reasons editor, the Lead Board card and the client list — then reads and writes one
-- spelling.
--
-- ── THE TWO LEGACY COLUMNS ARE KEPT, AND NOT TOUCHED ────────────────────────────────────────
-- They are NOT collapsed into the new column. 107 properties hold a meaningful value in BOTH
-- (48 "Select Units + Yes", 25 "Yes + Yes", 21 "Select Units + Select Units", and so on), and
-- one dropdown cannot say two things. The new column is DERIVED from them below; the originals
-- keep every value they hold, so nothing verified is lost and the derivation can be re-run or
-- reversed from data that is still there.
--
-- ── 'No' DERIVES NOTHING, DELIBERATELY ──────────────────────────────────────────────────────
-- washer_dryer_included = 'No' means there is no machine in the unit. It does NOT mean there is
-- no laundry in the building, and deriving "No Laundry Facilities" from it would put a claim in
-- front of a renter that nobody verified. Those 9 + 4 rows derive NULL — still "not verified" —
-- and keep their 'No' in the legacy column. 'none' is only ever set by a person choosing it.
--
-- ── WHAT IS NOT TOUCHED ─────────────────────────────────────────────────────────────────────
-- No column is dropped or rewritten. lb_prepare_client_share, lb_create_client_share and
-- lb_resolve_client_recommendations carry the status through as opaque text and are not
-- redefined here. Commission, images, pricing, specials and every other column are untouched.

begin;

-- ── 1. THE PAIR AND THE SNAPSHOT ACCEPT THE FULL VOCABULARY ─────────────────────────────────
alter table public.lead_property_reasons
  drop constraint if exists lead_property_reasons_wd_status_chk;
alter table public.lead_property_reasons
  add constraint lead_property_reasons_wd_status_chk
  check (washer_dryer_status is null
         or washer_dryer_status in ('included','hookups','select_units','laundry_onsite','none'));

alter table public.client_recommendation_share_items
  drop constraint if exists client_rec_share_items_wd_status_chk;
alter table public.client_recommendation_share_items
  add constraint client_rec_share_items_wd_status_chk
  check (washer_dryer_status is null
         or washer_dryer_status in ('included','hookups','select_units','laundry_onsite','none'));

-- ── 2. THE PROPERTY-LEVEL COLUMN ────────────────────────────────────────────────────────────
alter table public.property_catalog
  add column if not exists washer_dryer_status text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'property_catalog_wd_status_chk') then
    alter table public.property_catalog
      add constraint property_catalog_wd_status_chk
      check (washer_dryer_status is null
             or washer_dryer_status in ('included','hookups','select_units','laundry_onsite','none'));
  end if;
end $$;

comment on column public.property_catalog.washer_dryer_status is
  'PROPERTY-level washer/dryer in the unified vocabulary: included | hookups | select_units | laundry_onsite | none. NULL = not verified. Derived once from washer_dryer_included / washer_dryer_connections, which are KEPT because 107 properties hold a distinct fact in each. Edited from the map''s Edit Property panel and promoted from a per-client confirmation.';

-- ── 3. THE DERIVATION ───────────────────────────────────────────────────────────────────────
-- The precedence the Lead Board card already used, so a property's derived status says what its
-- card has been saying all along. Guarded by `is null` so re-running this migration can never
-- overwrite an answer a person has since typed.
update public.property_catalog
   set washer_dryer_status = case
         when washer_dryer_included = 'Yes' then 'included'
         when washer_dryer_connections = 'Yes' then 'hookups'
         when washer_dryer_included in ('Select Units','Specific Floor Plans') then 'select_units'
         when washer_dryer_connections = 'Select Units' then 'select_units'
         else null
       end
 where washer_dryer_status is null
   and (washer_dryer_included is not null or washer_dryer_connections is not null);

-- ── 4. THE READ PATH RETURNS IT ─────────────────────────────────────────────────────────────
-- Same signature plus one column, same 60-id cap, same refusal to truncate. The two legacy
-- columns are still returned: the card's fallback reads them when a property predates the
-- derivation or its status was never set.
--
-- A RETURNS TABLE cannot gain a column through `create or replace`, so the function is DROPPED
-- and recreated. 20261115000000 states the rule for exactly this case: a drop takes the grants
-- with it, and the default would hand `anon` execute again — so the revoke and the grant are
-- repeated below, verbatim. An anonymous call must still fail with 42501.
drop function if exists public.lb_property_washer_dryer_by_ids(text[]);

CREATE OR REPLACE FUNCTION public.lb_property_washer_dryer_by_ids(p_place_ids text[])
 RETURNS TABLE(place_id text, washer_dryer_included text, washer_dryer_connections text, washer_dryer_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    select c.place_id, c.washer_dryer_included, c.washer_dryer_connections, c.washer_dryer_status
      from public.property_catalog c
     where c.place_id = any (v_ids);
end;
$function$;

-- Authenticated CRM users only; never anon/public — repeated because the drop above discarded
-- the grants 20261115000000 set.
revoke all on function public.lb_property_washer_dryer_by_ids(text[]) from public, anon;
grant execute on function public.lb_property_washer_dryer_by_ids(text[]) to authenticated;

commit;
