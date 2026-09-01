-- Additive: the property's Google Places star rating (0.0–5.0), sourced from
-- Property Intelligence (property.google_rating), captured from the same Place
-- Details response as website_url and joined by Google Place ID. Named
-- google_rating (not a generic "rating") so its Google provenance is explicit.
-- Nullable; leaves every existing row and behavior untouched until the explorer
-- reads it. The property card shows it only when present, and it never affects
-- ranking or search.
alter table public.property_catalog add column if not exists google_rating real;
