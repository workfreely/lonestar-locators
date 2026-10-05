-- ─────────────────────────────────────────────────────────────────────────────
-- SOCIAL BEAST — make "published" mean Instagram actually confirmed it.
--
-- THE BUG THIS CLOSES. The finalize step claimed the media_publish call by writing
-- status='published' BEFORE calling Meta, because status was the only column available to
-- claim on. If the process died between the claim and the API response, the row read
-- 'published' with no media id — a post that may or may not be live, and which both the
-- publish route (rejects 'published') and the status route (requires 'publishing') then
-- refused to touch. Irrecoverable, and a lie.
--
-- A claim needs a column that does NOT assert an outcome. That is all this adds:
--
--   media_publish_claimed_at  — set, atomically and exactly once, immediately BEFORE
--                               media_publish is called. Winning the claim is what gives a
--                               caller the right to call Meta; it says "a publish call is in
--                               flight", never "a publish succeeded".
--
-- status now changes to 'published' only in the SAME statement that writes external_post_id,
-- so the two can never disagree: published ⇔ Meta returned a media id.
--
-- RECOVERY, and why this is not just a rename. A crash after Meta succeeds leaves
-- media_publish_claimed_at set and external_post_id null. The worker must NOT retry blindly —
-- that is the duplicate-Reel path. Instead it asks Meta what happened to the CONTAINER
-- (ig_container_id, already persisted before the call): status_code 'PUBLISHED' means the Reel
-- is live, and the worker recovers the media id instead of publishing again. This is why
-- `external_post_id IS NULL` must never be the retry condition on its own — on that row it is
-- true while the Reel is already on Instagram.
--
-- Additive and nullable: no backfill, no default, no existing row rewritten. The 45 current
-- drafts have never been published and are untouched.
--
-- Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

alter table public.social_posts
  add column if not exists media_publish_claimed_at timestamptz;

comment on column public.social_posts.media_publish_claimed_at is
  'Set immediately BEFORE the Instagram media_publish call, as the atomic claim for it. Means "a publish call is in flight", NEVER "published" — status becomes published only together with external_post_id. A row with this set and external_post_id null is a crash window: reconcile via the container status (PUBLISHED = already live, recover the id; never re-publish).';

-- Partial index for the worker's reconcile sweep: rows whose publish call was claimed but never
-- acknowledged locally. Tiny by construction — it is the crash set, normally empty.
create index if not exists social_posts_publish_unacked_idx
  on public.social_posts (media_publish_claimed_at)
  where media_publish_claimed_at is not null and external_post_id is null;

commit;

-- ─── VERIFICATION (read-only; run after the transaction) ─────────────────────
--
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_schema='public' and table_name='social_posts'
--    and column_name='media_publish_claimed_at';
--
-- -- expect 0: nothing is mid-publish, and no row was rewritten
-- select count(*) from public.social_posts where media_publish_claimed_at is not null;
