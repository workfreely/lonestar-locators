-- AI PRESENTER — per-agent avatar configuration, built multi-tenant from the first migration.
--
-- ── WHY PER-AGENT FROM DAY ONE ───────────────────────────────────────────────────────────────
-- Version 1 ships one shared sample presenter, but the destination is every Locator Beast agent
-- connecting their own HeyGen clone. Retrofitting ownership onto a single-tenant table later would
-- mean migrating live rows and rewriting every policy, so the ownership column and its RLS exist
-- now, while the table is empty and the cost is zero.
--
-- ── TWO KINDS OF PRESENTER ───────────────────────────────────────────────────────────────────
--   is_sample = true    the shared stand-in. owner_user_id IS NULL, readable by every platform
--                       admin, writable by none of them. It is how an agent can try the feature
--                       without first creating a digital twin (which costs money and requires a
--                       consent recording).
--   is_sample = false   an agent's own presenter. owner_user_id set, visible ONLY to that agent.
--
-- ── WHAT IS DELIBERATELY *NOT* HERE ──────────────────────────────────────────────────────────
-- No HeyGen API key column, on any table. Credentials stay in server-side environment variables
-- and are never per-row, because a row is reachable by PostgREST and an env var is not. What is
-- stored is the avatar IDENTIFIER (heygen_avatar_id), which is useless without the account key.
--
-- ── SOURCE VIDEOS ARE UNAFFECTED ─────────────────────────────────────────────────────────────
-- Generated avatar clips are DERIVATIVES and live under their own prefix, alongside renders/ and
-- takes/. An original source.* is never read, written or referenced by anything here. The
-- restrictive storage policies from 20261009000003 continue to protect them unchanged.

begin;

create table if not exists public.social_presenters (
  id uuid primary key default gen_random_uuid(),

  -- NULL = the shared sample presenter. Set = owned by exactly one agent.
  owner_user_id uuid references auth.users(id) on delete cascade,
  is_sample boolean not null default false,

  label text not null,

  -- HeyGen identity. An id, never a credential.
  heygen_avatar_id text,

  -- A pre-generated transparent clip, for the sample presenter and for caching. Storage key
  -- inside the social-media bucket, under a presenters/ prefix — a DERIVATIVE location, never a
  -- source.* key.
  clip_storage_path text,

  -- Voice. Either an uploaded recording or an ElevenLabs voice id; the SAME audio is sent to
  -- HeyGen for lip-sync and mixed into the final render, so the two can never disagree.
  voice_kind text not null default 'upload'
    check (voice_kind in ('upload', 'elevenlabs')),
  elevenlabs_voice_id text,

  -- Default intro length for this presenter. Clamped to the supported 3-5s range here as well as
  -- in the application, because a value outside it silently produces a wrong fade.
  default_intro_seconds numeric(4,2) not null default 4
    check (default_intro_seconds >= 3 and default_intro_seconds <= 5),

  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A sample has no owner; an agent presenter must have one. Enforced rather than conventional,
  -- because the RLS policies below read exactly this distinction.
  constraint social_presenters_ownership_chk
    check ((is_sample and owner_user_id is null) or (not is_sample and owner_user_id is not null))
);

comment on table public.social_presenters is
  'AI Presenter configurations. One row per agent presenter (owner_user_id set) plus shared sample '
  'rows (is_sample, owner_user_id NULL). Holds the HeyGen avatar IDENTIFIER only — never an API '
  'key; credentials live in server-side env vars. Generated clips are derivatives under a '
  'presenters/ prefix and never touch an original source.* object.';

create index if not exists social_presenters_owner_idx on public.social_presenters (owner_user_id) where owner_user_id is not null;
create unique index if not exists social_presenters_one_sample_label_uidx on public.social_presenters (label) where is_sample;

alter table public.social_presenters enable row level security;

-- READ: your own presenters, plus the shared samples.
drop policy if exists "presenters readable by owner or sample" on public.social_presenters;
create policy "presenters readable by owner or sample"
  on public.social_presenters for select to public
  using (is_platform_admin() and (is_sample or owner_user_id = auth.uid()));

-- WRITE: only your OWN, and you may never create or alter a sample. Samples are seeded
-- server-side, so an agent cannot promote their presenter into everyone's library.
drop policy if exists "presenters writable by owner" on public.social_presenters;
create policy "presenters writable by owner"
  on public.social_presenters for insert to public
  with check (is_platform_admin() and not is_sample and owner_user_id = auth.uid());

drop policy if exists "presenters updatable by owner" on public.social_presenters;
create policy "presenters updatable by owner"
  on public.social_presenters for update to public
  using (is_platform_admin() and not is_sample and owner_user_id = auth.uid())
  with check (is_platform_admin() and not is_sample and owner_user_id = auth.uid());

drop policy if exists "presenters deletable by owner" on public.social_presenters;
create policy "presenters deletable by owner"
  on public.social_presenters for delete to public
  using (is_platform_admin() and not is_sample and owner_user_id = auth.uid());

-- ── PER-POST SETTINGS ────────────────────────────────────────────────────────────────────────
-- OFF BY DEFAULT, and off for every existing row: presenter_id is NULL on all 69 current posts,
-- so no existing post changes behaviour and no render already produced becomes stale.
--
-- ON DELETE SET NULL, deliberately: deleting a presenter must disable the feature on its posts,
-- never delete the posts. This mirrors the source-video protocol's refusal to cascade.
alter table public.social_posts
  add column if not exists presenter_id uuid references public.social_presenters(id) on delete set null;

alter table public.social_posts
  add column if not exists presenter_intro_seconds numeric(4,2)
    check (presenter_intro_seconds is null or (presenter_intro_seconds >= 3 and presenter_intro_seconds <= 5));

-- The generated avatar clip for THIS post, cached so a re-render does not re-bill HeyGen. A
-- derivative, like rendered_storage_path.
alter table public.social_posts
  add column if not exists presenter_clip_storage_path text;

-- The audio used for BOTH the HeyGen lip-sync and the final mix. One column, so the two cannot
-- diverge into conflicting audio tracks.
alter table public.social_posts
  add column if not exists presenter_audio_storage_path text;

comment on column public.social_posts.presenter_id is
  'AI Presenter for this post, or NULL (the default, and the value on every row predating this '
  'migration) meaning no presenter. ON DELETE SET NULL: removing a presenter disables the feature '
  'on its posts and never deletes them.';
comment on column public.social_posts.presenter_audio_storage_path is
  'The ONE audio file used both for HeyGen lip-sync and for the final render mix, so the avatar''s '
  'mouth and the Reel''s audio can never disagree. Mixed through the existing Voice Clip hook path '
  'with its established ducking.';

commit;
