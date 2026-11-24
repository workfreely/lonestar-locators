-- APPLIED 23 Nov 2026, in one transaction with the launch release.
--
-- Adds sibling_of_post_id, which records that a TikTok post carries an Instagram post's creative.
-- It is the uniqueness key that makes automatic sibling creation idempotent, so one approval
-- cannot become two TikTok posts. NULL on every pre-existing row.
--
-- ONE COLUMN ON social_posts, so that creating a TikTok sibling can be made automatic and
-- idempotent — which the currently prepared index CANNOT do, and this file explains why rather
-- than quietly replacing it.
--
-- ── THE PREPARED INDEX CANNOT BE CREATED, AND IS ALSO NOW WRONG ────────────────────────────
-- supabase/prepared/20261103000000_tiktok_sibling_unique.sql is unique on (source_content_id)
-- where destination = 'tiktok_video'. Two separate problems:
--
--   1. IT WOULD FAIL. Production already has four tiktok_video rows sharing one
--      source_content_id, three of them published. CREATE UNIQUE INDEX raises on existing
--      duplicates, so that statement has never been runnable.
--
--   2. IT IS THE WRONG KEY NOW. With a second agent in the system, one creative legitimately has
--      two TikTok posts — the operator's and Lisette's — and global uniqueness on the content
--      would forbid the correct state. The feature's own requirement is one sibling per INSTAGRAM
--      POST, not one per creative.
--
-- ── SO THE KEY IS THE ORIGINAL, WHICH IS WHAT THE FEATURE ACTUALLY MEANS ───────────────────
-- ensureTikTokSibling already takes the Instagram post's id and already uses it to decide whether
-- a sibling exists — and then throws it away without storing it, which is the whole gap. Recording
-- it makes the uniqueness exact, atomic and backwards-compatible: every historical row has NULL,
-- so the partial index can be created today against live data.
--
-- NOT follows_post_id, which already exists and must not be reused: that column carries RELEASE
-- semantics — a Story companion with follows_post_id is armed only once its parent publishes
-- (releaseStoryForReel), has no schedule of its own, and is excluded from the autopilot pool as a
-- 'follow_up_post'. A TikTok sibling is none of those things: it is the same video on another
-- platform, with its own schedule and its own approval. Putting it in that column would hand it to
-- the Story machinery and remove it from the rotation.

begin;

alter table public.social_posts
  add column if not exists sibling_of_post_id uuid
    references public.social_posts(id) on delete set null;

comment on column public.social_posts.sibling_of_post_id is
  'The post this one was copied from — the Instagram original a TikTok sibling carries the creative of. NOT follows_post_id, which means "released by its parent''s publish" and would hand this row to the Story companion machinery and remove it from the autopilot pool. Purely a record of provenance plus the uniqueness key that makes automatic sibling creation idempotent. NULL on every pre-existing row.';

-- ONE SIBLING PER ORIGINAL. This is the guarantee that lets ensureTikTokSibling be wired to an
-- automatic trigger: two simultaneous callers can both read "none", and the second INSERT then
-- raises 23505, which that function already treats as success.
create unique index if not exists social_posts_one_sibling_per_original
  on public.social_posts (sibling_of_post_id)
  where sibling_of_post_id is not null;

-- A post cannot be its own sibling.
alter table public.social_posts
  drop constraint if exists social_posts_sibling_not_self;
alter table public.social_posts
  add constraint social_posts_sibling_not_self
  check (sibling_of_post_id is null or sibling_of_post_id <> id);

commit;

-- ── VERIFY, READ ONLY ──────────────────────────────────────────────────────────────────────
--
--   1. Nothing was written — must be 0:
--
--      select count(*) from public.social_posts where sibling_of_post_id is not null;
--
--   2. The index exists and is partial:
--
--      select indexdef from pg_indexes
--       where indexname = 'social_posts_one_sibling_per_original';
--
--   3. The four historical duplicates that block the OLD index are still there and still fine,
--      because nothing keys on their content any more:
--
--      select source_content_id, count(*), count(*) filter (where published_at is not null) as published
--        from public.social_posts
--       where destination = 'tiktok_video'
--       group by 1 having count(*) > 1;
--
-- ── AND THE OLD FILE ───────────────────────────────────────────────────────────────────────
-- supabase/prepared/20261103000000_tiktok_sibling_unique.sql should be deleted or marked
-- superseded once this is applied. It is left in place for now so that reviewing the two together
-- is possible; applying BOTH is not intended and the old one would fail anyway.
