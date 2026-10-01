-- ════════════════════════════════════════════════════════════════════════════
-- INVOICE: canonical property identity + the separate commission structures.
--
-- PREPARED FOR REVIEW — NOT APPLIED. The migration ledger is out of sync (51
-- migrations applied but absent from the remote ledger), so `supabase db push`
-- would re-run them against live Property Intelligence data. Apply by hand in the
-- SQL Editor for onwrrajmklxtnabekzcy, whole file, nothing selected, then run the
-- verification at the bottom.
--
-- WHY. The invoice today records `invoice_property_name` as FREE TEXT, so a closed
-- transaction has no link to the property it was for — the same property can be
-- spelled three ways across three invoices and nothing joins them to
-- property_catalog, to the Favorite, or to the recommendation that produced it.
--
-- And the commission model can only express ONE structure: a percentage of base
-- rent. Locators are really paid a percentage, OR a flat fee, OR either plus a
-- bonus. Those are different concepts and are deliberately NOT merged here: a
-- single "amount" column would make "$500" unreadable — flat fee or bonus? — and
-- no later parsing can recover the distinction.
--
-- NOTHING HERE WRITES BACK TO PROPERTY INTELLIGENCE. The invoice is TRANSACTION
-- data: what this lease actually paid. property_catalog is PROPERTY data: what the
-- property generally pays. They are allowed to disagree, and the invoice is never
-- authoritative over the catalog.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Canonical property identity on the invoice ───────────────────────────
-- Mirrors the identity every other surface already uses, so an invoice joins to
-- property_catalog / lead_favorites / lead_recommendations with no new concept:
--   place_id            the Google Place ID, as property_catalog is keyed
--   canonical_key       'pid:<place id>', the same shape lead_favorites and
--                       lead_recommendations GENERATE, so the three are comparable
--
-- Deliberately NOT a foreign key to property_catalog: a locator must be able to
-- invoice a property Property Intelligence has not catalogued yet, and an FK would
-- block the close. The catalog is an enrichment, never a gate on getting paid.
alter table public.leads
  add column if not exists invoice_property_place_id     text,
  add column if not exists invoice_property_canonical_key text;

comment on column public.leads.invoice_property_place_id is
  'Google Place ID of the property this invoice is for, from the canonical property '
  'search. Null for a property that was typed free-hand.';
comment on column public.leads.invoice_property_canonical_key is
  'pid:<place id> — the same canonical key lead_favorites / lead_recommendations '
  'generate, so an invoice can be joined to the Favorite and the recommendation it '
  'came from. Never a foreign key: an uncatalogued property must still be invoiceable.';

create index if not exists leads_invoice_property_key_idx
  on public.leads (invoice_property_canonical_key)
  where invoice_property_canonical_key is not null;

-- ── 2. The three commission structures, kept apart ──────────────────────────
-- EXISTING, unchanged: invoice_base_rent, invoice_commission_pct,
--                      invoice_broker_split_pct, invoice_expected_commission
--
-- invoice_flat_fee — a fixed dollar amount INSTEAD of a percentage (some
--   properties pay "$500 per lease" regardless of rent). Not a bonus.
-- invoice_bonus    — a dollar amount IN ADDITION to whichever structure applies
--   (a lease-up special, a volume bonus). Not a flat fee.
--
-- Separate columns because the distinction is not recoverable later: "$500" in one
-- merged field cannot be told apart, and they behave differently — a flat fee
-- REPLACES the percentage, a bonus ADDS to it.
alter table public.leads
  add column if not exists invoice_flat_fee     numeric,
  add column if not exists invoice_bonus        numeric,
  add column if not exists invoice_total_amount numeric;

comment on column public.leads.invoice_flat_fee is
  'Fixed dollar commission for this lease, INSTEAD of a percentage of base rent. '
  'Mutually meaningful with invoice_commission_pct, not mutually exclusive in the '
  'schema — a property may pay a percentage on one lease and a flat fee on another.';
comment on column public.leads.invoice_bonus is
  'Dollar bonus IN ADDITION to the percentage or flat fee. Never merged with '
  'invoice_flat_fee: a merged "amount" could not be interpreted later.';
comment on column public.leads.invoice_total_amount is
  'The invoiced total. Today this is DERIVABLE (see computeInvoiceTotals) and the '
  'app recomputes it live; it is stored so a historical invoice keeps the number '
  'that was actually billed even if the formula or the inputs change later — the '
  'same reason closed_estimated_commission is frozen on close.';

-- Negative money is always a data-entry error, never a real invoice.
alter table public.leads drop constraint if exists leads_invoice_amounts_nonneg;
alter table public.leads add constraint leads_invoice_amounts_nonneg check (
  (invoice_flat_fee     is null or invoice_flat_fee     >= 0) and
  (invoice_bonus        is null or invoice_bonus        >= 0) and
  (invoice_total_amount is null or invoice_total_amount >= 0)
);

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION — run after applying.
-- ════════════════════════════════════════════════════════════════════════════
-- a) all five columns exist (expect 5)
--    select count(*) from information_schema.columns
--     where table_schema='public' and table_name='leads'
--       and column_name in ('invoice_property_place_id','invoice_property_canonical_key',
--                           'invoice_flat_fee','invoice_bonus','invoice_total_amount');
--
-- b) nothing was back-filled or invented (expect 0 for every column)
--    select
--      count(*) filter (where invoice_property_place_id is not null)      as place_ids,
--      count(*) filter (where invoice_property_canonical_key is not null) as keys,
--      count(*) filter (where invoice_flat_fee is not null)               as flat_fees,
--      count(*) filter (where invoice_bonus is not null)                  as bonuses,
--      count(*) filter (where invoice_total_amount is not null)           as totals
--    from public.leads;
--
-- c) existing invoice data is untouched (expect the same counts as before)
--    select
--      count(*) filter (where invoice_property_name is not null) as named,
--      count(*) filter (where invoice_base_rent is not null)     as base_rents,
--      count(*) filter (where invoice_commission_pct is not null) as pcts
--    from public.leads;
--
-- d) the non-negative constraint is live (expect an error, 23514)
--    update public.leads set invoice_bonus = -1 where id = (select min(id) from public.leads);

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- begin;
--   alter table public.leads drop constraint if exists leads_invoice_amounts_nonneg;
--   drop index if exists leads_invoice_property_key_idx;
--   alter table public.leads
--     drop column if exists invoice_property_place_id,
--     drop column if exists invoice_property_canonical_key,
--     drop column if exists invoice_flat_fee,
--     drop column if exists invoice_bonus,
--     drop column if exists invoice_total_amount;
-- commit;
