-- Property Catalog — per-property structured geography from Property
-- Intelligence, keyed by Google Place ID. Feeds the production Property
-- Explorer's location-fit ranking. Additive; leaves location_clusters alone.
-- All geography fields nullable. Seeded from approved Property Intelligence
-- data (initial checkpoint: 10 approved San Antonio properties).
create table if not exists public.property_catalog (
  place_id          text primary key,
  neighborhood      text,
  location          text,
  location_keywords jsonb not null default '[]'::jsonb,
  zip               text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.property_catalog enable row level security;

-- Non-sensitive reference geography. Authenticated CRM users may read; there
-- is no write policy, so rows are managed only via service role / migrations.
drop policy if exists property_catalog_read on public.property_catalog;
create policy property_catalog_read
  on public.property_catalog for select to authenticated using (true);
