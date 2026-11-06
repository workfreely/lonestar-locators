-- Washer & Dryer, read-side: a second ID-scoped lookup, two columns wide.
--
-- ── WHY A NEW FUNCTION AND NOT TWO MORE COLUMNS ON THE OLD ONE ──────────────────────────────
-- lb_property_catalog_by_ids is shared: Unleash Beast's Map enrichment and the /admin/leads
-- workspace both read through it, and its 27-column contract is depended on by
-- lib/propertyExplorer/catalog.ts. Widening a shared function to serve one card is how a
-- contract drifts. This function is separate, two columns wide, and nothing else reads it, so
-- it can change later without touching Unleash. The old function is NOT altered by this
-- migration — not its body, not its signature, not its grants.
--
-- ── IT INHERITS THE 2026-09-22 SECURITY MODEL, NOT A NEW ONE ────────────────────────────────
-- Security Beast removed the broad `select to authenticated using (true)` policy on
-- property_catalog precisely so the corpus could not be enumerated; the RPC is the only
-- authenticated path and it is ID-scoped. This one is built to the same shape on purpose:
-- SECURITY DEFINER, fixed search_path, the SAME 60-id hard cap that rejects rather than
-- truncates, granted to `authenticated` and revoked from public and anon. It returns three
-- columns of the same table the function beside it already returns 27 of, so it adds no new
-- enumeration shape — only two amenity columns no RPC exposes today.
--
-- ── THE GRANT IS THE FRAGILE PART, AND THERE IS PRECEDENT ──────────────────────────────────
-- `create or replace` KEEPS existing privileges; `drop` + `create` RESETS them, and Postgres
-- gives EXECUTE to PUBLIC by default on a new function. That is not hypothetical here:
-- 20261106000000_property_gift_card.sql dropped and recreated lb_property_catalog_by_ids and
-- re-granted it `to anon, authenticated`, so today an ANONYMOUS caller who knows a place_id can
-- read all 27 of its columns — commissions included. This function is created with `create or
-- replace` and its grants are stated explicitly below. ANY future migration that drops it MUST
-- repeat the revoke, and the deploy check for it is one anon RPC call expecting 42501.
--
-- ── READ ONLY ───────────────────────────────────────────────────────────────────────────────
-- No table is created, altered or dropped. No row is written. No policy is added or removed.
-- Reverting is `drop function public.lb_property_washer_dryer_by_ids(text[]);` and nothing else.
--
-- ── WHAT IT DOES NOT DECIDE ─────────────────────────────────────────────────────────────────
-- These are PROPERTY-level values, and a property-level "Yes" is not a promise about the floor
-- plan one client would lease — which is why lead_property_reasons.washer_dryer_status exists
-- and why it alone still feeds the client-facing pill. This function serves the locator's own
-- workspace card. Nothing here reaches a renter.

create or replace function public.lb_property_washer_dryer_by_ids(p_place_ids text[])
returns table (
  place_id                 text,
  washer_dryer_included    text,
  washer_dryer_connections text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Deduplicated, non-empty id set — the cap and the lookup both use this, so duplicates
  -- can't fail a legitimate request or be used to distort the cap.
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

  -- The same hard cap, and the same refusal to truncate. The caller chunks.
  if v_n > 60 then
    raise exception 'property_catalog request exceeds the 60-id limit (got %)', v_n
      using errcode = 'check_violation';
  end if;

  return query
    select c.place_id, c.washer_dryer_included, c.washer_dryer_connections
      from public.property_catalog c
     where c.place_id = any (v_ids);
end;
$$;

comment on function public.lb_property_washer_dryer_by_ids(text[]) is
  'Read-only, ID-scoped washer/dryer lookup for the CRM Recommended Properties card. Property-level only; the client-facing pill still comes from lead_property_reasons.washer_dryer_status.';

-- Authenticated CRM users only; never anon/public. This is the grant lb_quick_match_candidates
-- carries and lb_property_catalog_by_ids was INTENDED to carry — verify it after applying.
revoke all on function public.lb_property_washer_dryer_by_ids(text[]) from public, anon;
grant execute on function public.lb_property_washer_dryer_by_ids(text[]) to authenticated;
