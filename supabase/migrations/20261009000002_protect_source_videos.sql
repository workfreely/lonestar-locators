-- THE ORIGINAL UPLOADED VIDEO IS A PROTECTED MASTER. Deleting a source must never silently
-- destroy the work built on it.
--
-- ── WHAT THIS FIXES ──────────────────────────────────────────────────────────────────────────
-- social_posts.source_content_id was ON DELETE CASCADE, and the source DELETE route performed no
-- dependent check: it read the row, removed the storage object, then deleted the row. One click
-- on one source would therefore have taken every post built from it with no warning.
--
-- Measured exposure at the time of this change: 76 sources, 69 posts, of which 8 are PUBLISHED
-- across 6 sources. Those published rows carry external_post_id and published_at — the only record
-- that something went out to Instagram. CASCADE would have erased that silently, and the bulk
-- delete path fans out to the same route, so a multi-select could have done it in one action.
--
-- ── WHY RESTRICT RATHER THAN SET NULL ────────────────────────────────────────────────────────
-- SET NULL would keep the posts but orphan them: source_content_id is how a post finds its
-- footage, its property facts and its render inputs, so a null there produces a post that cannot
-- render, cannot be understood, and silently drops out of the library's source-centric rollup.
-- An error the operator must act on is strictly better than data that survives in a broken state.
--
-- RESTRICT makes the protection STRUCTURAL. The API will also grow a friendly dependent-count
-- check (Phase 2), but that is a read-then-write and therefore racy; this constraint is the thing
-- that cannot be bypassed — not by a future code path, not by a direct SQL session, not by a
-- concurrent delete.
--
-- A source with NO posts still deletes normally, so ordinary cleanup of an unused upload is
-- unaffected.
--
-- NOTHING IS DELETED OR MIGRATED HERE. The constraint is swapped in place; every existing row,
-- file, draft, variation and published record is untouched.

begin;

alter table public.social_posts
  drop constraint if exists social_posts_source_content_id_fkey;

alter table public.social_posts
  add constraint social_posts_source_content_id_fkey
  foreign key (source_content_id)
  references public.social_content(id)
  on delete restrict;

comment on constraint social_posts_source_content_id_fkey on public.social_posts is
  'RESTRICT, deliberately: the uploaded original is a protected master that may be reused '
  'indefinitely for new templates, overlays, narration and AI-presenter versions. Deleting a '
  'source that still has posts must FAIL rather than cascade — it previously destroyed every '
  'dependent post, including published ones carrying external_post_id. A source with no posts '
  'deletes normally.';

commit;
