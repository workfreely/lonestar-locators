-- Populate aliases + landmarks for existing clusters, and add a new
-- "North Central / Airport" cluster for North Star Mall.

update location_clusters set
  aliases = '["La Cantera","The Rim"]',
  landmarks = '["Six Flags Fiesta Texas","The Shops at La Cantera"]'
where cluster_id = 'la_cantera_the_rim';

update location_clusters set
  aliases = '["Downtown","Pearl","Pearl District","Tobin Hill"]',
  landmarks = '["River Walk","Tower of the Americas"]'
where cluster_id = 'downtown_pearl';

update location_clusters set
  aliases = '["Brooks","Brooks City Base","Southside"]'
where cluster_id = 'southside_brooks';

update location_clusters set
  aliases = '["Converse","Live Oak","Universal City"]'
where cluster_id = 'converse_live_oak_universal_city';

update location_clusters set
  landmarks = '["SeaWorld San Antonio","Ingram Park Mall"]'
where cluster_id = 'westover_hills';

-- New cluster: North Central / Airport (North Star Mall area)
insert into location_clusters
  (cluster_id, cluster_name, city_slug, core_zips, nearby_zips, property_keywords, nearby_clusters, aliases, landmarks)
values
  (
    'north_central_airport', 'North Central / Airport', 'san-antonio',
    '["78216"]',
    '["78209","78212","78213","78217"]',
    '["North Star Mall","San Pedro Ave","Airport","San Antonio Airport"]',
    '["alamo_heights","medical_center"]',
    '["North Central","Airport"]',
    '["North Star Mall"]'
  )
on conflict (cluster_id) do update set
  cluster_name      = excluded.cluster_name,
  city_slug         = excluded.city_slug,
  core_zips         = excluded.core_zips,
  nearby_zips       = excluded.nearby_zips,
  property_keywords = excluded.property_keywords,
  nearby_clusters   = excluded.nearby_clusters,
  aliases           = excluded.aliases,
  landmarks         = excluded.landmarks,
  updated_at        = now();

-- Keep nearby_clusters symmetric for the two clusters now adjacent to it
update location_clusters set
  nearby_clusters = nearby_clusters || '["north_central_airport"]'::jsonb
where cluster_id in ('alamo_heights', 'medical_center')
  and not (nearby_clusters @> '["north_central_airport"]'::jsonb);
