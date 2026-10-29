-- ============================================================================
-- AI PRESENTER — THE CTA WINDOW, AND THE TWO LOOKS
-- ============================================================================
-- The presenter has only ever been able to appear ONCE, at the start, for 3-5
-- seconds (social_posts.presenter_intro_seconds, CHECK 3..5). The 8 CTA
-- recordings run 5.10-6.55s and are anchored to the END of the video, so a CTA
-- presenter was not merely unsupported — it was unrepresentable.
--
-- This adds the two things that were missing: somewhere to record WHICH avatar
-- clip plays during the CTA, and somewhere to record which LOOK a presenter
-- wears so the editor can recommend one.
--
-- ── EVERY COLUMN IS ADDITIVE AND NULLABLE ───────────────────────────────────
-- NULL on all three means exactly what the product did before this migration:
-- one presenter window at the start, no second Look, no recommendation. No
-- existing post changes behaviour and no finished render becomes stale.
--
-- ── NOTHING IS BACKFILLED, RENAMED OR DROPPED ───────────────────────────────
-- presenter_intro_seconds keeps its 3-5 CHECK, deliberately. That column is the
-- operator's Intro slider and is still consulted for exactly the case it was
-- written for — a presenter with no recording driving it. A window driven by a
-- recording takes the RECORDING'S duration, which is computed at render time
-- from the probed file and never stored in that column, so the CHECK constrains
-- nothing it should not.

begin;

-- ── WHICH LOOK A PRESENTER WEARS ────────────────────────────────────────────
-- A Look is a social_presenters ROW, not a new table: heygen_avatar_id,
-- clip_storage_path, the ownership model and the RLS policies already live
-- there, and "gray cutoff shirt" and "black button-up" differ in exactly the
-- things that row already describes. A second table would duplicate all of it
-- to express one adjective.
--
-- NULLABLE AND UNLABELLED BY DEFAULT. A null Look reads as "not set up yet",
-- which is honest for the rows that predate this. It deliberately does NOT read
-- as 'everyday': guessing a Look from a label like 'Jay Morris (HeyGen digital
-- twin)' would put the cutoff shirt in front of a penthouse with the editor's
-- recommendation agreeing.
alter table public.social_presenters
  add column if not exists look_kind text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'social_presenters_look_kind_check') then
    alter table public.social_presenters
      add constraint social_presenters_look_kind_check
      check (look_kind is null or look_kind in ('everyday', 'luxury'));
  end if;
end $$;

comment on column public.social_presenters.look_kind is
  'Which HeyGen Look this presenter wears: ''everyday'' (gray cutoff shirt — apartment content, '
  'deals, conversational) or ''luxury'' (black button-up — high-rises, penthouses). NULL means '
  'unlabelled, so the editor can make no recommendation that points at this row. Drives a '
  'SUGGESTION only; the operator''s choice is always stored as given.';

-- ── THE CTA WINDOW, PER POST ────────────────────────────────────────────────
-- ON DELETE SET NULL, matching presenter_id: deleting a presenter must disable
-- the feature on its posts, never delete the posts.
alter table public.social_posts
  add column if not exists presenter_cta_id uuid references public.social_presenters(id) on delete set null;

alter table public.social_posts
  add column if not exists presenter_cta_clip_storage_path text;

comment on column public.social_posts.presenter_cta_id is
  'The Look that stands in the CTA window. NULL ⇒ the intro presenter (presenter_id) stands there '
  'too, which is the common case and stores nothing extra. Set it to use a different Look for the '
  'end of the video — a conversational intro and a luxury close in one post.';

comment on column public.social_posts.presenter_cta_clip_storage_path is
  'The avatar clip composited during the CTA window. Written by the editor''s save path ONLY when '
  'a clip lip-synced to the SELECTED CTA recording exists (resolvePresenterClip reports '
  'lipSyncVerified). There is deliberately NO fallback: NULL means no avatar during the CTA — '
  'audio only, exactly as before this feature — because the alternative, reusing the intro clip, '
  'would put the hook''s mouth on the CTA''s words at the end of every video.';

commit;
