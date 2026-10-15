-- WATCH `market` ON social_content.
--
-- WHY: the geographic enrichment pass corrected one video's market (Dallas → Houston, for a Katy
-- property) and the change left NO revision record. The trigger watched area_neighborhood and
-- district — the two fields that pass was expected to touch — but not the market above them. That
-- is the most consequential geographic field in the library: it is what the five Video Library
-- filters read, so a wrong one hides a video rather than merely mislabelling it. An unrecorded
-- change to it is the one this table most needs to hold.
--
-- SCOPE: a trigger re-declaration and nothing else. The function is unchanged — it already takes
-- its watched columns from tg_argv — and this migration runs NO DML, so not one stored market
-- value is read or written here.

drop trigger if exists social_content_capture_revision on public.social_content;

create trigger social_content_capture_revision
  before update on public.social_content
  for each row
  execute function public.social_capture_revision(
    'market',              -- NEW: the field the Video Library filters on
    'property_type', 'amenities', 'special', 'budget_range', 'price_label_mode',
    'area_neighborhood', 'district', 'notes', 'details');
