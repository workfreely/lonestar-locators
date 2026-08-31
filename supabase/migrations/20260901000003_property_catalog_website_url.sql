-- Additive: the property's own website, sourced from Property Intelligence
-- (property.official_website_url), joined by Google Place ID. Nullable; leaves
-- every existing row and behavior untouched until the explorer reads it.
alter table public.property_catalog add column if not exists website_url text;
