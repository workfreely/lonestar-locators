-- Social Autopilot — SA1 foundation: admin-only Content Library.
--
-- ISOLATED, ADMIN-ONLY internal beta. Nothing here touches CRM/Companion/onboarding/
-- client-shares/customer surfaces. Every row is gated to platform admins (the existing
-- platform_admins / is_platform_admin() mechanism) AND owned by a single user via
-- owner_user_id, so this single-user beta is isolated even among admins. workspace_id
-- is deliberately NOT added yet — it can be added additively later without reworking
-- the model (the scheduler will key on content/post ids, not tenancy).

create table if not exists public.social_content (
  id                 uuid primary key default gen_random_uuid(),
  -- Owner = the platform admin who uploaded it (from the session, never the body).
  owner_user_id      uuid not null references auth.users(id) on delete cascade,
  -- Path inside the PRIVATE social-media bucket (owner-folder-scoped).
  storage_path       text not null,
  kind               text not null default 'clip' check (kind in ('clip', 'image')),
  original_filename  text,
  content_type       text,
  size_bytes         bigint,
  duration_s         numeric,
  -- ── Internal property metadata (operational only — NEVER auto-published) ──────
  property_name      text,
  market             text,          -- city / market
  special            text,          -- current or historical special
  budget_range       text,          -- budget / price range (free text)
  amenities          text,
  notes              text,
  place_id           text,          -- optional Google Place ID link
  details            jsonb not null default '{}'::jsonb, -- optional free-form fields
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists social_content_owner_created_idx
  on public.social_content (owner_user_id, created_at desc);

alter table public.social_content enable row level security;

-- Platform-admin AND owner. is_platform_admin() implies the caller is an admin;
-- owner_user_id = auth.uid() keeps each admin's beta content to themselves.
drop policy if exists "platform admin owns social_content" on public.social_content;
create policy "platform admin owns social_content"
  on public.social_content for all
  using (public.is_platform_admin() and owner_user_id = auth.uid())
  with check (public.is_platform_admin() and owner_user_id = auth.uid());

-- ── PRIVATE media bucket (NOT the public branding bucket) ─────────────────────
insert into storage.buckets (id, name, public)
values ('social-media', 'social-media', false)
on conflict (id) do nothing;

-- All access to social-media objects is platform-admin only, within the owner's own
-- folder (first path segment = auth.uid()). No public read; not enumerable by users.
drop policy if exists "social-media admin all" on storage.objects;
create policy "social-media admin all"
  on storage.objects for all
  using (
    bucket_id = 'social-media'
    and public.is_platform_admin()
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'social-media'
    and public.is_platform_admin()
    and (storage.foldername(name))[1] = auth.uid()::text
  );
