-- Final destination keyword pass for Location Intelligence, before
-- location scoring is wired into calculateMatchScore. No new clusters
-- created, no matching logic touched — landmarks data only.
--
-- Each UPDATE is guarded the same way as prior landmark/corridor
-- migrations (not (landmarks @> '[...]')) so this file is safe to re-run.
--
-- NOTE: the following terms were verified already present from earlier
-- migrations and are intentionally NOT re-added here to avoid duplication:
--   Fort Sam, Fort Sam Houston, BAMC, Brooke Army Medical Center  (alamo_heights, converse_live_oak_universal_city)
--   USAA, USAA Headquarters                                       (utsa, medical_center)
--   Randolph, Randolph AFB, JBSA Randolph                         (converse_live_oak_universal_city, schertz_cibolo)
--   Six Flags Fiesta Texas                                        (la_cantera_the_rim)
--   SeaWorld San Antonio                                          (westover_hills)

-- Downtown / Pearl
update location_clusters set
  landmarks = landmarks || '[
    "Riverwalk","River Walk","San Antonio River Walk",
    "Pearl","Pearl District","The Pearl","Pearl Brewery",
    "Tower of the Americas","Hemisfair",
    "Downtown","Downtown San Antonio"
  ]'::jsonb
where cluster_id = 'downtown_pearl'
  and not (landmarks @> '["Hemisfair"]'::jsonb);

-- North Central / Airport
update location_clusters set
  landmarks = landmarks || '["Airport","SAT Airport","San Antonio Airport","San Antonio International Airport"]'::jsonb
where cluster_id = 'north_central_airport'
  and not (landmarks @> '["SAT Airport"]'::jsonb);

-- Southside / Brooks
update location_clusters set
  landmarks = landmarks || '[
    "Brooks","Brooks City Base","Brooks City-Base",
    "Toyota","Toyota Plant","Toyota Manufacturing","Toyota Motor Manufacturing Texas","TMMTX"
  ]'::jsonb
where cluster_id = 'southside_brooks'
  and not (landmarks @> '["Brooks City-Base"]'::jsonb);

-- Westover Hills + Southside / Brooks (Lackland — already added by
-- 20260619000000_destination_landmarks.sql; guard makes this a safe no-op)
update location_clusters set
  landmarks = landmarks || '["Lackland","Lackland AFB","JBSA Lackland","Joint Base San Antonio Lackland"]'::jsonb
where cluster_id in ('westover_hills', 'southside_brooks')
  and not (landmarks @> '["Lackland"]'::jsonb);

-- Stone Oak + Helotes (Camp Bullis — already added by
-- 20260619000000_destination_landmarks.sql; guard makes this a safe no-op)
update location_clusters set
  landmarks = landmarks || '["Camp Bullis","Camp Bullis Training Site"]'::jsonb
where cluster_id in ('stone_oak', 'helotes')
  and not (landmarks @> '["Camp Bullis"]'::jsonb);
