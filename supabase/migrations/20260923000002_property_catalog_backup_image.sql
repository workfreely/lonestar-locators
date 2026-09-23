-- Ranked backup image for the property card / recommendation page.
--
-- The first-party image-enrichment pipeline selects a PRIMARY property photo and,
-- when a second valid gallery photo exists, a BACKUP — so the card (Map / Companion /
-- /r) can immediately try #2 if #1 fails to load (pairs with the <img onError>
-- fallback). Both come from the SAME verified first-party image set (property site
-- gallery / Schema.org photo), never a logo/stock/floor-plan/og:image-blind pick.
--
-- Additive + nullable. property_image_url stays the primary; these add the backup
-- plus lightweight image provenance separate from the record-level source/verified_at.
alter table public.property_catalog
  add column if not exists property_image_url_backup text,
  -- Where the CHOSEN images came from (e.g. property_site_gallery, schema_org_photo,
  -- property_site_image, og_image, canonical). Distinct from the record-level `source`.
  add column if not exists property_image_source_detail text,
  -- When the image set was last selected/verified by the pipeline.
  add column if not exists property_image_verified_at timestamptz;

comment on column public.property_catalog.property_image_url_backup is 'Second-ranked verified first-party property photo; the card tries this if the primary fails to load.';
comment on column public.property_catalog.property_image_source_detail is 'Provenance of the selected image(s): property_site_gallery | schema_org_photo | property_site_image | og_image | canonical.';
