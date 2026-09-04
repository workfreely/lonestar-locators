-- Property image enrichment — persistence layer on property_catalog.
--
-- Stores the SELECTED representative property image as a URL/reference only — we
-- never download or store the image bytes. One image per property (no gallery).
-- Filled by the website-scraper enrichment job using the calibrated scene-ranked
-- selector (lib/leads/detectPropertyMetadata); Google Places photos are NOT used.
--
-- Columns (all nullable, additive — nothing else on property_catalog changes):
--   property_image_url        the chosen image URL (null when no valid image)
--   property_image_source     provenance: "website:<channel>" (og | jsonld |
--                             twitter | gallery); null when no image
--   property_image_checked_at when the job last evaluated this property
--   property_image_status     "valid" | "no_image" | "unreachable"
alter table public.property_catalog
  add column if not exists property_image_url text,
  add column if not exists property_image_source text,
  add column if not exists property_image_checked_at timestamptz,
  add column if not exists property_image_status text;
