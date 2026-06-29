-- Seed data generated from supabase/seed/location_clusters_san_antonio.json
-- Upsert on cluster_id so this migration is safely re-runnable.

insert into location_clusters
  (cluster_id, cluster_name, city_slug, core_zips, nearby_zips, property_keywords, nearby_clusters)
values
  (
    'stone_oak', 'Stone Oak', 'san-antonio',
    '["78258","78259","78260"]',
    '["78248","78247","78261","78266"]',
    '["Stone Oak","Sonterra","Vineyard","Canyon Springs","Bulverde Rd","281 North","Hardy Oak"]',
    '["la_cantera_the_rim","utsa"]'
  ),
  (
    'la_cantera_the_rim', 'La Cantera / The Rim', 'san-antonio',
    '["78256","78257"]',
    '["78258","78230","78249"]',
    '["La Cantera","The Rim","Six Flags Fiesta Texas","Loop 1604","Westin","JW Marriott"]',
    '["stone_oak","utsa","helotes"]'
  ),
  (
    'medical_center', 'Medical Center', 'san-antonio',
    '["78229","78240","78230"]',
    '["78213","78231","78249","78228"]',
    '["Medical Center","South Texas Medical","Oakwell","Wurzbach","Babcock","Fredericksburg Rd","UT Health"]',
    '["utsa","alamo_heights"]'
  ),
  (
    'alamo_heights', 'Alamo Heights', 'san-antonio',
    '["78209"]',
    '["78212","78215","78218","78217"]',
    '["Alamo Heights","Broadway","Lincoln Heights","Olmos Park","Mahncke Park","Terrell Hills"]',
    '["medical_center","downtown_pearl","southtown"]'
  ),
  (
    'westover_hills', 'Westover Hills', 'san-antonio',
    '["78251","78253"]',
    '["78245","78250","78227"]',
    '["Westover Hills","Westover Marketplace","Hwy 151","Loop 1604 West","Potranco"]',
    '["alamo_ranch","southside_brooks"]'
  ),
  (
    'alamo_ranch', 'Alamo Ranch', 'san-antonio',
    '["78253","78250"]',
    '["78251","78254","78245"]',
    '["Alamo Ranch","Talley Rd","1604 West","Culebra Rd"]',
    '["westover_hills","helotes"]'
  ),
  (
    'utsa', 'UTSA', 'san-antonio',
    '["78249"]',
    '["78230","78257","78251","78240"]',
    '["UTSA","University of Texas at San Antonio","1604 & Babcock","Northwest Vista","Rogers Ranch"]',
    '["la_cantera_the_rim","medical_center","stone_oak"]'
  ),
  (
    'helotes', 'Helotes', 'san-antonio',
    '["78023"]',
    '["78254","78256","78250"]',
    '["Helotes","Bandera Rd","Old Bandera Rd","Scenic Loop"]',
    '["la_cantera_the_rim","alamo_ranch","boerne"]'
  ),
  (
    'boerne', 'Boerne', 'san-antonio',
    '["78006","78015"]',
    '["78023","78163"]',
    '["Boerne","Kendall County","Cibolo Creek","I-10 North"]',
    '["helotes","stone_oak"]'
  ),
  (
    'converse_live_oak_universal_city', 'Converse / Live Oak / Universal City', 'san-antonio',
    '["78109","78148","78233"]',
    '["78244","78263","78108"]',
    '["Converse","Live Oak","Universal City","Randolph AFB","FM 78","Loop 1604 East","Marshall Rd"]',
    '["schertz_cibolo","downtown_pearl"]'
  ),
  (
    'schertz_cibolo', 'Schertz / Cibolo', 'san-antonio',
    '["78108","78154"]',
    '["78109","78233","78130"]',
    '["Schertz","Cibolo","FM 78","FM 1103","IH-35 North","Randolph"]',
    '["converse_live_oak_universal_city","new_braunfels"]'
  ),
  (
    'new_braunfels', 'New Braunfels', 'new-braunfels',
    '["78130","78132"]',
    '["78133","78266","78108"]',
    '["New Braunfels","Gruene","Schlitterbahn","IH-35","Landa Park"]',
    '["schertz_cibolo","san_marcos"]'
  ),
  (
    'san_marcos', 'San Marcos', 'san-marcos',
    '["78666"]',
    '["78667","78130"]',
    '["San Marcos","Texas State University","Outlet Malls","IH-35 South","River Rd"]',
    '["new_braunfels"]'
  ),
  (
    'downtown_pearl', 'Downtown / Pearl', 'san-antonio',
    '["78205","78215"]',
    '["78212","78202","78207"]',
    '["Downtown","Pearl","Pearl Brewery","River Walk","Riverwalk","Tobin Hill","Broadway","St. Mary''s Strip"]',
    '["southtown","alamo_heights","converse_live_oak_universal_city"]'
  ),
  (
    'southtown', 'Southtown', 'san-antonio',
    '["78204"]',
    '["78210","78211","78205"]',
    '["Southtown","King William","Lone Star","Blue Star Arts Complex","S Alamo St"]',
    '["downtown_pearl","southside_brooks"]'
  ),
  (
    'southside_brooks', 'Southside / Brooks City Base', 'san-antonio',
    '["78211","78223","78214"]',
    '["78221","78242","78210"]',
    '["Southside","Brooks City Base","Brooks City-Base","Mission Trail","S Presa St","SW Military Dr"]',
    '["southtown","westover_hills"]'
  )
on conflict (cluster_id) do update set
  cluster_name       = excluded.cluster_name,
  city_slug          = excluded.city_slug,
  core_zips          = excluded.core_zips,
  nearby_zips        = excluded.nearby_zips,
  property_keywords  = excluded.property_keywords,
  nearby_clusters    = excluded.nearby_clusters,
  updated_at         = now();
