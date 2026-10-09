-- ONE INITIAL DRAFT PER SOURCE VIDEO — clicking Edit twice must not create two posts.
--
-- ── THE BUG ──────────────────────────────────────────────────────────────────────────────────
-- The library's Edit action reads a client-side rollup (`postsBySource`) to decide whether a
-- source already has a post. createPost never refreshed that rollup, and released its in-flight
-- guard the moment the HTTP request resolved — BEFORE the Next.js navigation completed. So for a
-- second or more the button was live, the page had not changed, and the rollup still said "zero
-- posts". Each further click created another draft.
--
-- Measured in production: Peregrine 3 drafts in 11.6s, Collection at Boerne 2 in 7.6s, The Mustang
-- 2 in 14.2s — all with updated_at == created_at and the untouched market_type auto-default, i.e.
-- never opened by anyone. The server could not catch it: POST /posts read the source and INSERTed
-- unconditionally, with no existing-draft check and no index that could refuse.
--
-- ── WHY A COLUMN AND NOT JUST A CHECK ────────────────────────────────────────────────────────
-- The route can (and now does) look for an existing draft before inserting, but a read-then-write
-- is not atomic: two concurrent requests both see nothing and both insert. Only a UNIQUE INDEX
-- makes that impossible, and an index needs something to key on.
--
-- It cannot simply be "one unpublished post per source" — that is exactly what Create Variation
-- legitimately produces, and intentional variations must keep working. So the index keys on
-- PROVENANCE: at most one post per source may be the implicitly-created INITIAL draft.
--
--   'edit_initial' — created implicitly by the Edit action because no post existed. AT MOST ONE
--                    per source while unpublished. This is the one the bug duplicated.
--   'variation'    — created deliberately (Create Variation, or "+ New" in the picker). Never
--                    constrained; a source may have as many as the operator wants.
--   NULL           — every pre-existing row. Deliberately left unmarked so the index starts empty
--                    and this migration cannot fail on, or alter, existing data.
--
-- A published initial draft LEAVES the index (the predicate requires published_at IS NULL), which
-- is correct: once a post has gone out, a fresh editable draft for that source is exactly what the
-- launch-reset workflow creates.

begin;

alter table public.social_posts
  add column if not exists created_via text;

comment on column public.social_posts.created_via is
  'How this post came to exist: ''edit_initial'' (implicitly created by the library''s Edit action '
  'when the source had no post — at most one per source while unpublished, enforced by '
  'social_posts_one_initial_draft_uidx), ''variation'' (deliberately created via Create Variation '
  'or "+ New" — never constrained), or NULL for rows predating this column. It records PROVENANCE '
  'so idempotency can protect the implicit path without ever blocking the deliberate one.';

alter table public.social_posts
  drop constraint if exists social_posts_created_via_chk;
alter table public.social_posts
  add constraint social_posts_created_via_chk
  check (created_via is null or created_via in ('edit_initial', 'variation'));

-- THE ACTUAL GUARANTEE. Two concurrent Edit clicks race here and exactly one wins; the loser gets
-- 23505 and the route then returns the row the winner created, so both clicks open the SAME post.
create unique index if not exists social_posts_one_initial_draft_uidx
  on public.social_posts (source_content_id)
  where created_via = 'edit_initial' and published_at is null;

commit;
