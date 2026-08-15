-- ============================================================================
-- lead_favorites.property_image_url — persisted property thumbnail
-- ============================================================================
-- The Workspace shows a small property image beside each Favorite (and each
-- Recommended Property) via the shared PropertyThumb component. The image is
-- resolved ONCE when the favorite is added/edited (from the property URL's
-- metadata — og:image first — through the existing /api/favorites/detect-metadata
-- flow), then reused on every render. The Workspace NEVER fetches the property
-- website at render time.
--
-- Smallest possible change: one nullable text column holding the resolved image
-- URL. NULL (uncollected, or metadata had no image) → PropertyThumb renders the
-- clean placeholder; a broken URL falls back to the same placeholder client-side.
-- No new table, no backfill, no change to any existing migration.
--
-- Forward-compatible: when the recommendation engine is live, a Recommended
-- Property already carries an image URL; turning it into a Favorite copies that
-- URL straight into this column — no re-fetch.

alter table public.lead_favorites
  add column if not exists property_image_url text;
