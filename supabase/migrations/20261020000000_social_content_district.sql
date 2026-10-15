-- Social Beast → DISTRICT. The fourth geographic layer, added beside the three that exist.
--
-- ── THE PROBLEM THIS SOLVES ─────────────────────────────────────────────────────────────────
-- Social Beast stores geography in two places: `market` (where the locator works) and
-- `area_neighborhood` (one free-text value). Verified research keeps producing properties where
-- TWO names are both accurate and only one can be stored:
--
--   Atelier Dallas      Downtown Dallas  +  Arts District
--   Tin Top Flats       Midtown SA       +  Tobin Hill
--   Freestone Ladera    Far West SA      +  Ladera
--   East Quarter Res.   Downtown Dallas  +  East Quarter
--
-- Forcing a choice loses one true fact every time, and the choice tends to go to whichever name
-- the mailing address happened to supply — see lib/social/filenameInference.ts suggestArea(),
-- which fills area_neighborhood with the address LOCALITY. That is why "Helotes", "Katy" and
-- "Frisco" (cities) currently sit in a field labelled Neighborhood.
--
-- ── WHY ONE COLUMN AND NOT FOUR ─────────────────────────────────────────────────────────────
-- Three of the four layers already have a home. `market` is the market. `area_neighborhood` holds
-- the broader area or submarket, and EVERY value stored in it today is legitimately one of those —
-- a submarket the market catalog already carries (Boerne, Schertz), a mailing city (Helotes,
-- Katy), or a broad area (Far West, Northwest, Downtown). The only layer with nowhere to live is
-- the specific district. So: one column, nothing migrated, nothing re-labelled in the data.
--
-- A separate `city` column was considered and deliberately NOT added. No stored value today needs
-- one, and an unused column is a thing that drifts. It can be added the same additive way if a
-- video ever needs a city that cannot be expressed as a submarket.
--
-- ── ADDITIVE, AND NOTHING IS POPULATED ──────────────────────────────────────────────────────
-- Nullable, no default, no backfill, no constraint. Every existing selection is untouched and
-- every row starts null. Districts are populated later, per video, from the verified research in
-- social_property_research — never in bulk from a guess.
--
-- INTERNAL, like its sibling. area_neighborhood is deliberately absent from
-- lib/social/composePost.ts SourceMeta so it cannot reach a caption, headline or overlay. district
-- is held to the same rule: it is editing metadata, not public copy.
alter table public.social_content add column if not exists district text;

comment on column public.social_content.district is
  'Social Beast supplemental SPECIFIC neighborhood / district (e.g. Arts District, Tobin Hill,
   Ladera). The finest of four layers: market > area_neighborhood (broader area / submarket /
   city) > district. Supplements both, replaces neither — "Downtown Dallas" and "Arts District"
   are stored together when both are accurate. Internal editing metadata only: never written to
   public post copy, and never written to property_catalog / CRM / canonical property records.';
