-- Social Autopilot → property_type on the source asset (additive; used by filename inference,
-- upload/edit UI, and post auto-compose so overlay/caption/hashtags use the right terminology,
-- e.g. townhome vs apartment). Free text validated per the app's PROPERTY_TYPES list.
alter table public.social_content add column if not exists property_type text;
comment on column public.social_content.property_type is
  'Apartment | Townhome | High-Rise | Mid-Rise | Garden-Style | Student Housing | Build-to-Rent | Other. Editable suggestion (from filename inference); influences post auto-compose terminology.';
