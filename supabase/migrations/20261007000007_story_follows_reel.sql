-- The Instagram Story as a FOLLOW-UP to its Reel, not a standalone post.
--
-- A Story is a companion distribution of a Reel: same property, same creative, published to the
-- other surface a while later. That makes it operationally dependent on the Reel in three ways the
-- data model has to carry —
--
--   1. it becomes due only AFTER its Reel actually publishes, measured from the real publish time
--      rather than the Reel's intended slot, so a late Reel moves its Story with it
--   2. if the Reel never publishes, the Story must not publish either
--   3. one Reel may have exactly ONE Story, however many times a publish is retried
--
-- …while staying a SEPARATE record. Status, external id, error handling and timestamps are all its
-- own: a failed Story must never mark its Reel failed, and a published Reel must not be touched by
-- anything the Story does afterwards.

begin;

alter table public.social_posts
  add column if not exists follows_post_id uuid references public.social_posts(id) on delete set null;

comment on column public.social_posts.follows_post_id is
  'This post is a follow-up distribution of another post (Story following its Reel). It becomes due '
  'after that post publishes. NOT a rotation entry: the scheduler excludes follow-ups from the '
  'property pool, so a Story does not consume one of the day''s Reel slots.';

-- IDEMPOTENCY, enforced by the database rather than by the caller remembering.
--
-- PARTIAL on destination, so the rule is exactly "one Instagram Story per Reel" and not a blanket
-- one-follow-up-per-post that would block a future TikTok companion. A retried publish, a replayed
-- webhook or two concurrent finalizers all collapse onto the one row: the second insert gets 23505
-- rather than creating a second Story.
create unique index if not exists social_posts_one_story_per_reel_uidx
  on public.social_posts (follows_post_id)
  where follows_post_id is not null and destination = 'instagram_story';

-- The lookup the finalizer does on every successful Reel publish: "does this Reel have a Story?"
create index if not exists social_posts_follows_idx
  on public.social_posts (follows_post_id)
  where follows_post_id is not null;

commit;
