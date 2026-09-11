-- Social Autopilot → social_posts (Drafts + Post Creation + Scheduling foundation).
--
-- One row = one social post VARIATION derived from an immutable source video
-- (social_content). Multiple posts may reference the same source. This table NEVER
-- modifies or duplicates the source media — it only references it. Platform-admin only
-- via RLS + is_platform_admin(), owner-scoped exactly like social_content.
--
-- Lifecycle (status): draft → rendering → ready → scheduled → publishing →
-- needs_attention, plus terminal 'published'. Rendering/publishing WORKERS are NOT built
-- yet — this establishes the state model + scheduling persistence so they can be added
-- later. Scheduling here is INTERNAL only: it sets scheduled_at + status='scheduled' and
-- never triggers any external publish.
--
-- Instagram is first; platform is a plain column (no platform-specific spaghetti) so
-- TikTok/YouTube can be added later without reshaping the core model. Publish-time fields
-- (published_at / external_post_id / external_post_url / error_message) exist now but stay
-- null until the publishing checkpoint.

create table if not exists public.social_posts (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null,
  source_content_id uuid not null references public.social_content(id) on delete cascade,
  platform          text not null default 'instagram',
  post_name         text,                 -- internal name (private)
  caption           text,                 -- PUBLIC caption (no internal metadata auto-inserted)
  on_video_text     text,                 -- on-video text foundation
  on_video_config   jsonb not null default '{}'::jsonb,
  status            text not null default 'draft',
  scheduled_at      timestamptz,
  published_at      timestamptz,          -- set later, by the publishing pipeline
  external_post_id  text,                 -- set later
  external_post_url text,                 -- set later
  error_message     text,                 -- set later
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint social_posts_status_chk check (status in
    ('draft','rendering','ready','scheduled','publishing','needs_attention','published'))
);

create index if not exists social_posts_owner_status_idx on public.social_posts (owner_user_id, status);
create index if not exists social_posts_scheduled_idx on public.social_posts (owner_user_id, scheduled_at);
create index if not exists social_posts_source_idx on public.social_posts (source_content_id);

comment on table public.social_posts is
  'Social Autopilot post variations derived from social_content sources. Metadata + state
   only — no external publishing. Admin-only via RLS. Source media is never modified.';

alter table public.social_posts enable row level security;

-- Owner + platform-admin isolation. WITH CHECK also guards INSERT/UPDATE so a client can
-- never set owner_user_id to anyone else. (source_content_id ownership is enforced in the
-- API, which resolves the source under the caller's own RLS before creating a post.)
drop policy if exists "platform admin owns social_posts" on public.social_posts;
create policy "platform admin owns social_posts" on public.social_posts
  for all
  using (public.is_platform_admin() and owner_user_id = auth.uid())
  with check (public.is_platform_admin() and owner_user_id = auth.uid());
