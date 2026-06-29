-- Seed corridor keywords across the clusters they're relevant to.
-- Each UPDATE is guarded so re-running this migration never duplicates
-- entries in the corridor_keywords array.
--
-- Note: the spec example "Potranco → Westover Hills, Southwest" refers to
-- a "Southwest" cluster that does not exist in location_clusters. The
-- closest existing southwest-side cluster is southside_brooks, used here
-- instead — flag if a dedicated Southwest cluster should be created later.

update location_clusters set
  corridor_keywords = corridor_keywords || '["Culebra Rd","Culebra Road"]'::jsonb
where cluster_id in ('alamo_ranch', 'westover_hills')
  and not (corridor_keywords @> '["Culebra Rd"]'::jsonb);

update location_clusters set
  corridor_keywords = corridor_keywords || '["Potranco Rd","Potranco Road"]'::jsonb
where cluster_id in ('westover_hills', 'southside_brooks')
  and not (corridor_keywords @> '["Potranco Rd"]'::jsonb);

update location_clusters set
  corridor_keywords = corridor_keywords || '["Bulverde Rd","Bulverde Road"]'::jsonb
where cluster_id = 'stone_oak'
  and not (corridor_keywords @> '["Bulverde Rd"]'::jsonb);

update location_clusters set
  corridor_keywords = corridor_keywords || '["I-35","IH-35","Interstate 35"]'::jsonb
where cluster_id in ('schertz_cibolo', 'new_braunfels', 'san_marcos', 'downtown_pearl')
  and not (corridor_keywords @> '["IH-35"]'::jsonb);

update location_clusters set
  corridor_keywords = corridor_keywords || '["Loop 1604 East"]'::jsonb
where cluster_id in ('converse_live_oak_universal_city', 'schertz_cibolo')
  and not (corridor_keywords @> '["Loop 1604 East"]'::jsonb);

update location_clusters set
  corridor_keywords = corridor_keywords || '["Loop 1604 West"]'::jsonb
where cluster_id in ('la_cantera_the_rim', 'utsa', 'helotes', 'alamo_ranch')
  and not (corridor_keywords @> '["Loop 1604 West"]'::jsonb);

update location_clusters set
  corridor_keywords = corridor_keywords || '["Inside Loop 1604"]'::jsonb
where cluster_id in ('stone_oak', 'medical_center', 'alamo_heights', 'downtown_pearl')
  and not (corridor_keywords @> '["Inside Loop 1604"]'::jsonb);

update location_clusters set
  corridor_keywords = corridor_keywords || '["Outside Loop 1604"]'::jsonb
where cluster_id in ('alamo_ranch', 'boerne', 'helotes', 'schertz_cibolo', 'new_braunfels')
  and not (corridor_keywords @> '["Outside Loop 1604"]'::jsonb);
