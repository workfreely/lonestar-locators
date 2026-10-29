-- PREPARED, NOT APPLIED. Held back deliberately.
--
-- WHY IT IS NOT IN supabase/migrations/: everything in that directory is applied. This file is
-- the idempotency guarantee for TikTok sibling posts, and it must be applied BEFORE
-- ensureTikTokSibling is wired to anything automatic — but not before the Content Posting API
-- audit returns, because changing the database while reviewers may be testing is a risk with no
-- upside. Move it into supabase/migrations/ when the audit completes.
--
-- WHAT IT GUARANTEES. ensureTikTokSibling reads-then-inserts, which is not atomic: two callers
-- can both observe "no sibling" and both insert. The Story companion has exactly this shape and
-- is safe only because a partial unique index makes the second insert fail with 23505, which the
-- code already treats as success. This is that index for TikTok.
--
-- One sibling per source video. The partial predicate keeps the constraint off every Instagram
-- row, so nothing about the existing Instagram posts changes.
create unique index if not exists social_posts_tiktok_sibling_uniq
  on public.social_posts (source_content_id)
  where destination = 'tiktok_video' and source_content_id is not null;

-- VERIFY BEFORE APPLYING — this must return 0, or the index creation will fail and the duplicates
-- have to be resolved by hand first:
--   select source_content_id, count(*)
--     from public.social_posts
--    where destination = 'tiktok_video' and source_content_id is not null
--    group by 1 having count(*) > 1;
