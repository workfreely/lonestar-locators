-- DESTINATION as a first-class column on posts and render jobs.
--
-- `platform` answers "whose API publishes this, and with which token". It cannot also answer "what
-- surface is this for": an Instagram Reel and an Instagram Story share one account, one token and
-- one provider, but have different UI chrome and therefore different safe areas. A frame that is
-- correct in a Reel can have its detail line under a Story's reply bar.
--
-- Collapsing the two would force a choice between one asset that is wrong on one surface, or a
-- fake "instagram_story" platform that lies about which account it belongs to. Both are worse than
-- a second column.
--
-- ONE POST PER DESTINATION. A post already carries exactly one connection_id, one scheduled_at and
-- one rendered artifact, so it is already a single publish target; a creative fans out into one
-- post per destination. That is what makes "Reel only / Story only / both" a selection rather than
-- a mode, and it means scheduling, the review hold, the slot-uniqueness index and the publish
-- worker all keep working unchanged.
--
-- platform is NOT dropped. It stays as the provider, derivable from destination but kept because
-- every existing query, index and publish path reads it.

begin;

-- ── posts ────────────────────────────────────────────────────────────────────────────────────
alter table public.social_posts
  add column if not exists destination text;

-- Backfill from platform: every existing row is a Reel or a TikTok video, since those were the
-- only surfaces that existed. Done before the constraint so the constraint can be trusted.
update public.social_posts
   set destination = case when platform = 'tiktok' then 'tiktok_video' else 'instagram_reel' end
 where destination is null;

alter table public.social_posts
  alter column destination set default 'instagram_reel',
  alter column destination set not null;

do $$ begin
  alter table public.social_posts add constraint social_posts_destination_check
    check (destination in ('instagram_reel','instagram_story','tiktok_video','tiktok_story'));
exception when duplicate_object then null; end $$;

comment on column public.social_posts.destination is
  'The content surface this post is built for. platform is the PROVIDER (whose API/token); this is '
  'the surface (what geometry and publish behaviour). One post = one destination.';

create index if not exists social_posts_destination_idx on public.social_posts (destination);

-- ── render jobs ──────────────────────────────────────────────────────────────────────────────
-- The job must carry the destination, not just the platform, because two destinations on ONE
-- platform can need different geometry. Without it, an instagram_reel job and an instagram_story
-- job for the same post are indistinguishable, and the second would be deduplicated away — the
-- Story would silently never render.
alter table public.social_render_jobs
  add column if not exists destination text;

update public.social_render_jobs
   set destination = case when platform = 'tiktok' then 'tiktok_video' else 'instagram_reel' end
 where destination is null;

alter table public.social_render_jobs
  alter column destination set default 'instagram_reel',
  alter column destination set not null;

do $$ begin
  alter table public.social_render_jobs add constraint social_render_jobs_destination_check
    check (destination in ('instagram_reel','instagram_story','tiktok_video','tiktok_story'));
exception when duplicate_object then null; end $$;

comment on column public.social_render_jobs.destination is
  'The surface this render is for. Part of the idempotency key: two destinations whose safe areas '
  'differ are genuinely different videos from the same source creative.';

commit;
