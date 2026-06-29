-- Location Clusters: San Antonio-area apartment-locating clusters
-- (neighborhoods, ZIPs, keywords) used by the matching engine's
-- location-intelligence layer. Schema only — no scoring logic depends
-- on this table yet.

create table if not exists location_clusters (
  id uuid primary key default gen_random_uuid(),

  cluster_id   text not null unique,
  cluster_name text not null,
  city_slug    text not null,

  core_zips         jsonb not null default '[]',
  nearby_zips       jsonb not null default '[]',

  property_keywords jsonb not null default '[]',
  nearby_clusters   jsonb not null default '[]',

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Recommended indexes
create index if not exists idx_location_clusters_city_slug
  on location_clusters (city_slug);

create index if not exists idx_location_clusters_core_zips
  on location_clusters using gin (core_zips);

create index if not exists idx_location_clusters_nearby_zips
  on location_clusters using gin (nearby_zips);

create index if not exists idx_location_clusters_property_keywords
  on location_clusters using gin (property_keywords);

-- Keep updated_at current on every row update
create or replace function set_location_clusters_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_location_clusters_updated_at on location_clusters;

create trigger trg_location_clusters_updated_at
  before update on location_clusters
  for each row
  execute function set_location_clusters_updated_at();

-- RLS: match existing read-mostly reference-table pattern
alter table location_clusters enable row level security;

create policy "Allow read access to location_clusters"
  on location_clusters for select
  using (true);

create policy "Allow service role full access to location_clusters"
  on location_clusters for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
