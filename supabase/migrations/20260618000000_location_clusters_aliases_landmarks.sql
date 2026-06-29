-- Add alias and destination-keyword (landmark/POI) support to
-- location_clusters, used for priority-ranked cluster detection.

alter table location_clusters
  add column if not exists aliases  jsonb not null default '[]',
  add column if not exists landmarks jsonb not null default '[]';

create index if not exists idx_location_clusters_aliases
  on location_clusters using gin (aliases);

create index if not exists idx_location_clusters_landmarks
  on location_clusters using gin (landmarks);
