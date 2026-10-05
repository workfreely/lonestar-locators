-- ─────────────────────────────────────────────────────────────────────────────
-- SOCIAL BEAST — Reel cover selection.
--
-- The Instagram container request has only ever sent media_type / video_url / caption, so Meta
-- picks the cover frame itself and the locator has no say in the single most visible frame of the
-- post. Two optional, independent ways to choose it:
--
--   cover_thumb_offset_ms  — "Select Frame": a millisecond offset INTO THE RENDERED VIDEO, sent as
--                            thumb_offset. The primary option, because it needs no upload and
--                            cannot disagree with the footage.
--   cover_storage_path     — "Custom Cover": an uploaded image in the private social-media bucket,
--                            signed at publish time and sent as cover_url. Secondary.
--
-- PRECEDENCE: a custom cover wins. Meta happens to resolve it the same way when both are sent, but
-- the publish path deliberately sends exactly ONE, so the choice is explicit in our request rather
-- than resolved by somebody else's tie-break.
--
-- WHY NO cover_mode COLUMN. The mode is already implied by the data — custom path present means
-- custom, else an offset, else Meta's default. A separate enum can disagree with the columns it
-- describes, and then there are two answers to one question.
--
-- NOT RENDER-AFFECTING. These describe which frame to SHOW, never what the MP4 contains, so
-- setting a cover must not reset render_status. (The editor's render-invalidating field list is
-- where that is enforced; this comment is here because the coupling is easy to add by accident.)
--
-- Both nullable with no default: a post with neither set behaves exactly as it does today. No
-- backfill, nothing migrated.
--
-- Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

alter table public.social_posts
  add column if not exists cover_thumb_offset_ms integer,
  add column if not exists cover_storage_path    text,
  -- Which render the frame was chosen against. Without it, "has this been re-rendered since?"
  -- cannot be answered truthfully — only guessed from render_version > 1, which is wrong whenever
  -- the frame was chosen AFTER the re-render. The hint compares this to render_version.
  add column if not exists cover_render_version  integer;

do $$
begin
  -- A negative offset is not a frame. Null stays allowed — that is "no frame chosen".
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.social_posts'::regclass
       and conname = 'social_posts_cover_offset_chk'
  ) then
    alter table public.social_posts
      add constraint social_posts_cover_offset_chk
      check (cover_thumb_offset_ms is null or cover_thumb_offset_ms >= 0);
  end if;
end $$;

comment on column public.social_posts.cover_thumb_offset_ms is
  'Reel cover as a millisecond offset into the RENDERED video (sent to Instagram as thumb_offset). Offsets index the file Meta receives, which is the rendered derivative — never the source. NULL = no frame chosen.';
comment on column public.social_posts.cover_render_version is
  'render_version at the moment a cover frame was chosen. The editor warns when it differs from the current render_version — the offset may now point at different footage. Advisory only: the offset is never cleared and publishing is never blocked.';
comment on column public.social_posts.cover_storage_path is
  'Reel cover as an uploaded image in the private social-media bucket, signed at publish time and sent as cover_url. Takes precedence over cover_thumb_offset_ms; the publish path sends exactly one of the two. NULL = no custom cover.';

commit;

-- ─── VERIFICATION (read-only; run after the transaction) ─────────────────────
--
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema='public' and table_name='social_posts'
--    and column_name in ('cover_thumb_offset_ms','cover_storage_path');
--
-- -- expect 0 / 0: nothing backfilled, every existing post keeps Meta's default cover
-- select count(*) filter (where cover_thumb_offset_ms is not null) as with_offset,
--        count(*) filter (where cover_storage_path is not null)    as with_custom
--   from public.social_posts;
