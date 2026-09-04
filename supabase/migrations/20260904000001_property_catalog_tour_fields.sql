-- Tour Assist data model (fields only — NO UI/workflow yet).
--
-- Property-level URLs for the FUTURE Beast Companion "Schedule Tour" autofill
-- workflow. They live on property_catalog, keyed by Google Place ID, so ANY
-- property in ANY supported market can carry them — there is no city-specific
-- logic anywhere; a property is identified by place_id, never by market name.
--
--   tour_url          the property's tour-request / schedule-a-tour page
--   apply_url         the property's application page
--   availability_url  optional live availability / floorplans page
--
-- All nullable and additive. Nothing reads these into UI yet; this only makes the
-- catalog + read path able to support the workflow later.
alter table public.property_catalog
  add column if not exists tour_url text,
  add column if not exists apply_url text,
  add column if not exists availability_url text;
