-- "A RENDERED MP4 EXISTS" IS NOT "THIS IS READY TO GO OUT".
--
-- The Rendered/Ready tab first derived membership from render_status='ready' + an artifact. That
-- silently promoted every TEST render to production-ready inventory, which is wrong: most of the
-- rendered posts in this database are test renders whose underlying property content (pricing,
-- specials, amenities, keywords, notes, captions) has not been verified yet.
--
-- ── WHY NO EXISTING FIELD CAN CARRY THIS ─────────────────────────────────────────────────────
-- Audited before adding a column, and every candidate fails for a concrete reason:
--
--   status='ready'       Set AUTOMATICALLY by the renderer (lib/social/renderPost.ts), not by a
--                        human. Measured: status='ready' and render_status='ready' are perfectly
--                        correlated — 7 of 7, with zero rows diverging in either direction — so it
--                        carries no information render_status does not already have.
--   needs_review_at      A NEGATIVE, machine-set flag ("the price behind this post changed"), and
--                        the renderer CLEARS it on every successful render. It is null for all 47
--                        unrendered drafts too, so null cannot mean "approved".
--   render_version /     Both describe the artifact, not anyone's judgement of it.
--   published_render_version
--
-- Approval is a NEW fact — a person asserting the content is correct — and nothing in the schema
-- records it. Hence one nullable timestamp, mirroring published_at.
--
--   approved_at IS NULL      → Working. Includes rendered test posts: an artifact alone proves
--                              nothing about whether the content behind it was checked.
--   approved_at IS NOT NULL  → Rendered/Ready: final, schedulable, publishable, reusable.
--
-- A PUBLISHED post counts as approved without needing a backfill: it already went out, which is a
-- stronger fact than any flag. That keeps published history in the Rendered tab (never hidden,
-- never deleted) while the 7 unapproved test renders correctly return to Working.
--
-- NOTHING IS DELETED. No MP4, no render_version, no history. This only changes which TAB a post
-- appears in.

begin;

alter table public.social_posts
  add column if not exists approved_at timestamptz;

comment on column public.social_posts.approved_at is
  'When a human marked this rendered post final — content verified, ready to schedule/publish/reuse. '
  'NULL means Working, INCLUDING a post that already has a rendered MP4 (a test render is not '
  'production inventory). Cleared automatically whenever the burned-in creative changes or the post '
  'is re-rendered, so approval always refers to the artifact that was actually reviewed. A published '
  'post is treated as approved regardless, so publishing never needs a backfill.';

-- APPROVAL IS OF A SPECIFIC RENDERED ARTIFACT, so a new render un-approves.
--
-- Without this, approving v3 and then re-rendering to v4 would leave v4 wearing v3's approval — the
-- exact "looks checked but nobody checked it" failure this column exists to prevent. Enforced in
-- the database rather than in each caller, because the render path, the editor PATCH and any future
-- queue worker all write render_version and would each have to remember.
--
-- A published post is deliberately exempt from the clear: its approval is historical and
-- re-rendering underneath it is already blocked elsewhere.
create or replace function public.social_posts_unapprove_on_rerender()
returns trigger
language plpgsql
as $$
begin
  if new.approved_at is not null
     and old.published_at is null
     and (new.render_version is distinct from old.render_version
          or (new.render_status is distinct from old.render_status and new.render_status <> 'ready'))
     and new.approved_at is not distinct from old.approved_at then
    new.approved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists social_posts_unapprove_on_rerender_trg on public.social_posts;
create trigger social_posts_unapprove_on_rerender_trg
  before update on public.social_posts
  for each row
  execute function public.social_posts_unapprove_on_rerender();

-- The Rendered/Ready listing: approved or published, newest first.
create index if not exists social_posts_approved_idx
  on public.social_posts (approved_at desc nulls last)
  where approved_at is not null;

commit;
