-- APPLIED TO PRODUCTION 2026-11-02, on explicit approval, via the Supabase Management API.
-- Verified by 20261109000000_property_credit_minimum.verify.sql plus five negative constraint
-- attacks (a score with no status, a score under 'no_check_reported', score 0, the token
-- 'unknown', an out-of-range observed approval) — all five rejected. Reverse with
-- ROLLBACK_20261109000000_property_credit_minimum.sql.
--
-- MINIMUM CREDIT SCORE, as first-class property data — additive only.
--
-- WHY A STATUS COLUMN AND NOT JUST A SCORE. Three states have to survive a round trip, and this
-- is the same shape the gift card already uses (20261106000000):
--
--   unknown / not researched      nobody has asked the leasing office
--   a reported minimum            an office stated a number
--   no credit check reported      an office stated that credit is not scored
--
-- A score alone cannot express the third, and "score is null" would collapse "nobody asked" with
-- "asked, and they don't check" into one value. That is exactly the mistake the commission model
-- exists to prevent: a null send_commission means nobody checked, an explicit "0%" means somebody
-- did. So the FACT gets its own column.
--
-- NULL MEANS UNKNOWN and there is deliberately no 'unknown' token — two spellings of one state is
-- how a column starts disagreeing with itself. The editor still offers three radio choices; the
-- third one writes NULL, exactly as the gift card's Clear control already does.
--
-- NEVER INFER NO-CHECK FROM BLANK OR ZERO. A blank score under a null status is "not researched".
-- 'no_check_reported' is reachable only by an explicit write, and 0 is outside the allowed range
-- so it cannot be stored at all.
--
-- A REPORTED MINIMUM IS NOT A CONFIRMED POLICY. These are agent-reported observations from
-- leasing-office conversations. The column name says `reported`, and nothing here is client-facing:
-- see the read-path note at the bottom.
--
-- OBSERVED PRIOR APPROVAL IS A SEPARATE COLUMN. "A 450 got approved here once" and "their stated
-- minimum is 450" are different claims, and only the second is a policy. Keeping them apart is
-- what stops an anecdote hardening into a rule — Hidden Oaks is exactly this case.

alter table public.property_catalog
  add column if not exists credit_minimum_status          text,
  add column if not exists credit_minimum_score           integer,
  add column if not exists credit_observed_approval_score integer,
  add column if not exists credit_screening_notes         text,
  add column if not exists credit_screening_checked_at    date;

-- The vocabulary, enforced.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.property_catalog'::regclass
      and conname = 'property_catalog_credit_minimum_status_check'
  ) then
    alter table public.property_catalog
      add constraint property_catalog_credit_minimum_status_check
      check (credit_minimum_status is null
             or credit_minimum_status in ('reported_minimum', 'no_check_reported'));
  end if;
end $$;

-- THE THREE STATES, ENFORCED AS ONE RULE:
--   status null                → score must be null  (nobody asked; a score would be a claim)
--   status 'no_check_reported' → score must be null  (a stated non-policy cannot carry a number)
--   status 'reported_minimum'  → score present, 300–850
--
-- NOT VALID so no table scan is needed. Every existing row has all five columns null and already
-- satisfies it, so it can be validated whenever convenient:
--   alter table public.property_catalog validate constraint property_catalog_credit_minimum_score_check;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.property_catalog'::regclass
      and conname = 'property_catalog_credit_minimum_score_check'
  ) then
    alter table public.property_catalog
      add constraint property_catalog_credit_minimum_score_check
      check (
        case
          when credit_minimum_status = 'reported_minimum'
            then credit_minimum_score is not null
                 and credit_minimum_score between 300 and 850
          else credit_minimum_score is null
        end
      ) not valid;
  end if;
end $$;

-- Observed approval stands on its own: it is legal with ANY status, including none, because an
-- anecdote can exist before anyone has asked about policy. Only its range is constrained.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.property_catalog'::regclass
      and conname = 'property_catalog_credit_observed_approval_check'
  ) then
    alter table public.property_catalog
      add constraint property_catalog_credit_observed_approval_check
      check (credit_observed_approval_score is null
             or credit_observed_approval_score between 300 and 850) not valid;
  end if;
end $$;

comment on column public.property_catalog.credit_minimum_status is
  'Credit screening: null = not researched, ''reported_minimum'' = an office stated a number, ''no_check_reported'' = an office stated credit is not scored. AGENT-REPORTED, not a confirmed policy. Internal only.';
comment on column public.property_catalog.credit_minimum_score is
  'The reported minimum FICO, 300-850. Only meaningful when credit_minimum_status = ''reported_minimum''.';
comment on column public.property_catalog.credit_observed_approval_score is
  'A score an applicant was observed to be approved with. An ANECDOTE, deliberately separate from credit_minimum_score, and never a policy.';
comment on column public.property_catalog.credit_screening_notes is
  'Internal screening notes: broken lease, eviction, rental debt, extra deposit, self-employment handling. Never client-facing.';
comment on column public.property_catalog.credit_screening_checked_at is
  'Date the screening information was last verified with the leasing office. Date, not timestamptz — mirrors gift_card_checked_at.';

-- ── THE READ PATH IS DELIBERATELY NOT TOUCHED ───────────────────────────────────────────────
-- Two catalog read functions exist, and this migration changes NEITHER:
--
--   lb_property_catalog_by_ids            feeds the agent-facing map/property cards
--   lb_resolve_client_recommendations     the ONLY path to a client /r page
--
-- The client function is left alone because that is the requirement: screening observations must
-- never reach a client page, and the surest way to guarantee that is for the function that builds
-- the page to have no access to the columns. Not adding them is the safety property.
--
-- The agent-facing function is left alone because nothing needs it yet. The Property Map Editor
-- reads and writes through /api/admin/owner/property-pricing, which selects from the table
-- directly, so the editor field works with columns alone. Should a credit badge later be wanted
-- ON the map card, that is a second, separate migration which re-creates only
-- lb_property_catalog_by_ids — and it should be reviewed on its own merits, because putting a
-- reported minimum on a card is a product decision, not a schema one.
