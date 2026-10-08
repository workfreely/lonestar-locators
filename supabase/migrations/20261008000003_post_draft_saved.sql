-- "A POST ROW EXISTS" IS NOT "THE USER SET THIS UP".
--
-- The Working tab needs to separate a card that was merely uploaded from one the operator actually
-- went into and saved — the difference between "still needs setup" and "information entered,
-- probably close to rendering".
--
-- ── WHY status='draft' CANNOT ANSWER THIS ────────────────────────────────────────────────────
-- status='draft' is assigned AUTOMATICALLY when the post row is created
-- (app/api/admin/social-autopilot/posts/route.ts), along with auto-prepared headline, caption and
-- hashtags. Every post is born a draft, so badging on it would badge everything and tell the
-- operator nothing.
--
-- ── WHY updated_at CANNOT ANSWER IT EITHER ───────────────────────────────────────────────────
-- Measured: 59 of 62 posts have updated_at > created_at. But that column is bumped by renders
-- (16 rows), publishes (8), schedules (1), the autopilot writer, and ordinary maintenance. It
-- cannot distinguish "the operator saved this in the editor" from "a background job touched the
-- row", so inferring DRAFT from it would mark posts nobody ever opened.
--
-- ── THE COLUMN ───────────────────────────────────────────────────────────────────────────────
-- One nullable timestamp, stamped ONLY by an explicit Save Draft (intent='save_draft' on PATCH).
-- Deliberately NOT stamped by scheduling, rendering, publishing, approving, autopilot activity or
-- any other system write — scheduling in particular has its own SCHEDULED state and conflating the
-- two would re-create exactly the ambiguity this column removes.
--
-- Safe because there is no autosave: every write from the editor is an explicit user action, so a
-- stamp here always reflects a real click.
--
-- ── NO BACKFILL, ON PURPOSE ──────────────────────────────────────────────────────────────────
-- All 62 existing rows stay NULL. We cannot know retroactively which were deliberately saved, and
-- the only available proxy (updated_at) is polluted as described above — backfilling from it would
-- put a DRAFT badge on posts nobody ever opened. Under-claiming is recoverable: the badge appears
-- the moment the operator next hits Save Draft. Over-claiming is not, because a wrong badge is
-- indistinguishable from a right one.

begin;

alter table public.social_posts
  add column if not exists draft_saved_at timestamptz;

comment on column public.social_posts.draft_saved_at is
  'When the operator explicitly clicked Save Draft in the post editor (PATCH intent=''save_draft''). '
  'Drives the green DRAFT badge in the Working tab: NULL means uploaded/created but never '
  'deliberately set up. NEVER stamped by scheduling, rendering, publishing, approving or autopilot '
  'writes — status=''draft'' is auto-assigned at creation and updated_at is bumped by background '
  'work, so neither can express this. Intentionally left NULL for all pre-existing rows.';

commit;
