-- Add corridor keyword support to location_clusters.
--
-- Corridor keywords are search-intent terms (major roads, highway
-- segments, "inside/outside the loop" phrasing) that are NOT landmarks
-- (they're not a destination) and NOT clusters (a single corridor maps
-- to multiple clusters). Kept in their own column for data clarity, but
-- matched identically to landmarks/keywords by the matching engine.

alter table location_clusters
  add column if not exists corridor_keywords jsonb not null default '[]';

create index if not exists idx_location_clusters_corridor_keywords
  on location_clusters using gin (corridor_keywords);
