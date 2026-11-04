-- PREPARED — NOT APPLIED TO PRODUCTION.
--
-- lb_quick_match_candidates — the Quick Match read path.
--
-- ── ADDITIVE BY CONSTRUCTION ────────────────────────────────────────────────────────────────
-- This CREATES A NEW FUNCTION and does not touch lb_property_catalog_by_ids. That matters: the
-- shared catalogue function is Unleash Beast's read path, adding a column to it requires DROP
-- (Postgres cannot change a function's OUT columns with CREATE OR REPLACE — 42P13), and dropping
-- the function Unleash Beast depends on is not a risk Quick Match should ever impose. The guard
-- at the end FAILS THE MIGRATION if the shared function's body has changed, so this file can
-- never become a back door into it.
--
-- ── WHY IT TAKES A COLLECTION, NOT A LIST OF IDS ────────────────────────────────────────────
-- lb_property_catalog_by_ids caps at 60 ids to stop bulk enumeration of a 4,207-row catalogue.
-- Quick Match needs the whole curated collection, which is 68 and growing, so an id-list call
-- would need chunking for no benefit: the collection is not a secret worth rate-limiting, it is
-- a hand-curated shortlist, and the caller cannot enumerate anything else through this function
-- because the WHERE clause is membership itself.
--
-- ── AUTHENTICATED ONLY. NOT anon. ───────────────────────────────────────────────────────────
-- This function returns credit minimums, screening policies, criminal-background policies and
-- agent notes — internal locator-facing intelligence. The client-facing share page (/r) runs as
-- anon, and nothing it renders may come from here. So EXECUTE is granted to `authenticated`
-- alone, and the deliberate absence of anon is part of the migration, not an oversight. Note
-- that pg_default_acl in this project grants anon/authenticated/service_role on new public
-- functions automatically, and PUBLIC gets EXECUTE by Postgres default — so both are REVOKED
-- explicitly below, and the guard re-checks anon afterwards.
--
-- ── THE COLUMN LIST IS THE DEPLOYED ONE ─────────────────────────────────────────────────────
-- Every column below exists in production today: the credit set (20261109000000), the full
-- screening-requirements set including the eviction balance requirement, both positive-history
-- flags and the rental-debt pair (20261110000000 + 20261110000004), and the nine
-- criminal-background columns (20261112000000). An earlier draft of this function listed only
-- the first screening migration's columns and would have left five deployed requirements
-- invisible to the engine.

-- ── GUARD, BEFORE ANYTHING IS CREATED ───────────────────────────────────────────────────────
-- ORDER MATTERS, and a test proved it. This block used to sit at the END of the file. psql (and
-- any runner that does not wrap the file in one transaction) autocommits each statement, so a
-- guard that fails after the CREATE leaves the new function behind in a database the migration
-- claims to have refused. Checking the dependency FIRST means a refusal creates nothing at all.
-- The one check that has to come after the create — that anon cannot execute the new function —
-- is at the bottom, where it can see it.
do $pre$
declare h text; n int;
begin
  select md5(prosrc) into h from pg_proc
   where oid = 'public.lb_property_catalog_by_ids(text[])'::regprocedure;
  if h <> 'ef035dc17e71b610bd0a87da014db9b9' then
    raise exception 'lb_property_catalog_by_ids has changed (md5 %). This migration must not be applied until that is understood.', h;
  end if;
  select count(*) into n from pg_proc p, unnest(p.proargmodes) as m
   where p.oid = 'public.lb_property_catalog_by_ids(text[])'::regprocedure and m in ('o','t');
  if n <> 27 then
    raise exception 'lb_property_catalog_by_ids has % OUT columns, expected 27 — Unleash Beast''s read path has been altered', n;
  end if;
end
$pre$;

create or replace function public.lb_quick_match_candidates(p_collection text)
returns table (
  place_id                               text,
  property_name                          text,
  address                                text,
  zip                                    text,
  website_url                            text,
  property_image_url                     text,
  google_rating                          real,
  current_special                        text,
  quick_match_collection                 text,
  -- Credit
  credit_minimum_status                  text,
  credit_minimum_score                   integer,
  credit_observed_approval_score         integer,
  credit_screening_notes                 text,
  -- Broken lease
  broken_lease_status                    text,
  broken_lease_min_age_years             integer,
  broken_lease_balance_requirement       text,
  broken_lease_max_balance               numeric,
  broken_lease_positive_history_required boolean,
  -- Eviction
  eviction_status                        text,
  eviction_min_age_years                 integer,
  eviction_balance_requirement           text,
  eviction_positive_history_required     boolean,
  -- Rental debt
  rental_debt_status                     text,
  rental_debt_balance_requirement        text,
  rental_debt_max_balance                numeric,
  -- Criminal background
  felony_policy                          text,
  felony_min_age_years                   integer,
  felony_restrictions                    text,
  misdemeanor_policy                     text,
  misdemeanor_min_age_years              integer,
  misdemeanor_restrictions               text,
  criminal_restricted_offense_types      text[],
  criminal_lookback_basis                text,
  background_screening_notes             text,
  -- Approval costs and provenance
  screening_additional_deposit           text,
  screening_risk_fee                     text,
  screening_guarantor_program            text,
  screening_requirements_checked_at      date,
  -- Housing fit
  beds_min                               integer,
  beds_max                               integer,
  onebr_starting_rent                    numeric,
  twobr_starting_rent                    numeric,
  threebr_starting_rent                  numeric,
  rent_min                               numeric,
  latitude                               double precision,
  longitude                              double precision
)
language sql
security definer
set search_path = public
stable
as $$
  select
    pc.place_id, pc.property_name, pc.address, pc.zip, pc.website_url, pc.property_image_url,
    pc.google_rating, pc.current_special, pc.quick_match_collection,
    pc.credit_minimum_status, pc.credit_minimum_score, pc.credit_observed_approval_score,
    pc.credit_screening_notes,
    pc.broken_lease_status, pc.broken_lease_min_age_years, pc.broken_lease_balance_requirement,
    pc.broken_lease_max_balance, pc.broken_lease_positive_history_required,
    pc.eviction_status, pc.eviction_min_age_years, pc.eviction_balance_requirement,
    pc.eviction_positive_history_required,
    pc.rental_debt_status, pc.rental_debt_balance_requirement, pc.rental_debt_max_balance,
    pc.felony_policy, pc.felony_min_age_years, pc.felony_restrictions,
    pc.misdemeanor_policy, pc.misdemeanor_min_age_years, pc.misdemeanor_restrictions,
    pc.criminal_restricted_offense_types, pc.criminal_lookback_basis,
    pc.background_screening_notes,
    pc.screening_additional_deposit, pc.screening_risk_fee, pc.screening_guarantor_program,
    pc.screening_requirements_checked_at,
    pc.beds_min, pc.beds_max,
    pc.onebr_starting_rent, pc.twobr_starting_rent, pc.threebr_starting_rent, pc.rent_min,
    pc.latitude, pc.longitude
  from public.property_catalog pc
  -- Membership IS the filter. There is no code path through this function to a non-member, which
  -- is the database half of the guarantee that Quick Match recommends only curated properties.
  where pc.quick_match_collection is not null
    and pc.quick_match_collection = p_collection
  order by pc.property_name
$$;

revoke all on function public.lb_quick_match_candidates(text) from public;
revoke all on function public.lb_quick_match_candidates(text) from anon;
grant execute on function public.lb_quick_match_candidates(text) to authenticated;

-- ── POST-CHECK: the new function must not be readable by anon ───────────────────────────────
do $post$
begin
  if exists (
    select 1 from pg_proc p
     where p.oid = 'public.lb_quick_match_candidates(text)'::regprocedure
       and has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then
    raise exception 'lb_quick_match_candidates is executable by anon — screening data must never reach a client-facing page';
  end if;
  raise notice 'OK: new function created; lb_property_catalog_by_ids untouched (27 cols, md5 matches); anon has no EXECUTE';
end
$post$;
