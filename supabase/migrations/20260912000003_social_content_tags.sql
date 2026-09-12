-- Social Autopilot → Tags on the source asset (additive; SA-only internal/content
-- organization, distinct from Amenities). Never written back to canonical property records.
alter table public.social_content add column if not exists tags text[];
comment on column public.social_content.tags is
  'Social Autopilot internal content tags (e.g. luxury, new construction, near randolph) — for
   SA filtering/organization/compose. NOT amenities, NOT written to property_catalog/CRM.';
