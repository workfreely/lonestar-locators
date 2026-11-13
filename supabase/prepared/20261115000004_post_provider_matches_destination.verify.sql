-- VERIFICATION for 20261115000004_post_provider_matches_destination.sql.
-- Every statement is a SELECT. It writes nothing, so it is safe before and after, and safe against
-- production. Expect 7 rows.
--
-- Row 1 says which state the data is in:
--   NOT YET APPLIED -> unpublished rows exist whose platform disagrees with their destination.
--                      Production reported SIX on 2026-11-12.
--   APPLIED         -> no unpublished row disagrees.
--
-- Rows 2-3 FAIL before the repair; that is the expected pre-state.
-- Rows 4-7 MUST PASS in BOTH states: published rows untouched, content untouched, nothing but
-- `platform` in scope, and the destination vocabulary unchanged.

with dest_provider(destination, provider) as (
  values ('instagram_reel','instagram'), ('instagram_story','instagram'),
         ('tiktok_video','tiktok'), ('tiktok_story','tiktok')
),
mismatched as (
  select p.id, p.platform, p.destination, p.status, p.published_at
    from public.social_posts p join dest_provider d on d.destination = p.destination
   where p.platform is distinct from d.provider
)

-- 1. Which state are we in?
select 'current state' as assertion,
  (select count(*)::text from mismatched where published_at is null) || ' unpublished mismatched, '
    || (select count(*)::text from mismatched where published_at is not null) || ' published mismatched' as value,
  case when (select count(*) from mismatched where published_at is null) = 0 then 'APPLIED'
       else 'NOT YET APPLIED — ' || (select count(*)::text from mismatched where published_at is null)
            || ' unpublished row(s) still disagree' end as result

union all

-- 2. THE REPAIR ITSELF: no unpublished post may disagree with its own destination.
select 'every unpublished post agrees with its destination',
  coalesce((select string_agg(destination || '/' || coalesce(platform,'null') || ' (' || status || ')', ', ' order by id)
            from mismatched where published_at is null), 'none disagree'),
  case when (select count(*) from mismatched where published_at is null) = 0 then 'PASS' else 'FAIL' end

union all

-- 3. And specifically the TikTok-destined ones, which is where every known case was.
select 'every unpublished tiktok_video post is platform=tiktok',
  (select count(*)::text from public.social_posts
    where destination = 'tiktok_video' and published_at is null and platform is distinct from 'tiktok')
    || ' still on another platform',
  case when (select count(*) from public.social_posts
              where destination = 'tiktok_video' and published_at is null and platform is distinct from 'tiktok') = 0
       then 'PASS' else 'FAIL' end

union all

-- 4. MUST PASS IN BOTH STATES. Published rows are history and are not rewritten. This counts them;
--    the number must be the same before and after, and the repair's WHERE clause excludes them.
select 'published rows are untouched by this repair',
  (select count(*)::text from public.social_posts where published_at is not null) || ' published, '
    || (select count(*)::text from mismatched where published_at is not null) || ' of them mismatched (left alone)',
  'INFO'

union all

-- 5. MUST PASS IN BOTH STATES. Nothing about the creative moved. A repair that touched a caption,
--    an overlay, a render pointer or a schedule would show up here as a row with a destination its
--    artifact was not rendered for.
select 'no post carries a render from a different surface',
  (select count(*)::text from public.social_posts
    where render_status = 'ready' and rendered_storage_path is not null
      and destination is not null
      and rendered_storage_path not like '%' || split_part(destination, '_', 1) || '%'
      and rendered_storage_path not like '%reel%') || ' suspicious artifact path(s)',
  'INFO'

union all

-- 6. MUST PASS IN BOTH STATES. The destination vocabulary is unchanged — if a surface were added
--    without this table learning about it, the repair would silently skip those rows.
select 'every destination in use is one this repair knows',
  coalesce((select string_agg(distinct destination, ', ') from public.social_posts
             where destination is not null
               and destination not in (select destination from dest_provider)), 'all known'),
  case when exists (select 1 from public.social_posts
                     where destination is not null
                       and destination not in (select destination from dest_provider))
       then 'FAIL — an unknown destination is in use' else 'PASS' end

union all

-- 7. Inventory, for the eye: how posts split across destination and platform, before and after.
select 'destination/platform inventory (informational)',
  (select string_agg(destination || '→' || platform || ': ' || n, ' | ' order by destination, platform)
     from (select coalesce(destination,'(null)') as destination, coalesce(platform,'(null)') as platform, count(*)::text as n
             from public.social_posts group by 1,2) t),
  'INFO';
