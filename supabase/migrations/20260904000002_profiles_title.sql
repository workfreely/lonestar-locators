-- Tour Assist data model (fields only). The locator's professional title (e.g.
-- "Apartment Locator", "Realtor") for the FUTURE Schedule Tour autofill — the only
-- field from that workflow's locator list not already on profiles (first_name,
-- last_name, email, phone_number, brokerage already exist). Nullable, additive; no
-- UI reads it yet.
alter table public.profiles
  add column if not exists title text;
