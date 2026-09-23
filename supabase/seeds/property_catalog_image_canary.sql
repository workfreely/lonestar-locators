-- First-party image-enrichment canary — 5 San Antonio properties.
--
-- Records the image-selection pipeline run (lib/leads/detectPropertyMetadata.ts
-- rankPropertyImages: JSON-LD gallery / Schema.org photo > property-site gallery
-- <img> > og:image, with logo/floor-plan/stock/badge/share-card rejection, scene
-- ranking, and identity dedup so PRIMARY and BACKUP are distinct photos).
-- Every URL below returned an image content-type on validation (200/206).
--
-- Selection rule (matches property-image-enrichment-spec hierarchy):
--   • #1 preference is the canonical primary already verified in our data — so
--     for rows that already HAD a valid property_image_url (Oasis, Los Cielos,
--     The Floodgate) the primary is LEFT UNCHANGED and only a distinct BACKUP is
--     added. The pipeline independently re-derived those same primaries.
--   • Rows with a NULL image (Preserve, Canyon Point) get primary + backup.
-- Image fields ONLY. Commission / approval / specials / management are untouched.
--
-- Provenance: all first-party property-site gallery imagery (Canyon Point's site
-- is behind a Cloudflare JS challenge, so its gallery was read from the rendered
-- page via a real browser — still the official property site, no third party).

-- Oasis at Stone Oak — keep hero; add distinct gallery photo as backup.
update public.property_catalog set
  property_image_url_backup = 'https://images.myrazz.com/uc-image/38Ssvkaqy2JTincQK/-/format/webp/-/quality/lighter/-/resize/x1200/-/scale_crop/640x400/center/shoootin-photo-5.jpeg.webp',
  property_image_source_detail = 'property_site_gallery',
  property_image_verified_at = now()
where place_id = 'ChIJl-eBQwCJXIYRN-FpPSfKfgM';

-- Los Cielos at Brooks — keep aerial exterior; add distinct exterior as backup.
update public.property_catalog set
  property_image_url_backup = 'https://loscielosatbrooks.com/assets/images/cache/LosCielos_HighRes-22-8bf52c06c0dab80de9b0f769e7646b30.jpg',
  property_image_source_detail = 'property_site_gallery',
  property_image_verified_at = now()
where place_id = 'ChIJ6ZZL8y_3XIYRHuewIdFxMZw';

-- Preserve at Westover Hills — was NULL (broken image). Resort pool + pool #2.
update public.property_catalog set
  property_image_url = 'https://thepreservewestoverhills.com/assets/images/cache/Image-31-3414efa0ebc8b4b7bb96608b99e48944.jpg',
  property_image_url_backup = 'https://thepreservewestoverhills.com/assets/images/cache/Image-32-f3474d32b0be981ace111075e97caa52.jpg',
  property_image_source_detail = 'property_site_gallery',
  property_image_verified_at = now()
where place_id = 'ChIJoU0gkedcXIYRnqkBHBjzl9Q';

-- The Floodgate — keep kitchen hero; add distinct riverwalk as backup.
update public.property_catalog set
  property_image_url_backup = 'https://thefloodgateliving.b-cdn.net/wp-content/uploads/2025/05/photoby-onwardgroup-photoby-onwardgroup-108-20250417-floodgate-rpm-windowstill-lpg-97-2--1920x1280.jpg',
  property_image_source_detail = 'property_site_gallery',
  property_image_verified_at = now()
where place_id = 'ChIJVTzV8wRZXIYR5VofQF2y2yE';

-- Canyon Point — was NULL (site behind Cloudflare). Aerial complex + entrance.
update public.property_catalog set
  property_image_url = 'https://medialibrarycfo.entrata.com/fit-in/760x428/17535/MLv3/9/36/2026/08/06/023411/6a74efc32efd49.68071678481.jpg',
  property_image_url_backup = 'https://medialibrarycfo.entrata.com/fit-in/760x428/17535/MLv3/9/36/2026/08/06/023148/6a74ef344e4cc0.78410407547.jpg',
  property_image_source_detail = 'property_site_gallery',
  property_image_verified_at = now()
where place_id = 'ChIJqRkNDzeKXIYRN-GXnUuVnqw';
