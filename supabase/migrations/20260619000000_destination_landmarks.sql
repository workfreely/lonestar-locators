-- Add destination/POI landmarks (military bases, hospitals, major
-- employers) to existing location_clusters. No new clusters created.
--
-- Mapping rationale:
--   Fort Sam Houston / BAMC      -> Alamo Heights, Converse/Live Oak/Universal City (adjacent NE side)
--   Lackland AFB / JBSA Lackland -> Westover Hills, Southside/Brooks (SW side)
--   Randolph AFB / JBSA Randolph -> Converse/Live Oak/Universal City, Schertz/Cibolo (NE/Universal City side)
--   Camp Bullis                  -> Stone Oak, Helotes (far north side)
--   USAA / USAA Headquarters     -> UTSA, Medical Center (Fredericksburg Rd / 1604 corridor)
--   Medical Center destinations  -> Medical Center
--   Toyota / TMMTX                -> Southside/Brooks (far south side)
--
-- Each UPDATE is guarded so re-running this migration never duplicates
-- entries in the landmarks array.

update location_clusters set
  landmarks = landmarks || '["Fort Sam","Fort Sam Houston","BAMC","Brooke Army Medical Center"]'::jsonb
where cluster_id = 'alamo_heights'
  and not (landmarks @> '["Fort Sam Houston"]'::jsonb);

update location_clusters set
  landmarks = landmarks || '[
    "Fort Sam","Fort Sam Houston","BAMC","Brooke Army Medical Center",
    "Randolph","Randolph AFB","JBSA Randolph"
  ]'::jsonb
where cluster_id = 'converse_live_oak_universal_city'
  and not (landmarks @> '["Fort Sam Houston"]'::jsonb);

update location_clusters set
  landmarks = landmarks || '["Lackland","Lackland AFB","JBSA Lackland","Joint Base San Antonio Lackland"]'::jsonb
where cluster_id = 'westover_hills'
  and not (landmarks @> '["Lackland"]'::jsonb);

update location_clusters set
  landmarks = landmarks || '[
    "Lackland","Lackland AFB","JBSA Lackland","Joint Base San Antonio Lackland",
    "Toyota","Toyota Plant","Toyota Manufacturing","Toyota Motor Manufacturing Texas","TMMTX"
  ]'::jsonb
where cluster_id = 'southside_brooks'
  and not (landmarks @> '["Lackland"]'::jsonb);

update location_clusters set
  landmarks = landmarks || '["Randolph","Randolph AFB","JBSA Randolph"]'::jsonb
where cluster_id = 'schertz_cibolo'
  and not (landmarks @> '["Randolph"]'::jsonb);

update location_clusters set
  landmarks = landmarks || '["Camp Bullis","Camp Bullis Training Site"]'::jsonb
where cluster_id in ('stone_oak', 'helotes')
  and not (landmarks @> '["Camp Bullis"]'::jsonb);

update location_clusters set
  landmarks = landmarks || '["USAA","USAA Headquarters"]'::jsonb
where cluster_id = 'utsa'
  and not (landmarks @> '["USAA"]'::jsonb);

update location_clusters set
  landmarks = landmarks || '[
    "USAA","USAA Headquarters",
    "Medical Center","South Texas Medical Center","UT Health",
    "University Hospital","Methodist Hospital","CHRISTUS Santa Rosa"
  ]'::jsonb
where cluster_id = 'medical_center'
  and not (landmarks @> '["USAA"]'::jsonb);
