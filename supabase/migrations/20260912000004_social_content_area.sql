-- Social Autopilot → Area / Neighborhood (additive, SA-only). A finer geographic signal than
-- Market (e.g. Schertz within San Antonio, Uptown within Dallas). Local snapshot/override only;
-- never written to property_catalog / CRM / canonical property records.
alter table public.social_content add column if not exists area_neighborhood text;
comment on column public.social_content.area_neighborhood is
  'Social Autopilot supplemental area/neighborhood (e.g. Schertz, Uptown). Supplements Market,
   never replaces it. SA-only snapshot; not written to canonical property systems.';
