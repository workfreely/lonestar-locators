-- The desired-area ZIP for a client's search.
--
-- Additive, nullable, no default, no backfill. The column the earlier Commute /
-- Destination work already defined for exactly this (prepared as part of
-- 20261110000001, whose other columns belong to Quick Match and are NOT applied here).
--
-- ── IT IS NOT WHERE THEY LIVE ───────────────────────────────────────────────────────────────
-- This is the ZIP the search should centre on — the answer to "do you need to be near a
-- specific address or zip code?". A client's CURRENT address is a different fact and is not
-- stored here. Reading it as a residential address would point the search at the place they are
-- trying to move away from.
--
-- ── WHY A NEW COLUMN AND NOT AN EXISTING ONE ────────────────────────────────────────────────
-- leads has 119 columns and none of them holds a ZIP. `city` is a city, `neighborhoods` and
-- `submarkets` are named areas from a catalog, and commute_anchor_label is the client-facing
-- wording for an anchored Google place — overloading any of them would make one column mean two
-- things. commute_anchor_place_id stays the canonical routing destination; this is the
-- type-it-by-hand alternative beside it, and the two are independent.
alter table public.leads
  add column if not exists destination_zip text;

-- Five digits or nothing. NOT VALID because the column ships empty: nothing to validate, no
-- table scan, and every future write is still constrained.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_destination_zip_format') then
    alter table public.leads
      add constraint leads_destination_zip_format
      check (destination_zip is null or destination_zip ~ '^[0-9]{5}$') not valid;
  end if;
end
$$;

comment on column public.leads.destination_zip is
  'The desired-area ZIP for this client''s search — where they want to BE, not where they live now. Five digits or NULL. Typed by a locator in the CRM Edit Client modal, beside commute_anchor_place_id, which remains the canonical routable destination.';
