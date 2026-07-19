-- Favorite Properties workflow improvement: Property URL is now the
-- primary input, with automatic name/address detection from the URL's
-- metadata. Validation no longer requires both fields — a valid URL alone
-- (once detection succeeds) is enough to save, and a name alone (no URL)
-- is still allowed for manual entry. Neither column can be the sole
-- required field anymore, so both become nullable, with a check ensuring
-- a favorite is never saved with literally nothing identifying it.

alter table public.lead_favorites
  alter column property_name drop not null,
  alter column property_url drop not null;

alter table public.lead_favorites
  add constraint lead_favorites_name_or_url_present
  check (property_name is not null or property_url is not null);
